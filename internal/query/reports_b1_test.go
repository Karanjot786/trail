package query

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"trail/internal/store"
)

func utm(e store.Event, src, med, camp string) store.Event {
	e.UTMSource, e.UTMMedium, e.UTMCampaign = src, med, camp
	return e
}

func TestCampaignsGroupsUTM(t *testing.T) {
	db := fixture(t,
		utm(pv("A", "s1", "/", t0), "x", "social", "launch-week"), pv("A", "s1", "/docs", t0+1000),
		utm(pv("B", "s2", "/", t0), "x", "social", "launch-week"), custom("B", "s2", "Signup", t0+10),
		purchase("B", "s2", t0+20, 49, ""),
		utm(pv("C", "s3", "/", t0), "newsletter", "email", "nov-digest"),
		pv("D", "s4", "/", t0), // no campaign
	)
	goalOf(t, db, "Signup", "event", "Signup")
	rows, err := Campaigns(db, around())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("%+v", rows)
	}
	lw := rows[0]
	if lw.Campaign != "launch-week" || lw.Source != "x" || lw.Medium != "social" || lw.Visitors != 2 || lw.Sessions != 2 ||
		lw.Bounce != 0 || lw.ConvRate == nil || *lw.ConvRate != 0.5 || lw.RevenueMinor != 4900 {
		t.Fatalf("launch-week %+v", lw)
	}
	if rows[1].Campaign != "nov-digest" || rows[1].Bounce != 1 || *rows[1].ConvRate != 0 {
		t.Fatalf("nov-digest %+v", rows[1])
	}
}

func TestAIReferralsTopEntry(t *testing.T) {
	db := fixture(t,
		ref(pv("A", "s1", "/docs/a", t0), "chatgpt.com"),
		ref(pv("B", "s2", "/docs/a", t0), "chatgpt.com"),
		ref(pv("C", "s3", "/pricing", t0), "chatgpt.com"),
		ref(pv("D", "s4", "/", t0), "perplexity.ai"),
		ref(pv("E", "s5", "/", t0), "google.com"),
	)
	rows, err := AIReferrals(db, around())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Key != "ChatGPT" || rows[0].Visitors != 3 || rows[0].Sessions != 3 ||
		rows[0].TopEntry != "/docs/a" || rows[0].ConvRate != nil || rows[1].Key != "Perplexity" {
		t.Fatalf("%+v", rows)
	}
}

