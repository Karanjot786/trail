package api

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"trail/internal/install"
	"trail/internal/query"
	"trail/internal/sites"
	"trail/internal/store"
)

type countingFetch struct{ n atomic.Int32 }

func (c *countingFetch) Fetch(context.Context, string) (install.Page, error) {
	c.n.Add(1)
	return install.Page{Status: 200, Header: http.Header{}, Body: []byte(`<script src="/_t/t.js" data-site="s"></script>`)}, nil
}

func TestSiteCheckRouteCached(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "c.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	reg, _ := sites.Open(st.DB())
	if _, err := reg.Add(sites.Site{ID: "s", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	f := &countingFetch{}
	h := New(st.DB(), reg, time.UTC, WithFetcher(f), WithClock(func() time.Time { return now }))
	var res install.InstallCheck
	w := get(h, "/api/sites/s/check")
	decodeStrict(t, w.Body.Bytes(), &res)
	if res.State != "waiting" || len(res.Checks) != 8 {
		t.Fatalf("check %s", w.Body)
	}
	get(h, "/api/sites/s/check")
	if f.n.Load() != 1 {
		t.Fatalf("not cached: %d fetches", f.n.Load())
	}
	now = now.Add(31 * time.Second)
	get(h, "/api/sites/s/check")
	if f.n.Load() != 2 {
		t.Fatalf("cache never expires: %d", f.n.Load())
	}
	if w := get(h, "/api/sites/nope/check"); w.Code != http.StatusNotFound {
		t.Errorf("unknown site: %d", w.Code)
	}
}

func TestSitesIncludeFeatures(t *testing.T) {
	h := setup(t)
	w := get(h, "/api/sites")
	var list []query.Site
	decodeStrict(t, w.Body.Bytes(), &list)
	if len(list) != 2 || list[0].Features.Currency == "" {
		t.Fatalf("sites %s", w.Body)
	}
	var raw []map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	if _, ok := raw[0]["features"].(map[string]any)["crawlers"]; !ok {
		t.Fatalf("features missing: %s", w.Body)
	}
}

func TestSiteExportGzip(t *testing.T) {
	h := setup(t)
	w := get(h, "/api/sites/s/export")
	if w.Code != 200 || w.Header().Get("Content-Encoding") != "gzip" || !strings.HasPrefix(w.Header().Get("Content-Disposition"), "attachment;") {
		t.Fatalf("export: %d %v", w.Code, w.Header())
	}
}
