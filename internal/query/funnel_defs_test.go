package query

import (
	"errors"
	"path/filepath"
	"testing"

	"trail/internal/store"
)

func TestFunnelDefsCRUD(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "f.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	db := st.DB()
	day := int64(86400000)
	steps := []FunnelStep{{Kind: "page", Match: "/pricing"}, {Kind: "event", Match: "Signup", Label: "Signed up"}}
	f, err := CreateFunnel(db, "s", Funnel{Name: " Trial ", WindowMs: day, Steps: steps})
	if err != nil || f.ID == 0 || f.Name != "Trial" || f.Steps[0].Label != "/pricing" || f.Created == 0 {
		t.Fatalf("create: %+v %v", f, err)
	}
	if _, err := CreateFunnel(db, "s", Funnel{Name: "Trial", WindowMs: day, Steps: steps}); !errors.Is(err, ErrBadFunnel) {
		t.Errorf("duplicate name: %v", err)
	}
	for _, bad := range []Funnel{
		{Name: "one", WindowMs: day, Steps: steps[:1]},
		{Name: "nine", WindowMs: day, Steps: make([]FunnelStep, 9)},
		{Name: "win", WindowMs: 5, Steps: steps},
		{Name: "", WindowMs: day, Steps: steps},
		{Name: "kind", WindowMs: day, Steps: []FunnelStep{{Kind: "x", Match: "a"}, {Kind: "page", Match: "b"}}},
		{Name: "match", WindowMs: day, Steps: []FunnelStep{{Kind: "page", Match: ""}, {Kind: "page", Match: "b"}}},
	} {
		if _, err := CreateFunnel(db, "s", bad); !errors.Is(err, ErrBadFunnel) {
			t.Errorf("%q: %v, want ErrBadFunnel", bad.Name, err)
		}
	}
	f.Name, f.WindowMs = "Trial 2", 7*day
	if g, err := UpdateFunnel(db, "s", f); err != nil || g.Name != "Trial 2" || g.WindowMs != 7*day {
		t.Fatalf("update: %+v %v", g, err)
	}
	if _, err := UpdateFunnel(db, "other", f); !errors.Is(err, ErrNotFound) {
		t.Errorf("update other site: %v", err)
	}
	if _, err := GetFunnel(db, "other", f.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("get other site: %v", err)
	}
	list, err := ListFunnels(db, "s")
	if err != nil || len(list) != 1 || len(list[0].Steps) != 2 {
		t.Fatalf("list: %+v %v", list, err)
	}
	if l, _ := ListFunnels(db, "none"); l == nil {
		t.Error("empty list is nil")
	}
	if err := DeleteFunnel(db, "s", f.ID); err != nil {
		t.Fatal(err)
	}
	if err := DeleteFunnel(db, "s", f.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete twice: %v", err)
	}
}

func TestUpdateGoal(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	db := st.DB()
	a, _ := CreateGoal(db, "s", Goal{Name: "A", Kind: "page", Match: "/a"})
	if _, err := CreateGoal(db, "s", Goal{Name: "B", Kind: "page", Match: "/b"}); err != nil {
		t.Fatal(err)
	}
	a.Name, a.Match = "A2", "/a2"
	if g, err := UpdateGoal(db, "s", a); err != nil || g.Name != "A2" {
		t.Fatalf("update: %+v %v", g, err)
	}
	a.Name = "B"
	if _, err := UpdateGoal(db, "s", a); !errors.Is(err, ErrBadGoal) {
		t.Errorf("rename onto B: %v", err)
	}
	a.Name = "C"
	if _, err := UpdateGoal(db, "x", a); !errors.Is(err, ErrGoalNotFound) {
		t.Errorf("other site: %v", err)
	}
}
