package demo

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"trail/internal/query"
)

// Plan is testdata/fixtures/plan.json (dashboard v3 plan §0.13).
type Plan struct {
	Sites  []string `json:"sites"`
	Ranges []string `json:"ranges"`
	Combos []struct {
		Ranges  json.RawMessage `json:"ranges"` // "all" or a list
		Cmp     string          `json:"cmp"`
		Filters [][]string      `json:"filters"`
	} `json:"combos"`
	Routes struct {
		Static    []string `json:"static"`
		PerCombo  []string `json:"perCombo"`
		PerDetail []string `json:"perDetail"`
		Live      string   `json:"live"`
	} `json:"routes"`
	SitesSummary  struct{ Site string } `json:"sitesSummary"`
	Metrics       []string              `json:"metrics"`
	SeriesExtras  bool                  `json:"seriesExtras"`
	BreakdownDims []string              `json:"breakdownDims"`
	RevenueDims   []string              `json:"revenueDims"`
	Details       struct {
		Journeys struct {
			LatestPeople int `json:"latestPeople"`
		} `json:"journeys"`
	} `json:"details"`
	Limits struct {
		MaxDiskBytes int64 `json:"maxDiskBytes"`
		MaxGzipBytes int64 `json:"maxGzipBytes"`
	} `json:"limits"`
}

// Manifest is the recorded index.json.
type Manifest struct {
	RecordedAt int64             `json:"recordedAt"`
	Now        int64             `json:"now"`
	TZ         string            `json:"tz"`
	Keys       map[string]string `json:"keys"`
}

// LoadPlan reads a recording plan.
func LoadPlan(path string) (Plan, error) {
	var p Plan
	b, err := os.ReadFile(path)
	if err != nil {
		return p, fmt.Errorf("plan: %w", err)
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return p, fmt.Errorf("plan %s: %w", path, err)
	}
	return p, nil
}

// envelope is one recorded response.
type envelope struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    json.RawMessage   `json:"body"`
}

type recorder struct {
	ctx   context.Context
	h     http.Handler
	tz    string
	files map[string][]byte // file name → bytes
	man   Manifest
}

// listLimit asks list routes for every row; the fixtures transport pages itself.
const listLimit = "1000"

// comboRows and defaultRows cap the people and session lists: the default combo (30d, previous period, no
// filters) keeps its first 500 rows, ten pages of the table; every other combo keeps two pages. x-total-count
// keeps the real total, so the screens still say how many there are.
const (
	comboRows   = 100
	defaultRows = 500
)

// get requests path with params from the demo handler, stores the response
// under its fixture key, and returns the body.
func (r *recorder) get(path string, params url.Values) (json.RawMessage, error) {
	return r.getN(path, params, 0)
}

// getN is get keeping at most maxRows rows of a list body (0 keeps all). Files are named by their content,
// so identical answers (empty lists, unchanged reports) are stored once.
func (r *recorder) getN(path string, params url.Values, maxRows int) (json.RawMessage, error) {
	if err := r.ctx.Err(); err != nil {
		return nil, err
	}
	key := query.FixtureKey(path, params)
	q := url.Values{}
	for k, v := range params {
		q[k] = slices.Clone(v)
	}
	q.Set("limit", listLimit)
	q.Set("tz", r.tz)
	w := httptest.NewRecorder()
	r.h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, prefix+strings.TrimPrefix(path, "/")+"?"+q.Encode(), nil))
	if w.Code != http.StatusOK {
		return nil, fmt.Errorf("record %s: %d %s", key, w.Code, strings.TrimSpace(w.Body.String()))
	}
	var body bytes.Buffer
	if err := json.Compact(&body, w.Body.Bytes()); err != nil {
		return nil, fmt.Errorf("record %s: %w", key, err)
	}
	if maxRows > 0 {
		var rows []json.RawMessage
		if json.Unmarshal(body.Bytes(), &rows) == nil && len(rows) > maxRows {
			b, err := json.Marshal(rows[:maxRows])
			if err != nil {
				return nil, fmt.Errorf("record %s: %w", key, err)
			}
			body.Reset()
			body.Write(b)
		}
	}
	env := envelope{Status: 200, Headers: map[string]string{}, Body: body.Bytes()}
	if n := w.Header().Get("X-Total-Count"); n != "" {
		env.Headers["x-total-count"] = n
	}
	b, err := json.Marshal(env)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(b)
	name := hex.EncodeToString(sum[:])[:16]
	r.files[name+".json"] = b
	r.man.Keys[key] = name
	return env.Body, nil
}

