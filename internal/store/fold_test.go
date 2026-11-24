package store

import (
	"bytes"
	"os"
	"path/filepath"
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
