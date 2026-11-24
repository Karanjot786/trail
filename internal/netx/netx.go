// Package netx derives the real client IP of an HTTP request.
//
// Forwarding headers are client-controlled, so they are believed only when
// the TCP peer (RemoteAddr) is a trusted proxy:
//
//   - X-Forwarded-For is walked from the right. Each hop appended by a trusted
//     proxy is skipped; the first untrusted hop is the client. The leftmost
//     value is never taken blindly.
//   - CF-Connecting-IP is believed only when the hop that delivered it is in
//     Cloudflare's published ranges (bundled in this package).
//   - X-Real-IP is ignored: proxies that don't set it pass the client's own
//     value through.
package netx

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// maxHops bounds the X-Forwarded-For walk.
const maxHops = 32

// privateRanges are loopback plus private networks: the "Trail behind nginx
// or Caddy on the same box or LAN" case.
var privateRanges = []netip.Prefix{
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("fc00::/7"),
}

// Resolver resolves client IPs for one trusted-proxy configuration. It is
// immutable and safe for concurrent use.
type Resolver struct {
	trusted    []netip.Prefix
	cloudflare bool // trust Cloudflare's ranges and CF-Connecting-IP
}

// Client is the outcome of resolving a request's client address.
type Client struct {
	// IP is the client address, without zone and with 4in6 unmapped. It is
	// invalid only when RemoteAddr itself is unparseable.
	IP netip.Addr
	// Raw is IP as a string, or RemoteAddr verbatim when IP is invalid.
	Raw string
	// Peer is the TCP peer (RemoteAddr host); invalid when unparseable.
	Peer netip.Addr
	// ViaCloudflare is true when the client address was reported by a
	// Cloudflare edge that Trail trusts. Headers Cloudflare adds (such as
	// CF-IPCountry) are trustworthy exactly when this is true.
	ViaCloudflare bool
}

// ParseTrusted parses a TRAIL_TRUSTED_PROXIES value: comma-separated IPs,
// CIDRs and the keywords "private" (loopback and private ranges) and
// "cloudflare" (Cloudflare's published ranges). Empty means
// "private,cloudflare". "none" trusts no proxy: the TCP peer is always the
// client.
func ParseTrusted(spec string) (*Resolver, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		spec = "private,cloudflare"
	}
	if strings.EqualFold(spec, "none") {
		return &Resolver{}, nil
	}
	r := &Resolver{}
	for part := range strings.SplitSeq(spec, ",") {
		part = strings.TrimSpace(part)
		switch strings.ToLower(part) {
		case "":
			continue
		case "none":
			return nil, errors.New(`"none" cannot be combined with other entries`)
		case "private":
			r.trusted = append(r.trusted, privateRanges...)
			continue
		case "cloudflare":
			r.cloudflare = true
			continue
		}
		p, err := parsePrefix(part)
		if err != nil {
			return nil, err
		}
		r.trusted = append(r.trusted, p)
	}
	if len(r.trusted) == 0 && !r.cloudflare {
		return nil, fmt.Errorf("no entries in %q (use \"none\" to trust no proxy)", spec)
	}
	return r, nil
}

func parsePrefix(s string) (netip.Prefix, error) {
	if strings.Contains(s, "/") {
		p, err := netip.ParsePrefix(s)
		if err != nil {
			return netip.Prefix{}, fmt.Errorf("bad CIDR %q", s)
		}
		return p.Masked(), nil
	}
	a, err := netip.ParseAddr(s)
	if err != nil {
		return netip.Prefix{}, fmt.Errorf("bad IP or CIDR %q", s)
	}
	a = a.WithZone("").Unmap()
	return netip.PrefixFrom(a, a.BitLen()), nil
}

// Default returns the resolver for an unset TRAIL_TRUSTED_PROXIES.
func Default() *Resolver {
	r, err := ParseTrusted("")
	if err != nil {
		panic(err) // the default spec is a constant
	}
	return r
}

// ClientIP returns the client address of req as a string (see Resolve).
func (r *Resolver) ClientIP(req *http.Request) string {
	return r.Resolve(req).Raw
}

// Resolve derives the client address of req.
func (r *Resolver) Resolve(req *http.Request) Client {
	peer := parsePeer(req.RemoteAddr)
	if !peer.IsValid() {
		return Client{Raw: req.RemoteAddr}
	}
	c := Client{IP: peer, Peer: peer}
	hops := forwarded(req.Header)
	hop := peer
	for range maxHops {
		if r.isCloudflare(hop) {
			// Cloudflare overwrites CF-Connecting-IP, and every hop between
			// it and us is trusted, so the header is the edge's own.
			if ip, ok := parseHop(req.Header.Get("CF-Connecting-IP")); ok {
				c.IP, c.ViaCloudflare = ip, true
				break
			}
		} else if !r.trusts(hop) {
			break
		}
		// hop is a trusted proxy: the next hop left of it in XFF is what it saw.
		var next string
		for len(hops) > 0 && next == "" {
			next, hops = hops[len(hops)-1], hops[:len(hops)-1]
		}
		if next == "" {
			break // all hops trusted: the leftmost trusted one is the client
		}
		ip, ok := parseHop(next)
		if !ok {
			break // garbage from a trusted proxy: stop at the last good hop
		}
		c.IP, c.ViaCloudflare = ip, r.isCloudflare(hop)
		hop = ip
	}
	c.Raw = c.IP.String()
	return c
}

func (r *Resolver) trusts(a netip.Addr) bool {
	for _, p := range r.trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

func (r *Resolver) isCloudflare(a netip.Addr) bool {
	return r.cloudflare && IsCloudflare(a)
}

// forwarded returns every X-Forwarded-For entry, left to right, across
// repeated headers, with whitespace trimmed (entries may be empty).
func forwarded(h http.Header) []string {
	var out []string
	for _, v := range h.Values("X-Forwarded-For") {
		for e := range strings.SplitSeq(v, ",") {
			out = append(out, strings.TrimSpace(e))
		}
	}
	return out
}

// parsePeer parses a RemoteAddr ("ip:port", "[ipv6]:port" or a bare IP).
func parsePeer(s string) netip.Addr {
	if host, _, err := net.SplitHostPort(s); err == nil {
		s = host
	}
	a, err := netip.ParseAddr(s)
	if err != nil {
		return netip.Addr{}
	}
	return a.WithZone("").Unmap()
}

// parseHop parses one forwarded address: an IP, "ip:port" or "[ipv6]:port".
func parseHop(s string) (netip.Addr, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return netip.Addr{}, false
	}
	a, err := netip.ParseAddr(s)
	if err != nil {
		ap, err := netip.ParseAddrPort(s)
		if err != nil {
			return netip.Addr{}, false
		}
		a = ap.Addr()
	}
	return a.WithZone("").Unmap(), true
}

// Bucket is the key a client is limited and pseudonymised by. IPv4 (and
// IPv4-mapped IPv6) is the dotted address; IPv6 is its /64, because one
// subscriber usually holds a whole /64 and can rotate within it at will.
// Unparseable input is returned unchanged.
func Bucket(ip string) string {
	a, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	a = a.Unmap()
	if a.Is4() {
		return a.String()
	}
	p, err := a.WithZone("").Prefix(64)
	if err != nil {
		return ip
	}
	return p.String()
}
