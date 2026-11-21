package store

import (
	"path/filepath"
	"testing"
)

// TestSchemaApplies opens the same file twice: the v3 additions must be idempotent and present.
func TestSchemaApplies(t *testing.T) {
	path := filepath.Join(t.TempDir(), "x.db")
	for i := 0; i < 2; i++ {
		s, err := Open(path)
		if err != nil {
			t.Fatalf("open %d: %v", i, err)
		}
		for _, name := range []string{"funnels", "notes", "views", "shares", "api_tokens", "crawl_hits"} {
			if n := count(t, s, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='`+name+`'`); n != 1 {
				t.Errorf("open %d: table %s missing", i, name)
			}
		}
		for _, name := range []string{"events_site_type_name_ts", "events_site_session_ts", "notes_site_ts"} {
			if n := count(t, s, `SELECT count(*) FROM sqlite_master WHERE type='index' AND name='`+name+`'`); n != 1 {
				t.Errorf("open %d: index %s missing", i, name)
			}
		}
		if err := s.Close(); err != nil {
			t.Fatalf("close %d: %v", i, err)
		}
	}
}

// TestSchemaChecks pins the CHECK constraints the v3 metadata tables rely on.
func TestSchemaChecks(t *testing.T) {
	s := openTest(t)
	if _, err := s.DB().Exec(`INSERT INTO notes(site_id, ts, label, kind, created) VALUES('s', 1, 'x', 'bogus', 1)`); err == nil {
		t.Error("notes accepted an unknown kind")
	}
	if _, err := s.DB().Exec(`INSERT INTO api_tokens(id, name, prefix, hash, scope, created) VALUES('t', 'n', 'p', x'00', 'admin', 1)`); err == nil {
		t.Error("api_tokens accepted an unknown scope")
	}
}
