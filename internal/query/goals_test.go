package query

import (
	"database/sql"
	"errors"
	"math"
	"strings"
	"testing"

	"trail/internal/store"
)

func custom(anon, sess, name string, ts int64) store.Event {
	return store.Event{Type: "event", AnonID: anon, SessionID: sess, Name: name, Path: "/", TS: ts}
}

func mustGoal(t *testing.T, db *sql.DB, g Goal) Goal {
	t.Helper()
	out, err := CreateGoal(db, "s", g)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func report(t *testing.T, db *sql.DB, p Params) []GoalRow {
	t.Helper()
	rows, err := GoalReport(db, p)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestGoalCRUD(t *testing.T) {
	db := fixture(t)
	g := mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	if g.ID == 0 {
		t.Fatal("no id")
	}
	list, err := ListGoals(db, "s")
	if err != nil || len(list) != 1 || list[0] != g {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if other, _ := ListGoals(db, "other"); len(other) != 0 {
		t.Fatalf("other site sees goals: %+v", other)
	}
	if err := DeleteGoal(db, "other", g.ID); !errors.Is(err, ErrGoalNotFound) {
		t.Fatalf("delete other site's goal: %v", err)
	}
	if err := DeleteGoal(db, "s", g.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := ListGoals(db, "s"); len(list) != 0 || list == nil {
		t.Fatalf("after delete = %#v", list)
	}
}

func TestGoalValidation(t *testing.T) {
	db := fixture(t)
	mustGoal(t, db, Goal{Name: "dup", Kind: "page", Match: "/x"})
	bad := []Goal{
		{Name: "a", Kind: "click", Match: "x"},
		{Name: "", Kind: "page", Match: "/x"},
		{Name: strings.Repeat("n", 61), Kind: "page", Match: "/x"},
		{Name: "a", Kind: "page", Match: ""},
		{Name: "a", Kind: "page", Match: strings.Repeat("m", 201)},
		{Name: "dup", Kind: "event", Match: "y"},
	}
	for _, g := range bad {
		if _, err := CreateGoal(db, "s", g); !errors.Is(err, ErrBadGoal) {
			t.Errorf("%+v: err = %v, want ErrBadGoal", g, err)
		}
	}
	if _, err := CreateGoal(db, "s", Goal{Name: strings.Repeat("n", 60), Kind: "page", Match: strings.Repeat("m", 200)}); err != nil {
		t.Errorf("max lengths rejected: %v", err)
	}
}

func TestGoalReportPageExact(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/pricing", t0), pv("A", "sa", "/pricing", t0+minute),
		pv("B", "sb", "/pricing/x", t0), pv("C", "sc", "/", t0),
	)
	mustGoal(t, db, Goal{Name: "Pricing", Kind: "page", Match: "/pricing"})
	r := report(t, db, around())
	if len(r) != 1 || r[0].Conversions != 2 || r[0].Visitors != 1 {
		t.Fatalf("got %+v", r)
	}
}

func TestGoalReportPagePrefix(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/blog/1", t0), pv("B", "sb", "/blog/2", t0), pv("C", "sc", "/blogger", t0),
		pv("D", "sd", "/100%_done", t0),
	)
	mustGoal(t, db, Goal{Name: "Blog", Kind: "page", Match: "/blog/*"})
	mustGoal(t, db, Goal{Name: "Lit", Kind: "page", Match: "/100%_*"})
	mustGoal(t, db, Goal{Name: "Wild", Kind: "page", Match: "/1%*"})
	got := map[string]int{}
	for _, row := range report(t, db, around()) {
		got[row.Name] = row.Visitors
	}
	if got["Blog"] != 2 || got["Lit"] != 1 || got["Wild"] != 0 {
		t.Fatalf("got %v", got)
	}
}

func TestGoalReportEvent(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/", t0), custom("A", "sa", "Signup", t0+1),
		pv("B", "sb", "/", t0), custom("B", "sb", "Other", t0+1),
		// a pageview whose path equals the event name must not count
		pv("C", "sc", "Signup", t0),
	)
	mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	r := report(t, db, around())
	if r[0].Conversions != 1 || r[0].Visitors != 1 {
		t.Fatalf("got %+v", r[0])
	}
}

func TestGoalReportRate(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/ok", t0), pv("B", "sb", "/ok", t0),
		pv("C", "sc", "/", t0), pv("D", "sd", "/", t0),
	)
	mustGoal(t, db, Goal{Name: "OK", Kind: "page", Match: "/ok"})
	if r := report(t, db, around()); r[0].Rate != 0.5 {
		t.Fatalf("rate = %v", r[0].Rate)
	}
}

