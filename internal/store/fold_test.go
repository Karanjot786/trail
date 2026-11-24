package store

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
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

// unfoldedDB writes n pageview+engage pairs (plus two orphans) as raw rows.
func unfoldedDB(t *testing.T, n int) *Store {
	t.Helper()
	s := openTest(t)
	s.SetFold(false)
	var evs []Event
	for i := 0; i < n; i++ {
		sid := fmt.Sprintf("x%d", i)
		base := int64(1000 + i*100000)
		p, e1, e2 := pv("/", base), eng("/", base+4000, 3000, 20), eng("/", base+9000, 8000, 50)
		for _, e := range []*Event{&p, &e1, &e2} {
			e.SessionID, e.AnonID = sid, "a"+sid
		}
		evs = append(evs, p, e1, e2)
	}
	orphan := eng("/", 5, 1, 1)
	orphan.SessionID = "ghost"
	evs = append(evs, orphan)
	if !s.EnqueueBatch(evs) {
		t.Fatal("queue full")
	}
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	return s
}

// beginFold runs foldBegin, waiting for the background pre-fold backup it may start.
func beginFold(s *Store) bool {
	if s.foldBegin() {
		return true
	}
	s.bwg.Wait()
	return s.foldBegin()
}

func foldAll(t *testing.T, s *Store, chunk int64) {
	t.Helper()
	if !beginFold(s) {
		t.Fatal("foldBegin refused")
	}
	for i := 0; i < 1000; i++ {
		done, err := s.foldStep(chunk)
		if err != nil {
			t.Fatal(err)
		}
		if done {
			return
		}
	}
	t.Fatal("fold never finished")
}

func dump(t *testing.T, s *Store) string {
	t.Helper()
	rows, err := s.DB().Query(`SELECT site_id, session_id, type, path, ts, engaged_ms, scroll_pct, dwell_ms FROM events ORDER BY site_id, session_id, ts, type`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var a, c, d, e string
		var ts, em, sc, dw int64
		if err := rows.Scan(&a, &c, &d, &e, &ts, &em, &sc, &dw); err != nil {
			t.Fatal(err)
		}
		fmt.Fprintln(&b, a, c, d, e, ts, em, sc, dw)
	}
	return b.String()
}

func TestFoldBackfillMatchesWritePath(t *testing.T) {
	a := unfoldedDB(t, 30)
	foldAll(t, a, 17)
	b := openTest(t) // the same events through the write path
	for i := 0; i < 30; i++ {
		sid := fmt.Sprintf("x%d", i)
		base := int64(1000 + i*100000)
		p, e1, e2 := pv("/", base), eng("/", base+4000, 3000, 20), eng("/", base+9000, 8000, 50)
		for _, e := range []*Event{&p, &e1, &e2} {
			e.SessionID, e.AnonID = sid, "a"+sid
		}
		b.EnqueueBatch([]Event{p, e1, e2})
	}
	orphan := eng("/", 5, 1, 1)
	orphan.SessionID = "ghost"
	b.Enqueue(orphan)
	if err := b.Flush(); err != nil {
		t.Fatal(err)
	}
	if da, db := dump(t, a), dump(t, b); da != db {
		t.Errorf("backfill differs from write path:\n%s\n---\n%s", da, db)
	}
}

func TestFoldBackfillResumesAfterCrash(t *testing.T) {
	want := dump(t, func() *Store { s := unfoldedDB(t, 30); foldAll(t, s, 1000); return s }())
	s := unfoldedDB(t, 30)
	if !beginFold(s) {
		t.Fatal("foldBegin refused")
	}
	for i := 0; i < 2; i++ {
		if _, err := s.foldStep(20); err != nil {
			t.Fatal(err)
		}
	}
	// A crash mid-chunk: the same work in a transaction that never commits.
	tx, _ := s.DB().Begin()
	_, _ = tx.Exec(`UPDATE events SET dwell_ms=dwell_ms+777 WHERE type='pageview'`)
	_ = tx.Rollback()
	s.foldReady = false // a fresh process
	foldAll(t, s, 20)
	if got := dump(t, s); got != want {
		t.Errorf("resumed fold differs from an uninterrupted one:\n%s\n---\n%s", got, want)
	}
	before := dump(t, s)
	if done, err := s.foldStep(20); err != nil || !done {
		t.Fatalf("step after done: %v %v", done, err)
	}
	if dump(t, s) != before {
		t.Error("step after done changed rows")
	}
}

