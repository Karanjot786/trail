package demo

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"trail/internal/query"
)

// aiPlan is smallPlan plus the AI agents plan's actor=all combo and agent journeys.
func aiPlan(t *testing.T) Plan {
	t.Helper()
	p := smallPlan(t)
	p.Sites = []string{"demo", "docs"}
	p.Ranges = []string{"30d"}
	var c = p.Combos[0]
	c.Ranges = json.RawMessage(`["30d"]`)
	c.Cmp, c.Filters, c.Params, c.Routes = "prev", nil, map[string]string{"actor": "all"}, []string{"/stats", "/series", "/breakdown"}
	p.Combos = append(p.Combos, c)
	p.Routes.PerCombo = []string{"/stats", "/series", "/breakdown", "/visitors", "/ai-visibility", "/agents"}
	p.Routes.Static = append(p.Routes.Static, "/ai-setup")
	p.BreakdownDims = []string{"path"}
	p.Details.Journeys.LatestPeople = 1
	p.Details.Journeys.AgentPeople = 10
	return p
}

func TestRecordActorCombo(t *testing.T) {
	man, err := record(context.Background(), sharedDemo(t), aiPlan(t), t.TempDir(), recNow, ist)
	if err != nil {
		t.Fatal(err)
	}
	routes := map[string]int{}
	for k := range man.Keys {
		if !strings.Contains(k, "actor=all") {
			continue
		}
		path, q, _ := strings.Cut(k, "?")
		routes[path]++
		if !strings.Contains(q, "range=30d") || !strings.Contains(q, "cmp=prev") {
			t.Errorf("actor key outside 30d/prev: %s", k)
		}
	}
	if len(routes) != 3 || routes["/stats"] != 2 || routes["/series"] == 0 || routes["/breakdown"] == 0 {
		t.Fatalf("actor=all keys by route %v", routes)
	}
	for _, key := range []string{"/ai-setup?site=demo", "/ai-setup?site=docs",
		"/ai-visibility?cmp=prev&env=production&range=30d&site=demo", "/agents?cmp=prev&env=production&range=30d&site=docs"} {
		if _, ok := man.Keys[key]; !ok {
			t.Errorf("missing %s", key)
		}
	}
}

func TestRecordAgentJourneys(t *testing.T) {
	out := t.TempDir()
	man, err := record(context.Background(), sharedDemo(t), aiPlan(t), out, recNow, ist)
	if err != nil {
		t.Fatal(err)
	}
	w := do(sharedDemo(t), http.MethodGet, "/api/demo/agents?site=demo&range=30d&tz=Asia/Kolkata")
	var ag query.AgentsResult
	if err := json.Unmarshal(w.Body.Bytes(), &ag); err != nil || len(ag.Latest) < 10 {
		t.Fatalf("agents: %v %d", err, len(ag.Latest))
	}
	n := 0
	for _, s := range ag.Latest[:10] {
		if _, ok := man.Keys["/journey?cmp=prev&env=production&person="+s.Person+"&range=30d&site=demo"]; ok {
			n++
		}
	}
	if n != 10 {
		t.Fatalf("%d of the 10 newest agent people have a recorded journey", n)
	}
}

func TestDemoAllowsAIRoutes(t *testing.T) {
	d := sharedDemo(t)
	for _, u := range []string{"/api/demo/ai-visibility?site=demo&range=30d", "/api/demo/agents?site=demo&range=30d",
		"/api/demo/ai-setup?site=demo", "/api/demo/ai-setup?site=docs", "/api/demo/stats?site=demo&range=30d&actor=all"} {
		if w := do(d, http.MethodGet, u); w.Code != http.StatusOK {
			t.Errorf("%s: %d %s", u, w.Code, w.Body)
		}
	}
	// The demo shows the setup card in both states: demo is receiving crawls, docs has none.
	var demo, docs query.AISetup
	_ = json.Unmarshal(do(d, http.MethodGet, "/api/demo/ai-setup?site=demo").Body.Bytes(), &demo)
	_ = json.Unmarshal(do(d, http.MethodGet, "/api/demo/ai-setup?site=docs").Body.Bytes(), &docs)
	if demo.Crawls.State != "receiving" || demo.Agents.Last24h == 0 || docs.Crawls.State != "none" || docs.Agents.LastAt != nil {
		t.Fatalf("setup demo %+v docs %+v", demo, docs)
	}
	var vis query.AIVisibilityResult
	_ = json.Unmarshal(do(d, http.MethodGet, "/api/demo/ai-visibility?site=demo&range=30d").Body.Bytes(), &vis)
	if len(vis.Steps) != 5 || vis.Steps[0].Value == nil || *vis.Steps[0].Value == 0 || vis.VerifiedShare == nil {
		t.Fatalf("visibility %+v", vis)
	}
}
