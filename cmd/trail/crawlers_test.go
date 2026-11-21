package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"trail/internal/sites"
	"trail/internal/store"
)

const accessLog = `1.1.1.1 - - [20/Nov/2026:04:00:00 +0000] "GET /a HTTP/1.1" 200 1 "-" "GPTBot/1.2"
1.1.1.1 - - [20/Nov/2026:04:01:00 +0000] "GET /b HTTP/1.1" 200 1 "-" "Mozilla/5.0 Chrome/131"
1.1.1.1 - - [20/Nov/2026:04:02:00 +0000] "GET /c?x=1 HTTP/1.1" 404 1 "-" "ClaudeBot/1.0"
`

func TestCrawlersImportLocal(t *testing.T) {
	db := filepath.Join(t.TempDir(), "c.db")
	t.Setenv("TRAIL_DB", db)
	st, err := store.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	reg, _ := sites.Open(st.DB())
	if _, err := reg.Add(sites.Site{ID: "s", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	_ = st.Close()
	logFile := filepath.Join(t.TempDir(), "access.log")
	if err := os.WriteFile(logFile, []byte(accessLog), 0o600); err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"kept 2", "kept 0"} {
		var out bytes.Buffer
		if err := runCrawlers([]string{"import", "--site", "s", logFile}, nil, &out); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.String(), want) {
			t.Errorf("run %d: %s", i, out.String())
		}
	}
	if err := runCrawlers([]string{"import", "--site", "nope", logFile}, nil, &bytes.Buffer{}); err == nil {
		t.Error("unknown site accepted")
	}
}

func TestCrawlersImportRemote(t *testing.T) {
	h := testRoutes(t)
	as := owner(t, h)
	tok := newToken(t, as, "edge", "crawl", "s")
	srv := httptest.NewServer(h)
	defer srv.Close()
	var out bytes.Buffer
	args := []string{"import", "--site", "s", "--since", "2026-11-01T00:00:00Z", "--url", srv.URL, "--token", tok.Token, "-"}
	if err := runCrawlers(args, strings.NewReader(accessLog), &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "kept 2") {
		t.Fatalf("out %s", out.String())
	}
	args[len(args)-2] = tok.Token + "x"
	if err := runCrawlers(args, strings.NewReader(accessLog), &out); err == nil || strings.Contains(err.Error(), tok.Token) {
		t.Fatalf("bad token: %v", err)
	}
	if err := runCrawlers([]string{"import", "--site", "s", "--url", srv.URL, "--token", "x", "-"}, strings.NewReader(""), &out); err == nil {
		t.Error("remote with --since auto accepted")
	}
}

func TestCLIFallsBackWithoutIP(t *testing.T) {
	var posts []string
	old := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		posts = append(posts, string(b))
		if strings.Contains(string(b), `"ip"`) { // an older Trail: DisallowUnknownFields
			http.Error(w, "line 1: want {ts, ua, path, status}", http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":2,"kept":2}`))
	}))
	defer old.Close()
	var out bytes.Buffer
	args := []string{"import", "--site", "s", "--since", "2026-11-01T00:00:00Z", "--url", old.URL, "--token", "t", "-"}
	// The rejected batch is resent once without ip, with one warning.
	if err := runCrawlers(args, strings.NewReader(accessLog+accessLog), &out); err != nil {
		t.Fatal(err)
	}
	if len(posts) != 2 || !strings.Contains(posts[0], `"ip":"1.1.1.1"`) || strings.Contains(posts[1], `"ip"`) {
		t.Fatalf("posts %q", posts)
	}
	if c := strings.Count(out.String(), "the remote Trail is older"); c != 1 {
		t.Errorf("warning printed %d times: %s", c, out.String())
	}
	if !strings.Contains(out.String(), "kept 4") {
		t.Errorf("out %s", out.String())
	}
}
