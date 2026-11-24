package query

import (
	"fmt"
	"strings"
	"testing"

	"trail/internal/store"
)

func TestSessionsPagingTotal(t *testing.T) {
	var evs []store.Event
	for i := 0; i < 25; i++ {
		evs = append(evs, pv(fmt.Sprintf("A%d", i%5), fmt.Sprintf("s%02d", i), "/", t0+int64(i)*minute))
	}
	db := fixture(t, evs...)
	p := around()
	p.Limit, p.Offset = 10, 20
	rows, total, err := Sessions(db, p, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 5 || total != 25 {
		t.Fatalf("%d rows, total %d", len(rows), total)
	}
	// Newest first by default: the last page holds the oldest sessions.
	if rows[4].SessionID != "s00" || rows[0].SessionID != "s04" {
		t.Fatalf("order %s … %s", rows[0].SessionID, rows[4].SessionID)
	}
	one, total, err := Sessions(db, around(), "A1")
	if err != nil || total != 5 || len(one) != 5 || one[0].Person != "A1" {
		t.Fatalf("person filter: %d %d %v", len(one), total, err)
	}
}

func TestSessionsFields(t *testing.T) {
	land := ref(pv("A", "s1", "/docs", t0), "google.com")
	land.City, land.Browser, land.OS = "Mumbai", "Chrome", "Android"
	db := fixture(t, land, pv("A", "s1", "/pricing", t0+60000), custom("A", "s1", "Signup", t0+61000),
		purchase("A", "s1", t0+62000, 19, ""), identify("A", "s1", "ada@example.com", t0+63000))
	g := goalOf(t, db, "Signup", "event", "Signup")
	goalOf(t, db, "Never", "page", "/never")
	rows, _, err := Sessions(db, around(), "")
	if err != nil || len(rows) != 1 {
		t.Fatalf("%+v %v", rows, err)
	}
	r := rows[0]
	if r.Person != "ada@example.com" || r.Label != "ada@example.com" || r.Entry != "/docs" || r.Exit != "/pricing" ||
		r.Source != "Google" || r.Pages != 2 || r.DurationMs != 63000 || r.City != "Mumbai" || r.Browser != "Chrome" ||
		r.OS != "Android" || r.Country != "IN" || r.Device != "mobile" || len(r.Goals) != 1 || r.Goals[0] != g.ID ||
		r.RevenueMinor != 1900 || r.Start != t0 {
		t.Fatalf("%+v", r)
	}
}

func TestSessionsSortDuration(t *testing.T) {
	db := fixture(t,
		pv("A", "short", "/", t0), pv("A", "short", "/", t0+1000),
		pv("B", "long", "/", t0-minute), pv("B", "long", "/", t0+5*minute),
		pv("C", "mid", "/", t0+2000), pv("C", "mid", "/", t0+60000),
	)
	p := around()
	p.Sort = "-duration"
	rows, _, err := Sessions(db, p, "")
	if err != nil || rows[0].SessionID != "long" || rows[2].SessionID != "short" {
		t.Fatalf("%+v %v", rows, err)
	}
	p.Sort = "pages"
	if _, _, err := Sessions(db, p, ""); err != nil {
		t.Fatal(err)
	}
	p.Sort = "password"
	if _, _, err := Sessions(db, p, ""); err == nil {
		t.Fatal("unknown sort accepted")
	}
}

func TestJourneyGoalsFromData(t *testing.T) {
	db := fixture(t,
		pv("A", "v1", "/pricing", t0-3*day), pv("A", "v1", "/pricing", t0-3*day+1000),
		pv("A", "v2", "/", t0-2*day),
		pv("A", "v3", "/signup", t0), custom("A", "v3", "Signup", t0+1000),
	)
	pricing := goalOf(t, db, "Saw pricing", "page", "/pri*")
	signup := goalOf(t, db, "Signed up", "event", "Signup")
	goals, err := ListGoals(db, "s")
	if err != nil {
		t.Fatal(err)
	}
	j, err := Journey(db, "s", "A", goals)
	if err != nil || len(j) != 3 {
		t.Fatalf("%+v %v", j, err)
	}
	if len(j[0].Goals) != 1 || j[0].Goals[0] != (GoalHit{ID: pricing.ID, Name: "Saw pricing", TS: t0 - 3*day}) {
		t.Fatalf("visit 1 goals %+v", j[0].Goals)
	}
	if len(j[1].Goals) != 0 || j[1].Goals == nil {
		t.Fatalf("visit 2 goals %+v", j[1].Goals)
	}
	if len(j[2].Goals) != 1 || j[2].Goals[0].ID != signup.ID || j[2].Goals[0].Name != "Signed up" {
		t.Fatalf("visit 3 goals %+v", j[2].Goals)
	}
}

func TestJourneyVisitNumbers(t *testing.T) {
	land := ref(pv("A", "v1", "/", t0-day), "news.ycombinator.com")
	land.City = "Pune"
	db := fixture(t, land, engage("A", "v1", t0-day+30000, 30000), pv("A", "v2", "/", t0))
	j, err := Journey(db, "s", "A", nil)
	if err != nil || len(j) != 2 {
		t.Fatalf("%+v %v", j, err)
	}
	if j[0].Visit != 1 || j[1].Visit != 2 || j[0].DurationMs != 30000 || j[0].Source != "Hacker News" ||
		j[0].City != "Pune" || j[0].Country != "IN" || j[0].Device != "mobile" || j[1].Source != "Direct" {
		t.Fatalf("%+v", j)
	}
}

func TestVisitorsTotalAndFields(t *testing.T) {
	a := ref(pv("A", "s1", "/", t0-30*minute), "github.com")
	a.Region, a.City, a.Browser, a.OS = "Karnataka", "Bengaluru", "Firefox", "Linux"
	db := fixture(t, a, pv("A", "s1", "/docs", t0-29*minute), pv("A", "s2", "/", t0),
		pv("B", "s3", "/", t0+minute), identify("B", "s3", "bob", t0+minute+1),
		pv("C", "s4", "/", t0+2*minute))
	p := around()
	p.Limit = 2
	vs, total, err := Visitors(db, p, "")
	if err != nil || total != 3 || len(vs) != 2 {
		t.Fatalf("%d rows total %d %v", len(vs), total, err)
	}
	if vs[0].Person != "C" || vs[1].Person != "bob" || !vs[1].Identified || vs[1].Label != "bob" {
		t.Fatalf("order/labels %+v", vs)
	}
	if vs[0].Label != "Visitor C" {
		t.Fatalf("anon label %q", vs[0].Label)
	}
	p.Sort, p.Limit = "-visits", 10
	vs, _, err = Visitors(db, p, "")
	if err != nil {
		t.Fatal(err)
	}
	v := vs[0]
	if v.Person != "A" || v.Visits != 2 || v.Pages != 3 || v.DurationMs != 60000 || v.Source != "GitHub" ||
		v.Region != "" || v.City != "" || v.Browser != "" {
		// latest event (s2 landing) has no region/city/browser: the latest location wins
		t.Fatalf("%+v", v)
	}
	q, total, err := Visitors(db, around(), "BO")
	if err != nil || total != 1 || len(q) != 1 || q[0].Person != "bob" {
		t.Fatalf("search %+v %d %v", q, total, err)
	}
	p.Sort = "nope"
	if _, _, err := Visitors(db, p, ""); err == nil {
		t.Fatal("unknown sort accepted")
	}
}

// A row counts visits in the range and, separately, every visit its journey lists.
func TestVisitorsTotalMatchesJourney(t *testing.T) {
	db := fixture(t,
		pv("A", "old1", "/", t0-40*day), pv("A", "old2", "/", t0-35*day), // before the range
		pv("A", "s1", "/", t0), identify("A", "s1", "ada", t0+1),
		pv("B", "s2", "/", t0+minute),
	)
	vs, _, err := Visitors(db, around(), "")
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range vs {
		j, err := Journey(db, "s", v.Person, nil)
		if err != nil {
			t.Fatal(err)
		}
		if v.VisitsAll != len(j) || v.Visits > v.VisitsAll {
			t.Errorf("%s: %d in range, %d total, journey lists %d", v.Person, v.Visits, v.VisitsAll, len(j))
		}
	}
	if vs[1].Person != "ada" || vs[1].Visits != 1 || vs[1].VisitsAll != 3 {
		t.Fatalf("%+v", vs[1])
	}
}

func TestJourneyUsesAnonIndex(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), identify("A", "sa", "u1", t0+1))
	rows, err := db.Query("EXPLAIN QUERY PLAN "+journeySQL, "s", "s", "u1", "u1", "u1", "s")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var plan strings.Builder
	for rows.Next() {
		var id, parent, notused int
		var detail string
		if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
			t.Fatal(err)
		}
		plan.WriteString(detail + "\n")
		if strings.HasPrefix(detail, "SCAN e") {
			t.Fatalf("journey scans events:\n%s", plan.String())
		}
	}
	if !strings.Contains(plan.String(), "events_site_anon_ts") {
		t.Fatalf("anon index unused:\n%s", plan.String())
	}
}

func TestJourneyEquivalence(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/", t0), identify("A", "sa", "u1", t0+1),
		pv("B", "sb", "/", t0+hour), identify("B", "sb", "u1", t0+hour+1), identify("B", "sb", "u2", t0+hour+2),
		pv("C", "sc", "/", t0+2*hour),
		pv("u1", "su", "/", t0+3*hour), identify("u1", "su", "u3", t0+3*hour+1),
	)
	ids := func(person string) []string {
		j, err := Journey(db, "s", person, nil)
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, s := range j {
			out = append(out, s.SessionID)
		}
		return out
	}
	for person, want := range map[string]string{"u1": "sa,sb", "C": "sc", "u2": "", "u3": "su"} {
		if got := strings.Join(ids(person), ","); got != want {
			t.Errorf("%s: got %q want %q", person, got, want)
		}
	}
}
