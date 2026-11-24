//go:build !race

package query

import (
	"database/sql"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/store"
)

// latencyDB builds a seeded single-site database of `days` days at about perDay events a day, like a
// busy site after the history fold: most pageviews carry dwell_ms, nothing is an engage row. It
// lives in a temp dir. now is Fri 2026-11-20 10:05 UTC; the last five minutes hold some activity.
func latencyDB(tb testing.TB, days, perDay int) (*sql.DB, time.Time) {
	tb.Helper()
	st, err := store.Open(filepath.Join(tb.TempDir(), "lat.db"))
	if err != nil {
		tb.Fatal(err)
	}
	tb.Cleanup(func() { _ = st.Close() })
	db := st.DB()
	now := time.Date(2026, 11, 20, 10, 5, 0, 0, time.UTC)
	rng := rand.New(rand.NewPCG(7, 7))
	tx, err := db.Begin()
	if err != nil {
		tb.Fatal(err)
	}
	ins, err := tx.Prepare(`INSERT INTO events(site_id, ts, type, anon_id, session_id, host, path, name, engaged_ms, dwell_ms,
		country, device, browser, os, env, referrer_host) VALUES('s',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		tb.Fatal(err)
	}
	span := int64(days) * 24 * 3600 * 1000
	sessions := days * perDay / 4 // 3 pageviews and about 1 event per session
	people := max(sessions/2, 1)
	idm := 0
	for s := 0; s < sessions; s++ {
		start := now.UnixMilli() - rng.Int64N(span)
		if s%50 == 0 { // some sessions are live
			start = now.UnixMilli() - rng.Int64N(4*60*1000)
		}
		anon := fmt.Sprintf("a%07d", rng.IntN(people))
		sid := fmt.Sprintf("s%08d", s)
		t := start
		for i := 0; i < 3; i++ {
			dwell := 0
			if rng.IntN(10) < 7 {
				dwell = 1000 + rng.IntN(60000)
			}
			if _, err := ins.Exec(t, "pageview", anon, sid, "x.test", fmt.Sprintf("/p%d", rng.IntN(300)), "", dwell/2, dwell,
				"IN", "desktop", "Chrome", "macOS", "production", "google.com"); err != nil {
				tb.Fatal(err)
			}
			t += 20000
		}
		if rng.IntN(4) == 0 {
			if _, err := ins.Exec(t, "event", anon, sid, "x.test", "/p1", "Signup", 0, 0, "IN", "desktop", "Chrome", "macOS", "production", ""); err != nil {
				tb.Fatal(err)
			}
		}
		if s%10 == 0 && idm < 5000 {
			idm++
			if _, err := tx.Exec(`INSERT INTO identity_map(site_id, anon_id, user_id, ts) VALUES('s',?,?,?)`, anon, fmt.Sprintf("u%d", idm), start); err != nil {
				tb.Fatal(err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		tb.Fatal(err)
	}
	if _, err := db.Exec(`ANALYZE`); err != nil {
		tb.Fatal(err)
	}
	return db, now
}

func latencyParams(tb testing.TB, now time.Time, rk string) Params {
	tb.Helper()
	w, err := ResolveWindow(rk, "prev", now, time.UTC, 0)
	if err != nil {
		tb.Fatal(err)
	}
	return Params{Site: "s", Env: "production", From: w.From, To: w.To, Win: w, TZ: time.UTC, Now: now, Limit: 100}
}

// TestLatencyLive pins the live reports at ~100K events a day: reading the fold lookback must cost
// the window (five minutes), not the day behind it. Budgets sit between the cost before the lookback
// (commit 493e463: activeNow 15 ms, Live 125 ms, Visitors 510 ms) and the full-day read (activeNow
// 92 ms, Live 725 ms, Visitors 890 ms), on an M-series laptop. Skipped with -short. Set TRAIL_LATENCY_DAYS and TRAIL_LATENCY_PERDAY
// for other sizes; the budgets scale with TRAIL_LATENCY_PERDAY (budget * perDay / 100000).
func TestLatencyLive(t *testing.T) {
	if testing.Short() {
		t.Skip("seeds 300K events")
	}
	days, perDay := 3, 100000
	if v := os.Getenv("TRAIL_LATENCY_PERDAY"); v != "" {
		_, _ = fmt.Sscan(v, &perDay)
	}
	if v := os.Getenv("TRAIL_LATENCY_DAYS"); v != "" {
		_, _ = fmt.Sscan(v, &days)
	}
	db, now := latencyDB(t, days, perDay)
	ig := func(_ any, err error) error { return err }
	ig2 := func(_ any, _ int, err error) error { return err }
	cases := []struct {
		name   string
		budget time.Duration
		fn     func() error
	}{
		{"activeNow", 50 * time.Millisecond, func() error { return ig(activeNow(db, latencyParams(t, now, "today"))) }},
		{"Live", 300 * time.Millisecond, func() error { return ig(Live(db, latencyParams(t, now, "today"))) }},
		{"Stats today", 800 * time.Millisecond, func() error { return ig(Stats(db, latencyParams(t, now, "today"))) }},
		{"Stats 7d", 1400 * time.Millisecond, func() error { return ig(Stats(db, latencyParams(t, now, "7d"))) }},
		{"Visitors today", 800 * time.Millisecond, func() error { return ig2(Visitors(db, latencyParams(t, now, "today"), "")) }},
	}
	var table strings.Builder
	for _, c := range cases {
		c.budget = c.budget * time.Duration(perDay) / 100000 // budgets are for 100K events a day
		d := perfFastest(t, c.fn)
		fmt.Fprintf(&table, "%-16s %7.1f ms (budget %5.0f ms)\n", c.name, float64(d.Microseconds())/1000, float64(c.budget.Milliseconds()))
		if d > c.budget {
			t.Errorf("%s: %v over the %v budget", c.name, d, c.budget)
		}
	}
	t.Log("\n" + table.String())
}
