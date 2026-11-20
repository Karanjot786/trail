package api

import (
	"bytes"
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

func setup(t *testing.T) http.Handler {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	// ponytail: remove once the ingest migration in store.go adds events.retry.
	if _, err := st.DB().Exec(`ALTER TABLE events ADD COLUMN retry INTEGER NOT NULL DEFAULT 0`); err != nil &&
		!strings.Contains(err.Error(), "duplicate column") {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	st.Enqueue(store.Event{SiteID: "s", Type: "pageview", AnonID: "A", SessionID: "x", Path: "/", TS: now - 1000, Env: "production"})
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	ist, _ := time.LoadLocation("Asia/Kolkata")
	return New(st.DB(), map[string]string{"s": "example.com", "b": "b.com"}, ist)
}

func get(h http.Handler, url string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil))
	return w
}

func decodeStrict(t *testing.T, body []byte, v any) {
	t.Helper()
	d := json.NewDecoder(bytes.NewReader(body))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
}

func rng() string {
	now := time.Now().UnixMilli()
	return fmt.Sprintf("site=s&from=%d&to=%d&env=all", now-86400000, now)
}

func TestAPIStatsJSONShape(t *testing.T) {
	w := get(setup(t), "/api/stats?"+rng())
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var s struct {
		Visitors, Pageviews int
		Bounce              float64
		Prev                struct {
			Visitors, Pageviews int
			Bounce              float64
		}
		Online int
	}
	decodeStrict(t, w.Body.Bytes(), &s)
	if s.Visitors != 1 || s.Pageviews != 1 || s.Bounce != 1 || s.Online != 1 {
		t.Fatalf("stats = %+v", s)
	}
	var raw map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	for _, k := range []string{"visitors", "pageviews", "bounce", "prev", "online"} {
		if _, ok := raw[k]; !ok {
			t.Errorf("missing key %q in %s", k, w.Body)
		}
	}
}

func TestAPIEndpointsShape(t *testing.T) {
	h := setup(t)
	tests := []struct {
		url  string
		keys []string
	}{
		{"/api/series?metric=visitors&" + rng(), []string{"bucket", "points"}},
		{"/api/breakdown?dim=path&" + rng(), []string{"key", "visitors", "pageviews", "total"}},
		{"/api/visitors?" + rng(), []string{"person", "identified", "firstSeen", "lastSeen", "visits", "country", "device", "source"}},
		{"/api/journey?site=s&person=A", []string{"sessionId", "start", "source", "steps"}},
		{"/api/sites", []string{"id", "domain"}},
	}
	for _, tt := range tests {
		w := get(h, tt.url)
		if w.Code != 200 {
			t.Errorf("%s: status %d: %s", tt.url, w.Code, w.Body)
			continue
		}
		var v any
		if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
			t.Fatal(err)
		}
		obj, ok := v.(map[string]any)
		if arr, isArr := v.([]any); isArr {
			if len(arr) == 0 {
				t.Errorf("%s: empty array", tt.url)
				continue
			}
			obj, ok = arr[0].(map[string]any)
		}
		if !ok {
			t.Errorf("%s: unexpected shape %s", tt.url, w.Body)
			continue
		}
		for _, k := range tt.keys {
			if _, ok := obj[k]; !ok {
				t.Errorf("%s: missing %q in %s", tt.url, k, w.Body)
			}
		}
	}
}

func TestAPIBadDim(t *testing.T) {
	h := setup(t)
	for _, u := range []string{
		"/api/breakdown?dim=password&" + rng(),
		"/api/stats?f=password:x&" + rng(),
		"/api/stats?f=nocolon&" + rng(),
		"/api/series?metric=nope&" + rng(),
		"/api/stats?site=unknown",
		"/api/stats?site=s&from=abc",
		"/api/stats?site=s&env=staging",
		"/api/journey?site=s",
	} {
		if w := get(h, u); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", u, w.Code)
		}
	}
}

func TestAPIEmptySiteArrays(t *testing.T) {
	h := setup(t)
	now := time.Now().UnixMilli()
	q := fmt.Sprintf("site=b&from=%d&to=%d", now-86400000, now)
	for _, u := range []string{"/api/breakdown?dim=path&" + q, "/api/visitors?" + q, "/api/journey?site=b&person=x"} {
		if w := get(h, u); w.Code != 200 || bytes.TrimSpace(w.Body.Bytes())[0] != '[' {
			t.Errorf("%s: %d %s", u, w.Code, w.Body)
		}
	}
}

