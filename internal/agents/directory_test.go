package agents

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const prefixDoc = `{"prefixes":[{"ipv4Prefix":"192.0.2.0/24"}]}`

// listServer serves body (or the status from code) and counts requests.
func listServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var n atomic.Int64
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv, &n
}

func testDir(srv *httptest.Server, urls map[string]string, now func() time.Time) *Directory {
	if now == nil {
		now = time.Now
	}
	return NewDirectory(DirOptions{Client: srv.Client(), Now: now, URLs: urls})
}

func statusOf(d *Directory, name string) ListStatus {
	for _, s := range d.Status() {
		if s.Name == name {
			return s
		}
	}
	return ListStatus{}
}

func TestDirectoryRefreshKeepsLastGood(t *testing.T) {
	var fail atomic.Bool
	srv, _ := listServer(t, func(w http.ResponseWriter, r *http.Request) {
		if fail.Load() {
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte(prefixDoc))
	})
	clock := time.UnixMilli(1_795_000_000_000)
	d := testDir(srv, map[string]string{"google-agents": srv.URL + "/g.json"}, func() time.Time { return clock })
	ctx := context.Background()
	if err := d.refresh(ctx, d.byName["google-agents"]); err != nil {
		t.Fatal(err)
	}
	if !d.InList("google-agents", "192.0.2.9") {
		t.Fatal("not in list after a good fetch")
	}
	first := statusOf(d, "google-agents")
	if !first.OK || first.FetchedAt != clock.UnixMilli() || first.Entries != 1 || first.Kind != "ip" {
		t.Fatalf("status %+v", first)
	}
	fail.Store(true)
	clock = clock.Add(time.Hour)
	if err := d.refresh(ctx, d.byName["google-agents"]); err == nil {
		t.Fatal("a 500 refreshed")
	}
	if !d.InList("google-agents", "192.0.2.9") {
		t.Error("lost the last good copy")
	}
	if s := statusOf(d, "google-agents"); !s.OK || s.FetchedAt != first.FetchedAt {
		t.Errorf("status after failure %+v", s)
	}
}

func TestDirectoryStartFetches(t *testing.T) {
	srv, n := listServer(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(prefixDoc)) })
	d := testDir(srv, map[string]string{"google-agents": srv.URL + "/g.json", "openai-gptbot": srv.URL + "/o.json"}, nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	d.Start(ctx)
	deadline := time.Now().Add(5 * time.Second)
	for !(statusOf(d, "google-agents").OK && statusOf(d, "openai-gptbot").OK) {
		if time.Now().After(deadline) {
			t.Fatalf("lists not fetched: %+v", d.Status())
		}
		time.Sleep(5 * time.Millisecond)
	}
	if n.Load() != 2 {
		t.Errorf("%d requests, want 2", n.Load())
	}
	if !d.VerifyCrawler("GPTBot", "192.0.2.1") || d.VerifyCrawler("GPTBot", "10.0.0.1") || d.VerifyCrawler("ClaudeBot", "192.0.2.1") {
		t.Error("VerifyCrawler wrong")
	}
	if d.VerifyCrawler("GPTBot", "not an ip") || d.InList("nope", "192.0.2.1") {
		t.Error("bad input matched")
	}
}

func TestDirectoryDisabledNeverFetches(t *testing.T) {
	srv, n := listServer(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(prefixDoc)) })
	d := NewDirectory(DirOptions{Client: srv.Client(), Disabled: true, URLs: map[string]string{"google-agents": srv.URL, "openai-keys": srv.URL}})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	d.Start(ctx)
	d.Key("https://chatgpt.com", "k")
	time.Sleep(50 * time.Millisecond)
	if n.Load() != 0 {
		t.Fatalf("%d requests while disabled", n.Load())
	}
	st := d.Status()
	if len(st) == 0 {
		t.Fatal("no status rows")
	}
	for _, s := range st {
		if s.OK {
			t.Errorf("%s OK while disabled", s.Name)
		}
	}
	// The default directory reports every §0.11 list.
	if got := len(NewDirectory(DirOptions{Disabled: true}).Status()); got != 10 {
		t.Errorf("default lists: %d, want 10", got)
	}
}

