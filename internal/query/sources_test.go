package query

import (
	"strconv"
	"testing"

	"trail/internal/store"
)

func ref(e store.Event, host string) store.Event { e.RefHost = host; return e }

func rowsByKey(t *testing.T, rows []Row) map[string]Row {
	t.Helper()
	m := map[string]Row{}
	for _, r := range rows {
		m[r.Key] = r
	}
	return m
}

func mustBreakdown(t *testing.T, p Params, dim string, evs ...store.Event) []Row {
	t.Helper()
	db := fixture(t, evs...)
	rows, err := Breakdown(db, p, dim, "", 50)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestBreakdownExitRate(t *testing.T) {
	rows := mustBreakdown(t, around(), "exit",
		pv("A", "s1", "/a", t0), pv("A", "s1", "/a", t0+1000), // exit /a
		pv("B", "s2", "/a", t0), pv("B", "s2", "/b", t0+1000), // exit /b
		pv("C", "s3", "/a", t0), // exit /a
	)
	m := rowsByKey(t, rows)
	a := m["/a"]
	if a.Exits == nil || *a.Exits != 2 || *a.Views != 4 || *a.ExitRate != 0.5 || a.Pageviews != 4 {
		t.Fatalf("/a = %+v", a)
	}
	if b := m["/b"]; *b.ExitRate != 1 {
		t.Fatalf("/b = %+v", b)
	}
	if rows[0].Key != "/a" {
		t.Fatalf("order %+v", rows)
	}
}

func TestBreakdownEntryTopSource(t *testing.T) {
	rows := mustBreakdown(t, around(), "entry",
		ref(pv("A", "s1", "/docs", t0), "google.com"), pv("A", "s1", "/pricing", t0+1000),
		ref(pv("B", "s2", "/docs", t0), "google.de"),
		ref(pv("C", "s3", "/docs", t0), "github.com"),
		pv("D", "s4", "/", t0),
	)
	m := rowsByKey(t, rows)
	d := m["/docs"]
	if d.Entries == nil || *d.Entries != 3 || d.Top != "Google" || d.Visitors != 3 || d.Pageviews != 4 || *d.Sessions != 3 {
		t.Fatalf("/docs = %+v", d)
	}
	if _, ok := m["/pricing"]; ok {
		t.Fatal("/pricing is not an entry page")
	}
}

func TestBreakdownSourceColumns(t *testing.T) {
	g := ref(pv("A", "s1", "/", t0-40*day), "google.com") // A's first touch: Google, long ago
	db := fixture(t,
		g, ref(pv("A", "s2", "/", t0), "x.com"), custom("A", "s2", "Signup", t0+10),
		purchase("A", "s2", t0+20, 19, ""),
		ref(pv("B", "s3", "/", t0), "x.com"), pv("B", "s3", "/docs", t0+1000),
	)
	goalOf(t, db, "Signup", "event", "Signup")
	rows, err := Breakdown(db, around(), "source", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	m := rowsByKey(t, rows)
	x := m["X"]
	// Traffic: both visits came from X. Credit: A converted and paid, but first touched Google.
	if x.Visitors != 2 || *x.Sessions != 2 || *x.Bounce != 0 || x.ConvRate == nil || *x.ConvRate != 0 || *x.RevenueMinor != 0 {
		t.Fatalf("X = %+v", x)
	}
	if gg, ok := m["Google"]; ok {
		t.Fatalf("Google has no visit in range: %+v", gg)
	}
	ch, err := Breakdown(db, around(), "channel", "", 10)
	if err != nil || len(ch) != 1 || ch[0].Key != "Social" {
		t.Fatalf("channel %+v %v", ch, err)
	}
	// Path rows carry no first-touch columns.
	pr, _ := Breakdown(db, around(), "path", "", 10)
	if pr[0].ConvRate != nil || pr[0].RevenueMinor != nil {
		t.Fatalf("path row %+v", pr[0])
	}
}

func TestBreakdownFirstTouchRevenue(t *testing.T) {
	db := fixture(t,
		ref(pv("A", "s1", "/", t0), "google.com"), purchase("A", "s1", t0+1, 49, ""),
		ref(pv("B", "s2", "/", t0), "google.com"),
	)
	goalOf(t, db, "Buy", "event", "Purchase")
	rows, err := Breakdown(db, around(), "source", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if r := rows[0]; r.Key != "Google" || *r.RevenueMinor != 4900 || *r.ConvRate != 0.5 {
		t.Fatalf("%+v", r)
	}
}

func TestBreakdownCityCarriesCountry(t *testing.T) {
	a := pv("A", "s1", "/", t0)
	a.Country, a.Region, a.City = "IN", "Maharashtra", "Mumbai"
	rows := mustBreakdown(t, around(), "city", a)
	if len(rows) != 1 || rows[0].Key != "Mumbai" || rows[0].Country != "IN" || rows[0].Region != "Maharashtra" {
		t.Fatalf("%+v", rows)
	}
}

func TestEventDimIncludesOutbound(t *testing.T) {
	out := store.Event{Type: "outbound", Name: "https://github.com/", AnonID: "A", SessionID: "s1", TS: t0 + 10}
	db := fixture(t, pv("A", "s1", "/", t0), out, custom("B", "s2", "Signup", t0), pv("B", "s2", "/", t0))
	before := mustStats(t, db, around())
	rows, err := Breakdown(db, around(), "event", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	m := rowsByKey(t, rows)
	if m["Outbound link"].Total != 1 || m["Signup"].Total != 1 {
		t.Fatalf("%+v", rows)
	}
	if before.Bounce != 0.5 {
		t.Fatalf("outbound click must not engage: bounce %v", before.Bounce)
	}
	p := around()
	p.Filters = map[string]string{"event": "Outbound link"}
	if s := mustStats(t, db, p); s.Visitors != 1 || s.Pageviews != 1 {
		t.Fatalf("outbound filter %+v", s.Totals)
	}
}

func TestGoalFilterSessionScoped(t *testing.T) {
	db := fixture(t,
		pv("A", "s1", "/", t0), pv("A", "s1", "/pricing", t0+1000),
		pv("A", "s2", "/", t0+2000), // same person, other session without the goal
		pv("B", "s3", "/", t0),
	)
	g := goalOf(t, db, "Pricing", "page", "/pricing")
	p := around()
	p.Filters = map[string]string{"goal": strconv.FormatInt(g.ID, 10)}
	s := mustStats(t, db, p)
	if s.Visitors != 1 || s.Pageviews != 2 || s.Sessions != 1 {
		t.Fatalf("%+v", s.Totals)
	}
	rows, err := Breakdown(db, around(), "goal", "", 10)
	if err != nil || len(rows) != 1 || rows[0].Key != "Pricing" || rows[0].Visitors != 1 || rows[0].Total != 1 {
		t.Fatalf("goal rows %+v %v", rows, err)
	}
}

func TestDowHourFilter(t *testing.T) {
	mon := at(2026, 11, 16, 9, 30) // Monday 09:30 IST
	db := fixture(t, pv("A", "s1", "/", mon), pv("B", "s2", "/", mon+hour), pv("C", "s3", "/", mon+day))
	p := params(mon-hour, mon+2*day)
	p.Filters = map[string]string{"dow": "0", "hour": "9"}
	if s := mustStats(t, db, p); s.Visitors != 1 {
		t.Fatalf("visitors %d", s.Visitors)
	}
	rows, err := Breakdown(db, params(mon-hour, mon+2*day), "dow", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if m := rowsByKey(t, rows); m["0"].Visitors != 2 || m["1"].Visitors != 1 {
		t.Fatalf("dow rows %+v", rows)
	}
	hr, _ := Breakdown(db, params(mon-hour, mon+2*day), "hour", "", 10)
	if m := rowsByKey(t, hr); m["9"].Visitors != 2 || m["10"].Visitors != 1 {
		t.Fatalf("hour rows %+v", hr)
	}
}

func TestSessionFilters(t *testing.T) {
	db := fixture(t,
		ref(pv("A", "s1", "/docs", t0), "chatgpt.com"), pv("A", "s1", "/pricing", t0+1000),
		pv("B", "s2", "/", t0), pv("B", "s2", "/pricing", t0+1000),
	)
	for _, c := range []struct{ dim, val string }{
		{"source", "ChatGPT"}, {"channel", "AI"}, {"ai_source", "ChatGPT"}, {"entry", "/docs"}, {"referrer", "chatgpt.com"},
	} {
		p := around()
		p.Filters = map[string]string{c.dim: c.val}
		if s := mustStats(t, db, p); s.Visitors != 1 || s.Pageviews != 2 {
			t.Errorf("%s=%s: %+v", c.dim, c.val, s.Totals)
		}
	}
	p := around()
	p.Filters = map[string]string{"source": "Direct"}
	if s := mustStats(t, db, p); s.Visitors != 1 || s.Pageviews != 2 {
		t.Errorf("source=Direct: %+v", s.Totals)
	}
	p.Filters = map[string]string{"exit": "/pricing"}
	if s := mustStats(t, db, p); s.Visitors != 2 {
		t.Errorf("exit: %+v", s.Totals)
	}
}

func TestBreakdownNewDimsAllowed(t *testing.T) {
	db := fixture(t, pv("A", "s1", "/", t0))
	for _, d := range []string{"path", "route", "host", "entry", "exit", "referrer", "source", "channel", "ai_source",
		"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "country", "region", "city",
		"device", "browser", "os", "event", "goal", "dow", "hour"} {
		if _, err := Breakdown(db, around(), d, "x", 10); err != nil {
			t.Errorf("%s: %v", d, err)
		}
		p := around()
		p.Filters = map[string]string{d: "x"}
		if _, err := Stats(db, p); err != nil {
			t.Errorf("filter %s: %v", d, err)
		}
	}
}
