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
