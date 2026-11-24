//go:build !race

package query

import (
	"database/sql"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/store"
)

// TestStorageReport prints the index sizes and report times of a database with the trimmed index set
// (what Open leaves) and with the pre-trim set (events_site_user_ts and the full
// events_site_type_name_ts instead of the partial events_site_name_ts), so a change can be judged by
// ratio on one machine. It runs only when TRAIL_BENCH_DB names a Trail database; that file is
// copied into a temp dir first and never touched. TRAIL_BENCH_SITE picks the site (default demo).
//
//	TRAIL_BENCH_DB=/path/to/trail.db go test ./internal/query -run TestStorageReport -v
func TestStorageReport(t *testing.T) {
	src := os.Getenv("TRAIL_BENCH_DB")
	if src == "" {
		t.Skip("set TRAIL_BENCH_DB to a Trail database to run the storage report")
	}
	site := os.Getenv("TRAIL_BENCH_SITE")
	if site == "" {
		site = "demo"
	}
	dir := t.TempDir()
	cp := filepath.Join(dir, "copy.db")
	ro, err := sql.Open("sqlite", "file:"+src+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ro.Exec(`VACUUM INTO ?`, cp); err != nil {
		t.Fatal(err)
	}
	_ = ro.Close()
	st, err := store.Open(cp) // migrates to the trimmed set
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	db := st.DB()

	var last int64
	if err := db.QueryRow(`SELECT coalesce(max(ts),0) FROM events WHERE site_id=?`, site).Scan(&last); err != nil || last == 0 {
		t.Fatalf("site %q has no events (%v)", site, err)
	}
	now := time.UnixMilli(last + 60000)
	w, err := ResolveWindow("30d", "prev", now, time.UTC, 0)
	if err != nil {
		t.Fatal(err)
	}
	p := Params{Site: site, Env: "production", From: w.From, To: w.To, Win: w, TZ: time.UTC, Now: now, Limit: 100}
	pOut := p
	pOut.Filters = map[string]string{"event": outboundKey}
	var event string
	_ = db.QueryRow(`SELECT name FROM events WHERE site_id=? AND type='event' AND name<>'' GROUP BY name ORDER BY count(*) DESC LIMIT 1`, site).Scan(&event)

	ig := func(_ any, err error) error { return err }
	ig3 := func(_ any, _ int, err error) error { return err }
	cases := []struct {
		name string
		fn   func() error
	}{
		{"EventCatalogue", func() error { return ig(EventCatalogue(db, p)) }},
		{"Stats with event=outbound", func() error { return ig(Stats(db, pOut)) }},
		{"Breakdown event", func() error { return ig(Breakdown(db, p, "event", "", 100)) }},
		{"EventDetail", func() error { return ig(EventDetail(db, p, event)) }},
		{"Series revenue", func() error { return ig(Series(db, p, "revenue", false)) }},
		{"SiteFeatures", func() error { return ig(SiteFeatures(db, site)) }},
		{"Stats", func() error { return ig(Stats(db, p)) }},
		{"Visitors", func() error { return ig3(Visitors(db, p, "")) }},
		{"Live", func() error { return ig(Live(db, p)) }},
	}
	measure := func(label string) map[string]time.Duration {
		out := map[string]time.Duration{}
		var b strings.Builder
		fmt.Fprintf(&b, "%s\n", label)
		rs, err := db.Query(`SELECT name, sum(pgsize) FROM dbstat WHERE name LIKE 'events%' OR name='events' GROUP BY name ORDER BY name`)
		if err != nil {
			t.Fatal(err)
		}
		for rs.Next() {
			var n string
			var sz int64
			_ = rs.Scan(&n, &sz)
			fmt.Fprintf(&b, "  %-28s %8.1f MB\n", n, float64(sz)/1e6)
		}
		rs.Close()
		for _, c := range cases {
			best := time.Duration(math.MaxInt64)
			for range 5 {
				s0 := time.Now()
				if err := c.fn(); err != nil {
					t.Fatalf("%s: %v", c.name, err)
				}
				best = min(best, time.Since(s0))
			}
			out[c.name] = best
			fmt.Fprintf(&b, "  %-28s %9.1f ms\n", c.name, float64(best.Microseconds())/1000)
		}
		t.Log("\n" + b.String())
		return out
	}
	if _, err := db.Exec(`ANALYZE`); err != nil {
		t.Fatal(err)
	}
	after := measure("after the trim (events_site_name_ts partial, no events_site_user_ts)")
	for _, q := range []string{
		`CREATE INDEX events_site_user_ts ON events(site_id, user_id, ts)`,
		`CREATE INDEX events_site_type_name_ts ON events(site_id, type, name, ts)`,
		`DROP INDEX events_site_name_ts`,
		`DROP INDEX events_site_type_ts`,
		`ANALYZE`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	before := measure("before the trim (events_site_user_ts, full events_site_type_name_ts)")
	var b strings.Builder
	fmt.Fprintf(&b, "after / before\n")
	for _, c := range cases {
		fmt.Fprintf(&b, "  %-28s %5.2fx\n", c.name, float64(after[c.name])/float64(before[c.name]))
	}
	t.Log("\n" + b.String())
}
