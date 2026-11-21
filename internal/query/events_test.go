package query

import (
	"strings"
	"testing"
	"time"

	"trail/internal/store"
)

// winParams is a Params with a resolved day-bucket window [from, to] and, when prevFrom < prevTo,
// a comparison window. The clock sits at to.
func winParams(from, to, prevFrom, prevTo int64) Params {
	p := params(from, to)
	p.Win = Window{Key: "test", From: from, To: to, Bucket: "day", TZ: "Asia/Kolkata"}
	if prevFrom < prevTo {
		p.Win.PrevFrom, p.Win.PrevTo = &prevFrom, &prevTo
	}
	p.Now = time.UnixMilli(to)
	return p
}

func ev(anon, sess, name, props string, ts int64) store.Event {
	return store.Event{Type: "event", AnonID: anon, SessionID: sess, Name: name, Props: props, Path: "/", TS: ts}
}

func outbound(anon, sess, url string, ts int64) store.Event {
	return store.Event{Type: "outbound", AnonID: anon, SessionID: sess, Props: `{"url":"` + url + `"}`, Path: "/", TS: ts}
}

func TestEventCatalogueCountsAndProps(t *testing.T) {
	db := fixture(t,
		ev("A", "sa", "Signup", `{"plan":"pro"}`, t0),
		ev("A", "sa", "Signup", `{"plan":"pro"}`, t0+minute),
		ev("B", "sb", "Signup", `{"plan":"free","n":3}`, t0+2*minute),
		ev("B", "sb", "Copy Code", ``, t0+3*minute),
		pv("C", "sc", "/", t0),
	)
	rows, err := EventCatalogue(db, around())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows %+v", rows)
	}
	s := rows[0]
	if s.Name != "Signup" || s.Kind != "custom" || s.Count != 3 || s.People != 2 || s.LastSeen != t0+2*minute {
		t.Fatalf("signup %+v", s)
	}
	if len(s.Props) != 2 || s.Props[0].Key != "plan" || s.Props[0].Distinct != 2 || s.Props[0].Top[0] != "pro" {
		t.Fatalf("props %+v", s.Props)
	}
	if rows[1].Name != "Copy Code" || rows[1].Props == nil || len(rows[1].Props) != 0 {
		t.Fatalf("copy %+v", rows[1])
	}
}

func TestEventCatalogueOutboundRow(t *testing.T) {
	db := fixture(t,
		outbound("A", "sa", "https://github.com/x", t0),
		outbound("B", "sb", "https://github.com/y", t0+minute),
		outbound("B", "sb", "https://x.com/z", t0+2*minute),
		ev("A", "sa", "Signup", ``, t0),
	)
	rows, err := EventCatalogue(db, around())
	if err != nil {
		t.Fatal(err)
	}
	var o *EventRow
	for i := range rows {
		if rows[i].Name == "Outbound link" {
			o = &rows[i]
		}
	}
	if o == nil || o.Kind != "outbound" || o.Count != 3 || o.People != 2 {
		t.Fatalf("outbound %+v", rows)
	}
	if len(o.Props) != 1 || o.Props[0].Key != "host" || o.Props[0].Distinct != 2 || o.Props[0].Top[0] != "github.com" {
		t.Fatalf("host prop %+v", o.Props)
	}
	if rows[0].Name != "Outbound link" {
		t.Fatalf("sorted by count: %+v", rows)
	}
}

