package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
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
	// Push the timer flush out of reach, so only the 500-event trigger can write the rows.
	s.every = time.Hour
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)
	for range 500 {
		s.Enqueue(ev("pageview"))
	}
	// A generous deadline for slow or loaded machines; the timer cannot fire within it.
	deadline := time.Now().Add(30 * time.Second)
	n := 0
	for time.Now().Before(deadline) {
		if n = count(t, s, "SELECT count(*) FROM events"); n == 500 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("got %d rows, want the batch of 500 flushed without the timer", n)
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

// oldEventsDB creates a database whose events table predates the agent, agent_via and geo_src columns.
func oldEventsDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	if _, err := old.Exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, site_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL,
		anon_id TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '',
		host TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '', route TEXT NOT NULL DEFAULT '',
		utm_source TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '',
		utm_term TEXT NOT NULL DEFAULT '', utm_content TEXT NOT NULL DEFAULT '', referrer_host TEXT NOT NULL DEFAULT '',
		referrer_url TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', props TEXT NOT NULL DEFAULT '',
		engaged_ms INTEGER NOT NULL DEFAULT 0, scroll_pct INTEGER NOT NULL DEFAULT 0, country TEXT NOT NULL DEFAULT '',
		region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '',
		browser TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '', is_bot INTEGER NOT NULL DEFAULT 0,
		env TEXT NOT NULL DEFAULT '', retry INTEGER NOT NULL DEFAULT 0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(`INSERT INTO events (site_id, ts, type) VALUES ('s1', 1, 'pageview'), ('s1', 2, 'pageview')`); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestMigrateAddsAgentColumns(t *testing.T) {
	s, err := Open(oldEventsDB(t))
	if err != nil {
		t.Fatalf("open old db: %v", err)
	}
	defer s.Close()
	for _, col := range []string{"agent", "agent_via", "geo_src"} {
		if n := count(t, s, "SELECT count(*) FROM pragma_table_info('events') WHERE name='"+col+"' AND dflt_value=\"''\""); n != 1 {
			t.Errorf("column %s with default '': %d, want 1", col, n)
		}
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE agent='' AND agent_via='' AND geo_src=''"); n != 2 {
		t.Errorf("old rows reading '': %d, want 2", n)
	}
	if n := count(t, s, "SELECT count(*) FROM sqlite_master WHERE name='events_site_agent_ts'"); n != 1 {
		t.Errorf("events_site_agent_ts index rows: %d, want 1", n)
	}
}

func TestMigrateCrawlHitsVerified(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(`CREATE TABLE crawl_hits(site_id TEXT NOT NULL, hour INTEGER NOT NULL, bot TEXT NOT NULL, path TEXT NOT NULL,
		status INTEGER NOT NULL, n INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY(site_id, hour, bot, path, status)) WITHOUT ROWID;
		INSERT INTO crawl_hits VALUES ('s1', 1, 'GPTBot', '/a', 2, 3, 10), ('s1', 1, 'GPTBot', '/b', 2, 1, 11), ('s1', 2, 'ClaudeBot', '/a', 4, 2, 12);`); err != nil {
		t.Fatal(err)
	}
	_ = old.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("open old db: %v", err)
	}
	defer s.Close()
	if n := count(t, s, "SELECT count(*) FROM crawl_hits WHERE verified=0"); n != 3 {
		t.Fatalf("rows with verified=0: %d, want 3", n)
	}
	if n := count(t, s, "SELECT sum(n) FROM crawl_hits"); n != 6 {
		t.Errorf("sum(n) = %d, want 6", n)
	}
	if _, err := s.DB().Exec(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, verified, n, last_ts) VALUES ('s1', 1, 'GPTBot', '/a', 2, 1, 1, 13)`); err != nil {
		t.Fatalf("insert verified twin: %v", err)
	}
	if n := count(t, s, "SELECT count(*) FROM crawl_hits WHERE site_id='s1' AND hour=1 AND bot='GPTBot' AND path='/a' AND status=2"); n != 2 {
		t.Errorf("rows for the key: %d, want 2 (verified is part of the key)", n)
	}
	if n := count(t, s, "SELECT count(*) FROM sqlite_master WHERE name LIKE 'crawl_hits_v2%'"); n != 0 {
		t.Errorf("leftover crawl_hits_v2 objects: %d", n)
	}
}

func TestEventAgentRoundTrip(t *testing.T) {
	s := openTest(t)
	e := ev("pageview")
	e.Agent, e.AgentVia, e.IsBot, e.GeoSrc = "claude-agent", "ua", true, "vercel"
	s.Enqueue(e)
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	var agent, via, geoSrc string
	var bot int
	if err := s.DB().QueryRow(`SELECT agent, agent_via, geo_src, is_bot FROM events`).Scan(&agent, &via, &geoSrc, &bot); err != nil {
		t.Fatal(err)
	}
	if agent != "claude-agent" || via != "ua" || geoSrc != "vercel" || bot != 1 {
		t.Errorf("got agent=%q via=%q geo_src=%q is_bot=%d", agent, via, geoSrc, bot)
	}
}

func TestEnqueueBatchAllOrNothing(t *testing.T) {
	s := openTest(t)
	for range queueCap - 1 {
		if !s.Enqueue(ev("pageview")) {
			t.Fatal("enqueue refused before the queue was full")
		}
	}
	if s.EnqueueBatch([]Event{ev("pageview"), ev("pageview")}) {
		t.Fatal("a batch that does not fit must be refused whole")
	}
	if got := s.Dropped(); got != 2 {
		t.Fatalf("Dropped()=%d, want 2", got)
	}
	if !s.EnqueueBatch([]Event{ev("pageview")}) {
		t.Fatal("a batch of 1 fits the last slot")
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != queueCap {
		t.Fatalf("got %d rows, want %d", n, queueCap)
	}
}

// limitDisk makes every write fail with SQLITE_FULL by capping the page count at its current size.
func limitDisk(t *testing.T, s *Store) {
	t.Helper()
	s.DB().SetMaxOpenConns(1)
	s.DB().SetMaxIdleConns(1)
	var pages int
	if err := s.DB().QueryRow("PRAGMA page_count").Scan(&pages); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(fmt.Sprintf("PRAGMA max_page_count=%d", pages)); err != nil {
		t.Fatal(err)
	}
}

func freeDisk(t *testing.T, s *Store) {
	t.Helper()
	if _, err := s.DB().Exec("PRAGMA max_page_count=1000000"); err != nil {
		t.Fatal(err)
	}
}

func bigEv() Event {
	e := ev("pageview")
	e.Props = strings.Repeat("x", 1024)
	return e
}

func TestFlushRetriesAfterDiskFull(t *testing.T) {
	s := openTest(t)
	limitDisk(t, s)
	for range 300 {
		s.Enqueue(bigEv())
	}
	if err := s.Flush(); err == nil {
		t.Fatal("Flush should fail while the disk is full")
	}
	if s.Pending() != 300 || count(t, s, "SELECT count(*) FROM events") != 0 {
		t.Fatalf("pending=%d, want 300 and no rows", s.Pending())
	}
	freeDisk(t, s)
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 300 || s.Pending() != 0 {
		t.Fatalf("rows=%d pending=%d, want 300 and 0", n, s.Pending())
	}
}

func TestFlushSalvagesBadRows(t *testing.T) {
	s := openTest(t)
	if _, err := s.DB().Exec(`CREATE TRIGGER bad BEFORE INSERT ON events WHEN NEW.path='/bad' BEGIN SELECT RAISE(ABORT,'bad'); END`); err != nil {
		t.Fatal(err)
	}
	for range 3 {
		s.Enqueue(ev("pageview"))
	}
	b := ev("pageview")
	b.Path = "/bad"
	s.Enqueue(b)
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 3 || s.Failed() != 1 || s.Pending() != 0 {
		t.Fatalf("rows=%d failed=%d pending=%d, want 3, 1, 0", n, s.Failed(), s.Pending())
	}
}

func TestFlushPendingCap(t *testing.T) {
	s := openTest(t)
	s.pendCap = 5
	limitDisk(t, s)
	for range 8 {
		s.Enqueue(bigEv())
	}
	_ = s.Flush()
	if s.Pending() != 5 || len(s.queue) != 3 {
		t.Fatalf("pending=%d queue=%d, want 5 and 3", s.Pending(), len(s.queue))
	}
}

func TestRetryable(t *testing.T) {
	s := openTest(t)
	limitDisk(t, s)
	for range 300 {
		s.Enqueue(bigEv())
	}
	full := s.Flush()
	if full == nil || !retryable(full) {
		t.Fatalf("disk full must be retryable, got %v", full)
	}
	freeDisk(t, s)
	_ = s.Flush()
	if _, err := s.DB().Exec(`CREATE TRIGGER bad BEFORE INSERT ON events WHEN NEW.path='/bad' BEGIN SELECT RAISE(ABORT,'bad'); END`); err != nil {
		t.Fatal(err)
	}
	_, err := s.DB().Exec(`INSERT INTO events(site_id, ts, type, path) VALUES ('s1',1,'pageview','/bad')`)
	if err == nil || retryable(err) {
		t.Fatalf("a constraint-class error must not be retryable, got %v", err)
	}
	if !retryable(errors.New("x")) {
		t.Fatal("unknown errors are retryable")
	}
}

func TestNextBackoff(t *testing.T) {
	for _, c := range []struct{ in, want time.Duration }{
		{0, time.Second}, {time.Second, 2 * time.Second}, {16 * time.Second, 30 * time.Second}, {30 * time.Second, 30 * time.Second},
	} {
		if got := nextBackoff(c.in); got != c.want {
			t.Errorf("nextBackoff(%v)=%v, want %v", c.in, got, c.want)
		}
	}
}

func TestCloseFlushesPending(t *testing.T) {
	path := filepath.Join(t.TempDir(), "c.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	limitDisk(t, s)
	for range 300 {
		s.Enqueue(bigEv())
	}
	if err := s.Flush(); err == nil {
		t.Fatal("expected failure")
	}
	freeDisk(t, s)
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if n := count(t, s2, "SELECT count(*) FROM events"); n != 300 {
		t.Fatalf("rows after reopen=%d, want 300", n)
	}
}
