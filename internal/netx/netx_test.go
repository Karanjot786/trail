package netx

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

// req builds a request whose TCP peer is remote, with the given headers.
// Each header value is added separately, so repeated keys become repeated headers.
func req(remote string, hdr ...[2]string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = remote
	for _, h := range hdr {
		r.Header.Add(h[0], h[1])
	}
	return r
}

func xff(v string) [2]string { return [2]string{"X-Forwarded-For", v} }
func cf(v string) [2]string  { return [2]string{"CF-Connecting-IP", v} }

func mustParse(t *testing.T, spec string) *Resolver {
	t.Helper()
	r, err := ParseTrusted(spec)
	if err != nil {
		t.Fatalf("ParseTrusted(%q): %v", spec, err)
	}
	return r
}

// A cloudflare edge address from the bundled snapshot (104.16.0.0/13).
const cfEdge = "104.16.1.1"

func TestClientIP(t *testing.T) {
	def := mustParse(t, "")
	none := mustParse(t, "none")
	custom := mustParse(t, "203.0.113.10, 2001:db8:1::/48")
	all := mustParse(t, "0.0.0.0/0, ::/0")

	tests := []struct {
		name string
		res  *Resolver
		r    *http.Request
		want string
		cf   bool
	}{
		// Spoofing from the open internet.
		{"spoofed xff from public peer is ignored", def, req("198.51.100.7:4000", xff("1.2.3.4")), "198.51.100.7", false},
		{"spoofed multi-value xff from public peer", def, req("198.51.100.7:4000", xff("1.2.3.4, 10.0.0.1")), "198.51.100.7", false},
		{"spoofed cf header from public peer", def, req("198.51.100.7:4000", cf("1.2.3.4")), "198.51.100.7", false},
		{"no headers", def, req("198.51.100.7:4000"), "198.51.100.7", false},

		// Trusted local proxy (nginx/Caddy on the same box).
		{"loopback proxy", def, req("127.0.0.1:5000", xff("203.0.113.5")), "203.0.113.5", false},
		{"private proxy", def, req("10.1.2.3:5000", xff("203.0.113.5")), "203.0.113.5", false},
		{"proxy drops leftmost spoof", def, req("127.0.0.1:5000", xff("6.6.6.6, 203.0.113.5")), "203.0.113.5", false},
		{"multi-hop trusted chain", def, req("127.0.0.1:5000", xff("6.6.6.6, 203.0.113.5, 10.0.0.2, 192.168.1.9")), "203.0.113.5", false},
		{"repeated xff headers concatenate", def, req("127.0.0.1:5000", xff("6.6.6.6"), xff("203.0.113.5, 10.0.0.2")), "203.0.113.5", false},
		{"all hops trusted gives leftmost", def, req("127.0.0.1:5000", xff("192.168.1.50, 10.0.0.2")), "192.168.1.50", false},
		{"trusted peer, empty xff", def, req("127.0.0.1:5000", xff("")), "127.0.0.1", false},
		{"trusted peer, blank entries", def, req("127.0.0.1:5000", xff(" , ,203.0.113.5 , ")), "203.0.113.5", false},
		{"malformed hop stops the walk", def, req("127.0.0.1:5000", xff("203.0.113.5, not-an-ip")), "127.0.0.1", false},
		{"xff entry with port", def, req("127.0.0.1:5000", xff("203.0.113.5:8443")), "203.0.113.5", false},
		{"x-real-ip is never trusted", def, req("127.0.0.1:5000", [2]string{"X-Real-IP", "1.2.3.4"}), "127.0.0.1", false},

		// IPv6.
		{"ipv6 loopback proxy", def, req("[::1]:5000", xff("2001:db8::42")), "2001:db8::42", false},
		{"ipv6 ula proxy", def, req("[fd00::1]:5000", xff("2001:db8::42")), "2001:db8::42", false},
		{"ipv6 public peer spoof", def, req("[2001:db8::1]:5000", xff("1.2.3.4")), "2001:db8::1", false},
		{"ipv6 bracketed xff entry with port", def, req("[::1]:5000", xff("[2001:db8::42]:1234")), "2001:db8::42", false},
		{"4in6 peer is unmapped", def, req("[::ffff:127.0.0.1]:5000", xff("203.0.113.5")), "203.0.113.5", false},
		{"zoned peer", def, req("[fe80::1%en0]:5000", xff("203.0.113.5")), "fe80::1", false},

		// Cloudflare.
		{"cf peer uses cf-connecting-ip", def, req(cfEdge+":443", cf("203.0.113.9"), xff("6.6.6.6")), "203.0.113.9", true},
		{"cf ipv6 peer", def, req("[2606:4700::1]:443", cf("2001:db8::9")), "2001:db8::9", true},
		{"cf peer without header falls back to xff", def, req(cfEdge+":443", xff("203.0.113.9")), "203.0.113.9", true},
		{"cf behind local nginx", def, req("127.0.0.1:5000", cf("203.0.113.9"), xff("6.6.6.6, 203.0.113.9, "+cfEdge)), "203.0.113.9", true},
		{"cf peer with garbage header", def, req(cfEdge+":443", cf("nope")), cfEdge, false},
		{"cf header via local proxy without cf hop", def, req("127.0.0.1:5000", cf("1.2.3.4"), xff("203.0.113.5")), "203.0.113.5", false},

		// TRAIL_TRUSTED_PROXIES=none.
		{"none ignores loopback xff", none, req("127.0.0.1:5000", xff("203.0.113.5")), "127.0.0.1", false},
		{"none ignores cloudflare", none, req(cfEdge+":443", cf("203.0.113.9")), cfEdge, false},

		// Explicit list: only those peers, and no implicit private ranges or Cloudflare.
		{"custom trusts listed ip", custom, req("203.0.113.10:80", xff("198.51.100.1")), "198.51.100.1", false},
		{"custom trusts listed v6 cidr", custom, req("[2001:db8:1::5]:80", xff("198.51.100.1")), "198.51.100.1", false},
		{"custom drops private default", custom, req("127.0.0.1:80", xff("198.51.100.1")), "127.0.0.1", false},
		{"custom drops cloudflare default", custom, req(cfEdge+":443", cf("198.51.100.1")), cfEdge, false},

		// Trusting every peer (opt-in, for rewrites from hosts without fixed IPs)
		// takes the leftmost entry again.
		{"trust all takes leftmost", all, req("198.51.100.7:4000", xff("1.2.3.4, 203.0.113.5")), "1.2.3.4", false},

		// Unparseable RemoteAddr is returned as is, never replaced by headers.
		{"bad remote addr", def, req("garbage", xff("1.2.3.4")), "garbage", false},
		{"remote addr without port", def, req("198.51.100.7", xff("1.2.3.4")), "198.51.100.7", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.res.ClientIP(tc.r); got != tc.want {
				t.Errorf("ClientIP = %q, want %q", got, tc.want)
			}
			if got := tc.res.Resolve(tc.r).ViaCloudflare; got != tc.cf {
				t.Errorf("ViaCloudflare = %v, want %v", got, tc.cf)
			}
		})
	}
}

