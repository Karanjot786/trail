package ingest

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func postMethod(h http.Handler, method, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/_t/e", strings.NewReader(pageview))
	r.Header.Set("Origin", origin)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestRateLimit429(t *testing.T) {
	_, h := newHandler(t, map[string]string{"s1": "example.com"}, WithRateLimit(1, 3))
	for i := range 3 {
		if w := post(h, pageview); w.Code != http.StatusNoContent {
			t.Fatalf("request %d: %d", i, w.Code)
		}
	}
	if w := post(h, pageview); w.Code != http.StatusTooManyRequests {
		t.Fatalf("over the burst: %d, want 429", w.Code)
	}
	// Another IP has its own bucket.
	if w := postFrom(h, pageview, map[string]string{"Origin": "https://example.com", "X-Forwarded-For": "198.51.100.1"}); w.Code != http.StatusNoContent {
		t.Fatalf("other ip: %d", w.Code)
	}
}

func TestRateLimiterCapAndSweep(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	l := newLimiter(10, 20, func() time.Time { return now })
	l.max = 5
	for i := range 50 {
		l.allow("10.0.0." + strconv.Itoa(i))
	}
	if n := l.size(); n != 5 {
		t.Fatalf("map size %d, want capped at 5", n)
	}
	for _, k := range l.keys() {
		if strings.Contains(k, "10.0.0.") {
			t.Fatalf("raw IP stored as key %q", k)
		}
	}
	now = now.Add(2 * time.Minute) // every bucket refilled: all idle
	l.allow("10.0.1.1")
	if n := l.size(); n != 1 {
		t.Fatalf("after sweep size %d, want 1", n)
	}
}
