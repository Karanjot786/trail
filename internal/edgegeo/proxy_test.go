package edgegeo

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

var update = flag.Bool("update", false, "rewrite testdata/proxy-vector.json")

const (
	testToken = "trl_AbCdEfGhIjKlMnOpQrStUvWxYz012345"
	testSite  = "demo"
)

var testNow = time.Unix(1763700000, 0)

// fwd is one proxy forward, signed by hand from §0.12 (not with SignProxy),
// so the tests pin the wire format independently of the implementation.
type fwd struct {
	token, site, ip, geo, src, host, body string
	t                                     int64
}

func good() fwd {
	return fwd{token: testToken, site: testSite, ip: "203.0.113.7", geo: "IN|MH|Mumbai", src: "vercel",
		host: "demo.trail.dev", body: `{"s":"demo","t":"pageview"}`, t: testNow.Unix()}
}

func (f fwd) header() string {
	key := sha256.Sum256([]byte(f.token))
	bh := sha256.Sum256([]byte(f.body))
	ts := strconv.FormatInt(f.t, 10)
	m := hmac.New(sha256.New, key[:])
	m.Write([]byte("v1\n" + f.site + "\n" + ts + "\n" + f.ip + "\n" + f.geo + "\n" + f.src + "\n" + f.host + "\n" + hex.EncodeToString(bh[:])))
	return "v1;k=" + f.token[:12] + ";t=" + ts + ";s=" + hex.EncodeToString(m.Sum(nil))
}

func (f fwd) request(h string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/_t/e", strings.NewReader(f.body))
	r.RemoteAddr = "198.51.100.10:443"
	r.Header.Set("X-Trail-IP", f.ip)
	r.Header.Set("X-Trail-Geo", f.geo)
	r.Header.Set("X-Trail-Geo-Src", f.src)
	r.Header.Set("X-Trail-Host", f.host)
	r.Header.Set("X-Trail-Proxy", h)
	return r
}

// keysFor serves the stored hash of tokens, each bound to its site.
func keysFor(bound map[string]string) Keys {
	return func(site, prefix string) [][]byte {
		var out [][]byte
		for tok, s := range bound {
			if s == site && tok[:12] == prefix {
				h := sha256.Sum256([]byte(tok))
				out = append(out, h[:])
			}
		}
		return out
	}
}

var testKeys = keysFor(map[string]string{testToken: testSite})

func verify(t *testing.T, f fwd, h string) (Result, bool) {
	t.Helper()
	return VerifyProxy(f.request(h), testSite, []byte(f.body), testKeys, testNow)
}

func TestProxyHMACAccepts(t *testing.T) {
	f := good()
	got, ok := verify(t, f, f.header())
	want := Result{IP: "203.0.113.7", Country: "IN", Region: "MH", City: "Mumbai", Source: "vercel",
		Proxied: true, Host: "demo.trail.dev"}
	if !ok || got != want {
		t.Fatalf("got %+v %v, want %+v", got, ok, want)
	}
}

func TestProxyHMACAcceptsWithinWindow(t *testing.T) {
	for _, d := range []int64{-300, 300} {
		f := good()
		f.t += d
		if _, ok := verify(t, f, f.header()); !ok {
			t.Errorf("t%+d s rejected", d)
		}
	}
}

func TestProxyHMACAcceptsNoGeo(t *testing.T) {
	f := good()
	f.geo, f.src = "", ""
	got, ok := verify(t, f, f.header())
	if !ok || got.IP != "203.0.113.7" || got.Country != "" || got.Source != "" || !got.Proxied {
		t.Fatalf("got %+v %v", got, ok)
	}
}

func TestProxyHMACRejectsWrongKey(t *testing.T) {
	f := good()
	f.token = testToken[:12] + "ZZZZZZZZZZZZZZZZZZZZZZZZ" // same prefix, other secret
	assertRejected(t, f, f.header())
}

