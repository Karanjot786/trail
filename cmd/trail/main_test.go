package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"trail/internal/auth"
	"trail/internal/demo"
	"trail/internal/enrich"
	"trail/internal/sites"
	"trail/internal/store"
)

func spaGet(h http.Handler, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func TestSPAFallback(t *testing.T) {
	h := spaHandler(fstest.MapFS{
		"index.html":    {Data: []byte("<html>app</html>")},
		"assets/app.js": {Data: []byte("js()")},
	})
	if w := spaGet(h, "/assets/app.js"); w.Body.String() != "js()" {
		t.Errorf("asset: %d %q", w.Code, w.Body)
	}
	for _, p := range []string{"/", "/visitors/u1", "/assets/missing.js", "/../etc/passwd"} {
		if w := spaGet(h, p); w.Code != 200 || !strings.Contains(w.Body.String(), "app") {
			t.Errorf("%s: %d %q", p, w.Code, w.Body)
		}
	}
}

func TestSPANotBuilt(t *testing.T) {
	w := spaGet(spaHandler(fstest.MapFS{}), "/")
	if !strings.Contains(w.Body.String(), "dashboard not built") {
		t.Errorf("got %d %q", w.Code, w.Body)
	}
}

func TestParseSites(t *testing.T) {
	got, err := parseSites(" a=Example.com, b=b.dev ,")
	if err != nil || len(got) != 2 || got["a"] != "example.com" || got["b"] != "b.dev" {
		t.Fatalf("got %v %v", got, err)
	}
	if _, err := parseSites("nodomain"); err == nil {
		t.Fatal("want error")
	}
}

const (
	testRead  = "read-token-aaaaaaaaaaaaaaaaaaaa"
	testWrite = "write-token-bbbbbbbbbbbbbbbbbbbb"
)

func testRoutes(t *testing.T) http.Handler { return testRoutesDemo(t, nil) }

func testRoutesDemo(t *testing.T, demoH http.Handler) http.Handler {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "r.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	st.Enqueue(store.Event{SiteID: "s", Type: "pageview", AnonID: "A", SessionID: "x", Path: "/", TS: time.Now().UnixMilli() - 1000, Env: "production"})
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	geo, _ := enrich.OpenGeo("")
	toks, err := auth.ParseTokens("ci:" + testRead + ":read,admin:" + testWrite + ":write")
	if err != nil {
		t.Fatal(err)
	}
	a := auth.New("pw", []byte("0123456789abcdef0123456789abcdef"))
	a.SetTokens(toks)
	reg, err := sites.Open(st.DB())
	if err != nil {
		t.Fatal(err)
	}
	if err := addEnvSites(reg, map[string]string{"s": "example.com"}); err != nil {
		t.Fatal(err)
	}
	return routes(st, geo, reg, time.UTC, a, fstest.MapFS{"index.html": {Data: []byte("app")}}, demoH, 0)
}

func TestAddEnvSitesKeepsEdits(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "e.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	reg, _ := sites.Open(st.DB())
	if err := addEnvSites(reg, map[string]string{"a": "a.com"}); err != nil {
		t.Fatal(err)
	}
	if _, err := reg.Update(sites.Site{ID: "a", Domain: "edited.com"}); err != nil {
		t.Fatal(err)
	}
	// A restart with the same TRAIL_SITES must not undo the dashboard edit.
	if err := addEnvSites(reg, map[string]string{"a": "a.com", "b": "b.com"}); err != nil {
		t.Fatal(err)
	}
	if s, _ := reg.Get("a"); s.Domain != "edited.com" {
		t.Errorf("env overwrote edit: %+v", s)
	}
	if _, ok := reg.Get("b"); !ok {
		t.Error("new env site not added")
	}
	if err := addEnvSites(reg, map[string]string{"c": "https://c.com"}); err == nil {
		t.Error("invalid env domain: want error")
	}
}

func TestV1SitesNeedWriteScope(t *testing.T) {
	h := testRoutes(t)
	body := `{"id":"blog","domain":"blog.dev"}`
	if w := do(h, "POST", "/api/v1/sites", testRead, body); w.Code != http.StatusForbidden {
		t.Fatalf("read POST: %d", w.Code)
	}
	if w := do(h, "POST", "/api/v1/sites", testWrite, body); w.Code != http.StatusCreated {
		t.Fatalf("write POST: %d %s", w.Code, w.Body)
	}
	if w := do(h, "PATCH", "/api/v1/sites/blog", testRead, `{"origins":[]}`); w.Code != http.StatusForbidden {
		t.Fatalf("read PATCH: %d", w.Code)
	}
	if w := do(h, "GET", "/api/v1/sites/blog/status", testRead, ""); w.Code != 200 {
		t.Fatalf("read status: %d %s", w.Code, w.Body)
	}
	if w := do(h, "DELETE", "/api/v1/sites/blog", testWrite, ""); w.Code != http.StatusNoContent {
		t.Fatalf("write DELETE: %d", w.Code)
	}
}

func TestIngestRouteChecksOrigin(t *testing.T) {
	h := testRoutes(t)
	ev := `{"s":"s","t":"pageview","a":"a1","u":"https://example.com/"}`
	for origin, want := range map[string]int{"https://example.com": 204, "https://evil.com": 403, "": 403} {
		r := httptest.NewRequest("POST", "/_t/e", strings.NewReader(ev))
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Errorf("origin %q: %d, want %d", origin, w.Code, want)
		}
	}
}

