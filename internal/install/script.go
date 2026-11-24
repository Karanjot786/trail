package install

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"trail/internal/sites"
)

var (
	scriptTag = regexp.MustCompile(`(?is)<script\b[^>]*>`)
	attrRe    = regexp.MustCompile(`(?is)([a-z][a-z0-9_:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`)
	trackerJS = regexp.MustCompile(`(?i)(^|/)(_t|t)/t(\.[a-z]+)?\.js(\?|#|$)`)

	// nextProps matches the Trail component's props in Next.js RSC flight data,
	// with or without backslash-escaped quotes.
	nextProps = regexp.MustCompile(`\\?"site\\?":\\?"([a-z0-9-]{1,40})\\?",\\?"src\\?":\\?"([^"\\]*)\\?"(?:,\\?"api\\?":\\?"([^"\\]*)\\?")?`)

	// Astro's integration injects an inline loader that sets these properties.
	jsStr    = `("(?:[^"\\]|\\.)*")`
	astroSrc = regexp.MustCompile(`\bs\.src=` + jsStr)
	astroSit = regexp.MustCompile(`\bs\.dataset\.site=` + jsStr)
	astroAPI = regexp.MustCompile(`\bs\.dataset\.api=` + jsStr)
)

// trackerTag is what the page says about the Trail tracker.
type trackerTag struct {
	Src, API, Site, Nonce string
	Via                   string // "tag" | "next" | "astro" | "" (nothing found)
}

func attrs(tag string) map[string]string {
	m := map[string]string{}
	for _, a := range attrRe.FindAllStringSubmatch(tag, -1) {
		m[strings.ToLower(a[1])] = a[2] + a[3] + a[4]
	}
	return m
}

func unquote(re *regexp.Regexp, s string) string {
	if m := re.FindStringSubmatch(s); m != nil {
		if v, err := strconv.Unquote(m[1]); err == nil {
			return v
		}
	}
	return ""
}

// findTracker looks for the tracker the way installs ship it: a plain script
// tag, the Next.js component's props in the RSC payload, or Astro's inline loader.
func findTracker(html string) trackerTag {
	for _, tag := range scriptTag.FindAllString(html, -1) {
		a := attrs(tag)
		if trackerJS.MatchString(a["src"]) {
			return trackerTag{Src: a["src"], API: a["data-api"], Site: a["data-site"], Nonce: a["nonce"], Via: "tag"}
		}
	}
	for _, m := range nextProps.FindAllStringSubmatch(html, -1) {
		if trackerJS.MatchString(m[2]) {
			return trackerTag{Site: m[1], Src: m[2], API: m[3], Via: "next"}
		}
	}
	if src := unquote(astroSrc, html); trackerJS.MatchString(src) {
		return trackerTag{Src: src, Site: unquote(astroSit, html), API: unquote(astroAPI, html), Via: "astro"}
	}
	return trackerTag{}
}

const scriptLabel = "The Trail script is on the page"

// scriptCheck judges the tracker found on the page. received is whether a
// non-bot event has ever arrived: then a script the page scan cannot see
// (it loads in the browser) is fine.
func scriptCheck(t trackerTag, site sites.Site, trailHost string, received bool) CheckItem {
	snippet := fmt.Sprintf(`<script defer src="https://%s/_t/t.js" data-site="%s" data-api="https://%s/_t/e"></script>`, trailHost, site.ID, trailHost)
	if t.Via == "" {
		if received {
			return item("script", scriptLabel, "pass", CodeOK, "The script is not in the server HTML, but events arrive, so it loads in the browser.", "")
		}
		return item("script", scriptLabel, "warn", CodeScriptMissing,
			"No Trail script in the server HTML. Components for React and some frameworks add it in the browser, where this check cannot look.",
			"Send a test visit to confirm. If nothing arrives, add this to the page's <head>: "+snippet)
	}
	if t.Site != site.ID {
		return item("script", scriptLabel, "fail", CodeWrongSiteID,
			fmt.Sprintf("The script says data-site=%q, but this site's id is %q.", t.Site, site.ID),
			`Set data-site="`+site.ID+`".`)
	}
	u, err := url.Parse(t.Src)
	if err == nil && u.Host != "" {
		if !sameHost(u.Host, trailHost) && !sameSite(strings.ToLower(u.Hostname()), site.Domain) {
			return item("script", scriptLabel, "fail", CodeWrongHost,
				fmt.Sprintf("The script loads from %s, not from this Trail (%s).", u.Host, trailHost), "Use: "+snippet)
		}
		if sameHost(u.Host, trailHost) && t.API == "" && !sameHost(trailHost, site.Domain) {
			return item("script", scriptLabel, "fail", CodeAPIMissing,
				"The script has no data-api, so events go to /_t/e on your own site and get a 404.",
				`Add data-api="https://`+trailHost+`/_t/e" to the script tag.`)
		}
	}
	detail := "Found the Trail script with the right site id."
	switch t.Via {
	case "next":
		detail = "Found the Trail component in the page data (it adds the script in the browser)."
	case "astro":
		detail = "Found the Trail Astro integration's loader."
	}
	return item("script", scriptLabel, "pass", CodeOK, detail, "")
}

func sameHost(a, b string) bool {
	strip := func(h string) string {
		if i := strings.LastIndexByte(h, ':'); i > 0 && !strings.HasSuffix(h, "]") {
			h = h[:i]
		}
		return strings.ToLower(h)
	}
	return strip(a) == strip(b)
}
