package query

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"trail/internal/store"
)

var (
	ist, _ = time.LoadLocation("Asia/Kolkata")
	t0     = time.Date(2026, 11, 19, 10, 0, 0, 0, ist).UnixMilli()
	minute = int64(time.Minute / time.Millisecond)
	hour   = 60 * minute
	day    = 24 * hour
)

// fixture inserts events and returns the db.
func fixture(t *testing.T, evs ...store.Event) *sql.DB {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "q.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	for _, e := range evs {
		if e.SiteID == "" {
			e.SiteID = "s"
		}
		if e.Env == "" {
			e.Env = "production"
		}
		st.Enqueue(e)
	}
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	return st.DB()
}

func pv(anon, sess, path string, ts int64) store.Event {
	return store.Event{Type: "pageview", AnonID: anon, SessionID: sess, Path: path, Route: path, TS: ts, Country: "IN", Device: "mobile"}
}

func engage(anon, sess string, ts int64, ms int) store.Event {
	return store.Event{Type: "engage", AnonID: anon, SessionID: sess, Path: "/", TS: ts, EngagedMs: ms, ScrollPct: 50}
}

func identify(anon, sess, user string, ts int64) store.Event {
	return store.Event{Type: "identify", AnonID: anon, SessionID: sess, UserID: user, TS: ts}
}

func params(from, to int64) Params {
	return Params{Site: "s", Env: "all", From: from, To: to, TZ: ist}
}

func around() Params { return params(t0-hour, t0+hour) }

func mustStats(t *testing.T, db *sql.DB, p Params) StatsResult {
	t.Helper()
	s, err := Stats(db, p)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestStatsBasic(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/", t0), engage("A", "sa", t0+3000, 3000),
		pv("B", "sb", "/", t0), pv("B", "sb", "/docs", t0+minute),
	)
	s := mustStats(t, db, around())
	if s.Visitors != 2 || s.Pageviews != 3 || s.Bounce != 0.5 {
		t.Fatalf("got %+v", s)
	}
}

func TestEngaged10s(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), engage("A", "sa", t0+10000, 10000))
	if s := mustStats(t, db, around()); s.Bounce != 0 {
		t.Fatalf("bounce = %v, want 0", s.Bounce)
	}
}

func TestCustomEventEngages(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), store.Event{Type: "event", AnonID: "A", SessionID: "sa", Name: "Signup", TS: t0 + 1})
	if s := mustStats(t, db, around()); s.Bounce != 0 {
		t.Fatalf("bounce = %v, want 0", s.Bounce)
	}
}