func base(site, rng, cmp string, filters []string) url.Values {
	v := url.Values{"site": {site}, "range": {rng}, "cmp": {cmp}, "env": {"production"}}
	for _, f := range filters {
		v.Add("f", f)
	}
	return v
}

func with(v url.Values, kv ...string) url.Values {
	out := url.Values{}
	for k, vs := range v {
		out[k] = slices.Clone(vs)
	}
	for i := 0; i+1 < len(kv); i += 2 {
		out.Set(kv[i], kv[i+1])
	}
	return out
}

// Record replays plan against the demo built in-process with its clock pinned
// at now (in tz), and writes one JSON envelope per response plus index.json to
// out. The output is byte-identical for the same now. It fails on any non-200
// response or when the recording exceeds the plan's size limits.
func Record(ctx context.Context, plan Plan, out string, now time.Time, tz *time.Location) (Manifest, error) {
	d, err := newDemo(tz, func() time.Time { return now })
	if err != nil {
		return Manifest{}, err
	}
	defer func() { _ = d.cur().st.Close() }()
	return record(ctx, d, plan, out, now, tz)
}

// record replays plan against d, whose clock must read now.
func record(ctx context.Context, d *demo, plan Plan, out string, now time.Time, tz *time.Location) (Manifest, error) {
	r := &recorder{ctx: ctx, h: d, tz: tz.String(), files: map[string][]byte{},
		man: Manifest{RecordedAt: now.UnixMilli(), Now: now.UnixMilli(), TZ: tz.String(), Keys: map[string]string{}}}
	if err := r.run(plan); err != nil {
		return r.man, err
	}
	if err := r.write(plan, out); err != nil {
		return r.man, err
	}
	return r.man, nil
}

func (r *recorder) run(plan Plan) error {
	spike, err := r.spikeDay(plan)
	if err != nil {
		return err
	}
	ranges := func(raw json.RawMessage) ([]string, error) {
		var all string
		if json.Unmarshal(raw, &all) == nil && all == "all" {
			return plan.Ranges, nil
		}
		var list []string
		err := json.Unmarshal(raw, &list)
		return list, err
	}
	// Static routes.
	for _, path := range plan.Routes.Static {
		switch {
		case path == "/sites", path == "/views":
			if _, err := r.get(path, url.Values{}); err != nil {
				return err
			}
		default:
			for _, site := range plan.Sites {
				p := strings.ReplaceAll(path, "{site}", site)
				params := url.Values{"site": {site}}
				if path == "/notes" {
					params = base(site, "30d", "prev", nil)
				}
				if _, err := r.get(p, params); err != nil {
					return err
				}
			}
		}
	}

	// Per-combo routes.
	for _, c := range plan.Combos {
		rs, err := ranges(c.Ranges)
		if err != nil {
			return fmt.Errorf("plan combo ranges: %w", err)
		}
		filterSets := c.Filters
		if len(filterSets) == 0 {
			filterSets = [][]string{nil}
		}
		for _, rg := range rs {
			rg = strings.ReplaceAll(rg, "{spikeDay}", spike)
			for _, fs := range filterSets {
				for _, path := range plan.Routes.PerCombo {
					if path == "/sites/summary" {
						if _, err := r.get(path, base(plan.SitesSummary.Site, rg, c.Cmp, fs)); err != nil {
							return err
						}
						continue
					}
					for _, site := range plan.Sites {
						if err := r.perCombo(plan, path, base(site, rg, c.Cmp, fs)); err != nil {
							return err
						}
					}
				}
				if plan.Routes.Live != "" && c.Cmp == "prev" && len(fs) == 0 && rg == "30d" {
					for _, site := range plan.Sites {
						if _, err := r.get(plan.Routes.Live, base(site, rg, c.Cmp, nil)); err != nil {
							return err
						}
					}
				}
			}
		}
	}

	// Details, on the 30d/prev combo with no filters.
	for _, site := range plan.Sites {
		if err := r.details(plan, base(site, "30d", "prev", nil)); err != nil {
			return err
		}
	}
	return nil
}

func (r *recorder) perCombo(plan Plan, path string, b url.Values) error {
	switch path {
	case "/series":
		for _, m := range plan.Metrics {
			kv := []string{"metric", m}
			if plan.SeriesExtras {
				kv = append(kv, "extras", "1")
			}
			if _, err := r.get(path, with(b, kv...)); err != nil {
				return err
			}
		}
	case "/breakdown":
		for _, dim := range plan.BreakdownDims {
			if _, err := r.get(path, with(b, "dim", dim)); err != nil {
				return err
			}
		}
	case "/revenue/breakdown":
		for _, dim := range plan.RevenueDims {
			if _, err := r.get(path, with(b, "dim", dim)); err != nil {
				return err
			}
		}
	case "/visitors", "/sessions":
		limit := comboRows
		if b.Get("range") == "30d" && b.Get("cmp") == "prev" && len(b["f"]) == 0 {
			limit = defaultRows
		}
		if _, err := r.getN(path, b, limit); err != nil {
			return err
		}
	default:
		if _, err := r.get(path, b); err != nil {
			return err
		}
	}
	return nil
}

