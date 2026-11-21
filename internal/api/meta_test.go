package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"trail/internal/meta"
	"trail/internal/query"
)

func TestNotesRoutes(t *testing.T) {
	h := setup(t)
	now := time.Now().UnixMilli()
	w := send(h, http.MethodPost, "/api/notes", fmt.Sprintf(`{"site":"s","ts":%d,"label":"Launch","kind":"press"}`, now-1000))
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var n meta.Note
	decodeStrict(t, w.Body.Bytes(), &n)
	if n.ID == 0 || n.Kind != "press" || n.Site != "s" {
		t.Fatalf("note %+v", n)
	}
	w = get(h, "/api/notes?site=s&range=7d")
	var list []meta.Note
	decodeStrict(t, w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatalf("list %s", w.Body)
	}
	for _, body := range []string{`{"site":"s","ts":1,"label":""}`, `{"site":"x","ts":1,"label":"a"}`, `{"site":"s","ts":1,"label":"a","kind":"bad"}`} {
		if w := send(h, http.MethodPost, "/api/notes", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: %d", body, w.Code)
		}
	}
	if w := send(h, http.MethodDelete, fmt.Sprintf("/api/notes/%d?site=b", n.ID), ""); w.Code != http.StatusNotFound {
		t.Errorf("delete via other site: %d", w.Code)
	}
	if w := send(h, http.MethodDelete, fmt.Sprintf("/api/notes/%d?site=s", n.ID), ""); w.Code != http.StatusNoContent {
		t.Errorf("delete: %d", w.Code)
	}
}

func TestViewsRoutes(t *testing.T) {
	h := setup(t)
	w := send(h, http.MethodPost, "/api/views", `{"name":"Mobile","site":"s","state":"range=7d&f=device:mobile"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var v meta.SavedView
	decodeStrict(t, w.Body.Bytes(), &v)
	if w := send(h, http.MethodPost, "/api/views", `{"name":"Huge","site":null,"state":"a=`+strings.Repeat("x", 2100)+`"}`); w.Code != http.StatusBadRequest {
		t.Errorf("huge state: %d", w.Code)
	}
	if w := send(h, http.MethodPost, "/api/views", `{"name":"X","site":"nope","state":""}`); w.Code != http.StatusBadRequest {
		t.Errorf("unknown site: %d", w.Code)
	}
	w = get(h, "/api/views")
	var list []meta.SavedView
	decodeStrict(t, w.Body.Bytes(), &list)
	if len(list) != 1 || list[0].ID != v.ID {
		t.Fatalf("list %s", w.Body)
	}
	if w := send(h, http.MethodDelete, fmt.Sprintf("/api/views/%d", v.ID), ""); w.Code != http.StatusNoContent {
		t.Errorf("delete: %d", w.Code)
	}
}

func TestFunnelValidation(t *testing.T) {
	h := setup(t)
	steps := func(n int) string {
		parts := make([]string, n)
		for i := range parts {
			parts[i] = fmt.Sprintf(`{"kind":"page","match":"/s%d","label":""}`, i)
		}
		return "[" + strings.Join(parts, ",") + "]"
	}
	for name, body := range map[string]string{
		"1 step":     `{"site":"s","name":"a","windowMs":86400000,"steps":` + steps(1) + `}`,
		"9 steps":    `{"site":"s","name":"a","windowMs":86400000,"steps":` + steps(9) + `}`,
		"bad window": `{"site":"s","name":"a","windowMs":1234,"steps":` + steps(2) + `}`,
	} {
		if w := send(h, http.MethodPost, "/api/funnels", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: %d %s", name, w.Code, w.Body)
		}
	}
}

func TestFunnelCRUDRoutes(t *testing.T) {
	h := setup(t)
	w := send(h, http.MethodPost, "/api/funnels",
		`{"site":"s","name":"Trial","windowMs":604800000,"steps":[{"kind":"page","match":"/pricing","label":"Pricing"},{"kind":"event","match":"Signup","label":"Signup"}]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var f query.Funnel
	decodeStrict(t, w.Body.Bytes(), &f)
	w = get(h, "/api/funnels?site=s")
	var list []query.Funnel
	decodeStrict(t, w.Body.Bytes(), &list)
	if len(list) != 1 || list[0].ID != f.ID || list[0].Name != "Trial" || len(list[0].Steps) != 2 || list[0].Created != f.Created {
		t.Fatalf("list %s", w.Body)
	}
	w = send(h, http.MethodPatch, fmt.Sprintf("/api/funnels/%d", f.ID),
		`{"site":"s","name":"Trial 2","windowMs":3600000,"steps":[{"kind":"page","match":"/a","label":"A"},{"kind":"page","match":"/b","label":"B"}]}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"Trial 2"`) {
		t.Fatalf("patch: %d %s", w.Code, w.Body)
	}
	if w := send(h, http.MethodDelete, fmt.Sprintf("/api/funnels/%d?site=b", f.ID), ""); w.Code != http.StatusNotFound {
		t.Errorf("delete via other site: %d", w.Code)
	}
	if w := send(h, http.MethodDelete, fmt.Sprintf("/api/funnels/%d?site=s", f.ID), ""); w.Code != http.StatusNoContent {
		t.Errorf("delete: %d", w.Code)
	}
}

func TestGoalPatch(t *testing.T) {
	h := setup(t)
	w := send(h, http.MethodPost, "/api/goals", `{"site":"s","name":"A","kind":"page","match":"/a"}`)
	var g query.Goal
	_ = json.Unmarshal(w.Body.Bytes(), &g)
	w = send(h, http.MethodPatch, fmt.Sprintf("/api/goals/%d", g.ID), `{"site":"s","name":"A2","kind":"event","match":"Signup"}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"A2"`) {
		t.Fatalf("patch: %d %s", w.Code, w.Body)
	}
	if w := send(h, http.MethodPatch, "/api/goals/999", `{"site":"s","name":"Z","kind":"page","match":"/z"}`); w.Code != http.StatusNotFound {
		t.Errorf("patch unknown: %d", w.Code)
	}
}
