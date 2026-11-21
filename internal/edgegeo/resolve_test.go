package edgegeo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"trail/internal/netx"
)

const cfPeer = "173.245.48.10" // in netx's bundled Cloudflare snapshot (173.245.48.0/20)

func testResolver() Resolver {
	return Resolver{Keys: testKeys, Now: func() time.Time { return testNow }, Net: netx.Default()}
}

func cfRequest(peer string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/_t/e", strings.NewReader("{}"))
	r.RemoteAddr = peer + ":443"
	r.Header.Set("CF-Connecting-IP", "198.51.100.77")
	r.Header.Set("CF-IPCountry", "DE")
	r.Header.Set("CF-Region-Code", "BE")
	r.Header.Set("CF-IPCity", "Berlin")
	return r
}

func TestCFGeoOnlyFromCloudflare(t *testing.T) {
	rv := testResolver()
	got := rv.Resolve(cfRequest("203.0.113.9"), testSite, []byte("{}"))
	if got != (Result{IP: "203.0.113.9"}) {
		t.Fatalf("non-Cloudflare peer: got %+v", got)
	}
	got = rv.Resolve(cfRequest(cfPeer), testSite, []byte("{}"))
	want := Result{IP: "198.51.100.77", Country: "DE", Region: "BE", City: "Berlin", Source: "cloudflare"}
	if got != want {
		t.Fatalf("Cloudflare peer: got %+v, want %+v", got, want)
	}
}

func TestCFGeoNotTrustedWhenCloudflareOff(t *testing.T) {
	net, err := netx.ParseTrusted("private")
	if err != nil {
		t.Fatal(err)
	}
	rv := testResolver()
	rv.Net = net
	if got := rv.Resolve(cfRequest(cfPeer), testSite, nil); got.Country != "" || got.Source != "" {
		t.Fatalf("cloudflare not trusted, got %+v", got)
	}
}

func TestCFGeoBehindLocalProxy(t *testing.T) {
	r := cfRequest("127.0.0.1")
	r.Header.Set("X-Forwarded-For", "198.51.100.77, "+cfPeer)
	got := testResolver().Resolve(r, testSite, nil)
	if got.IP != "198.51.100.77" || got.Country != "DE" || got.Source != "cloudflare" {
		t.Fatalf("got %+v", got)
	}
}

func TestCFGeoValidation(t *testing.T) {
	for _, c := range []struct{ cc, region, city, wantCC, wantRegion, wantCity string }{
		{"XX", "BE", "Berlin", "", "", ""},
		{"T1", "BE", "Berlin", "", "", ""},
		{"", "BE", "Berlin", "", "", ""},
		{"DE", "", "", "DE", "", ""},
		{"DE", "B E", strings.Repeat("x", 65), "DE", "", ""},
	} {
		r := cfRequest(cfPeer)
		r.Header.Set("CF-IPCountry", c.cc)
		r.Header.Set("CF-Region-Code", c.region)
		r.Header.Set("CF-IPCity", c.city)
		got := testResolver().Resolve(r, testSite, nil)
		if got.Country != c.wantCC || got.Region != c.wantRegion || got.City != c.wantCity {
			t.Errorf("%+v: got %+v", c, got)
		}
		if (got.Source == "cloudflare") != (c.wantCC != "") {
			t.Errorf("%+v: source %q", c, got.Source)
		}
		if got.IP != "198.51.100.77" || got.Proxied {
			t.Errorf("%+v: ip %q proxied %v", c, got.IP, got.Proxied)
		}
	}
}

func TestResolveProxyWinsOverCF(t *testing.T) {
	f := good()
	r := f.request(f.header())
	r.RemoteAddr = cfPeer + ":443"
	r.Header.Set("CF-Connecting-IP", "198.51.100.77")
	r.Header.Set("CF-IPCountry", "DE")
	got := testResolver().Resolve(r, testSite, []byte(f.body))
	if !got.Proxied || got.IP != "203.0.113.7" || got.Country != "IN" || got.Source != "vercel" {
		t.Fatalf("got %+v", got)
	}
}

func TestResolveForgedProxyFallsBack(t *testing.T) {
	f := good()
	r := f.request(f.header())
	r.Header.Set("X-Trail-Geo", "US|CA|Los Angeles") // tampered after signing
	got := testResolver().Resolve(r, testSite, []byte(f.body))
	if got != (Result{IP: "198.51.100.10"}) {
		t.Fatalf("got %+v, want the peer and no geo", got)
	}
}

func TestResolvePlain(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/_t/e", nil)
	r.RemoteAddr = "203.0.113.9:5000"
	r.Header.Set("X-Forwarded-For", "8.8.8.8")  // from an untrusted peer: ignored
	r.Header.Set("X-Trail-IP", "8.8.4.4")       // unsigned: ignored
	got := Resolver{}.Resolve(r, testSite, nil) // zero value: netx.Default, no keys
	if got != (Result{IP: "203.0.113.9"}) {
		t.Fatalf("got %+v", got)
	}
}
