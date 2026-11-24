package auth

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func newAuth() *Auth { return New("hunter2", []byte("0123456789abcdef0123456789abcdef")) }

func login(a *Auth, body string, tlsOn bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	if tlsOn {
		r.TLS = &tls.ConnectionState{}
	}
	w := httptest.NewRecorder()
	a.Login(w, r)
	return w
}

func TestLoginWrongPassword(t *testing.T) {
	for _, body := range []string{`{"password":"nope"}`, `{"password":""}`, `{`, ``} {
		if w := login(newAuth(), body, false); w.Code != http.StatusUnauthorized && w.Code != http.StatusBadRequest {
			t.Errorf("body %q: status %d", body, w.Code)
		}
		if w := login(newAuth(), body, false); w.Header().Get("Set-Cookie") != "" {
			t.Errorf("body %q: cookie set on failure", body)
		}
	}
	if w := login(newAuth(), `{"password":"nope"}`, false); w.Code != http.StatusUnauthorized {
		t.Errorf("wrong password: status %d, want 401", w.Code)
	}
}

func TestLoginOK(t *testing.T) {
	w := login(newAuth(), `{"password":"hunter2"}`, true)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status %d", w.Code)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies = %v", cookies)
	}
	c := cookies[0]
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode || c.Path != "/" {
		t.Errorf("cookie flags: %+v", c)
	}
	if plain := login(newAuth(), `{"password":"hunter2"}`, false).Result().Cookies()[0]; plain.Secure {
		t.Error("Secure set without TLS")
	}
}

func protected(a *Auth, c *http.Cookie) int {
	h := a.Require(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }))
	r := httptest.NewRequest(http.MethodGet, "/api/sites", nil)
	if c != nil {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}

func TestRequireRejectsNoCookie(t *testing.T) {
	if code := protected(newAuth(), nil); code != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", code)
	}
}

func TestRequireCookie(t *testing.T) {
	a := newAuth()
	c := login(a, `{"password":"hunter2"}`, false).Result().Cookies()[0]
	if code := protected(a, c); code != http.StatusTeapot {
		t.Fatalf("valid cookie: status %d", code)
	}
	tampered := *c
	tampered.Value = c.Value[:len(c.Value)-1] + "0"
	if tampered.Value == c.Value {
		tampered.Value = c.Value[:len(c.Value)-1] + "1"
	}
	if code := protected(a, &tampered); code != http.StatusUnauthorized {
		t.Errorf("tampered cookie: status %d", code)
	}
	other := New("hunter2", []byte("another-secret-another-secret-xx"))
	if code := protected(other, c); code != http.StatusUnauthorized {
		t.Errorf("cookie from another secret: status %d", code)
	}
	a.now = func() time.Time { return time.Now().Add(31 * 24 * time.Hour) }
	if code := protected(a, c); code != http.StatusUnauthorized {
		t.Errorf("expired cookie: status %d", code)
	}
}

func TestCookieDiesWithPasswordChange(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	old := New("hunter2", secret)
	c := login(old, `{"password":"hunter2"}`, false).Result().Cookies()[0]
	if code := protected(New("hunter2", secret), c); code != http.StatusTeapot {
		t.Fatalf("same password, same secret: %d", code) // a restart keeps the login
	}
	if code := protected(New("new-pass", secret), c); code != http.StatusUnauthorized {
		t.Fatalf("cookie survived a password change: %d", code)
	}
}

func loginFrom(a *Auth, body, ip string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	r.RemoteAddr = ip + ":1234"
	w := httptest.NewRecorder()
	a.Login(w, r)
	return w
}

const (
	badPW  = `{"password":"nope"}`
	goodPW = `{"password":"hunter2"}`
)

// limitedAuth has no real sleeping and a clock the test moves.
func limitedAuth() (*Auth, *time.Time, *[]time.Duration) {
	a := newAuth()
	now := time.Unix(1_800_000_000, 0)
	var slept []time.Duration
	a.now = func() time.Time { return now }
	a.sleep = func(d time.Duration) { slept = append(slept, d) }
	return a, &now, &slept
}

func TestLoginLocksAfterFiveFailures(t *testing.T) {
	a, now, _ := limitedAuth()
	for i := range 5 {
		if w := loginFrom(a, badPW, "203.0.113.9"); w.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d: %d", i+1, w.Code)
		}
	}
	w := loginFrom(a, goodPW, "203.0.113.9")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("6th: %d", w.Code)
	}
	if ra, _ := strconv.Atoi(w.Header().Get("Retry-After")); ra <= 0 {
		t.Errorf("Retry-After %q", w.Header().Get("Retry-After"))
	}
	*now = now.Add(failWindow + time.Second)
	if w := loginFrom(a, goodPW, "203.0.113.9"); w.Code != http.StatusNoContent {
		t.Fatalf("after the window: %d", w.Code)
	}
}

func TestLoginLockIsPerClient(t *testing.T) {
	a, _, _ := limitedAuth()
	for range 5 {
		loginFrom(a, badPW, "203.0.113.9")
	}
	if w := loginFrom(a, goodPW, "198.51.100.7"); w.Code != http.StatusNoContent {
		t.Fatalf("other client: %d", w.Code)
	}
}

func TestLoginIPv6KeyedBy64(t *testing.T) {
	a, _, _ := limitedAuth()
	for i := range 5 {
		loginFrom(a, badPW, "2001:db8::"+strconv.Itoa(i+1))
	}
	if w := loginFrom(a, goodPW, "2001:db8::ff"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("same /64: %d", w.Code)
	}
	if w := loginFrom(a, goodPW, "2001:db8:0:1::1"); w.Code != http.StatusNoContent {
		t.Fatalf("other /64: %d", w.Code)
	}
}

func TestLoginGlobalSlowdownNeverLocks(t *testing.T) {
	a, _, slept := limitedAuth()
	for i := range globalSlowAt {
		loginFrom(a, badPW, "192.0.2."+strconv.Itoa(i+1))
	}
	if n := len(*slept); n != globalSlowAt || (*slept)[n-1] != slowDelay || (*slept)[0] != failDelay {
		t.Fatalf("delays %v", *slept)
	}
	if w := loginFrom(a, goodPW, "198.51.100.200"); w.Code != http.StatusNoContent {
		t.Fatalf("owner locked out: %d", w.Code)
	}
}
