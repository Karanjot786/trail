// Package enrich derives device, geo, route, env and URL fields for ingested events.
package enrich

import (
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"strings"

	"github.com/mileusna/useragent"
)

// ParseUA maps a User-Agent to device (desktop|mobile|tablet), browser, os and a bot flag.
func ParseUA(ua string) (device, browser, os string, bot bool) {
	p := useragent.Parse(ua)
	lower := strings.ToLower(ua)
	bot = p.Bot || p.Name == useragent.HeadlessChrome ||
		strings.Contains(lower, "headless") || strings.Contains(lower, "webdriver")

	device = "desktop"
	switch {
	case p.Tablet:
		device = "tablet"
	case p.Mobile:
		device = "mobile"
	}

	os = p.OS
	switch os {
	case useragent.MacOS:
		os = "Mac"
	case useragent.Linux:
		os = "GNU/Linux"
	}
	return device, p.Name, os, bot
}

var (
	reNum  = regexp.MustCompile(`^\d+$`)
	reUUID = regexp.MustCompile(`^(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	reHex  = regexp.MustCompile(`^(?i)[0-9a-f]{16,}$`)
)

// DeriveRoute collapses numeric, UUID and long-hex path segments to ":id".
func DeriveRoute(path string) string {
	segs := strings.Split(path, "/")
	for i, s := range segs {
		if reNum.MatchString(s) || reUUID.MatchString(s) || reHex.MatchString(s) {
			segs[i] = ":id"
		}
	}
	return strings.Join(segs, "/")
}

// DeriveEnv returns given if set; otherwise production for the configured
// domain, development for local hosts, and preview for anything else.
func DeriveEnv(host, configuredDomain, given string) string {
	if given != "" {
		return given
	}
	h := bareHost(host)
	switch {
	case h == "localhost" || strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".local"):
		return "development"
	case isLoopbackOrPrivate(h):
		return "development"
	case h == bareHost(configuredDomain):
		return "production"
	default:
		return "preview"
	}
}

func isLoopbackOrPrivate(h string) bool {
	addr, err := netip.ParseAddr(h)
	return err == nil && (addr.IsLoopback() || addr.IsPrivate() || addr.IsUnspecified())
}

// bareHost lowercases, strips a port and a leading "www.".
func bareHost(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	if host, _, err := net.SplitHostPort(h); err == nil {
		h = host
	}
	return strings.TrimPrefix(h, "www.")
}

// ParseURL splits a page URL into host (with port, lowercased), query-free
// path and utm_{source,medium,campaign,term,content}.
func ParseURL(u string) (host, path string, utm [5]string) {
	p, err := url.Parse(u)
	if err != nil {
		return "", "", utm
	}
	host = strings.ToLower(p.Host)
	path = p.Path
	if path == "" {
		path = "/"
	}
	q := p.Query()
	for i, k := range [5]string{"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"} {
		utm[i] = q.Get(k)
	}
	return host, path, utm
}

// RefHost returns the referrer's host without "www.", or "" when empty,
// unparseable, or a self-referral.
func RefHost(ref, selfHost string) string {
	if ref == "" {
		return ""
	}
	p, err := url.Parse(ref)
	if err != nil || p.Hostname() == "" {
		return ""
	}
	h := bareHost(p.Hostname())
	if h == bareHost(selfHost) {
		return ""
	}
	return h
}
