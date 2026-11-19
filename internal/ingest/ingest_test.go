package ingest

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"trail/internal/enrich"
	"trail/internal/store"
)

const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"

func setup(t *testing.T) (*store.Store, http.Handler) {
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
	return st, New(st, geo, map[string]string{"s1": "example.com"})
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
	big := `{"s":"s1","t":"pageview","a":"a","u":"https://example.com/","n":"` + strings.Repeat("x", 9000) + `"}`
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
