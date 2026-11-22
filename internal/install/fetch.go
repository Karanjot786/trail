package install

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"syscall"
	"time"
)

// Page is a fetched home page.
type Page struct {
	Status int
	Header http.Header
	Body   []byte
}

// Fetcher loads https://{host}/. Tests inject a fake.
type Fetcher interface {
	Fetch(ctx context.Context, host string) (Page, error)
}

const (
	fetchTimeout  = 5 * time.Second
	fetchMaxBody  = 512 << 10
	fetchMaxHops  = 3
	fetchAgent    = "Trail-install-check/1"
	errPrivateMsg = "refusing to connect to a private or local address"
)

// ErrPrivateAddr is returned when the site's name resolves to a private,
// loopback, link-local, multicast or unspecified address.
var ErrPrivateAddr = errors.New(errPrivateMsg)

// blocked are the special-purpose ranges netip has no predicate for.
var blocked = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),      // this network
	netip.MustParsePrefix("100.64.0.0/10"),  // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),   // IETF protocol assignments
	netip.MustParsePrefix("198.18.0.0/15"),  // benchmarking
	netip.MustParsePrefix("240.0.0.0/4"),    // reserved, broadcast
	netip.MustParsePrefix("64:ff9b::/96"),   // NAT64 (can reach IPv4 private space)
	netip.MustParsePrefix("2001:db8::/32"),  // documentation
	netip.MustParsePrefix("fec0::/10"),      // site-local (deprecated)
	netip.MustParsePrefix("::ffff:0:0/96"),  // IPv4-mapped (checked unmapped too)
	netip.MustParsePrefix("2002::/16"),      // 6to4 (embeds IPv4)
	netip.MustParsePrefix("100::/64"),       // discard
	netip.MustParsePrefix("2001::/32"),      // Teredo (embeds IPv4)
	netip.MustParsePrefix("ff00::/8"),       // multicast
	netip.MustParsePrefix("fc00::/7"),       // unique local
	netip.MustParsePrefix("fe80::/10"),      // link-local
	netip.MustParsePrefix("169.254.0.0/16"), // link-local, cloud metadata
	netip.MustParsePrefix("127.0.0.0/8"),    // loopback
	netip.MustParsePrefix("224.0.0.0/4"),    // multicast
	netip.MustParsePrefix("255.255.255.255/32"),
}

// PublicAddr reports whether a is a public unicast address the check may dial.
func PublicAddr(a netip.Addr) bool {
	a = a.Unmap()
	if !a.IsValid() || a.IsLoopback() || a.IsPrivate() || a.IsLinkLocalUnicast() || a.IsLinkLocalMulticast() ||
		a.IsInterfaceLocalMulticast() || a.IsMulticast() || a.IsUnspecified() {
		return false
	}
	for _, p := range blocked {
		if p.Contains(a) {
			return false
		}
	}
	return true
}

// SafeFetcher fetches a site's home page for the install check without
// becoming an SSRF tool: https only, only the site's own host (redirects too,
// at most 3), a dialer that refuses non-public addresses after DNS resolution
// (so rebinding does not help), no proxy, a 5 s timeout and a 512 KiB cap.
type SafeFetcher struct {
	allow   func(netip.Addr) bool // PublicAddr; tests loosen it
	tlsConf *tls.Config           // nil: system roots
}

// NewSafeFetcher returns the production fetcher.
func NewSafeFetcher() *SafeFetcher { return &SafeFetcher{allow: PublicAddr} }

func (f *SafeFetcher) client(host string) *http.Client {
	dialer := &net.Dialer{
		Timeout: fetchTimeout,
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !f.allow(ap.Addr()) {
				return ErrPrivateAddr
			}
			return nil
		},
	}
	tr := &http.Transport{
		Proxy:                 nil, // an env proxy would dial for us and skip the address check
		DialContext:           dialer.DialContext,
		TLSClientConfig:       f.tlsConf,
		TLSHandshakeTimeout:   fetchTimeout,
		ResponseHeaderTimeout: fetchTimeout,
		MaxIdleConns:          1,
		DisableKeepAlives:     true,
	}
	return &http.Client{
		Transport: tr,
		Timeout:   fetchTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > fetchMaxHops {
				return errors.New("too many redirects")
			}
			// Follow the site's own www/apex hop (example.com -> www.example.com and back); the dialer still refuses private addresses.
			if req.URL.Scheme != "https" || !sameSite(req.URL.Host, host) {
				return fmt.Errorf("redirect to another host (%s) refused", req.URL.Host)
			}
			return nil
		},
	}
}

// Fetch loads https://{host}/. host is the site's registered domain.
func (f *SafeFetcher) Fetch(ctx context.Context, host string) (Page, error) {
	if host == "" || strings.ContainsAny(host, "/?#@\\ ") {
		return Page{}, errors.New("bad host")
	}
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://"+host+"/", nil)
	if err != nil {
		return Page{}, err
	}
	req.Header.Set("User-Agent", fetchAgent)
	req.Header.Set("Accept", "text/html")
	c := f.client(host)
	defer c.CloseIdleConnections()
	resp, err := c.Do(req)
	if err != nil {
		return Page{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, fetchMaxBody))
	if err != nil {
		return Page{}, err
	}
	return Page{Status: resp.StatusCode, Header: resp.Header, Body: body}, nil
}

// sameSite reports whether to is host itself, a subdomain of it, or its parent when host is a www. name.
func sameSite(to, host string) bool {
	to, host = strings.ToLower(to), strings.ToLower(host)
	return to == host || strings.HasSuffix(to, "."+host) || "www."+to == host
}