func TestProxyHMACRejectsStale(t *testing.T) {
	for _, d := range []int64{-301, 301} {
		f := good()
		f.t += d
		assertRejected(t, f, f.header())
	}
}

func TestProxyHMACRejectsBodySwap(t *testing.T) {
	f := good()
	h := f.header()
	f.body = `{"s":"demo","t":"event"}`
	assertRejected(t, f, h)
}

func TestProxyHMACRejectsGeoTamper(t *testing.T) {
	for _, tamper := range []func(*fwd){
		func(f *fwd) { f.geo = "US|CA|Los Angeles" },
		func(f *fwd) { f.ip = "203.0.113.8" },
		func(f *fwd) { f.src = "cloudflare" },
		func(f *fwd) { f.host = "evil.example" },
	} {
		f := good()
		h := f.header()
		tamper(&f)
		assertRejected(t, f, h)
	}
}

func TestProxyHMACRejectsOtherSite(t *testing.T) {
	// A valid forward signed for site "docs" with docs' own token.
	docsTok := "trl_DocsDocsDocsDocsDocsDocsDocsDocs"
	keys := keysFor(map[string]string{testToken: testSite, docsTok: "docs"})
	f := good()
	f.token, f.site = docsTok, "docs"
	if _, ok := VerifyProxy(f.request(f.header()), "docs", []byte(f.body), keys, testNow); !ok {
		t.Fatal("docs forward rejected for docs")
	}
	// The payload says site "demo": docs' token must not vouch for it.
	if _, ok := VerifyProxy(f.request(f.header()), testSite, []byte(f.body), keys, testNow); ok {
		t.Fatal("docs token accepted for demo")
	}
	// Signed as "demo" with docs' token: no demo key has docs' prefix.
	f.site = testSite
	if _, ok := VerifyProxy(f.request(f.header()), testSite, []byte(f.body), keys, testNow); ok {
		t.Fatal("docs token accepted when signing as demo")
	}
}

func TestProxyHMACRejectsRevoked(t *testing.T) {
	f := good()
	none := func(string, string) [][]byte { return nil }
	if _, ok := VerifyProxy(f.request(f.header()), testSite, []byte(f.body), none, testNow); ok {
		t.Fatal("accepted with no live key")
	}
	if _, ok := VerifyProxy(f.request(f.header()), testSite, []byte(f.body), nil, testNow); ok {
		t.Fatal("accepted with nil Keys")
	}
}

func TestProxyHMACRejectsMalformedHeader(t *testing.T) {
	f := good()
	h := f.header()
	for _, bad := range []string{
		"",
		"v2" + h[2:],
		strings.Replace(h, ";s=", ";x=", 1),
		strings.ToUpper(h),
		h + ";extra=1",
		h + "00",
		strings.Replace(h, ";t=", ";t=+", 1),
		strings.Replace(h, ";t=", ";t=0", 1),
		"v1;k=trl_AbCdEfGh;t=1;s=00",
		strings.Repeat("v1;", 2000),
	} {
		assertRejected(t, f, bad)
	}
	// An invalid X-Trail-IP is a failure, even when correctly signed.
	g := good()
	g.ip = "not-an-ip"
	assertRejected(t, g, g.header())
	// An unknown geo source likewise.
	g = good()
	g.src = "akamai"
	assertRejected(t, g, g.header())
}

func assertRejected(t *testing.T, f fwd, h string) {
	t.Helper()
	got, ok := verify(t, f, h)
	if ok || got != (Result{}) {
		t.Errorf("header %.60q accepted: %+v", h, got)
	}
}

