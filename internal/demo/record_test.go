package demo

import (
	"bytes"
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"trail/internal/query"
)

var recNow = t0

// smallPlan is the real plan cut down to one site and a few routes, so tests stay quick.
func smallPlan(t *testing.T) Plan {
	t.Helper()
	p, err := LoadPlan("../../testdata/fixtures/plan.json")
	if err != nil {
		t.Fatal(err)
	}
	p.Sites = []string{"demo"}
	p.Ranges = []string{"30d", "d:{spikeDay}"}
	p.Combos = p.Combos[:1]
	p.Routes.PerCombo = []string{"/sites/summary", "/stats", "/series", "/visitors"}
	p.Metrics = []string{"visitors"}
	return p
}

func TestRecordDeterministic(t *testing.T) {
	p := smallPlan(t)
	a, b := t.TempDir(), t.TempDir()
	if _, err := record(context.Background(), sharedDemo(t), p, a, recNow, ist); err != nil {
		t.Fatal(err)
	}
	if _, err := record(context.Background(), sharedDemo(t), p, b, recNow, ist); err != nil {
		t.Fatal(err)
	}
	files, _ := os.ReadDir(a)
	if len(files) < 10 {
		t.Fatalf("only %d files", len(files))
	}
	for _, f := range files {
		x, _ := os.ReadFile(filepath.Join(a, f.Name()))
		y, err := os.ReadFile(filepath.Join(b, f.Name()))
		if err != nil || !bytes.Equal(x, y) {
			t.Fatalf("%s differs between runs:\n%.600s\n%.600s", f.Name(), x, y)
		}
	}
}

func TestRecordCoversPlan(t *testing.T) {
	p := smallPlan(t)
	out := t.TempDir()
	man, err := record(context.Background(), sharedDemo(t), p, out, recNow, ist)
	if err != nil {
		t.Fatal(err)
	}
	var idx Manifest
	raw, _ := os.ReadFile(filepath.Join(out, "index.json"))
	if err := json.Unmarshal(raw, &idx); err != nil || idx.Now != recNow.UnixMilli() || idx.TZ != "Asia/Kolkata" || len(idx.Keys) != len(man.Keys) {
		t.Fatalf("index: %v %+v", err, idx.TZ)
	}
	base := "cmp=prev&env=production&range=30d&site=demo"
	for _, key := range []string{
		"/sites?", "/views?", "/goals?site=demo", "/funnels?site=demo", "/sites/demo/status?site=demo",
		"/stats?" + base, "/series?" + base[:len("cmp=prev&env=production")] + "&extras=1&metric=visitors&range=30d&site=demo",
		"/sites/summary?cmp=prev&env=production&range=30d&site=all", "/live?" + base,
		"/goals/1/detail?" + base, "/paths?" + base + "&goal=1", "/funnels/1/report?" + base,
	} {
		if _, ok := idx.Keys[key]; !ok && !strings.Contains(key, "&goal=") {
			t.Errorf("missing %s", key)
		}
	}
	spike := false
	for k := range idx.Keys {
		if strings.Contains(k, "range=d%3A2026-") {
			spike = true
		}
		if strings.Contains(k, "tz=") || strings.Contains(k, "limit=") {
			t.Errorf("key keeps tz or paging: %s", k)
		}
	}
	if !spike {
		t.Error("no spike-day range recorded")
	}
	var env envelope
	raw, _ = os.ReadFile(filepath.Join(out, idx.Keys["/visitors?"+base]+".json"))
	if err := json.Unmarshal(raw, &env); err != nil || env.Status != 200 || env.Headers["x-total-count"] == "" {
		t.Fatalf("visitors envelope: %v %+v", err, env.Headers)
	}
}

func TestRecordKeysMatchTS(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/fixtures/keys.json")
	if err != nil {
		t.Fatal(err)
	}
	var vec struct {
		Vectors []struct {
			Path   string     `json:"path"`
			Params [][]string `json:"params"`
			Key    string     `json:"key"`
		} `json:"vectors"`
	}
	if err := json.Unmarshal(raw, &vec); err != nil || len(vec.Vectors) == 0 {
		t.Fatal(err)
	}
	for _, v := range vec.Vectors {
		p := url.Values{}
		for _, kv := range v.Params {
			p.Add(kv[0], kv[1])
		}
		if got := query.FixtureKey(v.Path, p); got != v.Key {
			t.Errorf("got  %s\nwant %s", got, v.Key)
		}
	}
}

func TestRecordSizeCap(t *testing.T) {
	p := smallPlan(t)
	p.Limits.MaxDiskBytes = 1000
	if _, err := record(context.Background(), sharedDemo(t), p, t.TempDir(), recNow, ist); err == nil || !strings.Contains(err.Error(), "limit") {
		t.Fatalf("disk cap: %v", err)
	}
	p = smallPlan(t)
	p.Limits.MaxGzipBytes = 100
	out := t.TempDir()
	if _, err := record(context.Background(), sharedDemo(t), p, out, recNow, ist); err == nil {
		t.Fatal("gzip cap not enforced")
	}
	if files, _ := os.ReadDir(out); len(files) != 0 {
		t.Fatal("wrote files past the cap")
	}
}
