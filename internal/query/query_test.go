package query

import (
	"database/sql"
	"encoding/json"
	"math"
	"path/filepath"
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
	j, err := Journey(db, "s", "u1")
	if err != nil {
		t.Fatal(err)
	}
	if len(j) != 2 {
		t.Fatalf("journey sessions = %d, want 2", len(j))
	}
	vs, err := Visitors(db, around(), "", 10)
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
	vs, err := Visitors(db, around(), "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(vs) != 1 || vs[0].Person != "u1" {
		t.Fatalf("visitors = %+v, want only u1", vs)
	}
	j, err := Journey(db, "s", "u1")
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
	j, err := Journey(db, "s", "A")
	if err != nil {
		t.Fatal(err)
	}
	if len(j) != 1 || j[0].Source != "google.com" || j[0].Start != t0 || len(j[0].Steps) != 2 {
		t.Fatalf("journey = %+v", j)
	}
	if st := j[0].Steps[0]; st.EngagedMs != 20000 || st.ScrollPct != 50 {
		t.Fatalf("first step = %+v", st)
	}
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

func noNull(t *testing.T, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "null") || strings.Contains(string(b), "NaN") {
		t.Fatalf("json has null/NaN: %s", b)
	}
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
		sr, err := Series(db, p, m)
		if err != nil {
			t.Fatal(err)
		}
		if len(sr.Points) == 0 {
			t.Fatalf("%s: no points", m)
		}
		for _, pt := range sr.Points {
			if pt.V != 0 {
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
	vs, err := Visitors(db, p, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	noNull(t, vs)
	j, err := Journey(db, "s", "nobody")
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
	h, err := Series(db, params(t0-day, t0), "pageviews")
	if err != nil {
		t.Fatal(err)
	}
	if h.Bucket != "hour" || len(h.Points) != 25 {
		t.Fatalf("24h: bucket %s, %d points", h.Bucket, len(h.Points))
	}
	if last := h.Points[len(h.Points)-1]; last.T != t0 || last.V != 1 {
		t.Fatalf("last hour point = %+v", last)
	}
	d, err := Series(db, params(t0-7*day, t0+3*hour), "visitors")
	if err != nil {
		t.Fatal(err)
	}
	if d.Bucket != "day" || len(d.Points) != 8 {
		t.Fatalf("7d: bucket %s, %d points", d.Bucket, len(d.Points))
	}
	midnight := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	if last := d.Points[7]; last.T != midnight || last.V != 2 {
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
