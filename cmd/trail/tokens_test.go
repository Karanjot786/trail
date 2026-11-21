package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"trail/internal/meta"
)

// owner logs in and returns a request helper that carries the session cookie.
func owner(t *testing.T, h http.Handler) func(method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	w := do(h, "POST", "/api/login", "", `{"password":"pw"}`)
	if w.Code != http.StatusNoContent {
		t.Fatalf("login: %d", w.Code)
	}
	cookie := w.Result().Cookies()[0]
	return func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.AddCookie(cookie)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
}

func newToken(t *testing.T, as func(string, string, string) *httptest.ResponseRecorder, name, scope, site string) meta.NewToken {
	t.Helper()
	siteJSON := "null"
	if site != "" {
		siteJSON = `"` + site + `"`
	}
	w := as("POST", "/api/tokens", fmt.Sprintf(`{"name":%q,"scope":%q,"site":%s}`, name, scope, siteJSON))
	if w.Code != http.StatusCreated {
		t.Fatalf("create %s: %d %s", name, w.Code, w.Body)
	}
	var nt meta.NewToken
	if err := json.Unmarshal(w.Body.Bytes(), &nt); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(nt.Token, "trl_") || len(nt.Token) != 36 || nt.Prefix != nt.Token[:12] {
		t.Fatalf("token shape %+v", nt)
	}
	return nt
}

func TestTokenShownOnce(t *testing.T) {
	h := testRoutes(t)
	as := owner(t, h)
	nt := newToken(t, as, "ci-ui", "read", "")
	w := as("GET", "/api/tokens", "")
	if strings.Contains(w.Body.String(), nt.Token) || strings.Contains(w.Body.String(), `"token"`) {
		t.Fatalf("list leaks the secret: %s", w.Body)
	}
	var list []meta.APIToken
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || len(list) != 3 {
		t.Fatalf("list (2 env + 1): %s", w.Body)
	}
	// A token cannot mint or list tokens, even a write one.
	if w := do(h, "GET", "/api/v1/tokens", testWrite, ""); w.Code != http.StatusForbidden {
		t.Errorf("token lists tokens: %d", w.Code)
	}
	if w := do(h, "POST", "/api/v1/tokens", testWrite, `{"name":"x","scope":"write","site":null}`); w.Code != http.StatusForbidden {
		t.Errorf("token mints tokens: %d", w.Code)
	}
}

func TestTokenSiteScope403(t *testing.T) {
	h := testRoutes(t)
	as := owner(t, h)
	if w := as("POST", "/api/sites", `{"id":"docs","domain":"docs.dev"}`); w.Code != http.StatusCreated {
		t.Fatalf("add site: %d %s", w.Code, w.Body)
	}
	nt := newToken(t, as, "docs-only", "write", "docs")
	if w := do(h, "GET", "/api/v1/stats?site=s", nt.Token, ""); w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "limited to site docs") {
		t.Errorf("other site: %d %s", w.Code, w.Body)
	}
	if w := do(h, "GET", "/api/v1/stats?site=docs", nt.Token, ""); w.Code != 200 {
		t.Errorf("own site: %d %s", w.Code, w.Body)
	}
	w := do(h, "GET", "/api/v1/sites", nt.Token, "")
	if !strings.Contains(w.Body.String(), `"docs"`) || strings.Contains(w.Body.String(), `"id":"s"`) {
		t.Errorf("sites list not filtered: %s", w.Body)
	}
	if w := do(h, "POST", "/api/v1/goals", nt.Token, `{"site":"s","name":"x","kind":"page","match":"/"}`); w.Code != http.StatusForbidden {
		t.Errorf("write on other site: %d", w.Code)
	}
	if w := do(h, "DELETE", "/api/v1/sites/s", nt.Token, ""); w.Code != http.StatusForbidden {
		t.Errorf("site-bound token deletes a site: %d", w.Code)
	}
}

func TestTokenScopeMatrix(t *testing.T) {
	h := testRoutes(t)
	as := owner(t, h)
	tok := map[string]string{}
	for _, scope := range []string{"read", "notes", "write", "crawl"} {
		tok[scope] = newToken(t, as, scope+"-tok", scope, "s").Token
	}
	goal := func(n string) string { return `{"site":"s","name":"` + n + `","kind":"page","match":"/"}` }
	note := `{"site":"s","ts":1700000000000,"label":"Deploy","kind":"deploy"}`
	crawl := `{"ts":1700000000000,"ua":"GPTBot/1.1","path":"/","status":200}`
	for _, c := range []struct {
		scope, method, path, body string
		want                      int
	}{
		{"read", "GET", "/api/v1/stats?site=s", "", 200},
		{"read", "POST", "/api/v1/goals", goal("r"), 403},
		{"read", "POST", "/api/v1/notes", note, 403},
		{"notes", "POST", "/api/v1/notes", note, 201},
		{"notes", "POST", "/api/v1/goals", goal("n"), 403},
		{"notes", "GET", "/api/v1/notes?site=s", "", 200},
		{"crawl", "GET", "/api/v1/stats?site=s", "", 403},
		{"crawl", "POST", "/api/v1/crawls", crawl, 202},
		{"read", "POST", "/api/v1/crawls", crawl, 403},
		{"write", "POST", "/api/v1/goals", goal("w"), 201},
	} {
		if w := do(h, c.method, c.path, tok[c.scope], c.body); w.Code != c.want {
			t.Errorf("%s %s %s: %d, want %d (%s)", c.scope, c.method, c.path, w.Code, c.want, w.Body)
		}
	}
}

