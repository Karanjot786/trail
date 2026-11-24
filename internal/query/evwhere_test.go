package query

import (
	"strings"
	"testing"
	"time"
)

// The event dimension's session subquery must carry name<>”: the partial index events_site_name_ts
// only serves a query whose WHERE implies it.
func TestEvWhereEventDimNamesNonEmpty(t *testing.T) {
	where, _, err := evWhere(Params{Site: "s", Filters: map[string]string{"event": "Signup"}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(where, "name<>''") {
		t.Errorf("event-dim SQL lacks name<>'': %s", where)
	}
}

// A folded pageview stays active through its dwell, found by the lookback read: only the ones whose
// dwell reaches into the last five minutes count, with or without a page filter.
func TestLookbackActiveThroughDwell(t *testing.T) {
	now := t0
	db := fixture(t,
		pv("in", "s1", "/a", now-30*minute),  // dwell to now-2min: active
		pv("out", "s2", "/a", now-30*minute), // dwell to now-6min: not
		pv("old", "s3", "/b", now-26*hour),   // dwell 30 h, started past the lookback: not
		pv("live", "s4", "/b", now-2*minute), // plain row in the window
		pv("later", "s5", "/a", now+10*minute) /* after now */)
	set := func(anon string, dwell int64) {
		if _, err := db.Exec(`UPDATE events SET engaged_ms=1000, dwell_ms=? WHERE anon_id=?`, dwell, anon); err != nil {
			t.Fatal(err)
		}
	}
	set("in", 28*minute)
	set("out", 24*minute)
	set("old", 30*hour)
	set("later", 20*minute)
	p := params(now-day, now)
	p.Now = time.UnixMilli(now)
	if n, err := activeNow(db, p); err != nil || n != 2 {
		t.Errorf("activeNow %d %v, want 2 (in, live)", n, err)
	}
	p.Filters = map[string]string{"path": "/a"}
	if n, err := activeNow(db, p); err != nil || n != 1 {
		t.Errorf("activeNow on /a %d %v, want 1 (in)", n, err)
	}
	lv, err := Live(db, p)
	if err != nil || lv.Active != 1 || len(lv.Pages) != 1 || lv.Pages[0].Key != "/a" {
		t.Errorf("live on /a %+v %v, want 1 active on /a", lv, err)
	}
}
