package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"trail/internal/query"
)

type siteRow struct {
	ID          string   `json:"id"`
	Domain      string   `json:"domain"`
	Origins     []string `json:"origins"`
	Created     int64    `json:"created"`
	LastEventAt *int64   `json:"lastEventAt"`
	Events24h   int      `json:"events24h"`
	Features    struct {
		Revenue  bool   `json:"revenue"`
		Crawlers bool   `json:"crawlers"`
		Currency string `json:"currency"`
	} `json:"features"`
}

func TestAPISitesList(t *testing.T) {
	h := setup(t)
	w := get(h, "/api/sites")
	var rows []siteRow
	decodeStrict(t, w.Body.Bytes(), &rows)
	if len(rows) != 2 || rows[0].ID != "b" || rows[1].ID != "s" {
		t.Fatalf("rows %+v", rows)
	}
	b, s := rows[0], rows[1]
	if b.LastEventAt != nil || b.Events24h != 0 || b.Origins == nil {
		t.Errorf("empty site %+v (origins must be [] not null)", b)
	}
	if s.LastEventAt == nil || s.Events24h != 1 || s.Domain != "example.com" || s.Created == 0 {
		t.Errorf("site with an event %+v", s)
	}
	if !strings.Contains(w.Body.String(), `"lastEventAt":null`) {
		t.Errorf("want lastEventAt null in %s", w.Body)
	}
}

func TestAPISiteCreate(t *testing.T) {
	h := setup(t)
	w := send(h, http.MethodPost, "/api/sites", `{"id":"blog","domain":"Blog.dev","origins":["*.vercel.app"]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var s siteRow
	decodeStrict(t, w.Body.Bytes(), &s)
	if s.ID != "blog" || s.Domain != "blog.dev" || len(s.Origins) != 1 || s.LastEventAt != nil {
		t.Fatalf("created %+v", s)
	}
	if w := send(h, http.MethodPost, "/api/sites", `{"id":"blog","domain":"x.dev"}`); w.Code != http.StatusConflict {
		t.Errorf("duplicate: %d", w.Code)
	}
	for _, body := range []string{
		`{"id":"Bad Id","domain":"x.dev"}`,
		`{"id":"ok","domain":"https://x.dev"}`,
		`{"id":"ok","domain":"x.dev","origins":["https://y.dev"]}`,
		`{"id":"ok","domain":"x.dev","extra":1}`,
		`{"id":"ok"`,
	} {
		if w := send(h, http.MethodPost, "/api/sites", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", body, w.Code)
		}
	}
	for _, ct := range []string{"text/plain", "", "application/x-www-form-urlencoded"} {
		if w := sendCT(h, "/api/sites", ct, `{"id":"ct","domain":"ct.dev"}`); w.Code != http.StatusUnsupportedMediaType {
			t.Errorf("Content-Type %q: %d, want 415", ct, w.Code)
		}
	}
	if strings.Contains(get(h, "/api/sites").Body.String(), `"ct"`) {
		t.Error("a non-JSON post created a site")
	}
	// The new site is usable by the report API at once.
	if w := get(h, "/api/stats?site=blog"); w.Code != 200 {
		t.Errorf("stats for new site: %d %s", w.Code, w.Body)
	}
}

func TestAPISitePatch(t *testing.T) {
	h := setup(t)
	w := send(h, http.MethodPatch, "/api/sites/s", `{"origins":["*.vercel.app","staging.io"]}`)
	if w.Code != 200 {
		t.Fatalf("patch: %d %s", w.Code, w.Body)
	}
	var s siteRow
	decodeStrict(t, w.Body.Bytes(), &s)
	if s.Domain != "example.com" || len(s.Origins) != 2 {
		t.Fatalf("patched %+v", s)
	}
	if w := send(h, http.MethodPatch, "/api/sites/s", `{"domain":"new.com"}`); w.Code != 200 || !strings.Contains(w.Body.String(), `"staging.io"`) {
		t.Errorf("domain-only patch dropped origins: %d %s", w.Code, w.Body)
	}
	if w := send(h, http.MethodPatch, "/api/sites/nope", `{"domain":"x.com"}`); w.Code != http.StatusNotFound {
		t.Errorf("missing: %d", w.Code)
	}
	if w := send(h, http.MethodPatch, "/api/sites/s", `{"domain":"x.com/path"}`); w.Code != http.StatusBadRequest {
		t.Errorf("bad domain: %d", w.Code)
	}
	req := send(h, http.MethodPatch, "/api/sites/s", "")
	if req.Code != http.StatusUnsupportedMediaType {
		t.Errorf("patch without JSON type: %d", req.Code)
	}
}

func TestAPISiteDelete(t *testing.T) {
	h := setup(t)
	if w := send(h, http.MethodDelete, "/api/sites/s", ""); w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	if w := get(h, "/api/stats?site=s"); w.Code != http.StatusBadRequest {
		t.Errorf("deleted site still served: %d", w.Code)
	}
	// purge=0 kept the data: re-adding the site brings it back.
	send(h, http.MethodPost, "/api/sites", `{"id":"s","domain":"example.com"}`)
	if w := get(h, "/api/sites"); !strings.Contains(w.Body.String(), `"events24h":1`) {
		t.Errorf("soft delete lost data: %s", w.Body)
	}
	if w := send(h, http.MethodDelete, "/api/sites/s?purge=1", ""); w.Code != http.StatusNoContent {
		t.Fatalf("purge: %d", w.Code)
	}
	send(h, http.MethodPost, "/api/sites", `{"id":"s","domain":"example.com"}`)
	if w := get(h, "/api/sites"); strings.Contains(w.Body.String(), `"events24h":1`) {
		t.Errorf("purge kept events: %s", w.Body)
	}
	if w := send(h, http.MethodDelete, "/api/sites/nope", ""); w.Code != http.StatusNotFound {
		t.Errorf("missing: %d", w.Code)
	}
	if w := send(h, http.MethodDelete, "/api/sites/b?purge=yes", ""); w.Code != http.StatusBadRequest {
		t.Errorf("bad purge: %d", w.Code)
	}
}

func TestAPISiteStatus(t *testing.T) {
	h, reg := setupReg(t)
	reg.Reject("s")
	reg.Reject("s")
	w := get(h, "/api/sites/s/status")
	var st query.SiteStatus
	decodeStrict(t, w.Body.Bytes(), &st)
	if st.LastEventAt == nil || st.Events24h != 1 || st.Rejected24h != 2 {
		t.Fatalf("status %s", w.Body)
	}
	w = get(h, "/api/sites/b/status")
	var raw map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	if raw["lastEventAt"] != nil || raw["events24h"] != float64(0) || raw["rejected24h"] != float64(0) {
		t.Errorf("empty status %s", w.Body)
	}
	if w := get(h, "/api/sites/nope/status"); w.Code != http.StatusNotFound {
		t.Errorf("missing: %d", w.Code)
	}
}
