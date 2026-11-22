package install

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/sites"
	"trail/internal/store"
)

type fakeFetch struct {
	page Page
	err  error
}

func (f fakeFetch) Fetch(context.Context, string) (Page, error) { return f.page, f.err }

func html(tag string) Page {
	return Page{Status: 200, Header: http.Header{}, Body: []byte("<html><head>" + tag + "</head></html>")}
}

const goodTag = `<script defer src="https://trail.example.net/_t/t.js" data-site="s"></script>`

func TestCheckReasonCodes(t *testing.T) {
	now := time.Now().UnixMilli()
	ev := func(env string, bot bool, retry int) store.Event {
		return store.Event{SiteID: "s", Type: "pageview", AnonID: "a", SessionID: "x", Path: "/", TS: now - 1000, Env: env, IsBot: bot, Retry: retry}
	}
	csp := func(p string) Page {
		pg := html(goodTag)
		pg.Header.Set("Content-Security-Policy", p)
		return pg
	}
	for _, c := range []struct {
		name   string
		fetch  fakeFetch
		events []store.Event
		reject bool
		id     string
		code   ReasonCode
		state  string
	}{
		{"fetch failed", fakeFetch{err: errors.New("dial: no such host")}, nil, false, "page", CodeFetchFailed, "blocked"},
		{"404 home", fakeFetch{page: Page{Status: 404, Header: http.Header{}}}, nil, false, "page", CodeFetchFailed, "blocked"},
		{"script missing", fakeFetch{page: html("")}, nil, false, "script", CodeScriptMissing, "blocked"},
		{"wrong site id", fakeFetch{page: html(`<script src="https://trail.example.net/_t/t.js" data-site="docs">`)}, nil, false, "script", CodeWrongSiteID, "blocked"},
		{"wrong host", fakeFetch{page: html(`<SCRIPT data-site='s' src='https://old.example.org/_t/t.js'>`)}, nil, false, "script", CodeWrongHost, "blocked"},
		{"csp blocked", fakeFetch{page: csp("default-src 'self'; script-src 'self' https://cdn.example.com")}, nil, false, "csp", CodeCSPBlocked, "blocked"},
		{"csp ok", fakeFetch{page: csp("script-src 'self' https://trail.example.net; connect-src *.example.net")}, nil, false, "csp", CodeOK, "waiting"},
		{"origin", fakeFetch{page: html(goodTag)}, nil, true, "origin", CodeOriginNotAllowed, "blocked"},
		{"no events", fakeFetch{page: html(goodTag)}, nil, false, "first_event", CodeNoEvents, "waiting"},
		{"preview only", fakeFetch{page: html(goodTag)}, []store.Event{ev("preview", false, 0)}, false, "first_event", CodeEventsPreviewOnly, "receiving"},
		{"bots only", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", true, 0)}, false, "first_event", CodeBotFiltered, "waiting"},
		{"retries", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", false, 1), ev("production", false, 0)}, false, "delivery", CodeRetriesHigh, "receiving"},
		{"ok", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", false, 0)}, false, "first_event", CodeOK, "receiving"},
	} {
		t.Run(c.name, func(t *testing.T) {
			st, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer st.Close()
			for _, e := range c.events {
				st.Enqueue(e)
			}
			if err := st.Flush(); err != nil {
				t.Fatal(err)
			}
			reg, _ := sites.Open(st.DB())
			site, err := reg.Add(sites.Site{ID: "s", Domain: "example.com"})
			if err != nil {
				t.Fatal(err)
			}
			if c.reject {
				reg.Reject("s")
			}
			got, err := Check(context.Background(), st.DB(), reg, site, "trail.example.net", c.fetch)
			if err != nil {
				t.Fatal(err)
			}
			if len(got.Checks) != 6 {
				t.Fatalf("checks %+v", got.Checks)
			}
			ids := []string{"page", "script", "csp", "origin", "first_event", "delivery"}
			for i, it := range got.Checks {
				if it.ID != ids[i] {
					t.Fatalf("order %d: %s", i, it.ID)
				}
				if it.ID == c.id && it.Code != c.code {
					t.Errorf("%s: code %s, want %s (%s)", it.ID, it.Code, c.code, it.Detail)
				}
			}
			if got.State != c.state {
				t.Errorf("state %s, want %s", got.State, c.state)
			}
		})
	}
}

func TestSafeFetcherRefusesPrivate(t *testing.T) {
	f := NewSafeFetcher()
	for _, host := range []string{"127.0.0.1", "10.0.0.5", "169.254.169.254", "[::1]", "localhost", "0.0.0.0", "100.64.0.1", "[::ffff:127.0.0.1]"} {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, err := f.Fetch(ctx, host)
		cancel()
		if err == nil {
			t.Errorf("%s: fetched", host)
		}
	}
	for _, bad := range []string{"", "evil.com/@x", "a b", "user@host"} {
		if _, err := f.Fetch(context.Background(), bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
	for addr, want := range map[string]bool{"8.8.8.8": true, "2606:4700::1111": true, "192.168.1.1": false, "fd00::1": false, "::ffff:10.0.0.1": false, "224.0.0.1": false} {
		if got := PublicAddr(netip.MustParseAddr(addr)); got != want {
			t.Errorf("PublicAddr(%s) = %v", addr, got)
		}
	}
}

// testFetcher trusts srv's certificate and allows loopback, so redirects can be tested.
func testFetcher(srv *httptest.Server) *SafeFetcher {
	pool := x509.NewCertPool()
	pool.AddCert(srv.Certificate())
	return &SafeFetcher{allow: func(netip.Addr) bool { return true }, tlsConf: &tls.Config{RootCAs: pool}}
}

func TestSafeFetcherNoCrossHostRedirect(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			http.Redirect(w, r, "https://evil.example/", http.StatusFound)
		}
	}))
	defer srv.Close()
	host := strings.TrimPrefix(srv.URL, "https://")
	if _, err := testFetcher(srv).Fetch(context.Background(), host); err == nil || !strings.Contains(err.Error(), "another host") {
		t.Fatalf("cross-host redirect: %v", err)
	}

	same := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/home", http.StatusFound)
			return
		}
		if r.Header.Get("User-Agent") != "Trail-install-check/1" {
			t.Errorf("UA %q", r.Header.Get("User-Agent"))
		}
		_, _ = w.Write([]byte(strings.Repeat("x", fetchMaxBody+100)))
	}))
	defer same.Close()
	page, err := testFetcher(same).Fetch(context.Background(), strings.TrimPrefix(same.URL, "https://"))
	if err != nil || page.Status != 200 || len(page.Body) != fetchMaxBody {
		t.Fatalf("same-host redirect: %v %d", err, len(page.Body))
	}

	loop := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, r.URL.Path+"x", http.StatusFound)
	}))
	defer loop.Close()
	if _, err := testFetcher(loop).Fetch(context.Background(), strings.TrimPrefix(loop.URL, "https://")); err == nil {
		t.Fatal("redirect loop followed")
	}
}

func TestSameSiteRedirect(t *testing.T) {
	for _, c := range []struct {
		to, host string
		ok       bool
	}{
		{"www.example.com", "example.com", true},
		{"example.com", "www.example.com", true},
		{"EXAMPLE.com", "example.com", true},
		{"blog.example.com", "example.com", true},
		{"evil.com", "example.com", false},
		{"example.com.evil.com", "example.com", false},
		{"notexample.com", "example.com", false},
		{"other.example.com", "www.example.com", false},
	} {
		if got := sameSite(c.to, c.host); got != c.ok {
			t.Errorf("sameSite(%q, %q) = %v, want %v", c.to, c.host, got, c.ok)
		}
	}
}