func do(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestV1ReadAPI(t *testing.T) {
	h := testRoutes(t)
	if w := do(h, "GET", "/api/v1/stats?site=s", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("no token: %d", w.Code)
	}
	for _, path := range []string{"/api/v1/sites", "/api/v1/stats?site=s", "/api/v1/goals/report?site=s", "/api/v1/goals?site=s"} {
		if w := do(h, "GET", path, testRead, ""); w.Code != 200 {
			t.Errorf("%s: %d %s", path, w.Code, w.Body)
		}
	}
	w := do(h, "GET", "/api/v1/stats?site=s", testRead, "")
	if !strings.Contains(w.Body.String(), `"visitors":1`) {
		t.Errorf("stats body %s", w.Body)
	}
	// Bearer tokens don't open the cookie API.
	if w := do(h, "GET", "/api/stats?site=s", testWrite, ""); w.Code != http.StatusUnauthorized {
		t.Errorf("cookie route with token: %d", w.Code)
	}
}

func TestV1ReadTokenCannotWrite(t *testing.T) {
	h := testRoutes(t)
	goal := `{"site":"s","name":"Home","kind":"page","match":"/"}`
	if w := do(h, "POST", "/api/v1/goals", testRead, goal); w.Code != http.StatusForbidden {
		t.Fatalf("read POST: %d", w.Code)
	}
	if w := do(h, "DELETE", "/api/v1/goals/1?site=s", testRead, ""); w.Code != http.StatusForbidden {
		t.Fatalf("read DELETE: %d", w.Code)
	}
	w := do(h, "POST", "/api/v1/goals", testWrite, goal)
	if w.Code != http.StatusCreated {
		t.Fatalf("write POST: %d %s", w.Code, w.Body)
	}
	if w := do(h, "DELETE", "/api/v1/goals/1?site=s", testWrite, ""); w.Code != http.StatusNoContent {
		t.Fatalf("write DELETE: %d %s", w.Code, w.Body)
	}
}

func TestV1TokenCannotLogin(t *testing.T) {
	h := testRoutes(t)
	for _, path := range []string{"/api/v1/login", "/api/login"} {
		w := do(h, "POST", path, testWrite, `{"password":""}`)
		if w.Code < 400 || w.Header().Get("Set-Cookie") != "" {
			t.Errorf("%s: %d cookie %q", path, w.Code, w.Header().Get("Set-Cookie"))
		}
	}
}

func TestMCPRoute(t *testing.T) {
	h := testRoutes(t)
	body := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_stats","arguments":{"site":"s","range":"24h"}}}`
	if w := do(h, "POST", "/mcp", "", body); w.Code != http.StatusUnauthorized {
		t.Fatalf("no token: %d", w.Code)
	}
	if w := do(h, "POST", "/mcp", testRead+"x", body); w.Code != http.StatusUnauthorized {
		t.Fatalf("bad token: %d", w.Code)
	}
	w := do(h, "POST", "/mcp", testRead, body)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `\"visitors\":1`) {
		t.Fatalf("read token: %d %s", w.Code, w.Body)
	}
}

