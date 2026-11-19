package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
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
