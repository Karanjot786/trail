package store

import (
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func eventIndexes(t *testing.T, s *Store) []string {
	t.Helper()
	rs, err := s.db.Query(`SELECT name FROM pragma_index_list('events') WHERE origin='c' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	var out []string
	for rs.Next() {
		var n string
		_ = rs.Scan(&n)
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

var wantIndexes = []string{"events_site_agent_ts", "events_site_anon_ts", "events_site_name_ts", "events_site_session_ts", "events_site_ts"}

// A v1 database (both trimmed indexes present, user_version 1) gets the v2 index set; reopening is a no-op.
func TestMigrateV2Indexes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`DROP INDEX events_site_name_ts`,
		`CREATE INDEX events_site_type_name_ts ON events(site_id, type, name, ts)`,
		`CREATE INDEX events_site_user_ts ON events(site_id, user_id, ts)`,
		`PRAGMA user_version=1`,
	} {
		if _, err := s.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	_ = s.Close()
	for i := 0; i < 2; i++ {
		if s, err = Open(path); err != nil {
			t.Fatal(err)
		}
		if got := eventIndexes(t, s); !reflect.DeepEqual(got, wantIndexes) {
			t.Errorf("open %d: indexes %v, want %v", i, got, wantIndexes)
		}
		_ = s.Close()
	}
}

// The v1 schema.sql lines for the two trimmed indexes: a downgraded binary runs them on a v2 file.
const oldIndexSQL = `CREATE INDEX IF NOT EXISTS events_site_user_ts ON events(site_id, user_id, ts);
CREATE INDEX IF NOT EXISTS events_site_type_name_ts ON events(site_id, type, name, ts);`

func TestOldBinaryReopenRecreatesIndexes(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.db.Exec(oldIndexSQL); err != nil {
		t.Fatal(err)
	}
	if n := len(eventIndexes(t, s)); n != len(wantIndexes)+2 {
		t.Errorf("%d indexes after the old schema ran, want %d", n, len(wantIndexes)+2)
	}
}
