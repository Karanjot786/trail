package main

import (
	"bytes"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"trail/internal/auth"
	"trail/internal/store"
)

func loginCode(a *auth.Auth, pw string) (int, *http.Cookie) {
	w := httptest.NewRecorder()
	a.Login(w, httptest.NewRequest("POST", "/api/login", strings.NewReader(fmt.Sprintf(`{"password":%q}`, pw))))
	if cs := w.Result().Cookies(); len(cs) > 0 {
		return w.Code, cs[0]
	}
	return w.Code, nil
}

func cookieOK(a *auth.Auth, c *http.Cookie) bool {
	r := httptest.NewRequest("GET", "/api/x", nil)
	r.AddCookie(c)
	w := httptest.NewRecorder()
	a.Require(http.NotFoundHandler()).ServeHTTP(w, r)
	return w.Code == http.StatusNotFound
}

// With neither TRAIL_PASSWORD nor TRAIL_SECRET, the first start prints a
// password once; a restart over the same database accepts it and keeps the
// session cookie valid.
func TestServerAuthGeneratesAndPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	start := func() (*auth.Auth, string) {
		st, err := store.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer st.Close()
		var logs bytes.Buffer
		a, err := serverAuth(st.DB(), "", "", func(f string, v ...any) { fmt.Fprintf(&logs, f+"\n", v...) })
		if err != nil {
			t.Fatal(err)
		}
		return a, logs.String()
	}
	a1, logs1 := start()
	m := regexp.MustCompile(`Log in with:  (\S+)`).FindStringSubmatch(logs1)
	if m == nil {
		t.Fatalf("no password in first-start log:\n%s", logs1)
	}
	pw := m[1]
	code, c := loginCode(a1, pw)
	if code != http.StatusNoContent || c == nil {
		t.Fatalf("login with generated password: %d", code)
	}
	a2, logs2 := start()
	if strings.Contains(logs2, pw) {
		t.Fatal("password printed again on restart")
	}
	if !cookieOK(a2, c) {
		t.Fatal("restart without TRAIL_SECRET signed the owner out")
	}
	if code, _ := loginCode(a2, pw); code != http.StatusNoContent {
		t.Fatalf("generated password rejected after restart: %d", code)
	}
	if code, _ := loginCode(a2, "wrong"); code != http.StatusUnauthorized {
		t.Fatalf("wrong password: %d", code)
	}
}

func TestServerAuthEnvWins(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "e.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var logs bytes.Buffer
	logf := func(f string, v ...any) { fmt.Fprintf(&logs, f+"\n", v...) }
	a, err := serverAuth(st.DB(), "mine", strings.Repeat("s", 32), logf)
	if err != nil {
		t.Fatal(err)
	}
	if logs.Len() != 0 {
		t.Fatalf("unexpected log: %s", logs.String())
	}
	_, c := loginCode(a, "mine")
	// The env secret signs cookies, not the stored one.
	if !cookieOK(auth.New("mine", []byte(strings.Repeat("s", 32))), c) {
		t.Fatal("cookie not signed with TRAIL_SECRET")
	}
	if _, err := serverAuth(st.DB(), "mine", "short", logf); err == nil {
		t.Fatal("short TRAIL_SECRET: want error")
	}
	var n int
	_ = st.DB().QueryRow(`SELECT count(*) FROM settings WHERE key='password_sha256'`).Scan(&n)
	if n != 0 {
		t.Fatal("a password was generated although TRAIL_PASSWORD is set")
	}
}

func TestResetPassword(t *testing.T) {
	path := filepath.Join(t.TempDir(), "r.db")
	if err := runResetPassword(path, false, &bytes.Buffer{}); err == nil {
		t.Fatal("missing database: want error")
	}
	st, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = serverAuth(st.DB(), "", "", func(string, ...any) {})
	_ = st.Close()
	var out bytes.Buffer
	if err := runResetPassword(path, true, &out); err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(`password: (\S+)`).FindStringSubmatch(out.String())
	if m == nil || !strings.Contains(out.String(), "TRAIL_PASSWORD is set") {
		t.Fatalf("output: %s", out.String())
	}
	st, _ = store.Open(path)
	defer st.Close()
	a, _ := serverAuth(st.DB(), "", "", func(string, ...any) {})
	if code, _ := loginCode(a, m[1]); code != http.StatusNoContent {
		t.Fatalf("reset password rejected: %d", code)
	}
}

func TestHealthz(t *testing.T) {
	h, st := testRoutesWith(t, nil, nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != 200 || w.Body.String() != "ok\n" {
		t.Fatalf("healthz: %d %q", w.Code, w.Body)
	}
	_ = st.Close()
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("healthz with closed db: %d", w.Code)
	}
}

func TestRunHealth(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			w.WriteHeader(404)
		}
	}))
	defer ok.Close()
	_, port, _ := net.SplitHostPort(ok.Listener.Addr().String())
	for _, addr := range []string{":" + port, "0.0.0.0:" + port, "127.0.0.1:" + port} {
		if err := runHealth(addr, time.Second); err != nil {
			t.Errorf("%s: %v", addr, err)
		}
	}
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(503) }))
	defer bad.Close()
	if err := runHealth(bad.Listener.Addr().String(), time.Second); err == nil {
		t.Error("503: want error")
	}
	if err := runHealth("nonsense", time.Second); err == nil {
		t.Error("bad addr: want error")
	}
}