func TestEventDetailLatest15NewestFirst(t *testing.T) {
	var evs []store.Event
	for i := range 20 {
		evs = append(evs, ev("A", "sa", "Signup", `{"i":`+string(rune('0'+i%10))+`}`, t0+int64(i)*minute))
	}
	evs = append(evs, ev("B", "sb", "Signup", `{"plan":"pro"}`, t0-2*day)) // previous period
	db := fixture(t, evs...)
	from := t0 - 12*hour
	p := winParams(from, t0+12*hour, from-3*day, from-1)
	d, err := EventDetail(db, p, "Signup")
	if err != nil {
		t.Fatal(err)
	}
	if d.Count != 20 || d.People != 1 || d.Prev == nil || d.Prev.Count != 1 || d.Prev.People != 1 {
		t.Fatalf("counts %+v prev %+v", d, d.Prev)
	}
	if len(d.Latest) != 15 || d.Latest[0].TS != t0+19*minute || d.Latest[14].TS != t0+5*minute {
		t.Fatalf("latest %+v", d.Latest)
	}
	if d.Latest[0].Label == "" || d.Latest[0].SessionID != "sa" {
		t.Fatalf("latest row %+v", d.Latest[0])
	}
	var sum float64
	for _, pt := range d.Series {
		if pt.V != nil {
			sum += *pt.V
		}
	}
	if sum != 20 || len(d.PrevSeries) == 0 {
		t.Fatalf("series sum %v prev %d", sum, len(d.PrevSeries))
	}
	if len(d.Props) != 1 || d.Props[0].Key != "i" || len(d.Props[0].Rows) != 10 {
		t.Fatalf("props %+v", d.Props)
	}
}

func TestEventDetailUnknownName(t *testing.T) {
	db := fixture(t, ev("A", "sa", "Signup", ``, t0))
	d, err := EventDetail(db, around(), "Nope")
	if err != nil {
		t.Fatal(err)
	}
	if d.Count != 0 || d.People != 0 || d.Series == nil || d.Props == nil || d.Latest == nil || len(d.Latest) != 0 {
		t.Fatalf("got %+v", d)
	}
}

func TestEventPropsHostileKeys(t *testing.T) {
	long := strings.Repeat("x", 2048)
	db := fixture(t, ev("A", "sa", "Hostile", `{"a'b\"":"`+long+`"}`, t0))
	d, err := EventDetail(db, around(), "Hostile")
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Props) != 1 || d.Props[0].Key != `a'b"` || d.Props[0].Rows[0].Value != long {
		t.Fatalf("props %+v", d.Props)
	}
	if d.Latest[0].Props[`a'b"`] != long {
		t.Fatalf("latest props %+v", d.Latest[0].Props)
	}
	rows, err := EventCatalogue(db, around())
	if err != nil {
		t.Fatal(err)
	}
	if rows[0].Props[0].Key != `a'b"` || rows[0].Props[0].Top[0] != long {
		t.Fatalf("catalogue %+v", rows[0].Props)
	}
}

func TestEventDetailOutbound(t *testing.T) {
	db := fixture(t, outbound("A", "sa", "https://github.com/x", t0), outbound("B", "sb", "https://github.com/y", t0))
	d, err := EventDetail(db, around(), "Outbound link")
	if err != nil {
		t.Fatal(err)
	}
	if d.Count != 2 || len(d.Props) != 1 || d.Props[0].Rows[0].Value != "github.com" || d.Props[0].Rows[0].People != 2 {
		t.Fatalf("got %+v", d)
	}
	if d.Latest[0].Props["host"] != "github.com" {
		t.Fatalf("latest %+v", d.Latest[0])
	}
}

func TestBucketValuesNullFuture(t *testing.T) {
	db := fixture(t, ev("A", "sa", "Signup", ``, t0))
	from := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	p := winParams(from, from+day-1, 0, 0)
	p.Win.Bucket = "hour"
	p.Now = time.UnixMilli(t0 + 5*minute) // 10:05
	d, err := EventDetail(db, p, "Signup")
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Series) != 24 || d.Series[10].V == nil || *d.Series[10].V != 1 || d.Series[11].V != nil {
		t.Fatalf("series %+v", d.Series)
	}
	if d.Prev != nil || len(d.PrevSeries) != 0 {
		t.Fatalf("no comparison expected")
	}
}

func TestPersonLabel(t *testing.T) {
	if got := personLabel("0190a1b2-c3d4-7e5f-8a9b-cdef12345678", false); got != "Visitor 5678" {
		t.Fatal(got)
	}
	if got := personLabel("ada@example.com", true); got != "ada@example.com" {
		t.Fatal(got)
	}
}