func TestAPIRejectsHugeRange(t *testing.T) {
	h := setup(t)
	for _, q := range []string{"from=-9000000000000000000&to=0", "from=0&to=9000000000000000000", "from=-5&to=10"} {
		if w := get(h, "/api/series?metric=visitors&site=s&"+q); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", q, w.Code)
		}
	}
}

func send(h http.Handler, method, url, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(method, url, bytes.NewBufferString(body)))
	return w
}

func TestAPIGoals(t *testing.T) {
	h := setup(t)
	w := send(h, http.MethodPost, "/api/goals", `{"site":"s","name":"Pricing","kind":"page","match":"/pricing*"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var g struct {
		ID                int64
		Name, Kind, Match string
	}
	decodeStrict(t, w.Body.Bytes(), &g)
	if g.ID == 0 || g.Name != "Pricing" || g.Kind != "page" || g.Match != "/pricing*" {
		t.Fatalf("created = %+v", g)
	}

	w = get(h, "/api/goals?site=s")
	if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"name":"Pricing"`)) {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	if w := get(h, "/api/goals?site=b"); w.Code != 200 || string(bytes.TrimSpace(w.Body.Bytes())) != "[]" {
		t.Fatalf("other site list: %d %s", w.Code, w.Body)
	}

	for _, body := range []string{
		`not json`, `{"site":"s","name":"","kind":"page","match":"/x"}`, `{"site":"s","name":"x","kind":"nope","match":"/x"}`,
		`{"site":"s","name":"Pricing","kind":"page","match":"/x"}`, `{"site":"unknown","name":"x","kind":"page","match":"/x"}`,
		`{"site":"s","name":"x","kind":"page","match":"/x","extra":1}`,
	} {
		if w := send(h, http.MethodPost, "/api/goals", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", body, w.Code)
		}
	}

	id := fmt.Sprint(g.ID)
	if w := send(h, http.MethodDelete, "/api/goals/"+id+"?site=b", ""); w.Code != http.StatusNotFound {
		t.Errorf("delete other site's goal: %d, want 404", w.Code)
	}
	if w := send(h, http.MethodDelete, "/api/goals/abc?site=s", ""); w.Code != http.StatusBadRequest {
		t.Errorf("delete bad id: %d, want 400", w.Code)
	}
	if w := send(h, http.MethodDelete, "/api/goals/"+id+"?site=s", ""); w.Code != http.StatusNoContent {
		t.Errorf("delete: %d, want 204", w.Code)
	}
	if w := send(h, http.MethodDelete, "/api/goals/"+id+"?site=s", ""); w.Code != http.StatusNotFound {
		t.Errorf("delete twice: %d, want 404", w.Code)
	}
}

func TestAPIGoalReportAndDeliveryShape(t *testing.T) {
	h := setup(t)
	send(h, http.MethodPost, "/api/goals", `{"site":"s","name":"Home","kind":"page","match":"/"}`)
	w := get(h, "/api/goals/report?"+rng())
	if w.Code != 200 {
		t.Fatalf("report: %d %s", w.Code, w.Body)
	}
	var rows []struct {
		ID                    int64
		Name, Kind, Match     string
		Conversions, Visitors int
		Rate                  float64
		Prev                  struct {
			Conversions, Visitors int
			Rate                  float64
		}
	}
	decodeStrict(t, w.Body.Bytes(), &rows)
	if len(rows) != 1 || rows[0].Conversions != 1 || rows[0].Visitors != 1 || rows[0].Rate != 1 {
		t.Fatalf("rows = %+v", rows)
	}
	if w := get(h, "/api/goals/report?site=unknown"); w.Code != http.StatusBadRequest {
		t.Errorf("unknown site: %d", w.Code)
	}

	w = get(h, "/api/delivery?"+rng())
	if w.Code != 200 {
		t.Fatalf("delivery: %d %s", w.Code, w.Body)
	}
	var d struct {
		Events, Retried int
		RetriedRate     float64
	}
	decodeStrict(t, w.Body.Bytes(), &d)
	if d.Events != 1 || d.Retried != 0 {
		t.Fatalf("delivery = %+v", d)
	}
}
