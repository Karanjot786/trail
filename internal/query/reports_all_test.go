package query

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"path/filepath"
	"testing"
	"time"

	"trail/internal/seed"
	"trail/internal/store"
)

// foldSQL folds engage rows into their pageview the way the store's history fold does:
// each engage joins the latest pageview of its session and path at or before it, and an
// engage with no such pageview stays a row.
func foldSQL(t testing.TB, db *sql.DB) {
	t.Helper()
	for _, q := range []string{
		`DROP TABLE IF EXISTS temp.m`,
		`CREATE TEMP TABLE m AS SELECT g.id AS gid, (SELECT p.id FROM events p WHERE p.site_id=g.site_id AND p.session_id=g.session_id
		    AND p.type='pageview' AND p.path=g.path AND p.ts<=g.ts ORDER BY p.ts DESC, p.id DESC LIMIT 1) AS pid,
		    g.engaged_ms AS em, g.scroll_pct AS sc, g.ts AS gts FROM events g WHERE g.type='engage' AND g.session_id<>''`,
		`UPDATE events SET engaged_ms=max(engaged_ms, x.em), scroll_pct=max(scroll_pct, x.sc), dwell_ms=max(dwell_ms, x.gts-events.ts)
		    FROM (SELECT pid, max(em) AS em, max(sc) AS sc, max(gts) AS gts FROM m WHERE pid IS NOT NULL GROUP BY pid) x WHERE events.id=x.pid`,
		`DELETE FROM events WHERE id IN (SELECT gid FROM m WHERE pid IS NOT NULL)`,
		`DROP TABLE temp.m`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("fold: %v\n%s", err, q)
		}
	}
}

// allReports runs every exported report for p and returns each result as JSON text.
func allReports(t testing.TB, db *sql.DB, p Params) map[string]string {
	t.Helper()
	out := map[string]string{}
	put := func(name string, v any, err error) {
		if err != nil {
			out[name] = "error: " + err.Error()
			return
		}
		b, merr := json.Marshal(v)
		if merr != nil {
			t.Fatal(merr)
		}
		out[name] = string(b)
	}
	st, err := Stats(db, p)
	put("stats", st, err)
	for _, m := range []string{"visitors", "pageviews", "sessions", "duration", "bounce", "conversion", "revenue"} {
		v, err := Series(db, p, m, false)
		put("series "+m, v, err)
	}
	sv, err := Series(db, p, "visitors", true)
	put("series extras", sv, err)
	for d := range dims {
		v, err := Breakdown(db, p, d, "", 50)
		put("breakdown "+d, v, err)
	}
	gl, err := ListGoals(db, p.Site)
	put("goals", gl, err)
	rep, err := GoalReport(db, p)
	put("goalreport", rep, err)
	for _, g := range gl {
		v, err := GoalDetail(db, p, g.ID)
		put(fmt.Sprint("goaldetail ", g.ID), v, err)
		pp, err := PathsToGoal(db, p, g.ID)
		put(fmt.Sprint("paths ", g.ID), pp, err)
	}
	fl, err := ListFunnels(db, p.Site)
	put("funnels", fl, err)
	for _, f := range fl {
		v, err := FunnelReport(db, p, f.ID)
		put(fmt.Sprint("funnel ", f.ID), v, err)
		d, n, err := FunnelDropoff(db, p, f.ID, 1)
		put(fmt.Sprint("dropoff ", f.ID), []any{d, n}, err)
	}
	vis, total, err := Visitors(db, p, "")
	put("visitors", []any{vis, total}, err)
	vq, tq, err := Visitors(db, p, "a")
	put("visitors search", []any{vq, tq}, err)
	ss, n, err := Sessions(db, p, "")
	put("sessions", []any{ss, n}, err)
	for i, v := range vis {
		if i >= 8 {
			break
		}
		j, err := Journey(db, p.Site, v.Person, gl)
		put("journey "+v.Person, j, err)
	}
	c, err := Campaigns(db, p)
	put("campaigns", c, err)
	ai, err := AIReferrals(db, p)
	put("aireferrals", ai, err)
	lv, err := Live(db, p)
	put("live", lv, err)
	hm, err := Heatmap(db, p)
	put("heatmap", hm, err)
	ch, err := Changes(db, p)
	put("changes", ch, err)
	sm, err := SitesSummary(db, p, []string{p.Site})
	put("summary", sm, err)
	ag, err := Agents(db, p)
	put("agents", ag, err)
	av, err := AIVisibility(db, p)
	put("aivisibility", av, err)
	ec, err := EventCatalogue(db, p)
	put("eventcatalogue", ec, err)
	for _, e := range ec {
		v, err := EventDetail(db, p, e.Name)
		put("eventdetail "+e.Name, v, err)
	}
	ob, err := EventDetail(db, p, outboundKey)
	put("eventdetail outbound", ob, err)
	dl, err := Delivery(db, p)
	put("delivery", dl, err)
	rv, err := Revenue(db, p)
	put("revenue", rv, err)
	for _, d := range []string{"source", "channel", "utm_campaign", "entry", "country", "device"} {
		v, err := RevenueBreakdown(db, p, d)
		put("revenuebreakdown "+d, v, err)
	}
	return out
}

