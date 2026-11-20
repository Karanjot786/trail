package demo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/store"
)

var ist, _ = time.LoadLocation("Asia/Kolkata")

func clock(t time.Time) (func() time.Time, func(time.Duration)) {
	return func() time.Time { return t }, func(d time.Duration) { t = t.Add(d) }
}

func mustNew(t *testing.T, now func() time.Time) *demo {
	t.Helper()
	d, err := newDemo(ist, now)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func do(h http.Handler, method, url string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(method, url, nil))
	return w
}

func rng(now time.Time, days int) string {
	return fmt.Sprintf("from=%d&to=%d", now.Add(-time.Duration(days)*24*time.Hour).UnixMilli(), now.UnixMilli())
}

var t0 = time.Date(2026, 11, 20, 15, 30, 0, 0, ist)

func TestDemoGetStats(t *testing.T) {
	now, _ := clock(t0)
	d := mustNew(t, now)
	w := do(d, http.MethodGet, "/api/demo/stats?site=demo&"+rng(t0, 30))
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var s struct{ Visitors, Pageviews int }
	if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s.Visitors == 0 || s.Pageviews == 0 {
		t.Fatalf("empty demo: %+v", s)
	}
}

func TestDemoDefaultsToDemoSite(t *testing.T) {
	now, _ := clock(t0)
	d := mustNew(t, now)
	if w := do(d, http.MethodGet, "/api/demo/stats?"+rng(t0, 30)); w.Code != 200 {
		t.Fatalf("no site param: %d %s", w.Code, w.Body)
	}
}

func TestDemoNonGetIs403(t *testing.T) {
	now, _ := clock(t0)
	d := mustNew(t, now)
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodHead, http.MethodOptions} {
		for _, u := range []string{"/api/demo/goals", "/api/demo/goals/1?site=demo", "/api/demo/stats?site=demo", "/api/demo/nothing"} {
			w := do(d, m, u)
			if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "demo is read-only") {
				t.Errorf("%s %s: %d %q, want 403 demo is read-only", m, u, w.Code, w.Body)
			}
		}
	}
	// a rejected write must not have changed anything
	var n int
	if err := d.cur().st.DB().QueryRow(`SELECT count(*) FROM goals`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("goals = %d, %v", n, err)
	}
}

func TestDemoOnlyDemoSite(t *testing.T) {
	now, _ := clock(t0)
	d := mustNew(t, now)
	for _, site := range []string{"other", "demo2", "Demo"} {
		if w := do(d, http.MethodGet, "/api/demo/stats?site="+site+"&"+rng(t0, 7)); w.Code != http.StatusBadRequest {
			t.Errorf("site=%s: %d, want 400", site, w.Code)
		}
	}
}

func TestDemoRoutesAreAllowlisted(t *testing.T) {
	now, _ := clock(t0)
	d := mustNew(t, now)
	for _, p := range []string{"stats", "series?metric=visitors", "breakdown?dim=path", "visitors", "journey?person=x",
		"goals", "goals/report", "delivery"} {
		sep := "?"
		if strings.Contains(p, "?") {
			sep = "&"
		}
		if w := do(d, http.MethodGet, "/api/demo/"+p+sep+"site=demo&"+rng(t0, 30)); w.Code != 200 {
			t.Errorf("%s: %d %s", p, w.Code, w.Body)
		}
	}
	for _, p := range []string{"/api/demo/sites", "/api/demo/login", "/api/demo/", "/api/demo/../login", "/api/demo/goals/1",
		"/api/stats", "/api/login", "/", "/api/demo/stats/extra"} {
		if w := do(d, http.MethodGet, p+"?site=demo"); w.Code != http.StatusNotFound {
			t.Errorf("GET %s: %d, want 404", p, w.Code)
		}
	}
}

func TestDemoDeterministic(t *testing.T) {
	now, _ := clock(t0)
	a, b := mustNew(t, now), mustNew(t, now)
	u := "/api/demo/breakdown?dim=path&site=demo&" + rng(t0, 30)
	wa, wb := do(a, http.MethodGet, u), do(b, http.MethodGet, u)
	if wa.Code != 200 || wa.Body.String() != wb.Body.String() {
		t.Fatalf("builds differ:\n%s\n%s", wa.Body, wb.Body)
	}
	s := "/api/demo/series?metric=pageviews&site=demo&" + rng(t0, 30)
	if do(a, http.MethodGet, s).Body.String() != do(b, http.MethodGet, s).Body.String() {
		t.Fatal("series differ")
	}
}

