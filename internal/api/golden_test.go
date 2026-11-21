package api_test

import (
	"bytes"
	"encoding/json"
	"flag"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/api"
	"trail/internal/meta"
	"trail/internal/seed"
	"trail/internal/sites"
	"trail/internal/store"
)

var update = flag.Bool("update", false, "rewrite testdata/contract/*.json")

const contractDir = "../../testdata/contract"

// goldenRoutes is one request per read route of plan §0.4 (file name → URL).
var goldenRoutes = map[string]string{
	"sites":             "/api/sites",
	"sites-summary":     "/api/sites/summary?site=all&range=30d",
	"site-status":       "/api/sites/demo/status",
	"stats":             "/api/stats?site=demo&range=30d",
	"series":            "/api/series?site=demo&range=30d&metric=visitors&extras=1",
	"series-today":      "/api/series?site=demo&range=today&metric=pageviews",
	"breakdown":         "/api/breakdown?site=demo&range=30d&dim=source&limit=5",
	"changes":           "/api/changes?site=demo&range=30d",
	"heatmap":           "/api/heatmap?site=demo&range=30d",
	"live":              "/api/live?site=demo&limit=5",
	"visitors":          "/api/visitors?site=demo&range=30d&limit=3",
	"sessions":          "/api/sessions?site=demo&range=30d&limit=3",
	"journey":           "/api/journey?site=demo&range=30d&person=9c3902d15103a5023d1417951c078a8b", // an AI agent verified by IP list
	"campaigns":         "/api/campaigns?site=demo&range=30d",
	"ai-referrals":      "/api/ai-referrals?site=demo&range=30d",
	"events":            "/api/events?site=demo&range=30d",
	"event-detail":      "/api/events/detail?site=demo&range=30d&name=Signup",
	"goals":             "/api/goals?site=demo",
	"goals-report":      "/api/goals/report?site=demo&range=30d",
	"goal-detail":       "/api/goals/1/detail?site=demo&range=30d",
	"paths":             "/api/paths?site=demo&range=30d&goal=1",
	"funnels":           "/api/funnels?site=demo",
	"funnel-report":     "/api/funnels/1/report?site=demo&range=30d",
	"funnel-dropoff":    "/api/funnels/1/dropoff?site=demo&range=30d&step=1&limit=3",
	"revenue":           "/api/revenue?site=demo&range=30d",
	"revenue-breakdown": "/api/revenue/breakdown?site=demo&range=30d&dim=source",
	"crawlers":          "/api/crawlers?site=demo&range=30d",
	"notes":             "/api/notes?site=demo&range=30d",
	"views":             "/api/views",
	"whoami":            "/api/whoami",
}

// goldenServer seeds a fixed store (seed 42, clock pinned at 2026-11-20 10:05 IST).
func goldenServer(t *testing.T) http.Handler {
	t.Helper()
	ist, _ := time.LoadLocation("Asia/Kolkata")
	now := time.Date(2026, 11, 20, 10, 5, 0, 0, ist)
	st, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	rng := rand.New(rand.NewPCG(42, 42))
	specs := []seed.SiteSpec{{ID: "demo", Revenue: true, Crawlers: true}, {ID: "docs"}}
	if err := seed.Seed(st, specs, 60, 600, now, rng); err != nil {
		t.Fatal(err)
	}
	db := st.DB()
	reg, err := sites.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	for id, d := range map[string]string{"demo": "demo.trail.dev", "docs": "docs.trail.dev"} {
		if _, err := reg.Add(sites.Site{ID: id, Domain: d}); err != nil {
			t.Fatal(err)
		}
	}
	site := "demo"
	if _, err := meta.AddView(db, meta.SavedView{Name: "Mobile", Site: &site, State: "range=30d&f=device:mobile"}); err != nil {
		t.Fatal(err)
	}
	// Created timestamps come from the wall clock; pin them so the goldens are stable.
	for _, q := range []string{`UPDATE sites SET created=1700000000000`, `UPDATE funnels SET created=1700000000000`,
		`UPDATE views SET created=1700000000000`} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if reg, err = sites.Open(db); err != nil {
		t.Fatal(err)
	}
	return api.New(db, reg, ist, api.WithClock(func() time.Time { return now }))
}

func TestGoldenFilesCurrent(t *testing.T) {
	h := goldenServer(t)
	if *update {
		if err := os.MkdirAll(contractDir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for name, url := range goldenRoutes {
		w := httptest.NewRecorder()
		sep := "?"
		if strings.Contains(url, "?") {
			sep = "&"
		}
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url+sep+"tz=Asia/Kolkata", nil))
		if w.Code != 200 {
			t.Errorf("%s: %d %s", url, w.Code, w.Body)
			continue
		}
		var pretty bytes.Buffer
		if err := json.Indent(&pretty, bytes.TrimSpace(w.Body.Bytes()), "", "  "); err != nil {
			t.Fatal(err)
		}
		pretty.WriteByte('\n')
		path := filepath.Join(contractDir, name+".json")
		if *update {
			if err := os.WriteFile(path, pretty.Bytes(), 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		old, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("%s: %v (run go test ./internal/api -run Golden -update)", path, err)
			continue
		}
		if !bytes.Equal(old, pretty.Bytes()) {
			t.Errorf("%s differs from %s (run go test ./internal/api -run Golden -update)", url, path)
		}
	}
}
