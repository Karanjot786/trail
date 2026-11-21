package api

import (
	"net/http"
	"testing"
	"time"

	"trail/internal/agents"
)

type fakeAgents struct{ noAgents }

func (fakeAgents) Status() []agents.ListStatus { return []agents.ListStatus{{Name: "x", Kind: "ip"}} }

func TestAgentHooksDefaultAndOption(t *testing.T) {
	s := newServer(nil, nil, time.UTC)
	if s.agents == nil {
		t.Fatal("newServer left agents nil")
	}
	if st := s.agents.Status(); st == nil || len(st) != 0 {
		t.Errorf("no-op Status = %#v, want empty non-nil", st)
	}
	if s.agents.VerifyCrawler("GPTBot", "1.2.3.4") {
		t.Error("no-op VerifyCrawler = true")
	}
	if r := s.agents.RelaySigned("s", "1.2.3.4", "ua", agents.Signed{}, nil); r != (agents.Result{}) {
		t.Errorf("no-op RelaySigned = %+v", r)
	}
	s = newServer(nil, nil, time.UTC, WithAgents(fakeAgents{}))
	if len(s.agents.Status()) != 1 {
		t.Error("WithAgents did not set the hooks")
	}
}

// TestAIRoutesRegistered: the §0.5 routes exist from P0 on and answer 501 until B-api lands them.
func TestAIRoutesRegistered(t *testing.T) {
	h := setup(t)
	for _, url := range []string{"/api/ai-visibility?" + rng(), "/api/agents?" + rng(), "/api/ai-setup?site=s"} {
		if w := get(h, url); w.Code != http.StatusNotImplemented {
			t.Errorf("%s = %d %s, want 501", url, w.Code, w.Body)
		}
	}
	if w := get(h, "/api/ai-setup?site=nope"); w.Code != http.StatusBadRequest {
		t.Errorf("unknown site = %d, want 400", w.Code)
	}
}