func maxTS(t *testing.T, d *demo) int64 {
	t.Helper()
	var ts int64
	if err := d.cur().st.DB().QueryRow(`SELECT max(ts) FROM events`).Scan(&ts); err != nil {
		t.Fatal(err)
	}
	return ts
}

func TestDemoReseedsDaily(t *testing.T) {
	now, advance := clock(t0)
	d := mustNew(t, now)
	day := int64(24 * time.Hour / time.Millisecond)
	before := maxTS(t, d)
	advance(48 * time.Hour)
	if got := maxTS(t, d); got != before {
		t.Fatal("data changed without a reseed")
	}
	if err := d.reseed(); err != nil {
		t.Fatal(err)
	}
	after := maxTS(t, d)
	if after <= before {
		t.Fatalf("not reseeded: %d <= %d", after, before)
	}
	if diff := after - now().UnixMilli(); diff > day || diff < -day {
		t.Fatalf("max ts is %d ms from now, want within one day", diff)
	}
	if w := do(d, http.MethodGet, "/api/demo/stats?site=demo&"+rng(now(), 30)); w.Code != 200 {
		t.Fatalf("after reseed: %d", w.Code)
	}
}

func TestDemoHasGoals(t *testing.T) {
	now, _ := clock(t0)
	d := mustNew(t, now)
	w := do(d, http.MethodGet, "/api/demo/goals?site=demo")
	var gs []struct{ Name, Kind, Match string }
	if err := json.Unmarshal(w.Body.Bytes(), &gs); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"Signup": "event", "/pricing": "page"}
	if len(gs) != 2 {
		t.Fatalf("goals = %+v", gs)
	}
	for _, g := range gs {
		if want[g.Match] != g.Kind {
			t.Errorf("unexpected goal %+v", g)
		}
	}
	var rows []struct {
		Visitors int
		Rate     float64
	}
	if err := json.Unmarshal(do(d, http.MethodGet, "/api/demo/goals/report?site=demo&"+rng(t0, 30)).Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Visitors == 0 {
			t.Errorf("goal with no conversions in demo data: %+v", rows)
		}
	}
}

// The demo is a security boundary: even when a real database holds a site with the
// same name, the demo never reads it, and demo requests never write to it.
func TestDemoIsolatedFromRealDB(t *testing.T) {
	real, err := store.Open(filepath.Join(t.TempDir(), "real.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = real.Close() })
	now := t0.UnixMilli()
	real.Enqueue(store.Event{SiteID: "demo", Type: "pageview", AnonID: "R", SessionID: "r", Path: "/REAL-ONLY-SECRET", TS: now - 1000, Env: "production"})
	real.Enqueue(store.Event{SiteID: "private", Type: "pageview", AnonID: "P", SessionID: "p", Path: "/private-site", TS: now - 1000, Env: "production"})
	if err := real.Flush(); err != nil {
		t.Fatal(err)
	}

	clk, _ := clock(t0)
	d := mustNew(t, clk)
	for _, u := range []string{
		"/api/demo/breakdown?dim=path&limit=1000&site=demo&env=all&" + rng(t0, 400),
		"/api/demo/visitors?limit=1000&env=all&" + rng(t0, 400),
		"/api/demo/stats?site=private&env=all&" + rng(t0, 7),
	} {
		w := do(d, http.MethodGet, u)
		if strings.Contains(w.Body.String(), "REAL-ONLY-SECRET") || strings.Contains(w.Body.String(), "private-site") || strings.Contains(w.Body.String(), `"R"`) {
			t.Errorf("%s leaked real data: %s", u, w.Body)
		}
	}
	do(d, http.MethodPost, "/api/demo/goals")
	var n int
	if err := real.DB().QueryRow(`SELECT count(*) FROM goals`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("real goals = %d, %v", n, err)
	}
}

func TestNewServesHandler(t *testing.T) {
	now, _ := clock(t0)
	h, err := New(ist, now)
	if err != nil {
		t.Fatal(err)
	}
	if w := do(h, http.MethodGet, "/api/demo/stats?site=demo&"+rng(t0, 30)); w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	if w := do(h, http.MethodPost, "/api/demo/goals"); w.Code != http.StatusForbidden {
		t.Fatalf("post: %d", w.Code)
	}
}
