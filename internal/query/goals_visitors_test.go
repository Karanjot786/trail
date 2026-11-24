package query

import "testing"

// A session straddling the window start leaves an engage-only person inside the window; that
// person is not a visitor, so every goal rate must ignore them (folded or not).
func TestGoalRatesIgnoreEngageOnlyPeople(t *testing.T) {
	db := fixture(t,
		pv("x", "sx", "/", t0-2*minute),
		engage("x", "sx", t0+minute, 4000), // in the window, its pageview is not
		pv("y", "sy", "/", t0+2*minute),
		ev("y", "sy", "Signup", ``, t0+3*minute),
	)
	g := mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	p := b3Win(t0, t0+hour-1, 0, 0)
	p.Win.Bucket = "hour"
	if n, err := allVisitors(db, p); err != nil || n != 1 {
		t.Fatalf("allVisitors %d %v, want 1", n, err)
	}
	rep, err := GoalReport(db, p)
	if err != nil || len(rep) != 1 || rep[0].Rate != 1 {
		t.Fatalf("goal report %+v %v, want rate 1", rep, err)
	}
	d, err := GoalDetail(db, p, g.ID)
	if err != nil || d.Cur.Rate != 1 {
		t.Fatalf("goal detail %+v %v, want rate 1", d.Cur, err)
	}
	s, err := Series(db, p, "conversion", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, pt := range s.Points {
		if pt.V != nil && *pt.V != 0 && *pt.V != 1 {
			t.Fatalf("series conversion %v, want 0 or 1", *pt.V)
		}
	}
}

// A converter with no pageview in the window (x2) is not a visitor, so it must not count in any
// converter numerator: rates stay at or below 1.
func TestGoalRatesIgnoreConvertersWithoutPageview(t *testing.T) {
	db := fixture(t,
		pv("x", "sx", "/", t0-2*minute),
		ev("x", "sx", "Signup", ``, t0+minute),
		ev("x2", "sx2", "Signup", ``, t0+minute),
		pv("y", "sy", "/", t0+2*minute),
	)
	g := goalOf(t, db, "Signup", "event", "Signup")
	p := b3Win(t0, t0+hour-1, 0, 0)
	p.Win.Bucket = "hour"
	rep, err := GoalReport(db, p)
	if err != nil || len(rep) != 1 || rep[0].Rate > 1 {
		t.Fatalf("goal report %+v %v, want rate <= 1", rep, err)
	}
	d, err := GoalDetail(db, p, g.ID)
	if err != nil || d.Cur.Rate > 1 || d.Cur.Visitors > 1 {
		t.Fatalf("goal detail %+v %v, want rate <= 1", d.Cur, err)
	}
	st := mustStats(t, db, p)
	if st.ConvRate > 1 || st.ConvVisitors > st.BaseVisitors {
		t.Fatalf("stats %+v, want convRate <= 1", st)
	}
	s, err := Series(db, p, "conversion", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, pt := range s.Points {
		if pt.V != nil && *pt.V > 1 {
			t.Fatalf("series conversion %v, want <= 1", *pt.V)
		}
	}
}