// seedPair builds an unfolded database A (with a second, earlier engage for some pageviews) and
// a folded copy B, and returns both with the seeded clock.
func seedPair(t *testing.T) (a, b *sql.DB, now time.Time) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	st.SetFold(false)
	now = time.Date(2026, 11, 20, 10, 5, 0, 0, ist)
	sites := []seed.SiteSpec{{ID: "demo", Revenue: true, Crawlers: true}}
	if err := seed.Seed(st, sites, 14, 400, now, rand.New(rand.NewPCG(7, 7))); err != nil {
		t.Fatal(err)
	}
	a = st.DB()
	// A weaker, earlier engage for 1 in 5 pageviews, so max semantics are exercised.
	if _, err := a.Exec(`INSERT INTO events (site_id, ts, type, anon_id, session_id, path, route, host, engaged_ms, scroll_pct, country, region, city,
		device, browser, os, is_bot, env, agent, agent_via)
		SELECT site_id, ts+500, 'engage', anon_id, session_id, path, route, host, 300, 5, country, region, city, device, browser, os, is_bot, env, agent, agent_via
		FROM events WHERE type='pageview' AND id%5=0`); err != nil {
		t.Fatal(err)
	}
	bPath := filepath.Join(dir, "b.db")
	if _, err := a.Exec(`VACUUM INTO ?`, bPath); err != nil {
		t.Fatal(err)
	}
	bs, err := store.Open(bPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bs.Close() })
	b = bs.DB()
	for _, db := range []*sql.DB{a, b} {
		if gl, _ := ListGoals(db, "demo"); len(gl) == 0 {
			t.Fatal("seed has no goals")
		}
		if fl, _ := ListFunnels(db, "demo"); len(fl) == 0 {
			t.Fatal("seed has no funnels")
		}
	}
	foldSQL(t, b)
	return a, b, now
}

func TestReportsSameWhenEngageFolded(t *testing.T) {
	a, b, now := seedPair(t)
	var engA, engB int
	_ = a.QueryRow(`SELECT count(*) FROM events WHERE type='engage'`).Scan(&engA)
	_ = b.QueryRow(`SELECT count(*) FROM events WHERE type='engage'`).Scan(&engB)
	if engA == 0 || engB >= engA {
		t.Fatalf("fold did not remove engage rows: %d -> %d", engA, engB)
	}
	var last int64
	_ = a.QueryRow(`SELECT max(ts) FROM events`).Scan(&last)
	clock := time.UnixMilli(last).Add(time.Minute)
	if clock.Before(now) {
		clock = now
	}
	cases := map[string]Params{}
	for _, rk := range []string{"30d", "today", "7d"} {
		// A comparison window can end between a pageview and the engage folded into it, which only
		// the unfolded form splits; only 30d (whose previous window holds no data) compares.
		cmp := "none"
		if rk == "30d" {
			cmp = "prev"
		}
		w, err := ResolveWindow(rk, cmp, clock, ist, 0)
		if err != nil {
			t.Fatal(err)
		}
		cases[rk] = Params{Site: "demo", Env: "production", From: w.From, To: w.To, Win: w, TZ: ist, Now: clock, Limit: 100}
	}
	all := cases["30d"]
	all.Actor = "all"
	cases["30d actor=all"] = all
	// Two filter sets: session dims plus a row dim, and a goal filter.
	for name, f := range map[string]map[string]string{
		"source+country": {"source": "Direct", "country": "IN"},
		"goal":           {"goal": "1"},
		"path":           {"path": "/pricing"},
	} {
		q := cases["30d"]
		q.Filters = f
		cases[name] = q
	}
	for name, p := range cases {
		if raceOn && name != "30d" && name != "path" { // the race detector makes each case minutes long
			continue
		}
		ra, rb := allReports(t, a, p), allReports(t, b, p)
		for k, va := range ra {
			if rb[k] != va {
				i := 0
				for i < len(va) && i < len(rb[k]) && va[i] == rb[k][i] {
					i++
				}
				lo := max(0, i-150)
				t.Errorf("%s / %s differs at byte %d:\n unfolded ...%.400s\n folded   ...%.400s", name, k, i, va[lo:], rb[k][min(lo, len(rb[k])):])
			}
		}
	}
}

