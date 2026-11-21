package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trail/internal/auth"
)

func postCrawl(h http.Handler, tok auth.Token, query, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/crawls"+query, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/x-ndjson")
	r = r.WithContext(auth.WithToken(r.Context(), tok))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestCrawlsEndpointLimits(t *testing.T) {
	h := setup(t)
	crawl := auth.Token{ID: "t", Name: "edge", Scope: "crawl", Site: "s"}
	line := `{"ts":1795149300000,"ua":"GPTBot/1.2","path":"/a","status":200}` + "\n"
	w := postCrawl(h, crawl, "", line+`{"ts":1795149300000,"ua":"Chrome","path":"/","status":200}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `{"accepted":2,"kept":1}`) {
		t.Fatalf("ok post: %d %s", w.Code, w.Body)
	}
	if w := postCrawl(h, crawl, "", strings.Repeat("x", maxCrawlBody+1)); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("1 MiB + 1: %d", w.Code)
	}
	if w := postCrawl(h, crawl, "", strings.Repeat("{}\n", maxCrawlLines+1)); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("too many lines: %d", w.Code)
	}
	gone := auth.Token{ID: "g", Name: "old", Scope: "crawl", Site: "deleted"}
	if w := postCrawl(h, gone, "", line); w.Code != http.StatusForbidden {
		t.Errorf("unknown site token: %d", w.Code)
	}
	if w := postCrawl(h, crawl, "?site=b", line); w.Code != http.StatusForbidden {
		t.Errorf("other site: %d", w.Code)
	}
	if w := postCrawl(h, crawl, "", `{"ts":1,"ua":"x","path":"/","status":200,"extra":1}`); w.Code != http.StatusBadRequest {
		t.Errorf("unknown field: %d", w.Code)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/crawls?site=s", strings.NewReader(line))
	r.Header.Set("Content-Type", "text/plain")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusUnsupportedMediaType {
		t.Errorf("text/plain: %d", w.Code)
	}
}
