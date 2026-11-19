package store

import (
	"context"
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
