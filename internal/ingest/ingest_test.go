package ingest

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/enrich"
	"trail/internal/store"
)

const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"

func setup(t *testing.T) (*store.Store, http.Handler) {
	t.Helper()
	return newHandler(t, map[string]string{"s1": "example.com"})
}

func newHandler(t *testing.T, sites map[string]string, opts ...Option) (*store.Store, http.Handler) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	geo, err := enrich.OpenGeo("")
	if err != nil {
		t.Fatal(err)
	}
	return st, New(st, geo, sites, opts...)
}

func post(h http.Handler, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/_t/e", strings.NewReader(body))
	r.Header.Set("Content-Type", "text/plain")
	r.Header.Set("User-Agent", iphoneUA)
	r.Header.Set("X-Forwarded-For", "203.0.113.77, 10.0.0.1")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func rows(t *testing.T, st *store.Store) int {
	t.Helper()
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := st.DB().QueryRow("SELECT count(*) FROM events").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

const pageview = `{"s":"s1","t":"pageview","a":"anon-1","ss":"sess-1","u":"https://example.com/blog/123?utm_source=x&utm_medium=y","r":"https://www.google.com/search"}`

func TestValidPageview(t *testing.T) {
	st, h := setup(t)
	w := post(h, pageview)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status %d, body %q", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Trail-Accepted"); got != "1" {
		t.Errorf("X-Trail-Accepted = %q, want 1", got)
	}
	if c := w.Header().Get("Set-Cookie"); !strings.Contains(c, "_t_id=anon-1") || !strings.Contains(c, "Max-Age=31536000") || !strings.Contains(c, "SameSite=Lax") {
		t.Errorf("Set-Cookie = %q", c)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("ACAO = %q", got)
	}
	if n := rows(t, st); n != 1 {
		t.Fatalf("rows = %d", n)
	}
	var host, path, route, src, med, ref, country, device, env string
	err := st.DB().QueryRow(`SELECT host, path, route, utm_source, utm_medium, referrer_host, country, device, env FROM events`).
		Scan(&host, &path, &route, &src, &med, &ref, &country, &device, &env)
	if err != nil {
		t.Fatal(err)
	}
	got := []string{host, path, route, src, med, ref, country, device, env}
	want := []string{"example.com", "/blog/123", "/blog/:id", "x", "y", "google.com", "", "mobile", "production"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("row = %v, want %v", got, want)
	}
}

func TestRejects(t *testing.T) {
	big := `{"s":"s1","t":"pageview","a":"a","u":"https://example.com/","n":"` + strings.Repeat("x", 33<<10) + `"}`
	var props []string
	for i := range 21 {
		props = append(props, fmt.Sprintf(`"k%d":"v"`, i))
	}
	tests := []struct {
		name, body string
		code       int
	}{
		{"unknown site", strings.Replace(pageview, `"s1"`, `"nope"`, 1), http.StatusBadRequest},
		{"oversize body", big, http.StatusRequestEntityTooLarge},
		{"malformed json", `{"s":"s1",`, http.StatusBadRequest},
		{"too many props", `{"s":"s1","t":"event","a":"a","n":"x","d":{` + strings.Join(props, ",") + `}}`, http.StatusBadRequest},
		{"nested props", `{"s":"s1","t":"event","a":"a","n":"x","d":{"k":{"x":1}}}`, http.StatusBadRequest},
		{"unknown type", strings.Replace(pageview, `"pageview"`, `"click"`, 1), http.StatusBadRequest},
		{"missing anon", strings.Replace(pageview, `"anon-1"`, `""`, 1), http.StatusBadRequest},
		{"bad anon chars", strings.Replace(pageview, `"anon-1"`, `"a; Path=/x"`, 1), http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, h := setup(t)
			w := post(h, tt.body)
			if w.Code != tt.code {
				t.Errorf("status %d, want %d", w.Code, tt.code)
			}
			if n := rows(t, st); n != 0 {
				t.Errorf("rows = %d, want 0", n)
			}
		})
	}
}

func TestBotFlag(t *testing.T) {
	st, h := setup(t)
	if w := post(h, strings.Replace(pageview, `{`, `{"w":1,`, 1)); w.Code != http.StatusNoContent {
		t.Fatalf("status %d", w.Code)
	}
	rows(t, st)
	var bot int
	if err := st.DB().QueryRow("SELECT is_bot FROM events").Scan(&bot); err != nil {
		t.Fatal(err)
	}
	if bot != 1 {
		t.Errorf("is_bot = %d", bot)
	}
}