func (r *recorder) details(plan Plan, b url.Values) error {
	site := b.Get("site")
	var goals []query.Goal
	raw, err := r.get("/goals", url.Values{"site": {site}})
	if err == nil {
		err = json.Unmarshal(raw, &goals)
	}
	if err != nil {
		return err
	}
	for _, g := range goals {
		id := strconv.FormatInt(g.ID, 10)
		if _, err := r.get("/goals/"+id+"/detail", b); err != nil {
			return err
		}
		if _, err := r.get("/paths", with(b, "goal", id)); err != nil {
			return err
		}
	}
	var funnels []query.Funnel
	if raw, err = r.get("/funnels", url.Values{"site": {site}}); err == nil {
		err = json.Unmarshal(raw, &funnels)
	}
	if err != nil {
		return err
	}
	for _, f := range funnels {
		id := strconv.FormatInt(f.ID, 10)
		if _, err := r.get("/funnels/"+id+"/report", b); err != nil {
			return err
		}
		for step := 1; step <= len(f.Steps); step++ {
			if _, err := r.get("/funnels/"+id+"/dropoff", with(b, "step", strconv.Itoa(step))); err != nil {
				return err
			}
		}
	}
	var people []query.Person
	if raw, err = r.getN("/visitors", b, defaultRows); err == nil {
		err = json.Unmarshal(raw, &people)
	}
	if err != nil {
		return err
	}
	for i, p := range people {
		if i == plan.Details.Journeys.LatestPeople {
			break
		}
		if _, err := r.get("/journey", with(b, "person", p.Person)); err != nil {
			return err
		}
	}
	var events []query.EventRow
	if raw, err = r.get("/events", b); err == nil {
		err = json.Unmarshal(raw, &events)
	}
	if err != nil {
		return err
	}
	for _, e := range events {
		if _, err := r.get("/events/detail", with(b, "name", e.Name)); err != nil {
			return err
		}
	}
	return nil
}

// spikeDay is the day with the most visitors in the demo site's last 30 days.
func (r *recorder) spikeDay(plan Plan) (string, error) {
	if !slices.Contains(plan.Ranges, "d:{spikeDay}") || len(plan.Sites) == 0 {
		return "", nil
	}
	w := httptest.NewRecorder()
	r.h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, prefix+"series?metric=visitors&range=30d&cmp=none&site="+plan.Sites[0]+"&tz="+url.QueryEscape(r.tz), nil))
	var s query.SeriesResult
	if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil || w.Code != 200 {
		return "", fmt.Errorf("spike day: %d %v", w.Code, err)
	}
	loc, _ := time.LoadLocation(r.tz)
	best, day := -1.0, ""
	for _, p := range s.Points {
		if p.V != nil && *p.V > best {
			best, day = *p.V, time.UnixMilli(p.T).In(loc).Format(time.DateOnly)
		}
	}
	if day == "" {
		return "", errors.New("spike day: no data")
	}
	return day, nil
}

func (r *recorder) write(plan Plan, out string) error {
	idx, err := json.MarshalIndent(r.man, "", " ")
	if err != nil {
		return err
	}
	r.files["index.json"] = append(idx, '\n')
	var disk, gz int64
	names := make([]string, 0, len(r.files))
	for name, b := range r.files {
		names = append(names, name)
		disk += int64(len(b))
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		_, _ = zw.Write(b)
		_ = zw.Close()
		gz += int64(buf.Len())
	}
	if plan.Limits.MaxDiskBytes > 0 && disk > plan.Limits.MaxDiskBytes {
		return fmt.Errorf("recording is %d bytes, over the %d limit", disk, plan.Limits.MaxDiskBytes)
	}
	if plan.Limits.MaxGzipBytes > 0 && gz > plan.Limits.MaxGzipBytes {
		return fmt.Errorf("recording is %d bytes gzipped, over the %d limit", gz, plan.Limits.MaxGzipBytes)
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		return fmt.Errorf("record: %w", err)
	}
	slices.Sort(names)
	for _, name := range names {
		if err := os.WriteFile(filepath.Join(out, name), r.files[name], 0o644); err != nil {
			return fmt.Errorf("record: %w", err)
		}
	}
	return nil
}
