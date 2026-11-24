package ingest

import (
	"net/http"
	"testing"

	"trail/internal/enrich"
	"trail/internal/sites"
)

func TestOriginCheck(t *testing.T) {
	tests := []struct {
		name string
		hdr  map[string]string
		want int
	}{
		{"exact domain", map[string]string{"Origin": "https://example.com"}, http.StatusNoContent},
		{"subdomain", map[string]string{"Origin": "https://www.example.com"}, http.StatusNoContent},
		{"wildcard origin", map[string]string{"Origin": "https://my-app-git-main.vercel.app"}, http.StatusNoContent},
		{"listed origin with port", map[string]string{"Origin": "https://partner.io:8443"}, http.StatusNoContent},
		{"wrong domain", map[string]string{"Origin": "https://evil.com"}, http.StatusForbidden},
		{"suffix trick", map[string]string{"Origin": "https://evil-example.com"}, http.StatusForbidden},
		{"domain as subdomain of attacker", map[string]string{"Origin": "https://example.com.evil.com"}, http.StatusForbidden},
		{"referer fallback", map[string]string{"Referer": "https://example.com/pricing?x=1"}, http.StatusNoContent},
		{"referer wrong", map[string]string{"Referer": "https://evil.com/"}, http.StatusForbidden},
		{"origin wins over referer", map[string]string{"Origin": "https://evil.com", "Referer": "https://example.com/"}, http.StatusForbidden},
		{"both missing", map[string]string{}, http.StatusForbidden},
		{"null origin", map[string]string{"Origin": "null"}, http.StatusForbidden},
		{"localhost", map[string]string{"Origin": "http://localhost:3000"}, http.StatusNoContent},
		{"loopback v4", map[string]string{"Origin": "http://127.0.0.1:5173"}, http.StatusNoContent},
		{"loopback v6", map[string]string{"Origin": "http://[::1]:8080"}, http.StatusNoContent},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, reg := newRegistry(t, nil)
			if _, err := reg.Add(sites.Site{ID: "s1", Domain: "example.com", Origins: []string{"*.vercel.app", "partner.io"}}); err != nil {
				t.Fatal(err)
			}
			geo, _ := enrich.OpenGeo("")
			h := New(st, geo, reg)
			w := postFrom(h, pageview, tt.hdr)
			if w.Code != tt.want {
				t.Fatalf("status %d, want %d (body %q)", w.Code, tt.want, w.Body)
			}
			if tt.want == http.StatusForbidden {
				if w.Body.Len() != 0 {
					t.Errorf("403 body %q, want empty", w.Body)
				}
				// The tracker must be able to read the 403 so it drops the
				// events instead of retrying them.
				if o := tt.hdr["Origin"]; o != "" && w.Header().Get("Access-Control-Allow-Origin") != o {
					t.Errorf("403 ACAO = %q, want %q", w.Header().Get("Access-Control-Allow-Origin"), o)
				}
				if n := rows(t, st); n != 0 {
					t.Errorf("rows = %d", n)
				}
				if n := reg.Rejected24h("s1"); n != 1 {
					t.Errorf("rejected counter = %d, want 1", n)
				}
			} else if n := reg.Rejected24h("s1"); n != 0 {
				t.Errorf("accepted request counted as rejected: %d", n)
			}
		})
	}
}

// A Vercel or Next.js rewrite proxies /_t/e from the customer's own domain:
// the browser posts same-origin, and still sends Origin: https://<their domain>.
// The request reaches Trail with Trail's own Host.
func TestOriginThroughRewrite(t *testing.T) {
	st, h := setup(t)
	w := postFrom(h, pageview, map[string]string{
		"Origin":            "https://example.com",
		"Host":              "trail.fly.dev",
		"X-Forwarded-Host":  "example.com",
		"X-Forwarded-Proto": "https",
	})
	if w.Code != http.StatusNoContent {
		t.Fatalf("status %d %q", w.Code, w.Body)
	}
	if n := rows(t, st); n != 1 {
		t.Fatalf("rows = %d", n)
	}
}

func TestPreflightEchoesOrigin(t *testing.T) {
	_, h := setup(t)
	for _, origin := range []string{"https://example.com", "https://anything.dev"} {
		w := postMethod(h, http.MethodOptions, origin)
		if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Origin") != origin ||
			w.Header().Get("Access-Control-Allow-Headers") != "Content-Type" {
			t.Errorf("%s: %d %v", origin, w.Code, w.Header())
		}
	}
}

// A garbage X-Trail-Proxy on an accepted origin is counted for the install
// check; a plain browser request and an origin-refused one are not.
func TestBadProxyCounted(t *testing.T) {
	st, reg := newRegistry(t, nil)
	if _, err := reg.Add(sites.Site{ID: "s1", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	geo, _ := enrich.OpenGeo("")
	h := New(st, geo, reg)
	ok := map[string]string{"Origin": "https://example.com"}
	postFrom(h, pageview, ok)
	if n := reg.BadProxy24h("s1"); n != 0 {
		t.Fatalf("plain request counted: %d", n)
	}
	postFrom(h, pageview, map[string]string{"Origin": "https://evil.com", "X-Trail-Proxy": "garbage"})
	if n := reg.BadProxy24h("s1"); n != 0 {
		t.Fatalf("refused origin counted: %d", n)
	}
	w := postFrom(h, pageview, map[string]string{"Origin": "https://example.com", "X-Trail-Proxy": "garbage"})
	if n := reg.BadProxy24h("s1"); n != 1 || w.Header().Get("X-Trail-Proxy-Status") != "invalid" {
		t.Fatalf("count %d status %q", n, w.Header().Get("X-Trail-Proxy-Status"))
	}
}
