package seed

import (
	"database/sql"
	"math/rand/v2"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"trail/internal/store"
)

var seedNow = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

func seeded(t *testing.T, sites []SiteSpec, days, persons int) *sql.DB {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "seed.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := Seed(st, sites, days, persons, seedNow, rand.New(rand.NewPCG(1, 2))); err != nil {
		t.Fatal(err)
	}
	return st.DB()
}

func q(t *testing.T, db *sql.DB, sql string, args ...any) float64 {
	t.Helper()
	var v float64
	if err := db.QueryRow(sql, args...).Scan(&v); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	return v
}

var twoSites = []SiteSpec{{ID: "demo", Revenue: true, Crawlers: true}, {ID: "docs"}}

func TestSeedShape(t *testing.T) {
	db := seeded(t, twoSites, 30, 200)
	checks := []struct {
		name string
		sql  string
		min  float64
	}{
		{"bot rows", "SELECT count(*) FROM events WHERE is_bot=1", 1},
		{"identify rows", "SELECT count(*) FROM events WHERE type='identify'", 1},
		{"identity_map rows", "SELECT count(*) FROM identity_map", 1},
		{"multi-day anons", "SELECT count(*) FROM (SELECT anon_id FROM events GROUP BY anon_id HAVING count(DISTINCT ts/86400000) >= 2)", 1},
		{"error rows", "SELECT count(*) FROM events WHERE type='error'", 1},
		{"outbound rows", "SELECT count(*) FROM events WHERE type='outbound'", 1},
		{"IN share > 0.4", "SELECT avg(country='IN') FROM events", 0.4000001},
		{"both sites", "SELECT count(DISTINCT site_id) FROM events", 2},
		{"cities", "SELECT count(DISTINCT city) FROM events WHERE city!=''", 10},
		{"Copy Code", "SELECT count(*) FROM events WHERE name='Copy Code'", 1},
		{"Download Template", "SELECT count(*) FROM events WHERE name='Download Template'", 1},
		{"campaigns", "SELECT count(DISTINCT utm_campaign) FROM events WHERE utm_campaign!=''", 3},
		{"signup plan", "SELECT count(*) FROM events WHERE name='Signup' AND json_extract(props,'$.plan')!=''", 1},
	}
	for _, c := range checks {
		if got := q(t, db, c.sql); got < c.min {
			t.Errorf("%s = %v, want >= %v", c.name, got, c.min)
		}
	}
	if q(t, db, "SELECT count(*) FROM events WHERE ts > "+strconv.FormatInt(seedNow.UnixMilli(), 10)) != 0 {
		t.Error("events in the future")
	}
}

func TestSeedDeterministic(t *testing.T) {
	a := seeded(t, twoSites, 30, 300)
	b := seeded(t, twoSites, 30, 300)
	for _, s := range []string{"SELECT count(*) FROM events", "SELECT sum(ts) FROM events",
		"SELECT sum(n) FROM crawl_hits", "SELECT count(*) FROM identity_map"} {
		if x, y := q(t, a, s), q(t, b, s); x != y {
			t.Errorf("%s: %v != %v", s, x, y)
		}
	}
}

func TestSeedHasV3Data(t *testing.T) {
	db := seeded(t, twoSites, 60, 1800)
	purchases := func(site string) float64 {
		return q(t, db, "SELECT count(*) FROM events WHERE site_id=? AND name='Purchase'", site)
	}
	if purchases("demo") == 0 || purchases("docs") != 0 {
		t.Errorf("purchases demo %v docs %v", purchases("demo"), purchases("docs"))
	}
	ai := q(t, db, "SELECT avg(referrer_host IN ('chatgpt.com','perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com')) FROM events WHERE type='pageview' AND referrer_host!='' OR utm_source!=''")
	if ai <= 0 {
		t.Errorf("AI referral share %v", ai)
	}
	since := seedNow.UnixMilli() - 5*60_000
	for _, site := range []string{"demo", "docs"} {
		if n := q(t, db, "SELECT count(DISTINCT anon_id) FROM events WHERE site_id=? AND ts>=? AND is_bot=0", site, since); n != 6 {
			t.Errorf("%s live people = %v, want 6", site, n)
		}
		if n := q(t, db, "SELECT count(*) FROM goals WHERE site_id=?", site); n != 2 {
			t.Errorf("%s goals = %v", site, n)
		}
		if n := q(t, db, "SELECT count(*) FROM funnels WHERE site_id=? AND name='Docs to signup'", site); n != 1 {
			t.Errorf("%s funnel = %v", site, n)
		}
		if n := q(t, db, "SELECT count(*) FROM notes WHERE site_id=?", site); n != 1 {
			t.Errorf("%s notes = %v", site, n)
		}
	}
	if q(t, db, "SELECT count(*) FROM crawl_hits WHERE site_id='demo'") == 0 || q(t, db, "SELECT count(*) FROM crawl_hits WHERE site_id='docs'") != 0 {
		t.Error("crawl hits only on the crawler site")
	}
	// The spike day has clearly more visitors than the day before it.
	day := func(n int) float64 {
		from := seedNow.UnixMilli() - int64(n+1)*dayMs
		return q(t, db, "SELECT count(DISTINCT anon_id) FROM events WHERE ts>=? AND ts<? AND is_bot=0", from, from+dayMs)
	}
	if day(spikeDaysAgo) < 1.5*day(spikeDaysAgo+1) {
		t.Errorf("spike %v vs day before %v", day(spikeDaysAgo), day(spikeDaysAgo+1))
	}
}