func TestParseTrusted(t *testing.T) {
	for _, spec := range []string{"", "none", " NONE ", "private", "cloudflare", "private,cloudflare,10.0.0.1", "2001:db8::/32 , 192.0.2.0/24", "10.0.0.1,,"} {
		if _, err := ParseTrusted(spec); err != nil {
			t.Errorf("ParseTrusted(%q): %v", spec, err)
		}
	}
	for _, spec := range []string{"bogus", "10.0.0.0/33", "none,10.0.0.1", " , "} {
		if _, err := ParseTrusted(spec); err == nil {
			t.Errorf("ParseTrusted(%q): want error", spec)
		}
	}
	// "private,cloudflare" is the default.
	a, b := mustParse(t, ""), mustParse(t, "private,cloudflare")
	r := req(cfEdge+":443", cf("203.0.113.9"))
	if a.ClientIP(r) != b.ClientIP(r) {
		t.Error("default differs from private,cloudflare")
	}
}

func TestIsCloudflare(t *testing.T) {
	for s, want := range map[string]bool{
		cfEdge:              true,
		"173.245.48.1":      true,
		"2a06:98c0::1":      true,
		"::ffff:104.16.1.1": true,
		"8.8.8.8":           false,
		"127.0.0.1":         false,
		"2001:db8::1":       false,
	} {
		if got := IsCloudflare(netip.MustParseAddr(s)); got != want {
			t.Errorf("IsCloudflare(%s) = %v, want %v", s, got, want)
		}
	}
	if IsCloudflare(netip.Addr{}) {
		t.Error("zero addr is not cloudflare")
	}
}

func TestCloudflareSnapshotLoaded(t *testing.T) {
	if n := len(cloudflare); n < 20 {
		t.Fatalf("bundled cloudflare ranges = %d, want >= 20", n)
	}
}

// Long chains are bounded and still resolve to a real hop.
func TestLongChain(t *testing.T) {
	v := "203.0.113.5"
	for range 200 {
		v += ", 10.0.0.1"
	}
	got := mustParse(t, "").ClientIP(req("127.0.0.1:1", xff(v)))
	if got != "10.0.0.1" {
		t.Errorf("ClientIP = %q, want the last walked trusted hop 10.0.0.1", got)
	}
}

func FuzzClientIP(f *testing.F) {
	f.Add("127.0.0.1:1", "1.2.3.4, 10.0.0.1", "")
	f.Add(cfEdge+":443", "", "2001:db8::1")
	f.Add("[::1]:1", "[::1]:80,,x", "y")
	res, _ := ParseTrusted("")
	f.Fuzz(func(t *testing.T, remote, x, c string) {
		r := req(remote, xff(x), cf(c))
		got := res.Resolve(r)
		if got.IP.IsValid() && got.IP.Zone() != "" {
			t.Errorf("zone leaked: %v", got.IP)
		}
	})
}
