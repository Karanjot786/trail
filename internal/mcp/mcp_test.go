package mcp

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/auth"
	"trail/internal/query"
	"trail/internal/sites"
	"trail/internal/store"
)

var fixedNow = time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)

func setup(t *testing.T) (http.Handler, *sql.DB) {
	t.Helper()
	h, db, _ := setupReg(t)
	return h, db
}

func setupReg(t *testing.T) (http.Handler, *sql.DB, *sites.Registry) {
	t.Helper()
	now = func() time.Time { return fixedNow }
	t.Cleanup(func() { now = time.Now })
	st, err := store.Open(filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	ts := fixedNow.UnixMilli()
	for i, anon := range []string{"A", "B", "C"} {
		st.Enqueue(store.Event{SiteID: "s", Type: "pageview", AnonID: anon, SessionID: anon + "1", Path: "/", TS: ts - int64(i+1)*3600_000, Env: "production"})
	}
	st.Enqueue(store.Event{SiteID: "other", Type: "pageview", AnonID: "Z", SessionID: "z", Path: "/", TS: ts - 1000, Env: "production"})
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	reg, err := sites.Open(st.DB())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reg.Add(sites.Site{ID: "s", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	return New(st.DB(), reg, time.UTC), st.DB(), reg
}

func TestMCPListSitesIsLive(t *testing.T) {
	h, _, reg := setupReg(t)
	if _, err := reg.Add(sites.Site{ID: "new", Domain: "new.dev"}); err != nil {
		t.Fatal(err)
	}
	res := callTool(t, h, "list_sites", map[string]any{})
	if string(res.StructuredContent) != `[{"id":"new","domain":"new.dev"},{"id":"s","domain":"example.com"}]` {
		t.Errorf("list_sites %s", res.StructuredContent)
	}
	if res := callTool(t, h, "get_stats", map[string]any{"site": "new"}); res.IsError {
		t.Errorf("get_stats on a site added after start: %+v", res.Content)
	}
}

type rpcResp struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func rpc(t *testing.T, h http.Handler, method string, params any) (int, rpcResp) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	r := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(string(body)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Accept", "application/json, text/event-stream")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	var out rpcResp
	if w.Code == 200 {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s: decode %q: %v", method, w.Body, err)
		}
	}
	return w.Code, out
}

type toolResult struct {
	Content []struct {
		Type, Text string
	} `json:"content"`
	StructuredContent json.RawMessage `json:"structuredContent"`
	IsError           bool            `json:"isError"`
}

func callTool(t *testing.T, h http.Handler, name string, args map[string]any) toolResult {
	t.Helper()
	code, out := rpc(t, h, "tools/call", map[string]any{"name": name, "arguments": args})
	if code != 200 || out.Error != nil {
		t.Fatalf("%s: status %d err %+v", name, code, out.Error)
	}
	var res toolResult
	if err := json.Unmarshal(out.Result, &res); err != nil {
		t.Fatal(err)
	}
	return res
}

func TestMCPInitialize(t *testing.T) {
	h, _ := setup(t)
	code, out := rpc(t, h, "initialize", map[string]any{
		"protocolVersion": "2025-06-18",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "test", "version": "1"},
	})
	if code != 200 || out.Error != nil {
		t.Fatalf("status %d err %+v", code, out.Error)
	}
	var res struct {
		ProtocolVersion string                     `json:"protocolVersion"`
		Capabilities    map[string]json.RawMessage `json:"capabilities"`
		ServerInfo      struct{ Name string }      `json:"serverInfo"`
	}
	if err := json.Unmarshal(out.Result, &res); err != nil {
		t.Fatal(err)
	}
	if res.ProtocolVersion != "2025-06-18" {
		t.Errorf("protocolVersion %q, want echoed 2025-06-18", res.ProtocolVersion)
	}
	if _, ok := res.Capabilities["tools"]; !ok {
		t.Errorf("no tools capability: %s", out.Result)
	}
	if res.ServerInfo.Name != "trail" {
		t.Errorf("serverInfo %+v", res.ServerInfo)
	}
}

func TestMCPInitializedNotification202(t *testing.T) {
	h, _ := setup(t)
	r := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(`{"jsonrpc":"2.0","method":"notifications/initialized"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Accept", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
}

func TestMCPToolsList(t *testing.T) {
	h, _ := setup(t)
	code, out := rpc(t, h, "tools/list", map[string]any{})
	if code != 200 || out.Error != nil {
		t.Fatalf("status %d err %+v", code, out.Error)
	}
	var res struct {
		Tools []struct {
			Name        string          `json:"name"`
			InputSchema json.RawMessage `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(out.Result, &res); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"list_sites": true, "get_stats": true, "get_series": true, "get_breakdown": true, "list_visitors": true, "get_journey": true, "goal_report": true}
	if len(res.Tools) != len(want) {
		t.Fatalf("%d tools, want %d", len(res.Tools), len(want))
	}
	for _, tl := range res.Tools {
		if !want[tl.Name] {
			t.Errorf("unexpected tool %q", tl.Name)
		}
		if !strings.Contains(string(tl.InputSchema), `"object"`) {
			t.Errorf("%s: inputSchema %s", tl.Name, tl.InputSchema)
		}
	}
}

func TestMCPGetStats(t *testing.T) {
	h, db := setup(t)
	res := callTool(t, h, "get_stats", map[string]any{"site": "s", "range": "24h"})
	if res.IsError {
		t.Fatalf("isError: %+v", res.Content)
	}
	var got struct{ Visitors int }
	if err := json.Unmarshal(res.StructuredContent, &got); err != nil {
		t.Fatal(err)
	}
	want, err := query.Stats(db, query.Params{Site: "s", Env: "production", TZ: time.UTC,
		From: fixedNow.Add(-24 * time.Hour).UnixMilli(), To: fixedNow.UnixMilli(), Filters: map[string]string{}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Visitors != want.Visitors || got.Visitors != 3 {
		t.Fatalf("visitors %d, query.Stats %d, want 3", got.Visitors, want.Visitors)
	}
	if len(res.Content) != 1 || res.Content[0].Type != "text" || !strings.Contains(res.Content[0].Text, `"visitors":3`) {
		t.Fatalf("content %+v", res.Content)
	}
}

func TestMCPCustomRange(t *testing.T) {
	h, _ := setup(t)
	ts := fixedNow.UnixMilli()
	res := callTool(t, h, "get_stats", map[string]any{"site": "s", "range": map[string]any{"from": ts - 90*60_000, "to": ts}})
	var got struct{ Visitors int }
	_ = json.Unmarshal(res.StructuredContent, &got)
	if res.IsError || got.Visitors != 1 {
		t.Fatalf("visitors %d isError %v %+v", got.Visitors, res.IsError, res.Content)
	}
}

func TestMCPOtherTools(t *testing.T) {
	h, _ := setup(t)
	for name, args := range map[string]map[string]any{
		"list_sites":    {},
		"get_series":    {"site": "s", "metric": "visitors"},
		"get_breakdown": {"site": "s", "dim": "path", "limit": 5},
		"list_visitors": {"site": "s", "range": "30d"},
		"get_journey":   {"site": "s", "person": "A"},
	} {
		res := callTool(t, h, name, args)
		if res.IsError || len(res.StructuredContent) == 0 || string(res.StructuredContent) == "null" {
			t.Errorf("%s: isError %v structured %s content %+v", name, res.IsError, res.StructuredContent, res.Content)
		}
	}
	res := callTool(t, h, "list_sites", map[string]any{})
	if string(res.StructuredContent) != `[{"id":"s","domain":"example.com"}]` {
		t.Errorf("list_sites %s", res.StructuredContent)
	}
}

func TestMCPUnknownSiteIsError(t *testing.T) {
	h, _ := setup(t)
	// "other" has data in the DB but is not a configured site.
	for _, name := range []string{"get_stats", "get_series", "get_breakdown", "list_visitors", "get_journey", "goal_report"} {
		res := callTool(t, h, name, map[string]any{"site": "other", "metric": "visitors", "dim": "path", "person": "Z"})
		if !res.IsError || strings.Contains(string(res.StructuredContent), "visitors") {
			t.Errorf("%s: want isError, got %+v", name, res)
		}
	}
}

func TestMCPBadRange(t *testing.T) {
	h, _ := setup(t)
	ts := fixedNow.UnixMilli()
	for _, rng := range []any{"1y", "", 7, map[string]any{"from": ts, "to": ts - 1}, map[string]any{"from": 0}, map[string]any{"from": 0, "to": ts}} {
		res := callTool(t, h, "get_stats", map[string]any{"site": "s", "range": rng})
		if !res.IsError {
			t.Errorf("range %v: want isError", rng)
		}
	}
	for _, args := range []map[string]any{
		{"site": "s", "env": "staging"},
		{"site": "s", "filters": map[string]any{"password": "x"}},
	} {
		if res := callTool(t, h, "get_stats", args); !res.IsError {
			t.Errorf("%v: want isError", args)
		}
	}
	if res := callTool(t, h, "get_breakdown", map[string]any{"site": "s", "dim": "1;drop"}); !res.IsError {
		t.Error("bad dim: want isError")
	}
}

func TestMCPNeedsToken(t *testing.T) {
	h, _ := setup(t)
	a := auth.New("pw", []byte("0123456789abcdef0123456789abcdef"))
	toks, err := auth.ParseTokens("ci:read-token-aaaaaaaaaaaaaaaaaaaa:read")
	if err != nil {
		t.Fatal(err)
	}
	a.SetTokens(toks)
	guarded := a.API(h)
	if code, _ := rpc(t, guarded, "tools/list", map[string]any{}); code != http.StatusUnauthorized {
		t.Fatalf("no token: %d, want 401", code)
	}
	body := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	r := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer read-token-aaaaaaaaaaaaaaaaaaaa")
	w := httptest.NewRecorder()
	guarded.ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "get_stats") {
		t.Fatalf("read token: %d %s", w.Code, w.Body)
	}
}

func TestMCPGoalReport(t *testing.T) {
	h, db := setup(t)
	if _, err := query.CreateGoal(db, "s", query.Goal{Name: "Home", Kind: "page", Match: "/"}); err != nil {
		t.Fatal(err)
	}
	res := callTool(t, h, "goal_report", map[string]any{"site": "s", "range": "24h"})
	var rows []struct {
		Name     string
		Visitors int
		Rate     float64
	}
	if err := json.Unmarshal(res.StructuredContent, &rows); err != nil || res.IsError {
		t.Fatalf("%v %+v", err, res)
	}
	if len(rows) != 1 || rows[0].Name != "Home" || rows[0].Visitors != 3 || rows[0].Rate != 1 {
		t.Fatalf("rows %+v", rows)
	}
}

func TestMCPBadMetricText(t *testing.T) {
	h, _ := setup(t)
	res := callTool(t, h, "get_series", map[string]any{"site": "s", "metric": "zzz"})
	if !res.IsError || len(res.Content) == 0 || !strings.Contains(res.Content[0].Text, "unknown metric") {
		t.Fatalf("got %+v", res)
	}
}
