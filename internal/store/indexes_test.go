package store

import (
	"path/filepath"
	"reflect"
	"sort"
	"strings"
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

var wantIndexes = []string{"events_site_agent_ts", "events_site_anon_ts", "events_site_end", "events_site_name_ts", "events_site_session_ts", "events_site_ts", "events_site_type_ts"}

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

// A downgraded binary recreates the two trimmed indexes on a database whose user_version is already
// 2; the next open of the new binary must drop them again.
func TestMigrateV2RerunsAfterDowngrade(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(oldIndexSQL); err != nil {
		t.Fatal(err)
	}
	want := userVersion(t, s)
	_ = s.Close()
	if s, err = Open(path); err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if got := eventIndexes(t, s); !reflect.DeepEqual(got, wantIndexes) {
		t.Errorf("indexes %v, want %v", got, wantIndexes)
	}
	if got := userVersion(t, s); got != want {
		t.Errorf("user_version %d after re-run, want %d (a re-run must not move it)", got, want)
	}
}

// Each step sets user_version from its own number: a fresh and a v1 database both end at the latest.
func TestMigrateSetsLatestVersion(t *testing.T) {
	s := openTest(t)
	if got := userVersion(t, s); got != schemaVersion {
		t.Errorf("fresh user_version %d, want %d", got, schemaVersion)
	}
}

// A second opener that lost the race to add a column sees "duplicate column name": that is success.
func TestAddColumnToleratesDuplicate(t *testing.T) {
	s := openTest(t)
	if err := addColumn(s.db, "events", "retry", "retry INTEGER NOT NULL DEFAULT 0"); err != nil {
		t.Errorf("duplicate column: %v", err)
	}
	if err := addColumn(s.db, "events", "nope", "nope BOGUS SYNTAX ("); err == nil {
		t.Error("a real ALTER error was swallowed")
	}
}

// A v2 database (trimmed indexes, no events_site_end) gets the v3 index; it covers only dwell rows.
func TestMigrateV3EndIndex(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{`DROP INDEX events_site_end`, `PRAGMA user_version=2`} {
		if _, err := s.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	_ = s.Close()
	if s, err = Open(path); err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if got := eventIndexes(t, s); !reflect.DeepEqual(got, wantIndexes) {
		t.Errorf("indexes %v, want %v", got, wantIndexes)
	}
	if got := userVersion(t, s); got != schemaVersion {
		t.Errorf("user_version %d, want %d", got, schemaVersion)
	}
	var sql string
	if err := s.db.QueryRow(`SELECT sql FROM sqlite_master WHERE name='events_site_end'`).Scan(&sql); err != nil || !strings.Contains(sql, "WHERE dwell_ms>0") {
		t.Errorf("events_site_end sql %q %v", sql, err)
	}
}

// A v3 database (no events_site_type_ts) gets the v4 index: (site, type) scans of the type-only reports
// (event catalogue, outbound filter, event breakdown) need it because events_site_name_ts is partial.
func TestMigrateV4TypeIndex(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{`DROP INDEX events_site_type_ts`, `PRAGMA user_version=3`} {
		if _, err := s.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	_ = s.Close()
	if s, err = Open(path); err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if got := eventIndexes(t, s); !reflect.DeepEqual(got, wantIndexes) {
		t.Errorf("indexes %v, want %v", got, wantIndexes)
	}
	if got := userVersion(t, s); got != schemaVersion {
		t.Errorf("user_version %d, want %d", got, schemaVersion)
	}
}
