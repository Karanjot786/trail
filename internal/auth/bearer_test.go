package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const (
	readTok  = "read-token-aaaaaaaaaaaaaaaaaaaa"
	writeTok = "write-token-bbbbbbbbbbbbbbbbbbbb"
)

func bearerAuth(t *testing.T) *Auth {
	t.Helper()
	toks, err := ParseTokens("ci:" + readTok + ":read, admin:" + writeTok + ":write")
	if err != nil {
		t.Fatal(err)
	}
	a := newAuth()
	a.SetTokens(toks)
	return a
}

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })

func call(h http.Handler, method, header string) int {
	r := httptest.NewRequest(method, "/x", nil)
	if header != "" {
		r.Header.Set("Authorization", header)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}

func TestParseTokens(t *testing.T) {
	toks, err := ParseTokens(" ci:" + readTok + ":read ,admin:" + writeTok + ":write,")
	if err != nil {
		t.Fatal(err)
	}
	if toks[readTok] != (Token{ID: "env:ci", Name: "ci", Scope: "read", FromEnv: true}) ||
		toks[writeTok] != (Token{ID: "env:admin", Name: "admin", Scope: "write", FromEnv: true}) || len(toks) != 2 {
		t.Fatalf("got %+v", toks)
	}
	if toks, err := ParseTokens(""); err != nil || len(toks) != 0 {
		t.Fatalf("empty: %v %v", toks, err)
	}
	short := "x:shorttoken123:read"
	for _, bad := range []string{
		short,                     // < 24 chars
		"x:" + readTok + ":admin", // bad scope
		"x:" + readTok,            // missing scope
		":" + readTok + ":read",   // empty name
		"a:" + readTok + ":read,b:" + readTok + ":write", // duplicate token
		"a:" + readTok + ":read,a:" + writeTok + ":read", // duplicate name
	} {
		_, err := ParseTokens(bad)
		if err == nil {
			t.Errorf("%q: want error", bad)
			continue
		}
		if strings.Contains(err.Error(), readTok) || strings.Contains(err.Error(), "shorttoken123") {
			t.Errorf("error leaks the token: %v", err)
		}
	}
}

func TestBearerMissing401(t *testing.T) {
	h := bearerAuth(t).API(okHandler)
	for _, hdr := range []string{"", "Bearer", "Bearer ", "Basic " + readTok, readTok} {
		if c := call(h, "GET", hdr); c != http.StatusUnauthorized {
			t.Errorf("%q: %d, want 401", hdr, c)
		}
	}
}

func TestBearerWrong401(t *testing.T) {
	h := bearerAuth(t).API(okHandler)
	if c := call(h, "GET", "Bearer "+readTok+"x"); c != http.StatusUnauthorized {
		t.Fatalf("%d", c)
	}
	if c := call(h, "GET", "Bearer "+readTok[:len(readTok)-1]); c != http.StatusUnauthorized {
		t.Fatalf("prefix: %d", c)
	}
	// No tokens configured: everything is 401.
	if c := call(newAuth().API(okHandler), "GET", "Bearer "+readTok); c != http.StatusUnauthorized {
		t.Fatalf("unconfigured: %d", c)
	}
}

func TestBearerOK(t *testing.T) {
	a := bearerAuth(t)
	for _, hdr := range []string{"Bearer " + readTok, "bearer " + writeTok} {
		if c := call(a.API(okHandler), "GET", hdr); c != http.StatusTeapot {
			t.Errorf("%q: %d", hdr, c)
		}
	}
	if c := call(a.API(okHandler), "POST", "Bearer "+writeTok); c != http.StatusTeapot {
		t.Errorf("write token on write route: %d", c)
	}
}

func TestBearerReadCannotWrite403(t *testing.T) {
	if c := call(bearerAuth(t).API(okHandler), "POST", "Bearer "+readTok); c != http.StatusForbidden {
		t.Fatalf("%d, want 403", c)
	}
}

func TestBearerRateLimit429(t *testing.T) {
	a := bearerAuth(t)
	now := time.Unix(1_700_000_000, 0)
	a.now = func() time.Time { return now }
	h := a.API(okHandler)
	for i := range rateLimit {
		if c := call(h, "GET", "Bearer "+readTok); c != http.StatusTeapot {
			t.Fatalf("request %d: %d", i, c)
		}
	}
	if c := call(h, "GET", "Bearer "+readTok); c != http.StatusTooManyRequests {
		t.Fatalf("over limit: %d, want 429", c)
	}
	// Another token has its own bucket.
	if c := call(h, "GET", "Bearer "+writeTok); c != http.StatusTeapot {
		t.Fatalf("other token: %d", c)
	}
	// One second refills 5 requests (300/min).
	now = now.Add(time.Second)
	for i := range 5 {
		if c := call(h, "GET", "Bearer "+readTok); c != http.StatusTeapot {
			t.Fatalf("after refill %d: %d", i, c)
		}
	}
	if c := call(h, "GET", "Bearer "+readTok); c != http.StatusTooManyRequests {
		t.Fatalf("after refill over: %d", c)
	}
	// A full minute refills the whole bucket, never more.
	now = now.Add(10 * time.Minute)
	for range rateLimit {
		call(h, "GET", "Bearer "+readTok)
	}
	if c := call(h, "GET", "Bearer "+readTok); c != http.StatusTooManyRequests {
		t.Fatalf("bucket overfilled: %d", c)
	}
}

func TestBearerCannotUseCookieRoutes(t *testing.T) {
	a := bearerAuth(t)
	// A token is not a session: cookie-guarded routes still say 401.
	if c := call(a.Require(okHandler), "GET", "Bearer "+writeTok); c != http.StatusUnauthorized {
		t.Fatalf("Require with bearer: %d", c)
	}
	// And a token on the login route sets no cookie.
	r := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"password":""}`))
	r.Header.Set("Authorization", "Bearer "+writeTok)
	w := httptest.NewRecorder()
	a.Login(w, r)
	if w.Code != http.StatusUnauthorized || w.Header().Get("Set-Cookie") != "" {
		t.Fatalf("login with bearer: %d %q", w.Code, w.Header().Get("Set-Cookie"))
	}
}

func TestBearerNoTokenInResponse(t *testing.T) {
	h := bearerAuth(t).API(okHandler)
	for _, tok := range []string{readTok, readTok + "zz"} {
		r := httptest.NewRequest("POST", "/x", nil)
		r.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if strings.Contains(w.Body.String(), tok) {
			t.Fatalf("response echoes token: %s", w.Body)
		}
	}
}
