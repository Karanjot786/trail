package query

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

// noNilLists fails when v holds a nil slice or map that JSON would write as null
// (fields tagged omitempty are exempt: they are left out instead).
func noNilLists(t *testing.T, name string, v reflect.Value, path string) {
	t.Helper()
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface:
		if !v.IsNil() {
			noNilLists(t, name, v.Elem(), path)
		}
	case reflect.Slice, reflect.Map:
		if v.IsNil() && v.Type() != reflect.TypeOf(json.RawMessage{}) {
			t.Errorf("%s: %s is null, want an empty list", name, path)
			return
		}
		if v.Kind() == reflect.Slice {
			for i := 0; i < v.Len(); i++ {
				noNilLists(t, name, v.Index(i), path+"[]")
			}
		}
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			f := v.Type().Field(i)
			if !f.IsExported() || strings.Contains(f.Tag.Get("json"), "omitempty") {
				continue
			}
			noNilLists(t, name, v.Field(i), path+"."+f.Name)
		}
	}
}

// TestEmptySiteAllReports: every report on a site with zero events (and no goals, funnels,
// purchases or crawler data) answers without error, NaN or Inf, and with empty lists.
func TestEmptySiteAllReports(t *testing.T) {
	db := fixture(t, pv("A", "s1", "/", t0)) // another site has data; site "empty" has none
	p := winParams(t, "30d", "prev")
	p.Site = "empty"
	day := winParams(t, "today", "prev")
	day.Site = "empty"
	type report struct {
		name string
		run  func() (any, error)
	}
	v3 := func(rows any, _ int, err error) (any, error) { return rows, err }
	reports := []report{
		{"Stats", func() (any, error) { return Stats(db, p) }},
		{"Stats today", func() (any, error) { return Stats(db, day) }},
		{"Changes", func() (any, error) { return Changes(db, p) }},
		{"Heatmap", func() (any, error) { return Heatmap(db, p) }},
		{"Live", func() (any, error) { return Live(db, p) }},
		{"Visitors", func() (any, error) { return v3(Visitors(db, p, "")) }},
		{"Sessions", func() (any, error) { return v3(Sessions(db, p, "")) }},
		{"Journey", func() (any, error) { return Journey(db, "empty", "nobody", nil) }},
		{"Campaigns", func() (any, error) { return Campaigns(db, p) }},
		{"AIReferrals", func() (any, error) { return AIReferrals(db, p) }},
		{"SitesSummary", func() (any, error) { return SitesSummary(db, p, []string{"empty"}) }},
		{"SiteFeatures", func() (any, error) { return SiteFeatures(db, "empty") }},
		{"Revenue", func() (any, error) { return Revenue(db, p) }},
		{"RevenueBreakdown", func() (any, error) { return RevenueBreakdown(db, p, "source") }},
		{"Crawlers", func() (any, error) { return Crawlers(db, p) }},
		{"EventCatalogue", func() (any, error) { return EventCatalogue(db, p) }},
		{"EventDetail", func() (any, error) { return EventDetail(db, p, "Signup") }},
	}
	for _, m := range []string{"visitors", "pageviews", "sessions", "duration", "bounce", "conversion", "revenue"} {
		reports = append(reports, report{"Series " + m, func() (any, error) { return Series(db, p, m, true) }},
			report{"Series today " + m, func() (any, error) { return Series(db, day, m, true) }})
	}
	for d := range dims {
		reports = append(reports, report{"Breakdown " + d, func() (any, error) { return Breakdown(db, p, d, "", 10) }})
	}
	for _, r := range reports {
		got, err := r.run()
		if errors.Is(err, ErrNotImplemented) {
			t.Logf("%s: not implemented yet (B3 stub)", r.name)
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", r.name, err)
			continue
		}
		b, err := json.Marshal(got)
		if err != nil {
			t.Errorf("%s: marshal: %v", r.name, err) // json refuses NaN and Inf
			continue
		}
		if bytes.Contains(b, []byte("NaN")) || bytes.Contains(b, []byte("Inf")) {
			t.Errorf("%s: %s", r.name, b)
		}
		noNilLists(t, r.name, reflect.ValueOf(got), r.name)
	}
	var buf bytes.Buffer
	if err := ExportEvents(context.Background(), db, "empty", &buf); err != nil || buf.Len() != 0 {
		t.Errorf("export: %q %v", buf.String(), err)
	}
}
