package query

import (
	"database/sql"
	"errors"
	"fmt"
	"testing"

	"trail/internal/store"
)

// mkFunnel stores the Docs to signup funnel (/docs*, /pricing, /signup, event Signup) with windowMs.
func mkFunnel(t *testing.T, db *sql.DB, windowMs int64) int64 {
	t.Helper()
	res, err := db.Exec(`INSERT INTO funnels(site_id, name, window_ms, steps, created) VALUES('s','Docs to signup',?,?,0)`, windowMs,
		`[{"kind":"page","match":"/docs*","label":"Docs"},{"kind":"page","match":"/pricing","label":"Pricing"},`+
			`{"kind":"page","match":"/signup","label":"Signup page"},{"kind":"event","match":"Signup","label":"Signed up"}]`)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

// walk makes person anon go through the first n funnel steps, a minute apart, from ts.
func walk(anon string, n int, ts int64) []store.Event {
	steps := []store.Event{
		landing(anon, anon+"1", "/docs/start", "google.com", ts),
		pv(anon, anon+"1", "/pricing", ts+minute),
		pv(anon, anon+"1", "/signup", ts+2*minute),
		ev(anon, anon+"1", "Signup", ``, ts+3*minute),
	}
	return steps[:n]
}

func funnelFixture(t *testing.T) (*sql.DB, int64) {
	var evs []store.Event
	// reached 10, 6, 6, 2
	for i := range 10 {
		n := 1
		switch {
		case i < 2:
			n = 4
		case i < 6:
			n = 3
		}
		evs = append(evs, walk(fmt.Sprintf("P%02d", i), n, t0+int64(i)*hour)...)
	}
	db := fixture(t, evs...)
	return db, mkFunnel(t, db, 7*day)
}

func TestFunnelOneMeaningOfLeftAfter(t *testing.T) {
	db, id := funnelFixture(t)
	r, err := FunnelReport(db, thirtyDays(), id)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct{ reached, left int }{{10, 4}, {6, 0}, {6, 4}, {2, 0}}
	for i, w := range want {
		if r.Steps[i].Reached != w.reached || r.Steps[i].LeftAfter != w.left {
			t.Fatalf("step %d: %+v", i, r.Steps[i])
		}
	}
	if r.Started != 10 || r.BiggestDrop == nil || *r.BiggestDrop != (FunnelDrop{After: 1, People: 4}) {
		t.Fatalf("biggest %+v", r.BiggestDrop)
	}
	if r.Steps[0].MedianMsFromPrev != nil || r.Steps[1].MedianMsFromPrev == nil || *r.Steps[1].MedianMsFromPrev != minute {
		t.Fatalf("median %+v", r.Steps)
	}
	if r.Steps[3].FromStart != 0.2 || r.Steps[2].FromPrev != 1 || r.Steps[1].FromPrev != 0.6 || r.Funnel.Name != "Docs to signup" {
		t.Fatalf("rates %+v", r.Steps)
	}
}

func TestFunnelWindowExpires(t *testing.T) {
	db := fixture(t,
		landing("A", "a1", "/docs", "", t0), pv("A", "a2", "/pricing", t0+2*hour), // too late for a 1 h window
		landing("B", "b1", "/docs", "", t0), pv("B", "b1", "/pricing", t0+30*minute),
	)
	id := mkFunnel(t, db, hour)
	r, err := FunnelReport(db, thirtyDays(), id)
	if err != nil {
		t.Fatal(err)
	}
	if r.Steps[0].Reached != 2 || r.Steps[1].Reached != 1 {
		t.Fatalf("got %+v", r.Steps)
	}
}

func TestFunnelOutOfOrderDoesNotCount(t *testing.T) {
	db := fixture(t,
		pv("A", "a1", "/pricing", t0), landing("A", "a1", "/docs", "", t0+minute), pv("A", "a1", "/signup", t0+2*minute),
	)
	id := mkFunnel(t, db, day)
	r, err := FunnelReport(db, thirtyDays(), id)
	if err != nil {
		t.Fatal(err)
	}
	if r.Steps[0].Reached != 1 || r.Steps[1].Reached != 0 || r.Steps[2].Reached != 0 {
		t.Fatalf("got %+v", r.Steps)
	}
}

func TestDropoffAllPeopleNewestFirst(t *testing.T) {
	db, id := funnelFixture(t)
	p := thirtyDays()
	r, err := FunnelReport(db, p, id)
	if err != nil {
		t.Fatal(err)
	}
	people, total, err := FunnelDropoff(db, p, id, 1)
	if err != nil {
		t.Fatal(err)
	}
	if total != r.Steps[0].LeftAfter || len(people) != total {
		t.Fatalf("total %d people %+v", total, people)
	}
	for i, d := range people {
		if d.LastVisit < p.From || d.LastVisit > p.To || (i > 0 && d.LastVisit > people[i-1].LastVisit) {
			t.Fatalf("order %+v", people)
		}
		if d.ExitPage != "/docs/start" || d.Source != "Google" || d.Label == "" {
			t.Fatalf("row %+v", d)
		}
	}
	p.Limit, p.Offset = 3, 2
	page, total, err := FunnelDropoff(db, p, id, 1)
	if err != nil || total != 4 || len(page) != 2 || page[0] != people[2] {
		t.Fatalf("paged %+v %d %v", page, total, err)
	}
	last, total, err := FunnelDropoff(db, p, id, 4)
	if err != nil || total != 0 || last == nil {
		t.Fatalf("last step %+v %d %v", last, total, err)
	}
}

func TestFunnelStepOutOfRange(t *testing.T) {
	db, id := funnelFixture(t)
	for _, step := range []int{0, 9} {
		if _, _, err := FunnelDropoff(db, thirtyDays(), id, step); !errors.Is(err, ErrBadRequest) {
			t.Fatalf("step %d: %v", step, err)
		}
	}
}

func TestFunnelUnknown(t *testing.T) {
	db := fixture(t)
	if _, err := FunnelReport(db, thirtyDays(), 7); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	if _, _, err := FunnelDropoff(db, thirtyDays(), 7, 1); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

func TestFunnelEmpty(t *testing.T) {
	db := fixture(t)
	id := mkFunnel(t, db, day)
	r, err := FunnelReport(db, thirtyDays(), id)
	if err != nil || r.Started != 0 || r.BiggestDrop != nil || len(r.Steps) != 4 || r.Steps[1].FromPrev != 0 {
		t.Fatalf("got %+v %v", r, err)
	}
}
