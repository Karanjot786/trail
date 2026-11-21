//go:build !race

package query

import (
	"database/sql"
	"fmt"
	"math"
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

// perfFastest runs fn 5 times and returns the fastest run: on a busy machine the fastest run is the
// best estimate of what the report itself costs (other load only ever adds time).
func perfFastest(tb testing.TB, fn func() error) time.Duration {
	tb.Helper()
	best := time.Duration(math.MaxInt64)
	for range 5 {
		start := time.Now()
		if err := fn(); err != nil {
			tb.Fatal(err)
		}
		best = min(best, time.Since(start))
	}
	return best
}

// perfRefIdle is what perfRef takes on an idle development laptop (Apple M-series).
const perfRefIdle = 8 * time.Millisecond

// perfRef is a fixed reference workload: a full scan of the demo events. Its time right now says how
// fast this machine is at the moment, so the budget can stretch on a loaded runner without letting a
// report regress relative to it.
func perfRef(tb testing.TB) time.Duration {
	tb.Helper()
	return perfFastest(tb, func() error {
		var n, l int64
		return perfDB.QueryRow(`SELECT count(DISTINCT anon_id), sum(length(path)) FROM events WHERE site_id='demo'`).Scan(&n, &l)
	})
}

type perfCase struct {
	name string
	fn   func() error
}

// perfRun times every case and fails one that is over perfBudget scaled by the machine's current
// speed (never below 1×, capped at 8× so a gross regression still fails anywhere).
func perfRun(t *testing.T, cases []perfCase) {
	t.Helper()
	var table strings.Builder
	for _, c := range cases {
		scale := min(max(float64(perfRef(t))/float64(perfRefIdle), 1), 8)
		budget := time.Duration(float64(perfBudget) * scale)
		d := perfFastest(t, c.fn)
		fmt.Fprintf(&table, "%-28s %6.1f ms  (budget %6.1f ms)\n", c.name, float64(d.Microseconds())/1000, float64(budget.Microseconds())/1000)
		if d > budget {
			t.Errorf("%s: %v over the %v budget (%v at %.1fx machine load)", c.name, d, budget, perfBudget, scale)
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
	all := p
	all.Actor = ActorAll
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
		perfCase{"Agents", func() error { return ignore(Agents(perfDB, p)) }},
		perfCase{"AIVisibility", func() error { return ignore(AIVisibility(perfDB, p)) }},
		perfCase{"AIVisibility today", func() error { return ignore(AIVisibility(perfDB, perfParams(t, "today"))) }},
		perfCase{"AISetupFor", func() error { return ignore(AISetupFor(perfDB, "demo", perfNow)) }},
		perfCase{"GeoStatusFor", func() error { return ignore(GeoStatusFor(perfDB, "demo", perfNow)) }},
		perfCase{"Stats actor=all", func() error { return ignore(Stats(perfDB, all)) }},
		perfCase{"Breakdown path actor=all", func() error { return ignore(Breakdown(perfDB, all, "path", "", 100)) }},
	)
	perfRun(t, cases)
}

// TestFirstTouchAgreesWithSessionTouches: B1's FirstTouch CTE (Acquisition columns) and B3's
// sessionTouches/firstTouch (Revenue, goal detail) credit every person to the same session.
func TestFirstTouchAgreesWithSessionTouches(t *testing.T) {
	p := perfParams(t, "30d")
	cte, args, err := base(p)
	if err != nil {
		t.Fatal(err)
	}
	ft, ftArgs := FirstTouch(perfDB, p, "SELECT DISTINCT person FROM ev", nil)
	type row struct{ source, channel, campaign, entry, country, device string }
	mine := map[string]row{}
	var persons []string
	err = forRows(perfDB, cte+", "+ft+` SELECT person, source, channel, campaign, entry, country, device FROM ft`,
		append(args, ftArgs...), func(r *sql.Rows) error {
			var person string
			var x row
			if err := r.Scan(&person, &x.source, &x.channel, &x.campaign, &x.entry, &x.country, &x.device); err != nil {
				return err
			}
			mine[person] = x
			persons = append(persons, person)
			return nil
		})
	if err != nil {
		t.Fatal(err)
	}
	if len(persons) < 100 {
		t.Fatalf("only %d persons", len(persons))
	}
	touches, err := sessionTouches(perfDB, p, persons)
	if err != nil {
		t.Fatal(err)
	}
	for _, person := range persons {
		th := firstTouch(touches[person])
		theirs := row{th.source, th.channel, th.campaign, th.entry, th.country, th.device}
		if mine[person] != theirs {
			t.Errorf("%s: FirstTouch %+v, sessionTouches %+v", person, mine[person], theirs)
		}
	}
}