func TestLiveWindowAndCap(t *testing.T) {
	now := time.UnixMilli(t0)
	var evs []store.Event
	for i := 0; i < 60; i++ {
		e := pv(fmt.Sprintf("P%d", i%6), fmt.Sprintf("s%d", i%6), fmt.Sprintf("/p%d", i), t0-int64(i)*4000)
		if i%6 == 0 {
			e.RefHost = "google.com"
		}
		evs = append(evs, e)
	}
	evs = append(evs, pv("OLD", "old", "/", t0-10*minute), engage("P0", "s0", t0-1, 1000))
	db := fixture(t, evs...)
	p := around()
	p.Now = now
	l, err := Live(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if len(l.Stream) != 50 || l.StreamTotal != 60 || l.Active != 6 || l.AsOf != t0 {
		t.Fatalf("stream %d total %d active %d", len(l.Stream), l.StreamTotal, l.Active)
	}
	if l.Stream[0].TS != t0 || l.Stream[0].Path != "/p0" || l.Stream[0].Label == "" || l.Stream[0].Source != "Google" {
		t.Fatalf("newest %+v", l.Stream[0])
	}
	if len(l.Pages) != 6 || l.Pages[0].Count != 1 || len(l.Countries) != 1 || l.Countries[0] != (KeyCount{"IN", 6}) {
		t.Fatalf("pages %+v countries %+v", l.Pages, l.Countries)
	}
	if len(l.Sources) != 2 || l.Sources[0] != (KeyCount{"Direct", 5}) {
		t.Fatalf("sources %+v", l.Sources)
	}
}

// heatEvents gives n distinct people one pageview each at local (dow offset from Monday Nov 9, hour).
func heatEvents(start time.Time, cells map[[2]int]int) []store.Event {
	var evs []store.Event
	k := 0
	for c, n := range cells {
		for i := 0; i < n; i++ {
			ts := time.Date(start.Year(), start.Month(), start.Day()+c[0], c[1], 10, 0, 0, ist).UnixMilli()
			evs = append(evs, pv(fmt.Sprintf("h%d", k), fmt.Sprintf("hs%d", k), "/", ts))
			k++
		}
	}
	return evs
}

func heatParams() Params {
	p := params(at(2026, 11, 14, 0, 0), endOf(2026, 11, 20))
	p.Win = Window{Key: "7d", From: p.From, To: p.To, Bucket: "day"}
	return p
}

func TestHeatmapSparse(t *testing.T) {
	db := fixture(t, heatEvents(time.Date(2026, 11, 9, 0, 0, 0, 0, ist), map[[2]int]int{{0, 9}: 60, {1, 10}: 40})...)
	h, err := Heatmap(db, heatParams())
	if err != nil {
		t.Fatal(err)
	}
	if h.Status != "sparse" || h.Total != 100 || h.Cells[0][9] != 60 || h.Weeks != 4 || h.Threshold != 150 ||
		len(h.Cells) != 7 || len(h.Cells[6]) != 24 || h.From != at(2026, 10, 24, 0, 0) {
		t.Fatalf("%+v", h)
	}
}

func TestHeatmapClearPeak(t *testing.T) {
	db := fixture(t, heatEvents(time.Date(2026, 11, 9, 0, 0, 0, 0, ist), map[[2]int]int{{2, 14}: 100, {3, 14}: 50, {4, 9}: 40})...)
	h, err := Heatmap(db, heatParams())
	if err != nil {
		t.Fatal(err)
	}
	if h.Status != "ok" || h.Peak == nil || *h.Peak != (HeatPeak{Dow: 2, Hour: 14, Value: 100}) || !h.Clear || h.Busiest != nil || h.Max != 100 {
		t.Fatalf("%+v peak %+v", h, h.Peak)
	}
}

func TestHeatmapNoClearPeak(t *testing.T) {
	cells := map[[2]int]int{}
	for d := 0; d < 5; d++ {
		for hr := 17; hr <= 21; hr++ {
			cells[[2]int{d, hr}] = 10 + d // close values: no single clear peak
		}
	}
	db := fixture(t, heatEvents(time.Date(2026, 11, 9, 0, 0, 0, 0, ist), cells)...)
	h, err := Heatmap(db, heatParams())
	if err != nil {
		t.Fatal(err)
	}
	if h.Peak == nil || h.Clear || h.Busiest == nil {
		t.Fatalf("%+v", h)
	}
	if h.Busiest.Label != "Weekday evenings (17:00–22:00)" || h.Busiest.FromHour != 17 || h.Busiest.ToHour != 22 ||
		len(h.Busiest.Dows) != 5 {
		t.Fatalf("busiest %+v", h.Busiest)
	}
}

func TestHeatmapIgnoresOwnFilter(t *testing.T) {
	db := fixture(t, heatEvents(time.Date(2026, 11, 9, 0, 0, 0, 0, ist), map[[2]int]int{{0, 9}: 3, {1, 10}: 4})...)
	p := heatParams()
	p.Filters = map[string]string{"dow": "0", "hour": "9"}
	h, err := Heatmap(db, p)
	if err != nil || h.Total != 7 {
		t.Fatalf("%+v %v", h, err)
	}
	empty, err := Heatmap(fixture(t), heatParams())
	if err != nil || empty.Peak != nil || empty.Busiest != nil || empty.Total != 0 || empty.Status != "sparse" {
		t.Fatalf("empty %+v %v", empty, err)
	}
}

// dayVisitors gives n people a pageview on local day d at 12:00, from ref.
func dayVisitors(d time.Time, n int, refHost, tag string) []store.Event {
	var evs []store.Event
	for i := 0; i < n; i++ {
		e := pv(fmt.Sprintf("%s%d", tag, i), fmt.Sprintf("%ss%d", tag, i), "/", time.Date(d.Year(), d.Month(), d.Day(), 12, 0, 0, 0, ist).UnixMilli())
		e.RefHost = refHost
		evs = append(evs, e)
	}
	return evs
}

func TestChangesDayItemByVisitorsAdded(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, ist) }
	var evs []store.Event
	evs = append(evs, dayVisitors(day(11), 22, "", "a")...)
	evs = append(evs, dayVisitors(day(12), 22, "", "b")...)
	evs = append(evs, dayVisitors(day(12), 19, "news.ycombinator.com", "c")...) // Nov 12: 41 vs 22
	evs = append(evs, dayVisitors(day(15), 8, "", "d")...)
	evs = append(evs, dayVisitors(day(16), 15, "", "e")...) // Nov 16: 15 vs 8
	db := fixture(t, evs...)
	c, err := Changes(db, winParams(t, "30d", "none"))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Items) == 0 {
		t.Fatal("no items")
	}
	it := c.Items[0]
	if it.Kind != "day" || it.Day != "2026-11-12" || it.Cur != 41 || it.Prev != 22 || it.Added != 19 ||
		it.Source == nil || *it.Source != "Hacker News" || it.Basis != "vs Wed, Nov 11 (the day before)" {
		t.Fatalf("%+v", it)
	}
}

