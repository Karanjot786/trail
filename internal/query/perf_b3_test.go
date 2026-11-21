//go:build !race

package query

import (
	"database/sql"
	"math/rand/v2"
	"path/filepath"
	"sort"
	"sync"
	"testing"
	"time"

	"trail/internal/seed"
	"trail/internal/store"
)

// b3Perf is the 60-day / 1,800-person demo seed plus purchases, goals, a funnel and crawler hits.
// It is built once and shared; swap it for B1's perfDB fixture once that lands.
var b3Perf struct {
	once sync.Once
	db   *sql.DB
	now  time.Time
	err  error
}

func b3PerfDB(t *testing.T) (*sql.DB, time.Time) {
	t.Helper()
	b3Perf.once.Do(func() {
		st, err := store.Open(filepath.Join(t.TempDir(), "perf.db"))
		if err != nil {
			b3Perf.err = err
			return
		}
		now := time.Date(2026, 11, 20, 10, 5, 0, 0, ist)
		if err := seed.Seed(st, []string{"demo"}, 60, 1800, now, rand.New(rand.NewPCG(42, 42))); err != nil {
			b3Perf.err = err
			return
		}
		db := st.DB()
		stmts := []string{
			// About a third of signups buy, at 19 or 49 USD.
			`INSERT INTO events(site_id, ts, type, anon_id, session_id, user_id, host, path, route, name, props, country, device, browser, os, env)
			 SELECT site_id, ts+60000, 'event', anon_id, session_id, user_id, host, path, route, 'Purchase',
			   CASE WHEN id%2=0 THEN '{"amount":49,"currency":"USD","plan":"pro"}' ELSE '{"amount":19,"currency":"USD","plan":"starter"}' END,
			   country, device, browser, os, env FROM events WHERE name='Signup' AND id%3=0`,
			`INSERT INTO goals(site_id, name, kind, match, created) VALUES('demo','Signup','event','Signup',0),('demo','Pricing','page','/pricing',0)`,
			`INSERT INTO funnels(site_id, name, window_ms, steps, created) VALUES('demo','Docs to signup',604800000,
			 '[{"kind":"page","match":"/docs*","label":"Docs"},{"kind":"page","match":"/pricing","label":"Pricing"},{"kind":"page","match":"/signup","label":"Signup page"},{"kind":"event","match":"Signup","label":"Signed up"}]',0)`,
		}
		for _, s := range stmts {
			if _, err := db.Exec(s); err != nil {
				b3Perf.err = err
				return
			}
		}
		tx, err := db.Begin()
		if err != nil {
			b3Perf.err = err
			return
		}
		bots := []string{"GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "ChatGPT-User"}
		paths := []string{"/", "/docs", "/pricing", "/blog/42"}
		start := now.Add(-60 * 24 * time.Hour).Truncate(time.Hour)
		for h := start; h.Before(now); h = h.Add(time.Hour) {
			for i, b := range bots {
				for j, pth := range paths {
					if (h.Hour()+i+j)%3 != 0 {
						continue
					}
					if _, err := tx.Exec(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, n, last_ts) VALUES('demo',?,?,?,200,?,?)`,
						h.UnixMilli(), b, pth, 1+(i+j)%4, h.UnixMilli()+60000); err != nil {
						b3Perf.err = err
						return
					}
				}
			}
		}
		b3Perf.err = tx.Commit()
		b3Perf.db, b3Perf.now = db, now
	})
	if b3Perf.err != nil {
		t.Fatal(b3Perf.err)
	}
	return b3Perf.db, b3Perf.now
}

func TestPerfConversions(t *testing.T) {
	db, now := b3PerfDB(t)
	p := Params{Site: "demo", Env: "production", TZ: ist, Now: now, Limit: 100}
	for _, w := range []struct {
		name string
		days int
	}{{"30d", 30}, {"60d", 60}} {
		end := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999e6, ist)
		from := time.Date(now.Year(), now.Month(), now.Day()-w.days+1, 0, 0, 0, 0, ist).UnixMilli()
		pf := time.Date(now.Year(), now.Month(), now.Day()-2*w.days+1, 0, 0, 0, 0, ist).UnixMilli()
		pt := from - 1
		p.From, p.To = from, end.UnixMilli()
		p.Win = Window{Key: w.name, From: from, To: p.To, PrevFrom: &pf, PrevTo: &pt, Bucket: "day", TZ: "Asia/Kolkata"}
		cases := []struct {
			name string
			run  func() error
		}{
			{"EventCatalogue", func() error { _, err := EventCatalogue(db, p); return err }},
			{"EventDetail(Signup)", func() error { _, err := EventDetail(db, p, "Signup"); return err }},
			{"GoalDetail(1)", func() error { _, err := GoalDetail(db, p, 1); return err }},
			{"PathsToGoal(1)", func() error { _, err := PathsToGoal(db, p, 1); return err }},
			{"FunnelReport(1)", func() error { _, err := FunnelReport(db, p, 1); return err }},
			{"FunnelDropoff(1,1)", func() error { _, _, err := FunnelDropoff(db, p, 1, 1); return err }},
			{"Revenue", func() error { _, err := Revenue(db, p); return err }},
			{"Crawlers", func() error { _, err := Crawlers(db, p); return err }},
		}
		for _, dim := range []string{"source", "channel", "campaign", "entry", "country", "device"} {
			cases = append(cases, struct {
				name string
				run  func() error
			}{"RevenueBreakdown(" + dim + ")", func() error { _, err := RevenueBreakdown(db, p, dim); return err }})
		}
		for _, c := range cases {
			var runs []time.Duration
			for range 5 {
				start := time.Now()
				if err := c.run(); err != nil {
					t.Fatalf("%s %s: %v", w.name, c.name, err)
				}
				runs = append(runs, time.Since(start))
			}
			sort.Slice(runs, func(i, j int) bool { return runs[i] < runs[j] })
			med := runs[2]
			t.Logf("%-4s %-28s median %6.1f ms", w.name, c.name, float64(med.Microseconds())/1000)
			if med > 150*time.Millisecond {
				t.Errorf("%s %s: median %v over 150 ms", w.name, c.name, med)
			}
		}
	}
}
