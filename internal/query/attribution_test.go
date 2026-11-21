package query

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"testing"

	"trail/internal/store"
)

func purchase(anon, sess string, ts int64, amount float64, cur string) store.Event {
	props := `{"amount":` + ftoa(amount) + `}`
	if cur != "" {
		props = `{"amount":` + ftoa(amount) + `,"currency":"` + cur + `"}`
	}
	return store.Event{Type: "event", Name: "Purchase", AnonID: anon, SessionID: sess, TS: ts, Props: props}
}

func ftoa(f float64) string {
	b, _ := json.Marshal(f)
	return string(b)
}

func goalOf(t *testing.T, db *sql.DB, name, kind, match string) Goal {
	t.Helper()
	return mustGoal(t, db, Goal{Name: name, Kind: kind, Match: match})
}

func TestTotalsSessionsDuration(t *testing.T) {
	db := fixture(t,
		pv("A", "s1", "/", t0), pv("A", "s1", "/docs", t0+60000),
		pv("B", "s2", "/", t0),
	)
	s := mustStats(t, db, around())
	if s.Sessions != 2 || s.DurationMs != 30000 {
		t.Fatalf("sessions %d duration %d", s.Sessions, s.DurationMs)
	}
}

func TestFirstTouchUsesFirstSessionEver(t *testing.T) {
	first := pv("A", "old", "/blog", t0-50*day)
	first.RefHost = "google.com"
	later := pv("A", "new", "/", t0)
	later.RefHost = "x.com"
	other := pv("B", "b1", "/", t0)
	db := fixture(t, first, later, other)
	p := around()
	cte, args, err := base(p)
	if err != nil {
		t.Fatal(err)
	}
	ft, ftArgs := FirstTouch(db, p, "SELECT DISTINCT person FROM ev", nil)
	args = append(args, ftArgs...)
	rows := map[string][2]string{}
	err = forRows(db, cte+", "+ft+" SELECT person, source, entry FROM ft", args, func(r *sql.Rows) error {
		var person, src, entry string
		if err := r.Scan(&person, &src, &entry); err != nil {
			return err
		}
		rows[person] = [2]string{src, entry}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if rows["A"] != [2]string{"Google", "/blog"} || rows["B"] != [2]string{"Direct", "/"} || len(rows) != 2 {
		t.Fatalf("ft = %v", rows)
	}
}

func TestFirstTouchFollowsIdentity(t *testing.T) {
	first := pv("A1", "old", "/blog", t0-50*day)
	first.RefHost = "news.ycombinator.com"
	db := fixture(t, first, identify("A1", "old", "u1", t0-50*day+1),
		pv("A2", "new", "/", t0), identify("A2", "new", "u1", t0+1))
	p := around()
	cte, args, _ := base(p)
	ft, ftArgs := FirstTouch(db, p, "SELECT DISTINCT person FROM ev", nil)
	var person, src string
	if err := db.QueryRow(cte+", "+ft+" SELECT person, source FROM ft", append(args, ftArgs...)...).Scan(&person, &src); err != nil {
		t.Fatal(err)
	}
	if person != "u1" || src != "Hacker News" {
		t.Fatalf("got %s %s", person, src)
	}
}

func TestConvRateIgnoresGoalFilter(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/", t0), custom("A", "sa", "Signup", t0+1000),
		pv("B", "sb", "/", t0), pv("C", "sc", "/", t0),
	)
	g := goalOf(t, db, "Signup", "event", "Signup")
	p := around()
	s := mustStats(t, db, p)
	if s.Conv == nil || s.Conv.GoalID != g.ID || s.Conversions != 1 || s.ConvVisitors != 1 || s.BaseVisitors != 3 {
		t.Fatalf("unfiltered %+v conv %+v", s.Totals, s.Conv)
	}
	p.Filters = map[string]string{"goal": strconv.FormatInt(g.ID, 10)}
	s = mustStats(t, db, p)
	if s.Visitors != 1 || s.BaseVisitors != 3 || s.ConvRate >= 1 || s.ConvRate < 0.33 || s.ConvRate > 0.34 {
		t.Fatalf("goal filter: %+v", s.Totals)
	}
}

func TestConvPicksRequestedGoal(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/pricing", t0), pv("B", "sb", "/", t0))
	goalOf(t, db, "Signup", "event", "Signup")
	g2 := goalOf(t, db, "Pricing", "page", "/pri*")
	p := around()
	p.Conv = g2.ID
	s := mustStats(t, db, p)
	if s.Conv == nil || s.Conv.Name != "Pricing" || s.ConvVisitors != 1 || s.ConvRate != 0.5 {
		t.Fatalf("%+v %+v", s.Totals, s.Conv)
	}
}

func TestNoGoalsNoConv(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0))
	if s := mustStats(t, db, around()); s.Conv != nil || s.ConvRate != 0 || s.BaseVisitors != 1 {
		t.Fatalf("%+v", s)
	}
}

