package meta

import (
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"trail/internal/store"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st.DB()
}

func TestNotesCRUDAndRange(t *testing.T) {
	db := openDB(t)
	for i, ts := range []int64{100, 200, 300} {
		n, err := AddNote(db, Note{Site: "s", TS: ts, Label: " Deploy " + string(rune('A'+i)) + " ", Kind: "deploy"})
		if err != nil || n.ID == 0 || n.Label != "Deploy "+string(rune('A'+i)) {
			t.Fatalf("add: %+v %v", n, err)
		}
	}
	if _, err := AddNote(db, Note{Site: "other", TS: 150, Label: "x"}); err != nil {
		t.Fatal(err)
	}
	got, err := ListNotes(db, "s", 150, 300)
	if err != nil || len(got) != 2 || got[0].TS != 200 || got[1].TS != 300 {
		t.Fatalf("range: %+v %v", got, err)
	}
	if got, _ := ListNotes(db, "none", 0, 1000); got == nil || len(got) != 0 {
		t.Fatalf("empty list must be [] not nil: %#v", got)
	}
	for _, bad := range []Note{
		{Site: "s", TS: 1, Label: ""},
		{Site: "s", TS: 1, Label: strings.Repeat("x", 81)},
		{Site: "s", TS: 1, Label: "x", Kind: "nope"},
		{Site: "s", TS: 0, Label: "x"},
	} {
		if _, err := AddNote(db, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: %v, want ErrInvalid", bad, err)
		}
	}
	if err := DeleteNote(db, "other", got[0].ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete another site's note: %v", err)
	}
	if err := DeleteNote(db, "s", got[0].ID); err != nil {
		t.Errorf("delete: %v", err)
	}
}

func TestViewsRejectsHugeState(t *testing.T) {
	db := openDB(t)
	site := "s"
	v, err := AddView(db, SavedView{Name: "Mobile India", Site: &site, State: "?range=30d&f=country:IN"})
	if err != nil || v.ID == 0 || v.State != "range=30d&f=country:IN" {
		t.Fatalf("add: %+v %v", v, err)
	}
	for _, bad := range []SavedView{
		{Name: "big", State: "a=" + strings.Repeat("x", 2048)},
		{Name: "", State: "a=1"},
		{Name: strings.Repeat("n", 61), State: "a=1"},
		{Name: "bad", State: "a=%zz"},
	} {
		if _, err := AddView(db, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("%q: %v, want ErrInvalid", bad.Name, err)
		}
	}
	for i := range maxViews - 1 {
		if _, err := AddView(db, SavedView{Name: "v" + string(rune('a'+i%26)), State: ""}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := AddView(db, SavedView{Name: "one too many"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("view 51: %v", err)
	}
	list, _ := ListViews(db)
	if len(list) != maxViews || list[0].Site == nil || *list[0].Site != "s" || list[1].Site != nil {
		t.Fatalf("list: %d %+v", len(list), list[:2])
	}
	if err := DeleteView(db, list[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := DeleteView(db, list[0].ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice: %v", err)
	}
}
