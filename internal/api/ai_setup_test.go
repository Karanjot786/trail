package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trail/internal/agents"
	"trail/internal/auth"
	"trail/internal/query"
)

// listsHook reports fixed list status, as the agent directory does when it is offline.
type listsHook struct {
	noAgents
	lists []agents.ListStatus
}

func (h listsHook) Status() []agents.ListStatus { return h.lists }

func TestAISetupListsOffline(t *testing.T) {
	s := testServer(t, WithAgents(listsHook{lists: []agents.ListStatus{
		{Name: "google-agents", Kind: "ip", FetchedAt: 0, Entries: 0, OK: false},
		{Name: "openai-keys", Kind: "keys", FetchedAt: 1_700_000_000_000, Entries: 2, OK: true},
	}}))
	w := get(s.routes(), "/api/ai-setup?site=s")
	if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body.String())
	}
	var r query.AISetup
	decodeStrict(t, w.Body.Bytes(), &r)
	if len(r.Lists) != 2 || r.Lists[0].OK || r.Lists[0].FetchedAt != nil || r.Lists[0].Kind != "ip" ||
		r.Lists[1].FetchedAt == nil || *r.Lists[1].FetchedAt != 1_700_000_000_000 || r.Lists[1].Entries != 2 {
		t.Fatalf("lists %+v", r.Lists)
	}
	if r.Crawls.State != "none" {
		t.Fatalf("crawls %+v", r.Crawls)
	}
	// The no-op directory gives an empty list, never null.
	w = get(testServer(t).routes(), "/api/ai-setup?site=s")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"lists":[]`) {
		t.Fatalf("no-op: %d %s", w.Code, w.Body.String())
	}
}

func TestAISetupTokenSiteScope(t *testing.T) {
	h := testServer(t).routes()
	r := httptest.NewRequest(http.MethodGet, "/api/ai-setup?site=s", nil)
	r = r.WithContext(auth.WithToken(r.Context(), auth.Token{ID: "t", Scope: "read", Site: "b"}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("other site's token: %d", w.Code)
	}
	if w := get(h, "/api/ai-setup?site=nope"); w.Code != http.StatusBadRequest {
		t.Fatalf("unknown site: %d", w.Code)
	}
}
