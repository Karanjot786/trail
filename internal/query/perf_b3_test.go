//go:build !race

package query

import (
	"database/sql"
	"sync"
	"testing"
	"time"
)

// b3Perf tops up B1's shared perfDB (60 days / 1,800 persons; site demo has revenue, crawler
// hits, the goals Signup (id 1) and Pricing (id 2) and the funnel "Docs to signup" (id 1)) with
// more purchases, so the revenue reports work on a realistic number of sales.
var b3Perf struct {
	once sync.Once
	err  error
}

func b3PerfDB(t *testing.T) (*sql.DB, time.Time) {
	t.Helper()
	b3Perf.once.Do(func() {
		// About a third of signups buy, at 19 or 49 USD.
		_, b3Perf.err = perfDB.Exec(`INSERT INTO events(site_id, ts, type, anon_id, session_id, user_id, host, path, route, name, props, country, device, browser, os, env)
			 SELECT site_id, ts+60000, 'event', anon_id, session_id, user_id, host, path, route, 'Purchase',
			   CASE WHEN id%2=0 THEN '{"amount":49,"currency":"USD","plan":"pro"}' ELSE '{"amount":19,"currency":"USD","plan":"starter"}' END,
			   country, device, browser, os, env FROM events WHERE site_id='demo' AND name='Signup' AND id%3=0 AND ts+60000<=?`,
			perfNow.UnixMilli())
	})
	if b3Perf.err != nil {
		t.Fatal(b3Perf.err)
	}
	return perfDB, perfNow
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
		pc := make([]perfCase, 0, len(cases))
		for _, c := range cases {
			pc = append(pc, perfCase{w.name + " " + c.name, c.run})
		}
		perfRun(t, pc)

	}
}
