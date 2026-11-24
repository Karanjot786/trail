package ingest

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestSamplerOncePerWindow(t *testing.T) {
	now := time.Unix(1000, 0)
	var lines []string
	s := newSampler(time.Minute, func() time.Time { return now }, func(f string, a ...any) { lines = append(lines, fmt.Sprintf(f, a...)) })
	for range 5 {
		s.Log("k", "boom site=%s", "s1")
	}
	if len(lines) != 1 || lines[0] != "boom site=s1" {
		t.Fatalf("lines = %q, want one", lines)
	}
	now = now.Add(61 * time.Second)
	s.Log("k", "boom site=%s", "s1")
	if len(lines) != 2 || !strings.HasSuffix(lines[1], "(4 more since last)") {
		t.Fatalf("lines = %q, want a suffixed second line", lines)
	}
	s.Log("other", "different")
	if len(lines) != 3 {
		t.Fatalf("a new key must print at once: %q", lines)
	}
}

// logged returns an Option that sends the handler's log lines to *lines.
func logged(lines *[]string) Option {
	return func(h *handler) {
		h.log = newSampler(time.Minute, time.Now, func(f string, a ...any) { *lines = append(*lines, fmt.Sprintf(f, a...)) })
	}
}

func TestRejectLogHasNoIP(t *testing.T) {
	var lines []string
	_, h := newHandler(t, map[string]string{"s1": "example.com"}, logged(&lines))
	w := postFrom(h, `{"s":"nope","t":"pageview","a":"a","u":"https://example.com/"}`,
		map[string]string{"Origin": "https://example.com", "X-Forwarded-For": "203.0.113.77"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d", w.Code)
	}
	all := strings.Join(lines, "\n")
	if !strings.Contains(all, "400 unknown site") {
		t.Errorf("log %q lacks the 400 reason", all)
	}
	if strings.Contains(all, "203.0.113.77") {
		t.Errorf("log %q leaks the client IP", all)
	}
}

func TestUnverifiedProxyLogged(t *testing.T) {
	var lines []string
	_, h := newHandler(t, map[string]string{"s1": "example.com"}, logged(&lines))
	postFrom(h, pageview, map[string]string{"Origin": "https://example.com", "X-Trail-Proxy": "v1;k=bad;t=1;s=00"})
	if !strings.Contains(strings.Join(lines, "\n"), "proxy signature not verified") {
		t.Errorf("log %q lacks the unverified-proxy line", lines)
	}
}