func TestNoIPStored(t *testing.T) {
	st, h := setup(t)
	post(h, `{"s":"s1","t":"event","a":"anon-1","ss":"x","u":"https://example.com/","n":"Signup","d":{"plan":"pro","n":3,"ok":true}}`)
	rows(t, st)
	r, err := st.DB().Query("SELECT * FROM events")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	cols, _ := r.Columns()
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	for r.Next() {
		if err := r.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		for i, v := range vals {
			if strings.Contains(fmt.Sprint(v), "203.0.113.77") {
				t.Errorf("column %s contains the client IP", cols[i])
			}
		}
	}
}

func TestOptions(t *testing.T) {
	_, h := setup(t)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodOptions, "/_t/e", nil))
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("OPTIONS: %d %v", w.Code, w.Header())
	}
}

func TestTrackerHandler(t *testing.T) {
	w := httptest.NewRecorder()
	TrackerHandler([]byte("x()")).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/_t/t.js", nil))
	if w.Code != 200 || w.Body.String() != "x()" || w.Header().Get("Cache-Control") != "public, max-age=3600" ||
		!strings.Contains(w.Header().Get("Content-Type"), "javascript") {
		t.Errorf("got %d %q %v", w.Code, w.Body.String(), w.Header())
	}
}

func batch(n int, each func(i int) string) string {
	parts := make([]string, n)
	for i := range parts {
		parts[i] = each(i)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func TestBatchAccepted(t *testing.T) {
	st, h := setup(t)
	w := post(h, " \n"+batch(3, func(int) string { return pageview }))
	if w.Code != http.StatusNoContent {
		t.Fatalf("status %d, body %q", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Trail-Accepted"); got != "3" {
		t.Errorf("X-Trail-Accepted = %q, want 3", got)
	}
	if n := rows(t, st); n != 3 {
		t.Fatalf("rows = %d, want 3", n)
	}
}

func TestBatchRejected(t *testing.T) {
	other := strings.Replace(pageview, `"s1"`, `"s2"`, 1)
	tests := []struct {
		name, body string
	}{
		{"too many", batch(51, func(int) string { return pageview })},
		{"thousand", batch(1000, func(int) string { return `{}` })},
		{"empty", `[]`},
		{"mixed sites", batch(3, func(i int) string {
			if i == 2 {
				return other
			}
			return pageview
		})},
		{"one invalid", batch(3, func(i int) string {
			if i == 1 {
				return strings.Replace(pageview, `"pageview"`, `"click"`, 1)
			}
			return pageview
		})},
		{"one nested props", batch(2, func(i int) string {
			if i == 1 {
				return `{"s":"s1","t":"event","a":"a","n":"x","d":{"k":[1]}}`
			}
			return pageview
		})},
		{"not objects", `[1,2]`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, h := newHandler(t, map[string]string{"s1": "example.com", "s2": "other.com"})
			w := post(h, tt.body)
			if w.Code != http.StatusBadRequest {
				t.Errorf("status %d, want 400", w.Code)
			}
			if n := rows(t, st); n != 0 {
				t.Errorf("rows = %d, want 0", n)
			}
		})
	}
}

func TestBatchBodyLimit(t *testing.T) {
	st, h := setup(t)
	ev := strings.Replace(pageview, `"r":`, `"n":"`+strings.Repeat("x", 1000)+`","r":`, 1)
	w := post(h, batch(40, func(int) string { return ev }))
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status %d, want 413", w.Code)
	}
	if n := rows(t, st); n != 0 {
		t.Errorf("rows = %d, want 0", n)
	}
}

func TestRetryStored(t *testing.T) {
	for _, tt := range []struct {
		rc   string
		want int
	}{{"2", 2}, {"-3", 0}, {"0", 0}} {
		t.Run(tt.rc, func(t *testing.T) {
			st, h := setup(t)
			if w := post(h, strings.Replace(pageview, `{`, `{"rc":`+tt.rc+`,`, 1)); w.Code != http.StatusNoContent {
				t.Fatalf("status %d", w.Code)
			}
			rows(t, st)
			var got int
			if err := st.DB().QueryRow("SELECT retry FROM events").Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Errorf("retry = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestTrackerFiles(t *testing.T) {
	h := TrackerFiles()
	for _, p := range []string{"/_t/t.js", "/_t/t.p.js", "/_t/t.x.js"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, p, nil))
		if w.Code != 200 || w.Body.Len() == 0 || !strings.Contains(w.Header().Get("Content-Type"), "javascript") ||
			w.Header().Get("Cache-Control") != "public, max-age=3600" || w.Header().Get("Access-Control-Allow-Origin") != "*" {
			t.Errorf("%s: %d %v", p, w.Code, w.Header())
		}
	}
	for _, p := range []string{"/_t/x.js", "/_t/", "/_t/../ingest.go", "/_t/ingest.go"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, p, nil))
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", p, w.Code)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/_t/t.js", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST: %d, want 405", w.Code)
	}
}

const privatePV = `{"s":"s1","t":"pageview","m":"p","a":"","u":"https://example.com/"}`

func TestPrivateEventGetsServerIdentity(t *testing.T) {
	st, h := setup(t)
	w := post(h, batch(2, func(int) string { return privatePV }))
	if w.Code != http.StatusNoContent {
		t.Fatalf("status %d, body %q", w.Code, w.Body.String())
	}
	if c := w.Header().Get("Set-Cookie"); c != "" {
		t.Errorf("private mode set a cookie: %q", c)
	}
	if n := rows(t, st); n != 2 {
		t.Fatalf("rows = %d, want 2", n)
	}
	var anons, sessions int
	var anon, sess string
	err := st.DB().QueryRow(`SELECT count(DISTINCT anon_id), count(DISTINCT session_id), max(anon_id), max(session_id) FROM events`).
		Scan(&anons, &sessions, &anon, &sess)
	if err != nil {
		t.Fatal(err)
	}
	if anons != 1 || sessions != 1 || !strings.HasPrefix(anon, "p_") || sess == "" {
		t.Errorf("anons=%d sessions=%d anon=%q session=%q", anons, sessions, anon, sess)
	}
}

func TestPrivateIgnoresClientIDs(t *testing.T) {
	st, h := setup(t)
	if w := post(h, `{"s":"s1","t":"pageview","m":"p","a":"client-a","ss":"client-s","uid":"u1","u":"https://example.com/"}`); w.Code != http.StatusNoContent {
		t.Fatalf("status %d", w.Code)
	}
	rows(t, st)
	var anon, sess, uid string
	if err := st.DB().QueryRow(`SELECT anon_id, session_id, user_id FROM events`).Scan(&anon, &sess, &uid); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(anon, "p_") || sess == "client-s" || uid != "" {
		t.Errorf("anon=%q session=%q uid=%q", anon, sess, uid)
	}
}

func TestPrivateUsesGivenPrivate(t *testing.T) {
	p := NewPrivate(time.UTC, time.Now)
	st, h := newHandler(t, map[string]string{"s1": "example.com"}, WithPrivate(p))
	post(h, privatePV)
	rows(t, st)
	want, _ := p.Identify("s1", "203.0.113.77", iphoneUA)
	var anon string
	if err := st.DB().QueryRow(`SELECT anon_id FROM events`).Scan(&anon); err != nil {
		t.Fatal(err)
	}
	if anon != want {
		t.Errorf("anon = %q, want %q", anon, want)
	}
}

func TestFullModeUnchanged(t *testing.T) {
	st, h := setup(t)
	full := strings.Replace(pageview, `{`, `{"m":"f",`, 1)
	w := post(h, full)
	if w.Code != http.StatusNoContent || !strings.Contains(w.Header().Get("Set-Cookie"), "_t_id=anon-1") {
		t.Errorf("full: %d, Set-Cookie %q", w.Code, w.Header().Get("Set-Cookie"))
	}
	if w := post(h, strings.Replace(full, `"anon-1"`, `""`, 1)); w.Code != http.StatusBadRequest {
		t.Errorf("full mode without anon: %d, want 400", w.Code)
	}
	if n := rows(t, st); n != 1 {
		t.Errorf("rows = %d, want 1", n)
	}
}

func TestModeRejects(t *testing.T) {
	for name, body := range map[string]string{
		"private identify": `{"s":"s1","t":"identify","m":"p","a":"","uid":"u1"}`,
		"unknown mode":     strings.Replace(pageview, `{`, `{"m":"x",`, 1),
		"private in batch": batch(2, func(i int) string {
			if i == 1 {
				return `{"s":"s1","t":"identify","m":"p","uid":"u1"}`
			}
			return privatePV
		}),
	} {
		t.Run(name, func(t *testing.T) {
			st, h := setup(t)
			if w := post(h, body); w.Code != http.StatusBadRequest {
				t.Errorf("status %d, want 400", w.Code)
			}
			if n := rows(t, st); n != 0 {
				t.Errorf("rows = %d, want 0", n)
			}
		})
	}
}

func TestMixedModeBatchCookieFromFullEvent(t *testing.T) {
	_, h := setup(t)
	w := post(h, "["+privatePV+","+pageview+"]")
	if w.Code != http.StatusNoContent || !strings.Contains(w.Header().Get("Set-Cookie"), "_t_id=anon-1") {
		t.Errorf("%d, Set-Cookie %q", w.Code, w.Header().Get("Set-Cookie"))
	}
}
