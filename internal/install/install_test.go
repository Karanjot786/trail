package install

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
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

const goodTag = `<script defer src="https://trail.example.net/_t/t.js" data-site="s" data-api="https://trail.example.net/_t/e"></script>`

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
		{"script missing", fakeFetch{page: html("")}, nil, false, "script", CodeScriptMissing, "waiting"},
		{"wrong site id", fakeFetch{page: html(`<script src="https://trail.example.net/_t/t.js" data-site="docs">`)}, nil, false, "script", CodeWrongSiteID, "blocked"},
		{"wrong host", fakeFetch{page: html(`<SCRIPT data-site='s' data-api='https://old.example.org/_t/e' src='https://old.example.org/_t/t.js'>`)}, nil, false, "script", CodeWrongHost, "blocked"},
		{"csp blocked", fakeFetch{page: csp("default-src 'self'; script-src 'self' https://cdn.example.com")}, nil, false, "csp", CodeCSPBlocked, "blocked"},
		{"csp ok", fakeFetch{page: csp("script-src 'self' https://trail.example.net; connect-src *.example.net")}, nil, false, "csp", CodeOK, "waiting"},
		{"origin", fakeFetch{page: html(goodTag)}, nil, true, "origin", CodeOriginNotAllowed, "blocked"},
		{"no events", fakeFetch{page: html(goodTag)}, nil, false, "first_event", CodeNoEvents, "waiting"},
		{"preview only", fakeFetch{page: html(goodTag)}, []store.Event{ev("preview", false, 0)}, false, "first_event", CodeEventsPreviewOnly, "receiving"},
		{"bots only", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", true, 0)}, false, "first_event", CodeBotFiltered, "waiting"},
		{"retries", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", false, 1), ev("production", false, 0)}, false, "delivery", CodeRetriesHigh, "receiving"},
		{"ok", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", false, 0)}, false, "first_event", CodeOK, "receiving"},
		{"origin while receiving", fakeFetch{page: html(goodTag)}, []store.Event{ev("production", false, 0)}, true, "origin", CodeOriginNotAllowed, "receiving"},
		{"csp while receiving", fakeFetch{page: csp("script-src 'self'")}, []store.Event{ev("production", false, 0)}, false, "csp", CodeCSPBlocked, "receiving"},
		{"fetch failed while receiving", fakeFetch{err: errors.New("dial: no such host")}, []store.Event{ev("production", false, 0)}, false, "page", CodeFetchFailed, "receiving"},
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
			if len(got.Checks) != 8 {
				t.Fatalf("checks %+v", got.Checks)
			}
			ids := []string{"page", "script", "csp", "origin", "first_event", "delivery", "robots", "proxy"}
			for i, it := range got.Checks {
				if it.ID != ids[i] {
					t.Fatalf("order %d: %s", i, it.ID)
				}
				if it.ID == c.id && it.Code != c.code {
					t.Errorf("%s: code %s, want %s (%s)", it.ID, it.Code, c.code, it.Detail)
				}
				if got.State == "receiving" && it.Status == "fail" {
					t.Errorf("%s is fail while receiving", it.ID)
				}
				if got.State == "receiving" && it.ID == c.id && c.code != CodeOK && it.Status != "warn" {
					t.Errorf("%s: status %s, want warn while receiving", it.ID, it.Status)
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
		if ua := r.Header.Get("User-Agent"); !strings.Contains(ua, "TrailInstallCheck/1.0") || !strings.HasPrefix(ua, "Mozilla/5.0") {
			t.Errorf("UA %q", ua)
		}
		if !strings.Contains(r.Header.Get("Accept"), "application/xhtml+xml") || r.Header.Get("Accept-Language") != "en" {
			t.Errorf("headers %q %q", r.Header.Get("Accept"), r.Header.Get("Accept-Language"))
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

func TestOriginFixVercel(t *testing.T) {
	if got := originFix("myapp-git-feat-acme.vercel.app"); !strings.Contains(got, "*-acme.vercel.app") {
		t.Errorf("vercel: %q", got)
	}
	if got := originFix("staging.other.io"); !strings.Contains(got, "*-team.vercel.app") || strings.Contains(got, "*-other") {
		t.Errorf("generic: %q", got)
	}
	if got := originFix(""); !strings.Contains(got, "*-team.vercel.app") {
		t.Errorf("empty: %q", got)
	}
}

func TestCheckOriginFixNamesVercelScope(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	reg, _ := sites.Open(st.DB())
	site, _ := reg.Add(sites.Site{ID: "s", Domain: "example.com"})
	reg.RejectFrom("s", "myapp-abc123def-acme.vercel.app")
	got, err := Check(context.Background(), st.DB(), reg, site, "trail.example.net", fakeFetch{page: html(goodTag)})
	if err != nil {
		t.Fatal(err)
	}
	for _, it := range got.Checks {
		if it.ID == "origin" && !strings.Contains(it.Fix, "*-acme.vercel.app") {
			t.Errorf("fix %q", it.Fix)
		}
	}
}

func TestFindTrackerAndScriptCheck(t *testing.T) {
	next, err := os.ReadFile("testdata/next-rsc.html")
	if err != nil {
		t.Fatal(err)
	}
	astro, err := os.ReadFile("testdata/astro-inline.html")
	if err != nil {
		t.Fatal(err)
	}
	site := func(id string) sites.Site { return sites.Site{ID: id, Domain: "agentskills.in"} }
	for _, c := range []struct {
		name, html, id string
		received       bool
		status         string
		code           ReasonCode
	}{
		{"next rsc", string(next), "agent-skills", false, "pass", CodeOK},
		{"astro inline", string(astro), "blog", false, "pass", CodeOK},
		{"proxy path tag", `<script defer src="/t/t.js" data-site="agent-skills" data-api="/t/e">`, "agent-skills", false, "pass", CodeOK},
		{"own www absolute", `<script src="https://www.agentskills.in/t/t.js" data-site="agent-skills" data-api="/t/e">`, "agent-skills", false, "pass", CodeOK},
		{"fathom ignored", `<script src="https://cdn.usefathom.com/script.js" data-site="ABCDEF">`, "agent-skills", false, "warn", CodeScriptMissing},
		{"none, events arrive", ``, "agent-skills", true, "pass", CodeOK},
		{"none, no events", ``, "agent-skills", false, "warn", CodeScriptMissing},
		{"trail host, no api", `<script src="https://trail.example.net/_t/t.js" data-site="agent-skills">`, "agent-skills", false, "fail", CodeAPIMissing},
		{"other trail", `<script src="https://old.example.org/_t/t.js" data-site="agent-skills" data-api="https://old.example.org/_t/e">`, "agent-skills", false, "fail", CodeWrongHost},
		{"next rsc wrong site", string(next), "other", false, "fail", CodeWrongSiteID},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := scriptCheck(findTracker(c.html), site(c.id), "trail.example.net", c.received)
			if got.Status != c.status || got.Code != c.code {
				t.Fatalf("got %s/%s (%s)", got.Status, got.Code, got.Detail)
			}
		})
	}
	if fix := scriptCheck(findTracker(""), site("x"), "trail.example.net", false).Fix; !strings.Contains(fix, `data-api="https://trail.example.net/_t/e"`) {
		t.Errorf("snippet lacks data-api: %s", fix)
	}
}

func TestFindTrackerVia(t *testing.T) {
	next, _ := os.ReadFile("testdata/next-rsc.html")
	astro, _ := os.ReadFile("testdata/astro-inline.html")
	for html, want := range map[string]string{
		`<script src="/_t/t.js" data-site="s" nonce="abc">`: "tag",
		string(next):     "next",
		string(astro):    "astro",
		`<p>nothing</p>`: "",
	} {
		if got := findTracker(html).Via; got != want {
			t.Errorf("Via %q, want %q", got, want)
		}
	}
	if got := findTracker(`<script src="/_t/t.js" data-site="s" nonce="abc">`).Nonce; got != "abc" {
		t.Errorf("nonce %q", got)
	}
	if got := findTracker(string(astro)); got.Site != "blog" || got.Src != "/t/t.js" || got.API != "/t/e" {
		t.Errorf("astro %+v", got)
	}
}

func TestCSPCheck(t *testing.T) {
	next, err := os.ReadFile("testdata/next-rsc.html")
	if err != nil {
		t.Fatal(err)
	}
	nextExcerpt := strings.ReplaceAll(string(next), "agent-skills", "s")
	for _, c := range []struct {
		name     string
		policies []string
		html     string
		want     string
	}{
		{"first-party self", []string{"script-src 'self'; connect-src 'self'"}, `<script src="/t/t.js" data-site="s" data-api="/t/e">`, "pass"},
		{"first-party but only trail host", []string{"script-src https://trail.example.net; connect-src https://trail.example.net"}, `<script src="/t/t.js" data-site="s" data-api="/t/e">`, "fail"},
		{"direct tag, self only", []string{"default-src 'self'"}, goodTag, "fail"},
		{"direct tag ok", []string{"script-src https://trail.example.net; connect-src *.example.net"}, goodTag, "pass"},
		{"second header blocks", []string{"script-src *", "connect-src 'self'"}, goodTag, "fail"},
		{"script-src-elem wins", []string{"script-src https://trail.example.net; script-src-elem 'self'; connect-src *"}, goodTag, "fail"},
		{"strict-dynamic, next component", []string{"script-src 'nonce-a' 'strict-dynamic'; connect-src 'self'"}, nextExcerpt, "pass"},
		{"strict-dynamic, plain tag no nonce", []string{"script-src 'nonce-a' 'strict-dynamic'; connect-src *"}, goodTag, "fail"},
		{"strict-dynamic, plain tag with nonce", []string{"script-src 'nonce-a' 'strict-dynamic'; connect-src *"}, strings.Replace(goodTag, "<script ", `<script nonce="a" `, 1), "pass"},
		{"nothing found, self allowed", []string{"script-src 'self'; connect-src 'self'"}, ``, "pass"},
		{"nothing found, blocked", []string{"script-src https://cdn.other.com; connect-src 'none'"}, ``, "fail"},
		{"no header", nil, goodTag, "pass"},
		{"comma joined policies", []string{"script-src *, connect-src 'self'"}, goodTag, "fail"},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := cspCheck(c.policies, findTracker(c.html), sites.Site{ID: "s", Domain: "example.com"}, "trail.example.net")
			if got.Status != c.want {
				t.Fatalf("got %s (%s)", got.Status, got.Detail)
			}
			if c.want == "fail" && (got.Code != CodeCSPBlocked || got.Fix == "") {
				t.Errorf("code %s fix %q", got.Code, got.Fix)
			}
		})
	}
}

func TestBotWall(t *testing.T) {
	h := func(k, v string) http.Header { x := http.Header{}; x.Set(k, v); return x }
	for _, c := range []struct {
		p      Page
		vendor string
		ok     bool
	}{
		{Page{Status: 403, Header: h("Cf-Mitigated", "challenge")}, "Cloudflare", true},
		{Page{Status: 429, Header: h("X-Vercel-Mitigated", "challenge")}, "Vercel", true},
		{Page{Status: 403, Header: h("X-Vercel-Mitigated", "deny")}, "Vercel", true},
		{Page{Status: 503, Header: h("Server", "cloudflare")}, "Cloudflare", true},
		{Page{Status: 404, Header: h("Server", "cloudflare")}, "", false},
		{Page{Status: 403, Header: http.Header{}}, "", false},
	} {
		if v, ok := botWall(c.p); v != c.vendor || ok != c.ok {
			t.Errorf("%d %v: got %q %v", c.p.Status, c.p.Header, v, ok)
		}
	}
}

func TestCheckBotProtection(t *testing.T) {
	hdr := http.Header{}
	hdr.Set("Cf-Mitigated", "challenge")
	wall := fakeFetch{page: Page{Status: 403, Header: hdr}}
	for _, c := range []struct {
		name   string
		events bool
		state  string
	}{{"receiving", true, "receiving"}, {"no events", false, "waiting"}} {
		t.Run(c.name, func(t *testing.T) {
			st, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer st.Close()
			if c.events {
				st.Enqueue(store.Event{SiteID: "s", Type: "pageview", AnonID: "a", SessionID: "x", Path: "/", TS: time.Now().UnixMilli() - 1000, Env: "production"})
				if err := st.Flush(); err != nil {
					t.Fatal(err)
				}
			}
			reg, _ := sites.Open(st.DB())
			site, _ := reg.Add(sites.Site{ID: "s", Domain: "example.com"})
			got, err := Check(context.Background(), st.DB(), reg, site, "trail.example.net", wall)
			if err != nil {
				t.Fatal(err)
			}
			if got.State != c.state {
				t.Errorf("state %s, want %s", got.State, c.state)
			}
			for _, it := range got.Checks[:3] {
				if it.Code != CodeBotProtection {
					t.Errorf("%s code %s", it.ID, it.Code)
				}
			}
			if p := got.Checks[0]; p.Status != "warn" || !strings.Contains(p.Detail, "Cloudflare bot protection answered 403") {
				t.Errorf("page %+v", p)
			}
			if got.Checks[1].Status != "pending" || got.Checks[2].Status != "pending" {
				t.Errorf("script/csp %+v %+v", got.Checks[1], got.Checks[2])
			}
		})
	}
}

func TestRobotsBlocked(t *testing.T) {
	cf, err := os.ReadFile("testdata/robots-cloudflare.txt")
	if err != nil {
		t.Fatal(err)
	}
	bots := []string{"GPTBot", "ClaudeBot", "CCBot", "PerplexityBot"}
	if got := robotsBlocked(string(cf), bots); !slices.Equal(got, []string{"GPTBot", "ClaudeBot", "CCBot"}) {
		t.Errorf("cloudflare: %v", got)
	}
	if got := robotsBlocked("User-agent: *\nDisallow: /\n", bots); len(got) != 4 {
		t.Errorf("star: %v", got)
	}
	if got := robotsBlocked("User-agent: *\nDisallow: /\n\nUser-agent: gptbot\nAllow: /\n", bots); slices.Contains(got, "GPTBot") || len(got) != 3 {
		t.Errorf("own group wins: %v", got)
	}
	if got := robotsBlocked("User-agent: GPTBot\nDisallow: /private\n", bots); len(got) != 0 {
		t.Errorf("partial: %v", got)
	}
	if got := robotsBlocked("User-agent: GPTBot\nUser-agent: CCBot # both\nDisallow: /  # all\n", bots); !slices.Equal(got, []string{"GPTBot", "CCBot"}) {
		t.Errorf("shared group and comments: %v", got)
	}
	if got := robotsBlocked("", bots); len(got) != 0 {
		t.Errorf("empty: %v", got)
	}
}

func TestFetchPathRefusesBadPaths(t *testing.T) {
	f := NewSafeFetcher()
	for _, p := range []string{"x", "", "/a?b", "/a#b", "//evil.com/", "/@x", "/a b", "/a\\b"} {
		if _, err := f.FetchPath(context.Background(), "example.com", p); err == nil {
			t.Errorf("%q accepted", p)
		}
	}
}

type pathFetch struct {
	fakeFetch
	robots Page
	err    error
}

func (f pathFetch) FetchPath(_ context.Context, _, path string) (Page, error) {
	if path != "/robots.txt" {
		return Page{Status: 404, Header: http.Header{}}, nil
	}
	return f.robots, f.err
}

func TestCheckRobots(t *testing.T) {
	cf, _ := os.ReadFile("testdata/robots-cloudflare.txt")
	for _, c := range []struct {
		name   string
		f      Fetcher
		status string
		code   ReasonCode
	}{
		{"blocks ai", pathFetch{fakeFetch{page: html(goodTag)}, Page{Status: 200, Header: http.Header{}, Body: cf}, nil}, "warn", CodeRobotsBlocksAI},
		{"404", pathFetch{fakeFetch{page: html(goodTag)}, Page{Status: 404, Header: http.Header{}}, nil}, "pass", CodeOK},
		{"error", pathFetch{fakeFetch{page: html(goodTag)}, Page{}, errors.New("boom")}, "pass", CodeOK},
		{"not a path fetcher", fakeFetch{page: html(goodTag)}, "pass", CodeOK},
	} {
		t.Run(c.name, func(t *testing.T) {
			st, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer st.Close()
			reg, _ := sites.Open(st.DB())
			site, _ := reg.Add(sites.Site{ID: "s", Domain: "example.com"})
			got, err := Check(context.Background(), st.DB(), reg, site, "trail.example.net", c.f)
			if err != nil {
				t.Fatal(err)
			}
			if len(got.Checks) != 8 {
				t.Fatalf("checks %d", len(got.Checks))
			}
			r := got.Checks[6]
			if r.ID != "robots" || r.Status != c.status || r.Code != c.code {
				t.Fatalf("robots %+v", r)
			}
			if c.code == CodeRobotsBlocksAI && (!strings.Contains(r.Detail, "GPTBot") || got.State != "waiting") {
				t.Errorf("detail %q state %s", r.Detail, got.State)
			}
		})
	}
}

func TestCheckProxy(t *testing.T) {
	if it := proxyCheck(0); it.ID != "proxy" || it.Status != "pass" {
		t.Errorf("0: %+v", it)
	}
	it := proxyCheck(3)
	if it.Status != "warn" || it.Code != CodeProxyBadSignature || !strings.Contains(it.Detail, "3 forwarded") {
		t.Errorf("3: %+v", it)
	}
}