func TestZeroPageviewSessionsNotCounted(t *testing.T) {
	// The finding's example: a pageview at 23:58, then an engage for the same anon at 00:01 in a new session.
	mid := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	db := fixture(t,
		pv("a1", "s1", "/", mid-2*minute),
		engage("a1", "s2", mid+minute, 4000),
	)
	p := params(mid, mid+day-1)
	st := mustStats(t, db, p)
	if st.Totals.Visitors != 0 || st.Totals.Sessions != 0 || st.Totals.Bounce != 0 {
		t.Errorf("ghost day: visitors %d sessions %d bounce %v, want 0 0 0", st.Totals.Visitors, st.Totals.Sessions, st.Totals.Bounce)
	}
	if v, n, err := Visitors(db, p, ""); err != nil || n != 0 || len(v) != 0 {
		t.Errorf("visitors list: %v %d %v, want empty", v, n, err)
	}
	if s, n, err := Sessions(db, p, ""); err != nil || n != 0 || len(s) != 0 {
		t.Errorf("sessions list: %v %d %v, want empty", s, n, err)
	}
	// A real pageview session plus an outbound-only ghost session in the same window.
	db = fixture(t,
		pv("b1", "r1", "/", t0),
		store.Event{Type: "outbound", AnonID: "b2", SessionID: "r2", Name: "x.com", TS: t0 + minute},
	)
	st = mustStats(t, db, around())
	if st.Totals.Visitors != 1 || st.Totals.Sessions != 1 {
		t.Errorf("with ghost: visitors %d sessions %d, want 1 1", st.Totals.Visitors, st.Totals.Sessions)
	}
	if _, n, _ := Visitors(db, around(), ""); n != 1 {
		t.Errorf("visitors list total %d, want 1", n)
	}
}

func TestLiveCountsFoldedEngagement(t *testing.T) {
	now := time.UnixMilli(t0)
	pvAt := t0 - 20*minute
	db := fixture(t, pv("a1", "s1", "/a", pvAt))
	if _, err := db.Exec(`UPDATE events SET engaged_ms=9000, dwell_ms=? WHERE type='pageview'`, 19*minute); err != nil {
		t.Fatal(err)
	}
	p := params(pvAt-hour, t0)
	p.Now = now
	lv, err := Live(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if lv.Active != 1 {
		t.Errorf("active %d, want 1", lv.Active)
	}
	if len(lv.Stream) != 0 || lv.Events5m != 0 {
		t.Errorf("stream %d events5m %d, want empty", len(lv.Stream), lv.Events5m)
	}
}

// TestUnfoldRoundTrip: fold, then Unfold, gives back what the older binary reads: per session the
// same first and last timestamp and the same best engagement, read with the old shape of the query
// (max(ts)-min(ts), no dwell_ms), and the same reports from the current code.
func TestUnfoldRoundTrip(t *testing.T) {
	a, b, now := seedPair(t)
	oldShape := func(db *sql.DB) string {
		rows, err := db.Query(`SELECT session_id, min(ts), max(ts), max(engaged_ms), max(scroll_pct), sum(type='pageview'), sum(dwell_ms)
			FROM events GROUP BY site_id, session_id ORDER BY site_id, session_id`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var s string
		for rows.Next() {
			var id string
			var v [6]int64
			if err := rows.Scan(&id, &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]); err != nil {
				t.Fatal(err)
			}
			s += fmt.Sprint(id, v, "\n")
		}
		return s
	}
	want := oldShape(a)
	n, err := store.Unfold(b)
	if err != nil || n == 0 {
		t.Fatalf("unfold: %d %v", n, err)
	}
	if got := oldShape(b); got != want {
		i := 0
		for i < len(got) && i < len(want) && got[i] == want[i] {
			i++
		}
		t.Fatalf("old-shape sessions differ at byte %d:\n%.300s\n---\n%.300s", i, got[max(0, i-100):], want[max(0, i-100):])
	}
	if n2, err := store.Unfold(b); err != nil || n2 != 0 {
		t.Errorf("second unfold inserted %d (%v), want 0", n2, err)
	}
	w, err := ResolveWindow("30d", "none", now, ist, 0)
	if err != nil {
		t.Fatal(err)
	}
	p := Params{Site: "demo", Env: "production", From: w.From, To: w.To, Win: w, TZ: ist, Now: now, Limit: 100}
	if raceOn {
		return
	}
	ra, rb := allReports(t, a, p), allReports(t, b, p)
	for k, va := range ra {
		if rb[k] != va {
			t.Errorf("%s differs after fold+unfold", k)
		}
	}
}