func TestGoalReportPrev(t *testing.T) {
	db := fixture(t,
		pv("A", "sa", "/ok", t0), pv("B", "sb", "/", t0),
		pv("C", "sc", "/ok", t0-2*hour), pv("D", "sd", "/ok", t0-2*hour), pv("E", "se", "/", t0-2*hour),
	)
	mustGoal(t, db, Goal{Name: "OK", Kind: "page", Match: "/ok"})
	r := report(t, db, around())[0]
	if r.Prev.Conversions != 2 || r.Prev.Visitors != 2 || math.Abs(r.Prev.Rate-2.0/3) > 1e-9 {
		t.Fatalf("prev = %+v", r.Prev)
	}
}

func TestGoalReportEmpty(t *testing.T) {
	db := fixture(t)
	empty := report(t, db, around())
	if empty == nil || len(empty) != 0 {
		t.Fatalf("no goals = %#v", empty)
	}
	mustGoal(t, db, Goal{Name: "G", Kind: "page", Match: "/x"})
	r := report(t, db, around())
	if r[0].Rate != 0 || math.IsNaN(r[0].Rate) || math.IsNaN(r[0].Prev.Rate) {
		t.Fatalf("got %+v", r[0])
	}
}

func TestGoalReportIdentityMerge(t *testing.T) {
	db := fixture(t,
		pv("A1", "s1", "/ok", t0), pv("A2", "s2", "/ok", t0+hour/2),
		identify("A1", "s1", "u", t0+1), identify("A2", "s2", "u", t0+hour/2+1),
	)
	mustGoal(t, db, Goal{Name: "OK", Kind: "page", Match: "/ok"})
	r := report(t, db, around())[0]
	if r.Visitors != 1 || r.Conversions != 2 || r.Rate != 1 {
		t.Fatalf("got %+v", r)
	}
}

func TestGoalReportRespectsFilters(t *testing.T) {
	a, b := pv("A", "sa", "/ok", t0), pv("B", "sb", "/ok", t0)
	b.Country = "US"
	bot := pv("Z", "sz", "/ok", t0)
	bot.IsBot = true
	db := fixture(t, a, b, bot)
	mustGoal(t, db, Goal{Name: "OK", Kind: "page", Match: "/ok"})
	p := around()
	p.Filters = map[string]string{"country": "IN"}
	r := report(t, db, p)[0]
	if r.Visitors != 1 || r.Rate != 1 {
		t.Fatalf("filtered = %+v", r)
	}
	if r := report(t, db, around())[0]; r.Visitors != 2 {
		t.Fatalf("bots counted: %+v", r)
	}
}

func TestDeliveryRetried(t *testing.T) {
	db := fixture(t, pv("A", "sa", "/", t0), pv("B", "sb", "/", t0), pv("C", "sc", "/", t0), pv("D", "sd", "/", t0))
	if _, err := db.Exec(`UPDATE events SET retry=2 WHERE anon_id='A'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE events SET is_bot=1, retry=1 WHERE anon_id='D'`); err != nil {
		t.Fatal(err)
	}
	d, err := Delivery(db, around())
	if err != nil {
		t.Fatal(err)
	}
	if d.Events != 3 || d.Retried != 1 || math.Abs(d.RetriedRate-1.0/3) > 1e-9 {
		t.Fatalf("got %+v", d)
	}
	if d, _ := Delivery(db, params(0, 1)); d.Events != 0 || d.RetriedRate != 0 {
		t.Fatalf("empty = %+v", d)
	}
}