func TestIdentifyMergesAcrossAnons(t *testing.T) {
	db := fixture(t,
		pv("A", "s1", "/", t0), identify("A", "s1", "u1", t0+1),
		pv("B", "s2", "/", t0+minute), identify("B", "s2", "u1", t0+minute+1),
	)
	if s := mustStats(t, db, around()); s.Visitors != 1 {
		t.Fatalf("visitors = %d, want 1", s.Visitors)
	}
	j, err := Journey(db, "s", "u1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(j) != 2 {
		t.Fatalf("journey sessions = %d, want 2", len(j))
	}
	vs, _, err := Visitors(db, around(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(vs) != 1 || vs[0].Person != "u1" || !vs[0].Identified || vs[0].Visits != 2 {
		t.Fatalf("visitors = %+v", vs)
	}
}

func TestFirstIdentifierWins(t *testing.T) {
	db := fixture(t,
		pv("A", "s1", "/", t0), identify("A", "s1", "u1", t0+1), identify("A", "s1", "u2", t0+2),
	)
	vs, _, err := Visitors(db, around(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(vs) != 1 || vs[0].Person != "u1" {
		t.Fatalf("visitors = %+v, want only u1", vs)
	}
	j, err := Journey(db, "s", "u1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(j) != 1 || len(j[0].Steps) != 3 || j[0].Steps[0].Path != "/" {
		t.Fatalf("journey = %+v", j)
	}
}

func TestJourneyMergesEngage(t *testing.T) {
	db := fixture(t,
		store.Event{Type: "pageview", AnonID: "A", SessionID: "s1", Path: "/", TS: t0, RefHost: "google.com"},
		engage("A", "s1", t0+10000, 10000),
		engage("A", "s1", t0+20000, 20000),
		pv("A", "s1", "/docs", t0+30000),
	)
	j, err := Journey(db, "s", "A", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(j) != 1 || j[0].Source != "Google" || j[0].Start != t0 || len(j[0].Steps) != 2 {
		t.Fatalf("journey = %+v", j)
	}
	if st := j[0].Steps[0]; st.EngagedMs != 20000 || st.ScrollPct != 50 {
		t.Fatalf("first step = %+v", st)
	}
	noNull(t, j) // v3: goals is [] until B1 fills it, never null
}

func TestBotsExcluded(t *testing.T) {
	bot := pv("BOT", "sx", "/", t0)
	bot.IsBot = true
	db := fixture(t, pv("A", "sa", "/", t0), bot)
	if s := mustStats(t, db, around()); s.Visitors != 1 || s.Pageviews != 1 {
		t.Fatalf("got %+v", s)
	}
	rows, err := Breakdown(db, around(), "path", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Visitors != 1 {
		t.Fatalf("breakdown = %+v", rows)
	}
}

// contractNullable lists the v3 fields the contract allows to be null (§0.5); every other null is a bug.
var contractNullable = map[string]bool{"prevFrom": true, "prevTo": true, "botRequests": true, "conv": true}

func noNull(t *testing.T, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "NaN") {
		t.Fatalf("json has NaN: %s", b)
	}
	var walk func(key string, x any)
	walk = func(key string, x any) {
		switch x := x.(type) {
		case nil:
			if !contractNullable[key] {
				t.Fatalf("json has null at %q: %s", key, b)
			}
		case map[string]any:
			for k, e := range x {
				walk(k, e)
			}
		case []any:
			for _, e := range x {
				walk(key, e)
			}
		}
	}
	var g any
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	walk("", g)
}

func TestEmptyRange(t *testing.T) {
	db := fixture(t)
	p := around()
	s := mustStats(t, db, p)
	if s.Visitors != 0 || s.Bounce != 0 || math.IsNaN(s.Bounce) || s.Prev.Bounce != 0 {
		t.Fatalf("got %+v", s)
	}
	noNull(t, s)
	for _, m := range []string{"visitors", "pageviews", "bounce"} {
		sr, err := Series(db, p, m, false)
		if err != nil {
			t.Fatal(err)
		}
		if len(sr.Points) == 0 {
			t.Fatalf("%s: no points", m)
		}
		for _, pt := range sr.Points {
			if pt.V == nil || *pt.V != 0 {
				t.Fatalf("%s: point %+v", m, pt)
			}
		}
		noNull(t, sr)
	}
	br, err := Breakdown(db, p, "event", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	noNull(t, br)
	vs, _, err := Visitors(db, p, "")
	if err != nil {
		t.Fatal(err)
	}
	noNull(t, vs)
	j, err := Journey(db, "s", "nobody", nil)
	if err != nil {
		t.Fatal(err)
	}
	noNull(t, j)
}

func TestPrevPeriod(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/", t0),           // current
		pv("B", "sb", "/", t0-90*minute), // previous [t0-3h, t0-1h)
		pv("C", "sc", "/", t0-hour-1),    // previous
		pv("D", "sd", "/", t0-4*hour),    // neither
	)
	s := mustStats(t, db, around())
	if s.Visitors != 1 || s.Prev.Visitors != 2 || s.Prev.Pageviews != 2 {
		t.Fatalf("got %+v", s)
	}
}

func TestSeriesBucketHourVsDay(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), pv("B", "sb", "/", t0+2*day/24))
	h, err := Series(db, params(t0-day, t0), "pageviews", false)
	if err != nil {
		t.Fatal(err)
	}
	if h.Bucket != "hour" || len(h.Points) != 25 {
		t.Fatalf("24h: bucket %s, %d points", h.Bucket, len(h.Points))
	}
	if last := h.Points[len(h.Points)-1]; last.T != t0 || last.V == nil || *last.V != 1 {
		t.Fatalf("last hour point = %+v", last)
	}
	d, err := Series(db, params(t0-7*day, t0+3*hour), "visitors", false)
	if err != nil {
		t.Fatal(err)
	}
	if d.Bucket != "day" || len(d.Points) != 8 {
		t.Fatalf("7d: bucket %s, %d points", d.Bucket, len(d.Points))
	}
	midnight := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	if last := d.Points[7]; last.T != midnight || last.V == nil || *last.V != 2 {
		t.Fatalf("last day point = %+v", last)
	}
}

func TestBreakdownFilterAllowlist(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/x", t0), pv("B", "sb", "/y", t0), pv("B", "sb", "/x", t0+1))
	p := around()
	p.Filters = map[string]string{"path": "/x"}
	rows, err := Breakdown(db, p, "path", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Key != "/x" || rows[0].Visitors != 2 || rows[0].Pageviews != 2 {
		t.Fatalf("rows = %+v", rows)
	}
	if _, err := Breakdown(db, around(), "password", "", 10); err == nil {
		t.Fatal("dim=password: want error")
	}
	p.Filters = map[string]string{"password": "x"}
	if _, err := Stats(db, p); err == nil {
		t.Fatal("filter password: want error")
	}
	q, err := Breakdown(db, around(), "path", "Y", 10)
	if err != nil || len(q) != 1 || q[0].Key != "/y" {
		t.Fatalf("q search: %+v %v", q, err)
	}
}

func TestEventBreakdownTotal(t *testing.T) {
	ev := func(anon string, ts int64) store.Event {
		return store.Event{Type: "event", AnonID: anon, SessionID: anon, Name: "Signup", TS: ts}
	}
	db := fixture(t, ev("A", t0), ev("A", t0+1), ev("B", t0), pv("A", "A", "/", t0))
	rows, err := Breakdown(db, around(), "event", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Key != "Signup" || rows[0].Visitors != 2 || rows[0].Total != 3 {
		t.Fatalf("rows = %+v", rows)
	}
	p := around()
	p.Filters = map[string]string{"event": "Signup"}
	s := mustStats(t, db, p)
	if s.Visitors != 2 {
		t.Fatalf("event filter visitors = %d", s.Visitors)
	}
}

func TestOnline(t *testing.T) {
	now := time.Now().UnixMilli()
	db := fixture(t, pv("A", "sa", "/", now-minute), pv("B", "sb", "/", now-2*minute), pv("C", "sc", "/", now-10*minute))
	s := mustStats(t, db, params(now-day, now))
	if s.Online != 2 {
		t.Fatalf("online = %d, want 2", s.Online)
	}
}

func TestEnvFilter(t *testing.T) {
	prev := pv("B", "sb", "/", t0)
	prev.Env = "preview"
	db := fixture(t, pv("A", "sa", "/", t0), prev)
	p := around()
	p.Env = "production"
	if s := mustStats(t, db, p); s.Visitors != 1 {
		t.Fatalf("visitors = %d", s.Visitors)
	}
}

func TestSourceFilterKeepsSession(t *testing.T) {
	land := pv("A", "sa", "/", t0)
	land.RefHost = "google.com"
	db := fixture(t, land, engage("A", "sa", t0+20000, 20000), pv("A", "sa", "/docs", t0+30000), pv("B", "sb", "/", t0))
	p := around()
	p.Filters = map[string]string{"referrer": "google.com"}
	s := mustStats(t, db, p)
	if s.Visitors != 1 || s.Pageviews != 2 || s.Bounce != 0 {
		t.Fatalf("got %+v, want 1 visitor, 2 pageviews, bounce 0", s)
	}
}

// winParams resolves rk at winNow (2026-11-20 10:05 IST) into Params for site "s".
func winParams(t *testing.T, rk, cmp string) Params {
	t.Helper()
	w, err := ResolveWindow(rk, cmp, winNow, ist, 0)
	if err != nil {
		t.Fatal(err)
	}
	return Params{Site: "s", Env: "all", From: w.From, To: w.To, Win: w, TZ: ist, Now: winNow}
}

func mustSeries(t *testing.T, db *sql.DB, p Params, metric string, extras bool) SeriesResult {
	t.Helper()
	s, err := Series(db, p, metric, extras)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestSeriesFutureBucketsNull(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", at(2026, 11, 20, 10, 1)), pv("B", "sb", "/", at(2026, 11, 19, 15, 0)))
	s := mustSeries(t, db, winParams(t, "today", "prev"), "visitors", false)
	if len(s.Points) != 24 || s.Bucket != "hour" || s.Window.Key != "today" {
		t.Fatalf("%d points, bucket %s", len(s.Points), s.Bucket)
	}
	if s.Points[10].V == nil || *s.Points[10].V != 1 {
		t.Fatalf("point 10 = %+v", s.Points[10])
	}
	for i := 11; i < 24; i++ {
		if s.Points[i].V != nil {
			t.Fatalf("point %d not null", i)
		}
	}
	// Yesterday's 15:00 is after the same-hours cut-off: it is not counted and not drawn.
	if len(s.Prev) != 24 || s.Prev[10].V == nil || s.Prev[15].V != nil {
		t.Fatalf("prev = %+v", s.Prev)
	}
}

func TestSeriesPrevSameOffset(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", at(2026, 9, 22, 12, 0)), pv("B", "sb", "/", at(2026, 11, 20, 9, 0)))
	s := mustSeries(t, db, winParams(t, "30d", "prev"), "pageviews", false)
	if len(s.Points) != 30 || len(s.Prev) != 30 || s.Prev[0].T != at(2026, 9, 22, 0, 0) {
		t.Fatalf("len %d/%d prev0 %d", len(s.Points), len(s.Prev), s.Prev[0].T)
	}
	if *s.Prev[0].V != 1 || *s.Points[29].V != 1 {
		t.Fatalf("prev0 %v last %v", *s.Prev[0].V, *s.Points[29].V)
	}
	none := mustSeries(t, db, winParams(t, "30d", "none"), "pageviews", false)
	if len(none.Prev) != 0 || none.Prev == nil {
		t.Fatalf("cmp=none prev = %+v", none.Prev)
	}
}

func TestSeriesMetrics(t *testing.T) {
	d := at(2026, 11, 18, 9, 0)
	db := fixture(t,
		pv("A", "s1", "/", d), pv("A", "s1", "/docs", d+60000), // 60 s, engaged
		pv("B", "s2", "/", d), custom("B", "s2", "Signup", d+1000), // 1 s, engaged by event
		pv("C", "s3", "/", d), // bounce
	)
	goalOf(t, db, "Signup", "event", "Signup")
	p := winParams(t, "7d", "prev")
	i := 4 // Nov 18
	check := func(metric string, want float64) {
		t.Helper()
		s := mustSeries(t, db, p, metric, false)
		if got := s.Points[i].V; got == nil || math.Abs(*got-want) > 1e-9 {
			t.Errorf("%s = %v, want %v", metric, got, want)
		}
	}
	check("sessions", 3)
	check("duration", (60000.0+1000)/3)
	check("bounce", 1.0/3)
	check("conversion", 1.0/3)
	check("visitors", 3)
	check("pageviews", 4)
}

func TestSeriesRevenueBuckets(t *testing.T) {
	db := fixture(t,
		purchase("A", "s1", at(2026, 11, 18, 9, 0), 19, ""),
		purchase("B", "s2", at(2026, 11, 18, 11, 0), 49, "USD"),
		purchase("C", "s3", at(2026, 11, 19, 9, 0), 10, "EUR"),
		purchase("D", "s4", at(2026, 11, 20, 9, 0), 19, "USD"),
	)
	s := mustSeries(t, db, winParams(t, "7d", "prev"), "revenue", false)
	if *s.Points[4].V != 6800 || *s.Points[5].V != 0 || *s.Points[6].V != 1900 {
		t.Fatalf("revenue = %v %v %v", *s.Points[4].V, *s.Points[5].V, *s.Points[6].V)
	}
}

func TestSeriesExtrasTop3(t *testing.T) {
	d := at(2026, 11, 18, 9, 0)
	var evs []store.Event
	add := func(ref string, n int) {
		for k := 0; k < n; k++ {
			e := pv(ref+strconv.Itoa(k), ref+"s"+strconv.Itoa(k), "/", d)
			e.RefHost = ref
			evs = append(evs, e)
		}
	}
	add("google.com", 3)
	add("bing.com", 2)
	add("github.com", 2)
	add("x.com", 1)
	evs = append(evs, purchase("google.com0", "google.coms0", d+1, 19, ""))
	db := fixture(t, evs...)
	s := mustSeries(t, db, winParams(t, "7d", "prev"), "visitors", true)
	if len(s.Extras) != 7 {
		t.Fatalf("%d extras", len(s.Extras))
	}
	e := s.Extras[4]
	want := []TopSource{{"Google", 3}, {"Bing", 2}, {"GitHub", 2}}
	if len(e.TopSources) != 3 || e.TopSources[0] != want[0] || e.TopSources[1] != want[1] || e.TopSources[2] != want[2] {
		t.Fatalf("top = %+v", e.TopSources)
	}
	if e.RevenueMinor != 1900 || e.T != s.Points[4].T || s.Extras[0].TopSources == nil {
		t.Fatalf("extra = %+v", e)
	}
	if no := mustSeries(t, db, winParams(t, "7d", "prev"), "visitors", false); no.Extras != nil {
		t.Fatal("extras without asking")
	}
}

func TestSeriesBadMetric(t *testing.T) {
	db := fixture(t)
	if _, err := Series(db, winParams(t, "7d", "prev"), "password", false); !errors.Is(err, ErrBadMetric) {
		t.Fatalf("err = %v", err)
	}
}

// pathFilterFixture: session sa lands on / from google, engages, then views /pricing; sb only views /.
func pathFilterFixture(t *testing.T) *sql.DB {
	t.Helper()
	land := pv("A", "sa", "/", t0)
	land.RefHost = "google.com"
	return fixture(t, land, engage("A", "sa", t0+20000, 20000), pv("A", "sa", "/pricing", t0+30000), pv("B", "sb", "/", t0))
}

func pathFilter() Params {
	p := around()
	p.Filters = map[string]string{"path": "/pricing"}
	return p
}

func TestPathFilterKeepsSessionMetrics(t *testing.T) {
	s := mustStats(t, pathFilterFixture(t), pathFilter())
	if s.Visitors != 1 || s.Pageviews != 1 || s.Sessions != 1 || s.Bounce != 0 || s.DurationMs != 30000 {
		t.Fatalf("got %+v, want 1 visitor, 1 pageview, 1 session, bounce 0, 30000 ms", s.Totals)
	}
}

func TestPathFilterSourceIsLanding(t *testing.T) {
	rows, err := Breakdown(pathFilterFixture(t), pathFilter(), "referrer", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Key != "google.com" || rows[0].Visitors != 1 {
		t.Fatalf("rows = %+v", rows)
	}
}

func TestPathFilterSeriesDuration(t *testing.T) {
	r, err := Series(pathFilterFixture(t), pathFilter(), "duration", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, pt := range r.Points {
		if pt.T <= t0 && pt.V != nil && *pt.V == 30000 {
			return
		}
	}
	t.Fatalf("no bucket with 30000: %+v", r.Points)
}

func TestPathFilterSessionsList(t *testing.T) {
	rows, _, err := Sessions(pathFilterFixture(t), pathFilter(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].DurationMs != 30000 || rows[0].Pages != 2 || rows[0].Entry != "/" {
		t.Fatalf("rows = %+v", rows)
	}
}

func TestPathFilterPathBreakdownKeepsRows(t *testing.T) {
	rows, err := Breakdown(pathFilterFixture(t), pathFilter(), "path", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Key != "/pricing" || rows[0].Pageviews != 1 {
		t.Fatalf("rows = %+v", rows)
	}
}