func TestProxyGeoValidation(t *testing.T) {
	long := strings.Repeat("a", 300)
	cases := []struct{ geo, country, region, city string }{
		{"XX|MH|Mumbai", "", "", ""},
		{"T1|MH|Mumbai", "", "", ""},
		{"in|MH|Mumbai", "", "", ""},
		{"IN|MH|" + long, "IN", "MH", ""},
		{"BR|SP|São Paulo", "BR", "SP", "São Paulo"},
		{"IN|toolongregion|Pune", "IN", "", "Pune"},
		{"IN|M_H|Pune", "IN", "", "Pune"},
		{"IN||", "IN", "", ""},
		{"IN|MH|Mum\x00bai", "IN", "MH", ""},
		{"IN|MH|\xff\xfe", "IN", "MH", ""},
		{"IN", "IN", "", ""},
	}
	for _, c := range cases {
		f := good()
		f.geo = c.geo
		got, ok := verify(t, f, f.header())
		if !ok {
			t.Errorf("%q: rejected", c.geo)
			continue
		}
		if got.Country != c.country || got.Region != c.region || got.City != c.city {
			t.Errorf("%q: got %q %q %q, want %q %q %q", c.geo, got.Country, got.Region, got.City, c.country, c.region, c.city)
		}
		if (got.Source != "") != (c.country != "") {
			t.Errorf("%q: source %q with country %q", c.geo, got.Source, got.Country)
		}
	}
}

func TestProxyOversizedHeadersRejected(t *testing.T) {
	f := good()
	f.geo = "IN|MH|" + strings.Repeat("x", 2000) // over the 1 KiB cap
	assertRejected(t, f, f.header())
	f = good()
	f.host = strings.Repeat("h", 256)
	assertRejected(t, f, f.header())
}

// vector is the shared test vector: the npm forward must produce the same header.
type vector struct {
	Token  string `json:"token"`
	Site   string `json:"site"`
	T      int64  `json:"t"`
	IP     string `json:"ip"`
	Geo    string `json:"geo"`
	GeoSrc string `json:"geoSrc"`
	Host   string `json:"host"`
	Body   string `json:"body"`
	Header string `json:"header"`
}

func TestProxyVector(t *testing.T) {
	const path = "testdata/proxy-vector.json"
	f := good()
	f.geo = "BR|SP|São Paulo"
	if *update {
		v := vector{Token: f.token, Site: f.site, T: f.t, IP: f.ip, Geo: f.geo, GeoSrc: f.src, Host: f.host,
			Body: f.body, Header: f.header()}
		b, _ := json.MarshalIndent(v, "", "  ")
		if err := os.WriteFile(path, append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var v vector
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	vf := fwd{token: v.Token, site: v.Site, ip: v.IP, geo: v.Geo, src: v.GeoSrc, host: v.Host, body: v.Body, t: v.T}
	if h := vf.header(); h != v.Header {
		t.Fatalf("hand-built header %q != vector %q", h, v.Header)
	}
	if h := SignProxy(v.Token, v.Site, v.T, v.IP, v.Geo, v.GeoSrc, v.Host, []byte(v.Body)); h != v.Header {
		t.Fatalf("SignProxy %q != vector %q", h, v.Header)
	}
	keys := keysFor(map[string]string{v.Token: v.Site})
	got, ok := VerifyProxy(vf.request(v.Header), v.Site, []byte(v.Body), keys, time.Unix(v.T, 0))
	if !ok || got.City != "São Paulo" {
		t.Fatalf("vector does not verify: %+v %v", got, ok)
	}
}

func FuzzParseProxyHeader(f *testing.F) {
	f.Add(good().header())
	f.Add("v1;k=trl_AbCdEfGh;t=1;s=")
	f.Add(";;;")
	f.Add("v1;k=;t=;s=;")
	f.Fuzz(func(t *testing.T, h string) {
		p, ok := parseProxyHeader(h)
		if !ok {
			return
		}
		if len(p.prefix) != 12 || len(p.sig) != sha256.Size || p.ts == "" || len(p.ts) > 12 {
			t.Fatalf("accepted bad parts: %+v", p)
		}
		fw := good()
		r := fw.request(h)
		_, _ = VerifyProxy(r, testSite, []byte(fw.body), testKeys, testNow) // must not panic
	})
}
