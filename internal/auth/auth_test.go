package auth

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
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
