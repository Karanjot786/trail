package query

import (
	"errors"
	"reflect"
	"testing"
)

func TestGoalSourcesSumToConverters(t *testing.T) {
	db := fixture(t,
		landing("A", "a1", "/", "google.com", t0-40*day), // first touch before the window
		landing("A", "a2", "/docs", "x.com", t0), ev("A", "a2", "Signup", ``, t0+minute),
		landing("B", "b1", "/", "google.com", t0), ev("B", "b1", "Signup", ``, t0+minute), ev("B", "b1", "Signup", ``, t0+2*minute),
		landing("C", "c1", "/docs", "x.com", t0), ev("C", "c1", "Signup", ``, t0+minute),
		landing("D", "d1", "/", "google.com", t0), // no conversion
		landing("E", "e1", "/", "", t0-2*day), landing("E", "e2", "/", "", t0-day), landing("E", "e3", "/", "", t0),
		ev("E", "e3", "Signup", ``, t0+minute),
	)
	g := mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	p := thirtyDays()
	p.Filters = map[string]string{"goal": "1"} // ignored: a goal report never filters on a goal
	d, err := GoalDetail(db, p, g.ID)
	if err != nil {
		t.Fatal(err)
	}
	if d.Cur.Visitors != 4 || d.Cur.Conversions != 5 || d.Cur.Rate != 0.8 || d.Prev == nil {
		t.Fatalf("cur %+v prev %+v", d.Cur, d.Prev)
	}
	sum := 0
	for _, r := range d.Sources {
		sum += r.Converted
	}
	if sum != d.Cur.Visitors {
		t.Fatalf("sources %+v", d.Sources)
	}
	if d.Sources[0].Key != "google.com" || d.Sources[0].Converted != 2 || d.Sources[0].Visitors != 3 || !d.Sources[0].LowBase {
		t.Fatalf("google %+v", d.Sources)
	}
	if len(d.Landings) != 2 || d.Landings[0].Key != "/" || d.Landings[0].Converted != 3 {
		t.Fatalf("landings %+v", d.Landings)
	}
	if d.ByVisit != (VisitSplit{First: 2, Second: 1, Later: 1}) {
		t.Fatalf("byVisit %+v", d.ByVisit)
	}
	var conv float64
	for _, pt := range d.Series {
		if pt.V != nil {
			conv += *pt.V
		}
	}
	if conv != 4 {
		t.Fatalf("series converters %v", conv)
	}
}

func TestGoalRevenueMatchesRevenueBreakdown(t *testing.T) {
	db := fixture(t,
		landing("A", "a1", "/", "google.com", t0-40*day),
		landing("A", "a2", "/", "x.com", t0), ev("A", "a2", "Signup", ``, t0+minute), buy("A", "a2", "49", "USD", t0+2*minute),
		landing("B", "b1", "/", "google.com", t0), ev("B", "b1", "Signup", ``, t0+minute), buy("B", "b1", "19", "USD", t0+2*minute),
		landing("C", "c1", "/", "x.com", t0), ev("C", "c1", "Signup", ``, t0+minute), buy("C", "c1", "19", "USD", t0+2*minute),
	)
	g := mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	d, err := GoalDetail(db, thirtyDays(), g.ID)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := RevenueBreakdown(db, thirtyDays(), "source")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]int64{}
	for _, r := range rows {
		want[r.Key] = r.RevenueMinor
	}
	for _, s := range d.Sources {
		if s.RevenueMinor != want[s.Key] {
			t.Fatalf("%s: goal %d, revenue %d", s.Key, s.RevenueMinor, want[s.Key])
		}
	}
	if d.Sources[0].Key != "google.com" || d.Sources[0].RevenueMinor != 6800 {
		t.Fatalf("sources %+v", d.Sources)
	}
}

func TestPathsCollapseAndEllipsis(t *testing.T) {
	db := fixture(t,
		// A: / → /docs → /docs → /pricing → Signup (repeat collapsed)
		landing("A", "a1", "/", "google.com", t0), pv("A", "a1", "/docs", t0+minute), pv("A", "a1", "/docs", t0+2*minute),
		pv("A", "a1", "/pricing", t0+3*minute), ev("A", "a1", "Signup", ``, t0+4*minute),
		// B: the same path
		landing("B", "b1", "/", "google.com", t0), pv("B", "b1", "/docs", t0+minute), pv("B", "b1", "/pricing", t0+3*minute),
		ev("B", "b1", "Signup", ``, t0+4*minute),
		// C: six pages → first 2, …, last 1; the page after the hit is ignored
		landing("C", "c1", "/a", "", t0), pv("C", "c1", "/b", t0+minute), pv("C", "c1", "/c", t0+2*minute),
		pv("C", "c1", "/d", t0+3*minute), pv("C", "c1", "/e", t0+4*minute), ev("C", "c1", "Signup", ``, t0+5*minute),
		pv("C", "c1", "/after", t0+6*minute),
	)
	g := mustGoal(t, db, Goal{Name: "Signed up", Kind: "event", Match: "Signup"})
	r, err := PathsToGoal(db, thirtyDays(), g.ID)
	if err != nil {
		t.Fatal(err)
	}
	if r.Converters != 3 || len(r.Rows) != 2 || r.Goal.ID != g.ID {
		t.Fatalf("got %+v", r)
	}
	if !reflect.DeepEqual(r.Rows[0].Steps, []string{"google.com", "/", "/docs", "/pricing", "Signed up"}) || r.Rows[0].People != 2 {
		t.Fatalf("row 0 %+v", r.Rows[0])
	}
	if !reflect.DeepEqual(r.Rows[1].Steps, []string{"Direct", "/a", "/b", "…", "/e", "Signed up"}) || r.Rows[1].Share != 1.0/3 {
		t.Fatalf("row 1 %+v", r.Rows[1])
	}
}

func TestPathsPageGoalStopsBeforeGoalPage(t *testing.T) {
	db := fixture(t, landing("A", "a1", "/", "", t0), pv("A", "a1", "/pricing", t0+minute))
	g := mustGoal(t, db, Goal{Name: "Pricing", Kind: "page", Match: "/pricing"})
	r, err := PathsToGoal(db, thirtyDays(), g.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Rows) != 1 || !reflect.DeepEqual(r.Rows[0].Steps, []string{"Direct", "/", "Pricing"}) {
		t.Fatalf("got %+v", r.Rows)
	}
}

func TestGoalDetailUnknown(t *testing.T) {
	db := fixture(t, pv("A", "a1", "/", t0))
	if _, err := GoalDetail(db, thirtyDays(), 99); !errors.Is(err, ErrNotFound) {
		t.Fatalf("detail: %v", err)
	}
	if _, err := PathsToGoal(db, thirtyDays(), 99); !errors.Is(err, ErrNotFound) {
		t.Fatalf("paths: %v", err)
	}
}

func TestGoalDetailEmpty(t *testing.T) {
	db := fixture(t)
	g := mustGoal(t, db, Goal{Name: "Pricing", Kind: "page", Match: "/pricing*"})
	d, err := GoalDetail(db, thirtyDays(), g.ID)
	if err != nil {
		t.Fatal(err)
	}
	if d.Cur.Rate != 0 || d.Sources == nil || d.Landings == nil || len(d.Series) != 31 {
		t.Fatalf("got %+v", d)
	}
	r, err := PathsToGoal(db, thirtyDays(), g.ID)
	if err != nil || r.Rows == nil {
		t.Fatalf("paths %+v %v", r, err)
	}
}
