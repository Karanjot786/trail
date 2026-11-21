package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/query"
	"trail/internal/sites"
	"trail/internal/store"
)

// reportFixture serves site s with a few visits, a goal and a funnel.
func reportFixture(t *testing.T, paths ...string) (http.Handler, int64, int64) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "r.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	ts := time.Now().Add(-2 * time.Hour).UnixMilli()
	if len(paths) == 0 {
		paths = []string{"/", "/pricing"}
	}
	for i, p := range paths {
		st.Enqueue(store.Event{SiteID: "s", Type: "pageview", AnonID: fmt.Sprintf("a%d", i), SessionID: fmt.Sprintf("x%d", i),
			Path: p, Country: "IN", TS: ts + int64(i), Env: "production"})
	}
	st.Enqueue(store.Event{SiteID: "s", Type: "event", Name: "Signup", AnonID: "a0", SessionID: "x0", Path: "/", TS: ts + 100, Env: "production"})
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	reg, _ := sites.Open(st.DB())
	if _, err := reg.Add(sites.Site{ID: "s", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	g, err := query.CreateGoal(st.DB(), "s", query.Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	if err != nil {
		t.Fatal(err)
	}
	f, err := query.CreateFunnel(st.DB(), "s", query.Funnel{Name: "F", WindowMs: 86400000,
		Steps: []query.FunnelStep{{Kind: "page", Match: "/"}, {Kind: "event", Match: "Signup"}}})
	if err != nil {
		t.Fatal(err)
	}
	ist, _ := time.LoadLocation("Asia/Kolkata")
	return New(st.DB(), reg, ist), g.ID, f.ID
}

func TestEveryReportRouteServes(t *testing.T) {
	h, goal, funnel := reportFixture(t)
	q := "site=s&range=7d"
	for _, c := range []struct {
		url  string
		into func() any
	}{
		{"/api/stats?" + q, func() any { return &query.StatsResult{} }},
		{"/api/stats?site=all&range=7d", func() any { return &query.StatsResult{} }},
		{"/api/series?metric=visitors&extras=1&" + q, func() any { return &query.SeriesResult{} }},
		{"/api/breakdown?dim=path&" + q, func() any { return &[]query.Row{} }},
		{"/api/sites/summary?site=all&range=7d", func() any { return &[]query.SiteSummary{} }},
		{"/api/changes?" + q, func() any { return &query.ChangesResult{} }},
		{"/api/heatmap?" + q, func() any { return &query.HeatmapResult{} }},
		{"/api/live?" + q, func() any { return &query.LiveResult{} }},
		{"/api/visitors?" + q, func() any { return &[]query.Person{} }},
		{"/api/sessions?" + q, func() any { return &[]query.SessionRow{} }},
		{"/api/journey?person=a0&" + q, func() any { return &[]query.JourneySession{} }},
		{"/api/campaigns?" + q, func() any { return &[]query.Campaign{} }},
		{"/api/ai-referrals?" + q, func() any { return &[]query.AIReferral{} }},
		{"/api/events?" + q, func() any { return &[]query.EventRow{} }},
		{"/api/events/detail?name=Signup&" + q, func() any { return &query.EventDetailResult{} }},
		{"/api/goals/report?" + q, func() any { return &[]query.GoalRow{} }},
		{fmt.Sprintf("/api/goals/%d/detail?%s", goal, q), func() any { return &query.GoalDetailResult{} }},
		{fmt.Sprintf("/api/paths?goal=%d&%s", goal, q), func() any { return &query.PathsReport{} }},
		{fmt.Sprintf("/api/funnels/%d/report?%s", funnel, q), func() any { return &query.FunnelReportResult{} }},
		{fmt.Sprintf("/api/funnels/%d/dropoff?step=1&%s", funnel, q), func() any { return &[]query.DropoffPerson{} }},
		{"/api/revenue?" + q, func() any { return &query.RevenueResult{} }},
		{"/api/revenue/breakdown?dim=source&" + q, func() any { return &[]query.RevenueRow{} }},
		{"/api/crawlers?" + q, func() any { return &query.CrawlersResult{} }},
		{"/api/notes?" + q, func() any { return &[]map[string]any{} }},
		{"/api/funnels?site=s", func() any { return &[]query.Funnel{} }},
	} {
		w := get(h, c.url)
		if w.Code == http.StatusNotImplemented {
			t.Logf("%s: query not implemented yet", c.url)
			continue
		}
		if w.Code != 200 {
			t.Errorf("%s: %d %s", c.url, w.Code, w.Body)
			continue
		}
		decodeStrict(t, w.Body.Bytes(), c.into())
	}
}

func TestExportCSVNeutralisesFormulas(t *testing.T) {
	h, _, _ := reportFixture(t, "=cmd|' /C calc'!A0", "+1", "@SUM(A1)", "/ok")
	w := get(h, "/api/breakdown?dim=path&site=s&range=7d&format=csv")
	if w.Code != 200 || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body)
	}
	body := w.Body.String()
	if !strings.HasPrefix(body, "key,visitors,pageviews,total") {
		t.Errorf("header row: %q", strings.SplitN(body, "\n", 2)[0])
	}
	for _, want := range []string{`'=cmd|' /C calc'!A0`, "'+1", "'@SUM(A1)", "/ok"} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q in %s", want, body)
		}
	}
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "=") || strings.HasPrefix(line, "+") || strings.HasPrefix(line, "@") || strings.HasPrefix(line, `"=`) {
			t.Errorf("formula cell left as is: %q", line)
		}
	}
	if neutralise("-5") != "'-5" || neutralise("\tx") != "'\tx" || neutralise("ok") != "ok" || neutralise("") != "" {
		t.Error("neutralise")
	}
}

