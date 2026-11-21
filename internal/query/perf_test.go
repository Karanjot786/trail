//go:build !race

package query

import (
	"database/sql"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"trail/internal/seed"
	"trail/internal/store"
)

// perfBudget is the median a report may take on the 60-day / 1,800-person demo seed.
const perfBudget = 150 * time.Millisecond

var (
	// perfDB is the 60-day / 1,800-person seed (sites demo with revenue and crawlers, and docs),
	// built once in TestMain; perfNow is its clock (Fri 2026-11-20 10:05 Asia/Kolkata).
	perfDB  *sql.DB
	perfNow = time.Date(2026, 11, 20, 10, 5, 0, 0, ist)
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "trail-perf")
	if err != nil {
		panic(err)
	}
	st, err := store.Open(filepath.Join(dir, "perf.db"))
	if err != nil {
		panic(err)
	}
	sites := []seed.SiteSpec{{ID: "demo", Revenue: true, Crawlers: true}, {ID: "docs"}}
	if err := seed.Seed(st, sites, 60, 1800, perfNow, rand.New(rand.NewPCG(42, 42))); err != nil {
		panic(err)
	}
	perfDB = st.DB()
	code := m.Run()
	_ = st.Close()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

// perfParams resolves rk on site demo at perfNow, production only, comparing with prev.
func perfParams(tb testing.TB, rk string) Params {
	tb.Helper()
	w, err := ResolveWindow(rk, "prev", perfNow, ist, 0)
	if err != nil {
		tb.Fatal(err)
	}
	return Params{Site: "demo", Env: "production", From: w.From, To: w.To, Win: w, TZ: ist, Now: perfNow, Limit: 100}
}

// perfMedian runs fn 5 times and returns the median duration.
func perfMedian(tb testing.TB, fn func() error) time.Duration {
	tb.Helper()
	ds := make([]time.Duration, 5)
	for i := range ds {
		start := time.Now()
		if err := fn(); err != nil {
			tb.Fatal(err)
		}
		ds[i] = time.Since(start)
	}
	slices.Sort(ds)
	return ds[2]
}

type perfCase struct {
	name string
	fn   func() error
}

func perfRun(t *testing.T, cases []perfCase) {
	t.Helper()
	var table strings.Builder
	for _, c := range cases {
		d := perfMedian(t, c.fn)
		fmt.Fprintf(&table, "%-28s %6.1f ms\n", c.name, float64(d.Microseconds())/1000)
		if d > perfBudget {
			t.Errorf("%s: median %v over the %v budget", c.name, d, perfBudget)
		}
	}
	t.Log("\n" + table.String())
}

func TestPerfDemo(t *testing.T) {
	p := perfParams(t, "30d")
	var person string
	if err := perfDB.QueryRow(`SELECT coalesce(nullif(user_id,''), anon_id) FROM events WHERE site_id='demo' AND is_bot=0
  GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`).Scan(&person); err != nil {
		t.Fatal(err)
	}
	goals, err := ListGoals(perfDB, "demo")
	if err != nil {
		t.Fatal(err)
	}
	ignore := func(_ any, err error) error { return err }
	ignore3 := func(_ any, _ int, err error) error { return err }
	cases := []perfCase{
		{"Stats", func() error { return ignore(Stats(perfDB, p)) }},
		{"Stats 90d", func() error { return ignore(Stats(perfDB, perfParams(t, "90d"))) }},
		{"Stats today", func() error { return ignore(Stats(perfDB, perfParams(t, "today"))) }},
	}
	for _, m := range []string{"visitors", "pageviews", "sessions", "duration", "bounce", "conversion", "revenue"} {
		cases = append(cases, perfCase{"Series " + m, func() error { return ignore(Series(perfDB, p, m, false)) }})
	}
	cases = append(cases, perfCase{"Series visitors+extras", func() error { return ignore(Series(perfDB, p, "visitors", true)) }})
	dimNames := make([]string, 0, len(dims))
	for d := range dims {
		dimNames = append(dimNames, d)
	}
	slices.Sort(dimNames)
	for _, d := range dimNames {
		cases = append(cases, perfCase{"Breakdown " + d, func() error { return ignore(Breakdown(perfDB, p, d, "", 100)) }})
	}
	filtered := p
	filtered.Filters = map[string]string{"source": "Google", "country": "IN"}
	cases = append(cases,
		perfCase{"Stats filtered", func() error { return ignore(Stats(perfDB, filtered)) }},
		perfCase{"Breakdown path filtered", func() error { return ignore(Breakdown(perfDB, filtered, "path", "", 100)) }},
		perfCase{"Visitors", func() error { return ignore3(Visitors(perfDB, p, "")) }},
		perfCase{"Sessions", func() error { return ignore3(Sessions(perfDB, p, "")) }},
		perfCase{"Journey", func() error { return ignore(Journey(perfDB, "demo", person, goals)) }},
		perfCase{"Campaigns", func() error { return ignore(Campaigns(perfDB, p)) }},
		perfCase{"AIReferrals", func() error { return ignore(AIReferrals(perfDB, p)) }},
		perfCase{"Live", func() error { return ignore(Live(perfDB, p)) }},
		perfCase{"Heatmap", func() error { return ignore(Heatmap(perfDB, p)) }},
		perfCase{"Changes", func() error { return ignore(Changes(perfDB, p)) }},
		perfCase{"SitesSummary", func() error { return ignore(SitesSummary(perfDB, p, []string{"demo", "docs"})) }},
		perfCase{"SiteFeatures", func() error { return ignore(SiteFeatures(perfDB, "demo")) }},
	)
	perfRun(t, cases)
}
