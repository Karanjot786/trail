package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"trail/internal/edgegeo"
	"trail/internal/enrich"
	"trail/internal/meta"
	"trail/internal/store"
)

// cityGeo maps 49.36.0.1 to IN / Maharashtra / Mumbai.
func cityGeo(t *testing.T) *enrich.Geo {
	t.Helper()
	geo, err := enrich.OpenGeo("../enrich/testdata/city-test.mmdb")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = geo.Close() })
	return geo
}

// edgeSetup is site s1 (example.com) with a live crawl token, the city test
// database and the edge-geo resolver keyed by the store's proxy keys.
func edgeSetup(t *testing.T, opts ...Option) (*store.Store, http.Handler, string) {
	t.Helper()
	st, reg := newRegistry(t, map[string]string{"s1": "example.com"})
	tok, err := meta.CreateToken(st.DB(), "proxy", meta.ScopeCrawl, "s1")
	if err != nil {
		t.Fatal(err)
	}
	rv := edgegeo.Resolver{Keys: func(site, prefix string) [][]byte {
		k, _ := meta.ProxyKeys(st.DB(), site, prefix)
		return k
	}}
	return st, New(st, cityGeo(t), reg, append([]Option{WithResolver(rv)}, opts...)...), tok.Token
}

// beacon is a POST to /_t/e from peer, as the site's page would send it.
func beacon(peer, body string, hdr map[string]string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/_t/e", strings.NewReader(body))
	r.RemoteAddr = peer + ":40000"
	r.Header.Set("Content-Type", "text/plain")
	r.Header.Set("Origin", "https://example.com")
	r.Header.Set("User-Agent", iphoneUA)
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	return r
}

const proxyPeer = "198.51.100.10" // the site's server: public, not a trusted proxy

// forward is a signed first-party proxy forward of body.
func forward(token, ip, geo, src, body string) *http.Request {
	h := edgegeo.SignProxy(token, "s1", time.Now().Unix(), ip, geo, src, "example.com", []byte(body))
	return beacon(proxyPeer, body, map[string]string{
		"X-Trail-IP": ip, "X-Trail-Geo": geo, "X-Trail-Geo-Src": src, "X-Trail-Host": "example.com",
		"X-Trail-Proxy": h,
	})
}

func serve(t *testing.T, h http.Handler, r *http.Request) int {
	t.Helper()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}

// geoRows returns country|region|city|geo_src of every stored event, oldest first.
func geoRows(t *testing.T, st *store.Store) []string {
	t.Helper()
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	rs, err := st.DB().Query(`SELECT country, region, city, geo_src FROM events ORDER BY rowid`)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	var out []string
	for rs.Next() {
		var c, r, ci, s string
		if err := rs.Scan(&c, &r, &ci, &s); err != nil {
			t.Fatal(err)
		}
		out = append(out, c+"|"+r+"|"+ci+"|"+s)
	}
	return out
}

func TestIngestEdgeGeoFromProxy(t *testing.T) {
	st, h, tok := edgeSetup(t, WithRateLimit(0.001, 1))
	if c := serve(t, h, forward(tok, "203.0.113.1", "IN|MH|Mumbai", "vercel", pageview)); c != http.StatusNoContent {
		t.Fatalf("first visitor: %d", c)
	}
	// A second visitor through the same proxy server has its own bucket.
	if c := serve(t, h, forward(tok, "203.0.113.2", "IN|MH|Mumbai", "vercel", pageview)); c != http.StatusNoContent {
		t.Fatalf("second visitor shares the proxy's bucket: %d", c)
	}
	// The first visitor again is over its limit.
	if c := serve(t, h, forward(tok, "203.0.113.1", "IN|MH|Mumbai", "vercel", pageview)); c != http.StatusTooManyRequests {
		t.Fatalf("first visitor again: %d, want 429", c)
	}
	got := geoRows(t, st)
	if len(got) != 2 || got[0] != "IN|Maharashtra|Mumbai|vercel" || got[1] != got[0] {
		t.Fatalf("rows %q", got)
	}
}

func TestIngestForgedProxyHeadersIgnored(t *testing.T) {
	st, h, tok := edgeSetup(t)
	cases := map[string]func(*http.Request){
		"bad hmac": func(r *http.Request) {
			h := r.Header.Get("X-Trail-Proxy")
			flip := byte('0')
			if h[len(h)-1] == '0' {
				flip = '1'
			}
			r.Header.Set("X-Trail-Proxy", h[:len(h)-1]+string(flip))
		},
		"tampered geo": func(r *http.Request) { r.Header.Set("X-Trail-Geo", "DE|BE|Berlin") },
		"no hmac":      func(r *http.Request) { r.Header.Del("X-Trail-Proxy") },
		"other token": func(r *http.Request) {
			o := forward("trl_"+strings.Repeat("Z", 32), "203.0.113.1", "US|CA|Los Angeles", "vercel", pageview)
			r.Header.Set("X-Trail-Proxy", o.Header.Get("X-Trail-Proxy"))
		},
	}
	for name, spoil := range cases {
		r := forward(tok, "203.0.113.1", "US|CA|Los Angeles", "vercel", pageview)
		r.RemoteAddr = "49.36.0.1:40000" // the real sender, in the test database
		spoil(r)
		if c := serve(t, h, r); c != http.StatusNoContent {
			t.Fatalf("%s: %d", name, c)
		}
	}
	for _, g := range geoRows(t, st) {
		if g != "IN|Maharashtra|Mumbai|" {
			t.Errorf("forged headers used: %q", g)
		}
	}
}