func TestNotesWriteNeedsNotesScope(t *testing.T) {
	h := testRoutes(t)
	note := `{"site":"s","ts":1700000000000,"label":"Deploy"}`
	if w := do(h, "POST", "/api/v1/notes", testRead, note); w.Code != http.StatusForbidden {
		t.Errorf("read token adds a note: %d", w.Code)
	}
	if w := do(h, "POST", "/api/v1/notes", testWrite, note); w.Code != http.StatusCreated {
		t.Errorf("write token: %d %s", w.Code, w.Body)
	}
}

func TestRevokedToken401(t *testing.T) {
	h := testRoutes(t)
	as := owner(t, h)
	nt := newToken(t, as, "temp", "read", "")
	if w := do(h, "GET", "/api/v1/sites", nt.Token, ""); w.Code != 200 {
		t.Fatalf("before revoke: %d", w.Code)
	}
	if w := as("DELETE", "/api/tokens/"+nt.ID, ""); w.Code != http.StatusNoContent {
		t.Fatalf("revoke: %d", w.Code)
	}
	if w := do(h, "GET", "/api/v1/sites", nt.Token, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("after revoke: %d", w.Code)
	}
	if w := as("DELETE", "/api/tokens/env:ci", ""); w.Code != http.StatusBadRequest {
		t.Errorf("revoke env token: %d", w.Code)
	}
}

func TestEnvTokensStillWork(t *testing.T) {
	h := testRoutes(t)
	if w := do(h, "GET", "/api/v1/stats?site=s", testRead, ""); w.Code != 200 {
		t.Fatalf("env read: %d", w.Code)
	}
	w := owner(t, h)("GET", "/api/tokens", "")
	if !strings.Contains(w.Body.String(), `"fromEnv":true`) || strings.Contains(w.Body.String(), testRead) {
		t.Fatalf("env tokens listing: %s", w.Body)
	}
}

func TestWhoAmI(t *testing.T) {
	h := testRoutes(t)
	nt := newToken(t, owner(t, h), "who", "notes", "s")
	var me meta.WhoAmI
	w := do(h, "GET", "/api/v1/whoami", nt.Token, "")
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil || me.Name != "who" || me.Scope != "notes" || me.Site == nil || *me.Site != "s" {
		t.Fatalf("whoami: %d %s", w.Code, w.Body)
	}
	w = do(h, "GET", "/api/v1/whoami", testRead, "")
	if !strings.Contains(w.Body.String(), `"site":null`) {
		t.Fatalf("env whoami: %s", w.Body)
	}
}

func TestTokenNotLogged(t *testing.T) {
	var buf bytes.Buffer
	old := log.Writer()
	log.SetOutput(&buf)
	defer log.SetOutput(old)
	h := testRoutes(t)
	nt := newToken(t, owner(t, h), "quiet", "read", "")
	do(h, "GET", "/api/v1/stats?site=s", nt.Token, "")
	do(h, "GET", "/api/v1/stats?site=s", nt.Token+"x", "")
	do(h, "GET", "/api/v1/nope", nt.Token, "")
	time.Sleep(10 * time.Millisecond)
	if strings.Contains(buf.String(), nt.Token) || strings.Contains(buf.String(), nt.Token[4:]) {
		t.Fatalf("log has the token: %s", buf.String())
	}
}

func TestExportRequiresCookie(t *testing.T) {
	h := testRoutes(t)
	if w := do(h, "GET", "/api/v1/sites/s/export", testWrite, ""); w.Code != http.StatusForbidden {
		t.Errorf("bearer export: %d", w.Code)
	}
	if w := owner(t, h)("GET", "/api/sites/s/export", ""); w.Code != 200 || w.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("cookie export: %d", w.Code)
	}
}

func TestConfigRoute(t *testing.T) {
	h := testRoutes(t)
	if w := do(h, "GET", "/api/config", "", ""); w.Code != http.StatusUnauthorized {
		t.Errorf("anonymous config: %d", w.Code)
	}
	w := owner(t, h)("GET", "/api/config", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"version":"test"`) || !strings.Contains(w.Body.String(), `"envSites":[]`) {
		t.Errorf("config: %d %s", w.Code, w.Body)
	}
}
