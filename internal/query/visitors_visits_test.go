package query

import "testing"

// visits counts sessions with a pageview, as Sessions and the session totals do: a custom event
// fired in a session that has no pageview in the window is not a visit.
func TestVisitorsVisitsCountPageviewSessionsOnly(t *testing.T) {
	db := fixture(t,
		pv("a", "s1", "/", t0),
		pv("a", "s2", "/x", t0+10*minute),
		ev("a", "s3", "Signup", ``, t0+20*minute), // no pageview in s3
		pv("b", "s4", "/", t0+minute),
	)
	vs, total, err := Visitors(db, around(), "")
	if err != nil || total != 2 {
		t.Fatalf("visitors %v total %d err %v, want 2 people", vs, total, err)
	}
	for _, v := range vs {
		want := map[string]int{"a": 2, "b": 1}[v.Person]
		if v.Visits != want {
			t.Errorf("person %s: visits %d, want %d", v.Person, v.Visits, want)
		}
	}
}
