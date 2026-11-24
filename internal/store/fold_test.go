package store

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func userVersion(t *testing.T, s *Store) int {
	t.Helper()
	return count(t, s, "PRAGMA user_version")
}

func TestUserVersionSetOnOpen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	for i := 0; i < 2; i++ {
		s, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		if v := userVersion(t, s); v != schemaVersion {
			t.Errorf("open %d: user_version %d, want %d", i, v, schemaVersion)
		}
		_ = s.Close()
	}
}

func TestMigrateFromUnversioned(t *testing.T) {
	s, err := Open(oldEventsDB(t))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if v := userVersion(t, s); v != schemaVersion {
		t.Errorf("user_version %d, want %d", v, schemaVersion)
	}
	if n := count(t, s, "SELECT count(*) FROM pragma_table_info('events') WHERE name='dwell_ms' AND dflt_value='0'"); n != 1 {
		t.Errorf("dwell_ms column with default 0: %d, want 1", n)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 2 {
		t.Errorf("rows %d, want 2", n)
	}
}

func TestEngageKeyStable(t *testing.T) {
	p1, p2 := filepath.Join(t.TempDir(), "a.db"), filepath.Join(t.TempDir(), "b.db")
	s, err := Open(p1)
	if err != nil {
		t.Fatal(err)
	}
	k := s.EngageKey()
	_ = s.Close()
	if len(k) != 32 {
		t.Fatalf("key length %d, want 32", len(k))
	}
	s, _ = Open(p1)
	if !bytes.Equal(k, s.EngageKey()) {
		t.Error("key changed across reopen")
	}
	_ = s.Close()
	o, _ := Open(p2)
	defer o.Close()
	if bytes.Equal(k, o.EngageKey()) {
		t.Error("two databases share a key")
	}
}

func TestBackupIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.Enqueue(Event{SiteID: "s", Type: "pageview", TS: 1})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	p, err := backup(s.DB(), path)
	if err != nil || p != path+".pre-fold" {
		t.Fatalf("backup: %q %v", p, err)
	}
	st1, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(20 * time.Millisecond)
	p2, err := backup(s.DB(), path)
	if err != nil || p2 != p {
		t.Fatalf("second backup: %q %v", p2, err)
	}
	st2, _ := os.Stat(p)
	if !st1.ModTime().Equal(st2.ModTime()) {
		t.Error("second backup rewrote the file")
	}
	b, err := Open(p)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if n := count(t, b, "SELECT count(*) FROM events"); n != 1 {
		t.Errorf("backup rows %d, want 1", n)
	}
}

func TestBackupSurvivesInterruptedCopy(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.Enqueue(Event{SiteID: "s", Type: "pageview", TS: 1})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	// A kill mid-copy leaves a partial .tmp, never a .pre-fold.
	if err := os.WriteFile(path+".pre-fold.tmp", []byte("truncated"), 0o600); err != nil {
		t.Fatal(err)
	}
	p, err := backup(s.DB(), path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("stale tmp left behind: %v", err)
	}
	b, err := Open(p)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if n := count(t, b, "SELECT count(*) FROM events"); n != 1 {
		t.Errorf("backup rows %d, want 1", n)
	}
}

func pv(path string, ts int64) Event {
	return Event{SiteID: "s1", Type: "pageview", AnonID: "a1", SessionID: "x1", Path: path, TS: ts}
}

func eng(path string, ts int64, em, sc int) Event {
	return Event{SiteID: "s1", Type: "engage", AnonID: "a1", SessionID: "x1", Path: path, TS: ts, EngagedMs: em, ScrollPct: sc}
}

func TestEngageFoldsIntoPageview(t *testing.T) {
	s := openTest(t)
	s.EnqueueBatch([]Event{pv("/", 1000), eng("/", 6000, 4000, 40), eng("/", 13000, 9000, 30)})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 1 {
		t.Fatalf("rows %d, want 1", n)
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE engaged_ms=9000 AND scroll_pct=40 AND dwell_ms=12000"); n != 1 {
		t.Error("pageview did not take max engaged, max scroll and last-engage dwell")
	}
}

func TestEngageFoldsAcrossFlushes(t *testing.T) {
	s := openTest(t)
	for _, e := range []Event{pv("/", 1000), eng("/", 6000, 4000, 40), eng("/", 13000, 9000, 30)} {
		s.Enqueue(e)
		if err := s.Flush(); err != nil {
			t.Fatal(err)
		}
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE type='pageview' AND engaged_ms=9000 AND scroll_pct=40 AND dwell_ms=12000"); n != 1 {
		t.Error("not folded across flushes")
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 1 {
		t.Errorf("rows %d, want 1", n)
	}
}

func TestEngageFoldsByPathNotToken(t *testing.T) {
	s := openTest(t)
	s.EnqueueBatch([]Event{pv("/a", 1000), pv("/b", 2000), eng("/a", 3000, 700, 10)})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE path='/a' AND engaged_ms=700 AND dwell_ms=2000"); n != 1 {
		t.Error("/a did not take the engage")
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE path='/b' AND engaged_ms=0 AND dwell_ms=0"); n != 1 {
		t.Error("/b was touched")
	}
}

func TestFoldFallsBackWhenPageviewMissing(t *testing.T) {
	s := openTest(t)
	noSess := eng("/", 5000, 100, 1)
	noSess.SessionID = ""
	s.EnqueueBatch([]Event{eng("/", 5000, 100, 1), noSess})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE type='engage'"); n != 2 {
		t.Errorf("engage rows %d, want 2", n)
	}
	// An engage older than the only pageview has nothing to fold into either.
	s.EnqueueBatch([]Event{pv("/late", 9000), eng("/late", 8000, 100, 1)})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE type='engage'"); n != 3 {
		t.Errorf("engage rows %d, want 3", n)
	}
}

func TestFoldOff(t *testing.T) {
	s := openTest(t)
	s.SetFold(false)
	s.EnqueueBatch([]Event{pv("/", 1000), eng("/", 6000, 4000, 40)})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != 2 {
		t.Errorf("rows %d, want 2", n)
	}
}

func TestFoldUsesSessionIndex(t *testing.T) {
	s := openTest(t)
	rows, err := s.DB().Query("EXPLAIN QUERY PLAN "+foldTargetSQL, "s1", "x1", "/", int64(1))
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var all string
	for rows.Next() {
		var a, b, c int
		var d string
		if err := rows.Scan(&a, &b, &c, &d); err != nil {
			t.Fatal(err)
		}
		all += d + "\n"
	}
	if !strings.Contains(all, "events_site_session_ts (site_id=? AND session_id=?") {
		t.Errorf("plan does not use the session index:\n%s", all)
	}
}
