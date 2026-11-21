package ingest

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"trail/internal/netx"
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

// A full map must not let new IPs through unlimited: they share one capped bucket.
func TestRateLimiterFullMapCapsNewIPs(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	l := newLimiter(1, 1, func() time.Time { return now })
	l.max = 2
	for i := range 2 { // fill the map with busy clients (each used its burst)
		l.allow("10.0.0." + strconv.Itoa(i))
	}
	allowed := 0
	for i := range 1000 { // a flood of fresh IPs at the same instant
		if l.allow("10.9." + strconv.Itoa(i/250) + "." + strconv.Itoa(i%250)) {
			allowed++
		}
	}
	if allowed != 20 { // overflow bucket burst = 20 x per-IP burst
		t.Fatalf("fresh IPs allowed %d while full, want 20 (shared overflow burst)", allowed)
	}
}

// A client connecting directly cannot dodge its bucket by rotating a forged
// X-Forwarded-For: only a trusted proxy's header counts.
func TestRateLimitIgnoresSpoofedXFF(t *testing.T) {
	_, h := newHandler(t, map[string]string{"s1": "example.com"}, WithRateLimit(1, 3))
	limited := false
	for i := range 10 {
		w := postFrom(h, pageview, map[string]string{
			"Origin":          "https://example.com",
			"RemoteAddr":      "198.51.100.7:5000",
			"X-Forwarded-For": "203.0.113." + strconv.Itoa(i),
		})
		if w.Code == http.StatusTooManyRequests {
			limited = true
		}
	}
	if !limited {
		t.Fatal("spoofer rotating X-Forwarded-For was never limited")
	}
}

// With TRAIL_TRUSTED_PROXIES=none even a loopback proxy's header is ignored,
// so everyone behind it shares one bucket.
func TestRateLimitTrustedNone(t *testing.T) {
	none, err := netx.ParseTrusted("none")
	if err != nil {
		t.Fatal(err)
	}
	_, h := newHandler(t, map[string]string{"s1": "example.com"}, WithRateLimit(1, 3), WithProxies(none))
	for i := range 3 {
		postFrom(h, pageview, map[string]string{"Origin": "https://example.com", "X-Forwarded-For": "203.0.113." + strconv.Itoa(i)})
	}
	if w := postFrom(h, pageview, map[string]string{"Origin": "https://example.com", "X-Forwarded-For": "203.0.113.99"}); w.Code != http.StatusTooManyRequests {
		t.Fatalf("got %d, want 429: XFF must be ignored with none", w.Code)
	}
}