func TestIngestCFGeo(t *testing.T) {
	st, h, _ := edgeSetup(t)
	cf := map[string]string{"CF-Connecting-IP": "49.36.0.1", "CF-IPCountry": "DE", "CF-Region-Code": "BE", "CF-IPCity": "Berlin"}
	serve(t, h, beacon("173.245.48.10", pageview, cf)) // a Cloudflare edge
	serve(t, h, beacon("49.36.0.1", pageview, cf))     // anyone else
	got := geoRows(t, st)
	want := []string{"DE|Berlin|Berlin|cloudflare", "IN|Maharashtra|Mumbai|"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("rows %q, want %q", got, want)
	}
}

func TestIngestEdgeRegionMatchesDatabase(t *testing.T) {
	st, h, _ := edgeSetup(t)
	cf := map[string]string{"CF-Connecting-IP": "49.36.0.1", "CF-IPCountry": "IN", "CF-Region-Code": "MH", "CF-IPCity": "Mumbai"}
	serve(t, h, beacon("173.245.48.10", pageview, cf)) // edge code
	serve(t, h, beacon("49.36.0.1", pageview, nil))    // database name
	got := geoRows(t, st)
	want := []string{"IN|Maharashtra|Mumbai|cloudflare", "IN|Maharashtra|Mumbai|"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("rows %q, want %q", got, want)
	}
}

func TestIngestPrivateModeCountryOnly(t *testing.T) {
	st, h, tok := edgeSetup(t)
	serve(t, h, forward(tok, "203.0.113.1", "IN|MH|Mumbai", "vercel", privatePV))
	cf := map[string]string{"CF-Connecting-IP": "49.36.0.1", "CF-IPCountry": "DE", "CF-Region-Code": "BE", "CF-IPCity": "Berlin"}
	serve(t, h, beacon("173.245.48.10", privatePV, cf))
	got := geoRows(t, st)
	want := []string{"IN|||vercel", "DE|||cloudflare"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("rows %q, want %q", got, want)
	}
}

func TestIngestEdgeFieldFallback(t *testing.T) {
	st, h, tok := edgeSetup(t)
	// Country from the edge; region and city from the database for X-Trail-IP.
	serve(t, h, forward(tok, "49.36.0.1", "IN||", "vercel", pageview))
	// The database disagrees on the country: its region and city are not mixed in.
	serve(t, h, forward(tok, "49.36.0.1", "LK||", "vercel", pageview))
	got := geoRows(t, st)
	want := []string{"IN|Maharashtra|Mumbai|vercel", "LK|||vercel"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("rows %q, want %q", got, want)
	}
}

func TestIngestProxiedPrivateIdentityPerVisitor(t *testing.T) {
	st, h, tok := edgeSetup(t)
	serve(t, h, forward(tok, "203.0.113.1", "", "", privatePV))
	serve(t, h, forward(tok, "203.0.113.2", "", "", privatePV))
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := st.DB().QueryRow(`SELECT count(DISTINCT anon_id) FROM events`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("%d private identities, want one per visitor", n)
	}
}

func TestIngestEmbeddedCountryDefault(t *testing.T) {
	// No options and the embedded country database: geo works as before.
	st, reg := newRegistry(t, map[string]string{"s1": "example.com"})
	geo, err := enrich.OpenGeo("")
	if err != nil {
		t.Fatal(err)
	}
	h := New(st, geo, reg)
	serve(t, h, beacon("8.8.8.8", pageview, nil))
	got := geoRows(t, st)
	if len(got) != 1 || got[0] != "US|||" {
		t.Fatalf("rows %q, want the embedded country", got)
	}
}

// A Vercel or Netlify rewrite reaches Trail from the platform's edge, which
// is not a trusted proxy, so netx sees the edge's IP. A signed forward
// carries the visitor's IP, and Trail uses it with no TRAIL_TRUSTED_PROXIES.
func TestIngestRewriteEdgeUsesSignedIP(t *testing.T) {
	st, h, tok := edgeSetup(t)
	r := forward(tok, "49.36.0.1", "", "", pageview) // no edge geo: the database answers for the signed IP
	r.RemoteAddr = "76.76.21.21:443"
	r.Header.Set("X-Forwarded-For", "49.36.0.1")
	if c := serve(t, h, r); c != http.StatusNoContent {
		t.Fatalf("status %d", c)
	}
	// The same rewrite unsigned: the edge's IP, so no visitor geo.
	r = beacon("76.76.21.21", pageview, map[string]string{"X-Forwarded-For": "49.36.0.1", "X-Trail-IP": "49.36.0.1"})
	serve(t, h, r)
	got := geoRows(t, st)
	want := []string{"IN|Maharashtra|Mumbai|", "|||"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("rows %q, want %q", got, want)
	}
}