func TestExportFilename(t *testing.T) {
	h, _, _ := reportFixture(t)
	w := get(h, "/api/breakdown?dim=path&site=s&range=d:2026-11-12&format=json")
	if cd := w.Header().Get("Content-Disposition"); cd != `attachment; filename="trail-s-breakdown-2026-11-12-2026-11-12.json"` {
		t.Fatalf("disposition %q", cd)
	}
	var out map[string]json.RawMessage
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	for _, k := range []string{"site", "window", "tz", "filters", "rows"} {
		if _, ok := out[k]; !ok {
			t.Errorf("json export lacks %q: %s", k, w.Body)
		}
	}
	w = get(h, "/api/revenue/breakdown?dim=source&site=s&range=7d&format=csv")
	if w.Code == 200 && !strings.Contains(w.Header().Get("Content-Disposition"), "trail-s-revenue-breakdown-") {
		t.Errorf("nested report name: %q", w.Header().Get("Content-Disposition"))
	}
	if w := get(h, "/api/stats?site=s&format=csv"); w.Code != http.StatusBadRequest {
		t.Errorf("object export: %d", w.Code)
	}
	if w := get(h, "/api/breakdown?dim=path&site=s&format=xlsx"); w.Code != http.StatusBadRequest {
		t.Errorf("bad format: %d", w.Code)
	}
}

func TestFunnelReportUnknown404(t *testing.T) {
	h, _, funnel := reportFixture(t)
	for _, u := range []string{"/api/funnels/999/report?site=s", "/api/funnels/999/dropoff?site=s&step=1"} {
		if w := get(h, u); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", u, w.Code)
		}
	}
	if w := get(h, fmt.Sprintf("/api/funnels/%d/dropoff?site=s", funnel)); w.Code != http.StatusBadRequest {
		t.Errorf("dropoff without step: %d", w.Code)
	}
}

func TestDropoffTotalHeader(t *testing.T) {
	h, _, funnel := reportFixture(t)
	w := get(h, fmt.Sprintf("/api/funnels/%d/dropoff?site=s&step=1&range=7d", funnel))
	if w.Code == http.StatusNotImplemented {
		t.Skip("FunnelDropoff not implemented yet (B3)")
	}
	if w.Code != 200 || w.Header().Get("X-Total-Count") == "" {
		t.Fatalf("%d %v", w.Code, w.Header())
	}
	w = get(h, "/api/visitors?site=s&range=7d&limit=1")
	if w.Header().Get("X-Total-Count") != "2" {
		t.Errorf("visitors total %q", w.Header().Get("X-Total-Count"))
	}
}

func TestStatsBotRequestsNullWhenUnconfigured(t *testing.T) {
	h, _, _ := reportFixture(t)
	w := get(h, "/api/stats?site=s&range=7d")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"botRequests":null`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