func TestTrackerRoutes(t *testing.T) {
	h := testRoutes(t)
	for _, p := range []string{"/_t/t.js", "/_t/t.p.js"} {
		if w := do(h, "GET", p, "", ""); w.Code != 200 {
			t.Errorf("%s: %d", p, w.Code)
		}
	}
	if w := do(h, "GET", "/_t/nope.js", "", ""); w.Code != 404 {
		t.Errorf("unknown tracker file: %d", w.Code)
	}
}

func TestParseSecret(t *testing.T) {
	a, err1 := parseSecret("")
	b, err2 := parseSecret("")
	if err1 != nil || err2 != nil || len(a) != 32 || string(a) == string(b) {
		t.Fatal("unset secret must be random 32 bytes")
	}
	s := strings.Repeat("k", 32)
	if got, err := parseSecret(s); err != nil || string(got) != s {
		t.Fatalf("%q %v", got, err)
	}
	if _, err := parseSecret("short"); err == nil {
		t.Fatal("short secret: want error")
	}
}

func TestSecretKeepsLogin(t *testing.T) {
	secret, _ := parseSecret(strings.Repeat("k", 32))
	login := func(a *auth.Auth) *http.Cookie {
		w := httptest.NewRecorder()
		a.Login(w, httptest.NewRequest("POST", "/api/login", strings.NewReader(`{"password":"pw"}`)))
		return w.Result().Cookies()[0]
	}
	c := login(auth.New("pw", secret))
	// A new process with the same TRAIL_SECRET accepts the old cookie.
	r := httptest.NewRequest("GET", "/api/x", nil)
	r.AddCookie(c)
	w := httptest.NewRecorder()
	auth.New("pw", secret).Require(http.NotFoundHandler()).ServeHTTP(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("cookie rejected after restart: %d", w.Code)
	}
}

func TestDemoRoutes(t *testing.T) {
	d, err := demo.New(time.UTC, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	h := testRoutesDemo(t, d)
	w := do(h, "GET", "/api/demo/stats?site=demo", "", "")
	if w.Code != 200 || strings.Contains(w.Body.String(), `"visitors":0`) {
		t.Fatalf("demo stats: %d %s", w.Code, w.Body)
	}
	for _, m := range []string{"POST", "DELETE", "PUT", "PATCH"} {
		if w := do(h, m, "/api/demo/goals", "", `{"site":"demo","name":"x","kind":"page","match":"/"}`); w.Code != http.StatusForbidden {
			t.Errorf("%s: %d, want 403", m, w.Code)
		}
	}
	// Isolation: the demo cannot see the real site "s", even with a token.
	for _, tok := range []string{"", testWrite} {
		if w := do(h, "GET", "/api/demo/stats?site=s", tok, ""); w.Code == 200 {
			t.Errorf("demo served real site (token %q): %s", tok, w.Body)
		}
	}
	if w := do(h, "GET", "/api/demo/sites", "", ""); strings.Contains(w.Body.String(), "example.com") {
		t.Errorf("demo lists real sites: %s", w.Body)
	}
	// The real API stays locked.
	if w := do(h, "GET", "/api/stats?site=demo", "", ""); w.Code != http.StatusUnauthorized {
		t.Errorf("real API without cookie: %d", w.Code)
	}
}

func TestDemoOffByDefault(t *testing.T) {
	if w := do(testRoutes(t), "GET", "/api/demo/stats?site=demo", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("demo mounted when off: %d", w.Code)
	}
}

func TestParseRPS(t *testing.T) {
	for in, want := range map[string]float64{"": 50, "10": 10, "0": 0, "2.5": 2.5} {
		if got, err := parseRPS(in); err != nil || got != want {
			t.Errorf("%q: %v %v", in, got, err)
		}
	}
	for _, bad := range []string{"-1", "fast", "NaN"} {
		if _, err := parseRPS(bad); err == nil {
			t.Errorf("%q: want error", bad)
		}
	}
}