func TestChangesCapsAt4(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, ist) }
	var evs []store.Event
	// Previous 7 days (Nov 7–13): 10 from Google, all bounce.
	evs = append(evs, dayVisitors(day(8), 10, "google.com", "p")...)
	// Current 7 days (Nov 14–20): a spike from X, engaged and converting.
	evs = append(evs, dayVisitors(day(15), 6, "", "q")...)
	evs = append(evs, dayVisitors(day(16), 30, "x.com", "r")...)
	for i := 0; i < 10; i++ {
		evs = append(evs, custom(fmt.Sprintf("r%d", i), fmt.Sprintf("rs%d", i), "Signup", at(2026, 11, 16, 12, 1)))
	}
	db := fixture(t, evs...)
	goalOf(t, db, "Signup", "event", "Signup")
	c, err := Changes(db, winParams(t, "7d", "prev"))
	if err != nil {
		t.Fatal(err)
	}
	kinds := ""
	for _, it := range c.Items {
		kinds += it.Kind + " "
	}
	if len(c.Items) != 4 || kinds != "source day rate rate " {
		t.Fatalf("items %q %+v", kinds, c.Items)
	}
	if s := c.Items[0]; s.Key != "X" || s.Cur != 30 || s.Prev != 0 {
		t.Fatalf("source %+v", s)
	}
	for _, it := range c.Items[2:] {
		if it.Metric == "bounce" && (it.N != 10 || it.Prev != 1) {
			t.Fatalf("bounce %+v", it)
		}
	}
	b, _ := json.Marshal(c)
	if bytes.Contains(b, []byte("NaN")) {
		t.Fatal(string(b))
	}
}

func TestSitesSummary(t *testing.T) {
	now := time.UnixMilli(t0)
	evs := []store.Event{pv("A", "s1", "/", t0-minute), pv("B", "s2", "/", t0-2*day), pv("C", "s3", "/", t0-8*day)}
	other := pv("Z", "z1", "/", t0)
	other.SiteID = "o"
	db := fixture(t, append(evs, other)...)
	if _, err := db.Exec(`INSERT INTO sites(id, domain, created) VALUES('s', 's.example', 1)`); err != nil {
		t.Fatal(err)
	}
	w, _ := ResolveWindow("7d", "prev", now, ist, 0)
	p := Params{Env: "all", From: w.From, To: w.To, Win: w, TZ: ist, Now: now}
	rows, err := SitesSummary(db, p, []string{"s", "o"})
	if err != nil || len(rows) != 2 {
		t.Fatalf("%+v %v", rows, err)
	}
	s := rows[0]
	if s.ID != "s" || s.Domain != "s.example" || s.Visitors != 2 || s.PrevVisitors == nil || *s.PrevVisitors != 1 ||
		s.Online != 1 || len(s.Spark) != 7 || *s.Spark[6] != 1 || *s.Spark[4] != 1 {
		t.Fatalf("%+v", s)
	}
	if rows[1].ID != "o" || rows[1].Domain != "o" || rows[1].Visitors != 1 {
		t.Fatalf("%+v", rows[1])
	}
}

func TestExportEventsNDJSON(t *testing.T) {
	db := fixture(t, pv("A", "s1", "/", t0), purchase("A", "s1", t0+1, 19, ""))
	var buf bytes.Buffer
	if err := ExportEvents(context.Background(), db, "s", &buf); err != nil {
		t.Fatal(err)
	}
	sc := bufio.NewScanner(&buf)
	n := 0
	for sc.Scan() {
		var m map[string]any
		if err := json.Unmarshal(sc.Bytes(), &m); err != nil {
			t.Fatal(err)
		}
		if m["site_id"] != "s" || m["anon_id"] != "A" || m["ts"] == nil || (m["type"] == "pageview") != (m["country"] == "IN") {
			t.Fatalf("line %v", m)
		}
		n++
	}
	if n != 2 {
		t.Fatalf("%d lines", n)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := ExportEvents(ctx, db, "s", &buf); err == nil {
		t.Fatal("cancelled export returned nil")
	}
}