func TestClassifyNeverBlocksOnFetch(t *testing.T) {
	release := make(chan struct{})
	srv, _ := listServer(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		case <-time.After(30 * time.Second):
		}
	})
	defer close(release)
	d := testDir(srv, map[string]string{"google-agents": srv.URL, "anthropic-sail": srv.URL + "/sail"}, nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	d.Start(ctx)
	time.Sleep(20 * time.Millisecond) // the fetches are in flight
	start := time.Now()
	in := d.InList("google-agents", "192.0.2.1")
	r := d.Classify(Input{Site: "s", UA: claudeAgentUA, IP: "192.0.2.1"})
	if el := time.Since(start); in || el > 5*time.Millisecond {
		t.Fatalf("InList = %v after %v", in, el)
	}
	if r != (Result{ID: "claude-agent", Via: ViaUA}) {
		t.Errorf("Classify = %+v", r)
	}
}

func TestDirectoryRejectsBigBody(t *testing.T) {
	big := strings.Repeat(" ", 3<<20) + prefixDoc
	srv, _ := listServer(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(big)) })
	d := testDir(srv, map[string]string{"google-agents": srv.URL}, nil)
	if err := d.refresh(context.Background(), d.byName["google-agents"]); err == nil {
		t.Fatal("a 3 MiB body was accepted")
	}
	if statusOf(d, "google-agents").OK {
		t.Error("status OK")
	}
}

func TestDirectoryHTTPSOnly(t *testing.T) {
	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(prefixDoc)) }))
	defer plain.Close()
	d := NewDirectory(DirOptions{URLs: map[string]string{"google-agents": plain.URL}})
	if err := d.refresh(context.Background(), d.byName["google-agents"]); err == nil {
		t.Fatal("http:// fetched")
	}
}

func TestDirectoryRedirects(t *testing.T) {
	var srv *httptest.Server
	srv, _ = listServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/same":
			http.Redirect(w, r, "/final", http.StatusFound)
		case "/final":
			_, _ = w.Write([]byte(prefixDoc))
		case "/loop":
			http.Redirect(w, r, "/loop", http.StatusFound)
		case "/away":
			http.Redirect(w, r, "https://example.invalid/x.json", http.StatusFound)
		}
	})
	d := testDir(srv, map[string]string{"google-agents": srv.URL + "/same", "openai-gptbot": srv.URL + "/loop", "openai-adsbot": srv.URL + "/away"}, nil)
	ctx := context.Background()
	if err := d.refresh(ctx, d.byName["google-agents"]); err != nil {
		t.Errorf("same-host redirect: %v", err)
	}
	if err := d.refresh(ctx, d.byName["openai-gptbot"]); err == nil {
		t.Error("redirect loop followed")
	}
	if err := d.refresh(ctx, d.byName["openai-adsbot"]); err == nil || !strings.Contains(err.Error(), "redirect") {
		t.Errorf("cross-host redirect: %v", err)
	}
}

func TestDirectorySAILList(t *testing.T) {
	doc, err := os.ReadFile("testdata/sail.toml")
	if err != nil {
		t.Fatal(err)
	}
	srv, _ := listServer(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(doc) })
	d := testDir(srv, map[string]string{"anthropic-sail": srv.URL}, nil)
	if err := d.refresh(context.Background(), d.byName["anthropic-sail"]); err != nil {
		t.Fatal(err)
	}
	if !d.inAgentList(Catalogue[0], "192.0.2.10") || d.inAgentList(Catalogue[0], "203.0.113.1") {
		t.Error("Claude-Agent service set wrong")
	}
	if !d.VerifyCrawler("ClaudeBot", "203.0.113.1") || d.VerifyCrawler("ClaudeBot", "192.0.2.10") {
		t.Error("ClaudeBot verified against the wrong service")
	}
}
