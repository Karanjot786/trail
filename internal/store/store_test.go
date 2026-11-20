package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func count(t *testing.T, s *Store, q string) int {
	t.Helper()
	var n int
	if err := s.DB().QueryRow(q).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

func ev(typ string) Event {
	return Event{SiteID: "s1", Type: typ, AnonID: "a1", SessionID: "x1", TS: time.Now().UnixMilli(), Path: "/"}
}

func TestEnqueueFlush(t *testing.T) {
	s := openTest(t)
	for range 3 {
		s.Enqueue(ev("pageview"))
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 3 {
		t.Fatalf("got %d rows, want 3", n)
	}
}

func TestBatchAt500(t *testing.T) {
	s := openTest(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)
	for range 500 {
		s.Enqueue(ev("pageview"))
	}
	// The 1 s timer must not be what flushes: poll well under it.
	// (50 ms per the plan; the race detector makes 500 inserts slower than that.)
	deadline := time.Now().Add(500 * time.Millisecond)
	n := 0
	for time.Now().Before(deadline) {
		if n = count(t, s, "SELECT count(*) FROM events"); n == 500 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("got %d rows within 500ms, want 500", n)
}

func TestIdentifyWritesMap(t *testing.T) {
	s := openTest(t)
	e := ev("identify")
	e.UserID = "u1"
	s.Enqueue(e)
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM identity_map WHERE user_id='u1'"); n != 1 {
		t.Fatalf("identity_map rows = %d, want 1", n)
	}
}

func TestRetryStored(t *testing.T) {
	s := openTest(t)
	e := ev("pageview")
	e.Retry = 2
	s.Enqueue(e)
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT retry FROM events"); n != 2 {
		t.Fatalf("retry = %d, want 2", n)
	}
}

func TestStoreMigratesRetryColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	// The events table as it was before the retry column.
	if _, err := old.Exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, site_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL,
		anon_id TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '',
		host TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '', route TEXT NOT NULL DEFAULT '',
		utm_source TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '',
		utm_term TEXT NOT NULL DEFAULT '', utm_content TEXT NOT NULL DEFAULT '', referrer_host TEXT NOT NULL DEFAULT '',
		referrer_url TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', props TEXT NOT NULL DEFAULT '',
		engaged_ms INTEGER NOT NULL DEFAULT 0, scroll_pct INTEGER NOT NULL DEFAULT 0, country TEXT NOT NULL DEFAULT '',
		region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '',
		browser TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '', is_bot INTEGER NOT NULL DEFAULT 0, env TEXT NOT NULL DEFAULT '');
		INSERT INTO events (site_id, ts, type) VALUES ('s1', 1, 'pageview')`); err != nil {
		t.Fatal(err)
	}
	_ = old.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("open old db: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	e := ev("pageview")
	e.Retry = 1
	s.Enqueue(e)
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE retry=0"); n != 1 {
		t.Errorf("old rows with retry=0: %d, want 1", n)
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE retry=1"); n != 1 {
		t.Errorf("new rows with retry=1: %d, want 1", n)
	}
	// Reopening an already-migrated DB must not fail.
	_ = s.Close()
	s2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	_ = s2.Close()
}