func TestFoldSkipsWithoutBackupSpace(t *testing.T) {
	s := unfoldedDB(t, 5)
	old := freeBytesFn
	freeBytesFn = func(string) (uint64, bool) { return 1, true }
	defer func() { freeBytesFn = old }()
	before := count(t, s, "SELECT count(*) FROM events")
	s.foldTick()
	s.foldTick()
	if n := count(t, s, "SELECT count(*) FROM events"); n != before {
		t.Errorf("rows %d, want %d: fold ran without a backup", n, before)
	}
	if _, ok, _ := setting(s.DB(), "fold_done"); ok {
		t.Error("fold_done set")
	}
	s.Enqueue(pv("/new", 1))
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n != before+1 {
		t.Error("ingest stopped")
	}
}

func TestFoldBackupBeforeFirstDelete(t *testing.T) {
	s := unfoldedDB(t, 5)
	before := count(t, s, "SELECT count(*) FROM events")
	s.foldTick()
	s.bwg.Wait()
	s.foldTick()
	b, err := Open(s.path + ".pre-fold")
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if n := count(t, b, "SELECT count(*) FROM events"); n != before {
		t.Errorf("backup rows %d, want %d", n, before)
	}
	if n := count(t, s, "SELECT count(*) FROM events"); n >= before {
		t.Errorf("fold did not run: %d rows", n)
	}
}

func TestFoldKeepsOrphans(t *testing.T) {
	s := unfoldedDB(t, 5)
	foldAll(t, s, 100)
	if n := count(t, s, "SELECT count(*) FROM events WHERE type='engage'"); n != 1 {
		t.Errorf("engage rows %d, want the 1 orphan", n)
	}
}

func TestFoldRefoldsRowsWrittenAfterDone(t *testing.T) {
	s := unfoldedDB(t, 3)
	foldAll(t, s, 100)
	s.SetFold(false)
	s.EnqueueBatch([]Event{pv("/z", 9e9), eng("/z", 9e9+5000, 10, 10)})
	_ = s.Flush()
	s.foldReady, s.foldFinished = false, false
	foldAll(t, s, 100)
	if n := count(t, s, "SELECT count(*) FROM events WHERE type='pageview' AND path='/z' AND dwell_ms=5000"); n != 1 {
		t.Error("late engage not folded")
	}
}

func TestFoldRunsBetweenFlushes(t *testing.T) {
	s := unfoldedDB(t, 3000)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.every = 5 * time.Millisecond
	s.Start(ctx)
	for i := 0; i < 20; i++ {
		s.Enqueue(pv(fmt.Sprintf("/n%d", i), int64(1e10+i)))
		if err := s.Flush(); err != nil {
			t.Fatal(err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	for end := time.Now().Add(60 * time.Second); time.Now().Before(end); time.Sleep(25 * time.Millisecond) {
		if _, ok, _ := setting(s.DB(), "fold_done"); ok {
			break
		}
	}
	if _, ok, _ := setting(s.DB(), "fold_done"); !ok {
		t.Fatal("fold did not finish")
	}
	if n := count(t, s, "SELECT count(*) FROM events WHERE path LIKE '/n%'"); n != 20 {
		t.Errorf("new pageviews %d, want 20", n)
	}
}

func TestCompactAfterFold(t *testing.T) {
	s := unfoldedDB(t, 5)
	s.foldTick()
	s.bwg.Wait()
	for i := 0; i < 5 && !s.foldFinished; i++ {
		s.foldTick()
	}
	if v, ok, _ := setting(s.DB(), "fold_compacted"); !ok || v != "1" {
		t.Error("not compacted")
	}
}

// A slow first-run backup must not stop the writer: events keep flushing and the
// fold waits for the copy.
func TestFoldBackupDoesNotBlockFlush(t *testing.T) {
	s := unfoldedDB(t, 50)
	release := make(chan struct{})
	old := backupFn
	backupFn = func(db *sql.DB, p string) (string, error) {
		<-release
		return old(db, p)
	}
	defer func() { backupFn = old }()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.every = 5 * time.Millisecond
	s.Start(ctx)
	deadline := time.Now().Add(60 * time.Second)
	for i := 0; i < 30; i++ {
		s.Enqueue(pv(fmt.Sprintf("/b%d", i), int64(1e10+i)))
		for s.Pending() > 0 {
			if time.Now().After(deadline) {
				t.Fatalf("flush stalled during the backup: %d pending", s.Pending())
			}
			time.Sleep(5 * time.Millisecond)
		}
	}
	if _, ok, _ := setting(s.DB(), "fold_cursor"); ok {
		t.Error("fold started before the backup finished")
	}
	close(release)
	for time.Now().Before(deadline) {
		if _, ok, _ := setting(s.DB(), "fold_done"); ok {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if _, ok, _ := setting(s.DB(), "fold_done"); !ok {
		t.Fatal("fold did not finish after the backup")
	}
	if _, err := os.Stat(s.path + ".pre-fold"); err != nil {
		t.Error("no backup file")
	}
}
