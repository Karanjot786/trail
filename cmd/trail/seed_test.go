package main

import (
	"path/filepath"
	"slices"
	"testing"
	"time"

	"trail/internal/store"
)

func TestSeedFlags(t *testing.T) {
	t.Setenv("TRAIL_SITES", "")
	o, err := parseSeedFlags([]string{"--sites", "demo,docs", "--days", "60", "--persons", "300", "--seed", "42", "--revenue", "demo", "--crawlers", "demo"})
	if err != nil || !slices.Equal(o.sites, []string{"demo", "docs"}) || o.days != 60 || o.persons != 300 || o.seed != 42 ||
		!slices.Equal(o.revenue, []string{"demo"}) || !slices.Equal(o.crawlers, []string{"demo"}) {
		t.Fatalf("%+v %v", o, err)
	}
	if o, _ := parseSeedFlags(nil); !slices.Equal(o.sites, []string{"demo", "docs"}) || o.days != 30 {
		t.Fatalf("defaults %+v", o)
	}
	for _, bad := range [][]string{{"--days", "0"}, {"--revenue", "nope"}, {"--persons", "-1"}, {"--bogus"}} {
		if _, err := parseSeedFlags(bad); err == nil {
			t.Errorf("%v accepted", bad)
		}
	}

	db := filepath.Join(t.TempDir(), "s.db")
	if err := seedDB(db, o, time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	count := func(q string) int {
		var n int
		if err := st.DB().QueryRow(q).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if count(`SELECT count(*) FROM events WHERE site_id='demo' AND name='Purchase'`) == 0 ||
		count(`SELECT count(*) FROM events WHERE site_id='docs' AND name='Purchase'`) != 0 {
		t.Error("revenue went to the wrong sites")
	}
	if count(`SELECT count(*) FROM crawl_hits WHERE site_id='demo'`) == 0 || count(`SELECT count(*) FROM crawl_hits WHERE site_id='docs'`) != 0 {
		t.Error("crawls went to the wrong sites")
	}
}