func TestRevenueMinorSitesCurrency(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/", t0), purchase("A", "sa", t0+1, 19, ""),
		purchase("B", "sb", t0+2, 49, "usd"), purchase("C", "sc", t0+3, 10, "EUR"),
	)
	s := mustStats(t, db, around())
	if s.RevenueMinor != 6800 || s.Purchases != 2 {
		t.Fatalf("revenue %d purchases %d", s.RevenueMinor, s.Purchases)
	}
}

func TestStatsUsesWindowPrev(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), pv("B", "sb", "/", t0-10*day), pv("C", "sc", "/", t0-10*day))
	p := around()
	pf, pt := t0-10*day-hour, t0-10*day+hour
	p.Win = Window{Key: "c:x", From: p.From, To: p.To, PrevFrom: &pf, PrevTo: &pt}
	s := mustStats(t, db, p)
	if s.Prev == nil || s.Prev.Visitors != 2 || s.Window.Key != "c:x" {
		t.Fatalf("prev %+v", s.Prev)
	}
	p.Win.PrevFrom, p.Win.PrevTo = nil, nil
	if s := mustStats(t, db, p); s.Prev != nil {
		t.Fatalf("cmp=none: prev %+v", s.Prev)
	}
}

func TestSiteFeatures(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), purchase("A", "sa", t0, 5, "EUR"), purchase("B", "sb", t0, 5, "EUR"),
		purchase("C", "sc", t0, 5, ""))
	f, err := SiteFeatures(db, "s")
	if err != nil {
		t.Fatal(err)
	}
	if !f.Revenue || f.Crawlers || f.Currency != "EUR" {
		t.Fatalf("%+v", f)
	}
	if _, err := db.Exec(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, n, last_ts) VALUES('s', 1, 'GPTBot', '/', 200, 3, 1)`); err != nil {
		t.Fatal(err)
	}
	f, _ = SiteFeatures(db, "s")
	if !f.Crawlers {
		t.Fatal("crawlers not detected")
	}
	empty, err := SiteFeatures(db, "nope")
	if err != nil || empty.Revenue || empty.Crawlers || empty.Currency != "USD" {
		t.Fatalf("empty %+v %v", empty, err)
	}
}

func TestSourceName(t *testing.T) {
	db := fixture(t)
	cases := []struct{ ref, utmS, utmM, name, channel, ai string }{
		{"google.co.in", "", "", "Google", "Organic search", ""},
		{"google.com", "google", "cpc", "Google", "Paid", ""},
		{"chatgpt.com", "", "", "ChatGPT", "AI", "ChatGPT"},
		{"", "chatgpt.com", "", "ChatGPT", "AI", "ChatGPT"},
		{"gemini.google.com", "", "", "Gemini", "AI", "Gemini"},
		{"", "newsletter", "email", "newsletter", "Email", ""},
		{"", "", "", "Direct", "Direct", ""},
		{"l.facebook.com", "", "", "Facebook", "Social", ""},
		{"t.co", "x", "social", "X", "Social", ""},
		{"github.com", "", "", "GitHub", "Referral", ""},
		{"blog.example.org", "", "", "blog.example.org", "Referral", ""},
		{"", "launch", "", "launch", "Campaign", ""},
		{"evil.com' OR 1=1", "", "", "evil.com' OR 1=1", "Referral", ""},
		{"notgoogle.com", "", "", "notgoogle.com", "Referral", ""},
	}
	for _, c := range cases {
		var name, ch, ai string
		err := db.QueryRow(`SELECT `+sourceNameExpr+`, `+channelExpr+`, `+aiSourceExpr+
			` FROM (SELECT ? AS referrer_host, ? AS utm_source, ? AS utm_medium, '' AS utm_campaign)`,
			c.ref, c.utmS, c.utmM).Scan(&name, &ch, &ai)
		if err != nil {
			t.Fatal(err)
		}
		if name != c.name || ch != c.channel || ai != c.ai {
			t.Errorf("%q/%q/%q → %q %q %q, want %q %q %q", c.ref, c.utmS, c.utmM, name, ch, ai, c.name, c.channel, c.ai)
		}
	}
}
