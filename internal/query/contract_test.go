package query_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"trail/internal/install"
	"trail/internal/meta"
	"trail/internal/query"
)

var update = flag.Bool("update", false, "rewrite web/src/api/contract.golden.ts")

const goldenPath = "../../web/src/api/contract.golden.ts"

func keys(t *testing.T, v any) []string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal %T: %v", v, err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal %T: %v", v, err)
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func sorted(s ...string) []string {
	sort.Strings(s)
	return s
}

// TestContractJSONNames pins zero values' JSON key sets to the §0.5 TypeScript fields.
func TestContractJSONNames(t *testing.T) {
	totals := []string{"visitors", "pageviews", "sessions", "durationMs", "bounce", "conversions", "convVisitors", "convRate", "baseVisitors", "revenueMinor", "purchases"}
	cases := []struct {
		v    any
		want []string
	}{
		{query.StatsResult{}, sorted(append([]string{"window", "prev", "online", "botRequests", "conv"}, totals...)...)},
		{query.SeriesResult{}, sorted("window", "metric", "bucket", "points", "prev")},
		{query.Row{}, sorted("key", "visitors", "pageviews", "total")},
		{query.ChangeItem{Kind: "day"}, sorted("kind", "day", "cur", "prev", "added", "source", "basis")},
		{query.ChangeItem{Kind: "source"}, sorted("kind", "key", "cur", "prev", "basis")},
		{query.ChangeItem{Kind: "rate"}, sorted("kind", "metric", "cur", "prev", "n", "basis")},
		{query.FunnelReportResult{}, sorted("funnel", "window", "started", "steps", "biggestDrop")},
		{query.Window{}, sorted("key", "label", "from", "to", "prevFrom", "prevTo", "bucket", "tz", "elapsed", "lastBucket", "clamped", "invalid", "basis")},
	}
	for _, c := range cases {
		if got := keys(t, c.v); !slices.Equal(got, c.want) {
			t.Errorf("%T keys\n got %v\nwant %v", c.v, got, c.want)
		}
	}
}

// TestContractListsNeverNull: nullable TS fields are JSON null, never-null lists are [] after NewXxx-style fill
// is the builders' job; here we pin that a nil pointer field marshals as null, not as a missing key.
func TestContractNullables(t *testing.T) {
	b, _ := json.Marshal(query.Point{T: 1})
	if string(b) != `{"t":1,"v":null}` {
		t.Errorf("future bucket = %s", b)
	}
}

func TestParamsPrev(t *testing.T) {
	pf, pt := int64(100), int64(199)
	p := query.Params{Site: "s", From: 200, To: 299, Win: query.Window{Key: "7d", From: 200, To: 299, PrevFrom: &pf, PrevTo: &pt}}
	prev, ok := p.Prev()
	if !ok || prev.From != 100 || prev.To != 199 || prev.Win.From != 100 || prev.Win.To != 199 || prev.Win.PrevFrom != nil || prev.Site != "s" {
		t.Fatalf("prev = %+v, %v", prev, ok)
	}
	if p.From != 200 || *p.Win.PrevFrom != 100 {
		t.Fatal("Prev mutated the receiver")
	}
	if _, ok := (query.Params{}).Prev(); ok {
		t.Fatal("no comparison window must report false")
	}
}

func TestStubsReportNotImplemented(t *testing.T) {
	if _, err := query.ResolveWindow("30d", "prev", time.Now(), time.UTC, 0); !errors.Is(err, query.ErrNotImplemented) && err != nil {
		t.Fatalf("ResolveWindow: %v", err)
	}
	if _, err := query.Revenue(nil, query.Params{}); !errors.Is(err, query.ErrNotImplemented) && err != nil {
		t.Fatalf("Revenue: %v", err)
	}
}

// ---- Golden TS: every Go contract type, fully populated, checked by tsc with `satisfies`. ----

// enums gives string and number fields whose TS type is a literal union a valid member.
var enums = map[string]any{
	"Window.Bucket": "day", "SeriesResult.Bucket": "day", "SeriesResult.Metric": "visitors",
	"Note.Kind": "deploy", "EventRow.Kind": "custom", "Goal.Kind": "page", "FunnelStep.Kind": "page", "Step.Type": "pageview",
	"HeatmapResult.Status": "ok", "HeatmapResult.Weeks": 4, "HeatmapResult.Threshold": 150,
	"CrawlCategoryRow.Key": "training", "CrawlerRow.Category": "training", "CrawlPage.Category": "training",
	"CheckItem.ID": "page", "CheckItem.Status": "pass", "CheckItem.Code": "ok", "InstallCheck.State": "waiting",
	"APIToken.Scope": "read", "WhoAmI.Scope": "read",
	"ChangeItem.Kind": "day", "ChangeItem.Metric": "bounce",
}

var rawType = reflect.TypeOf(json.RawMessage{})

func fill(v reflect.Value, owner, field string) {
	if e, ok := enums[owner+"."+field]; ok {
		ev := reflect.ValueOf(e)
		if v.Kind() == reflect.String {
			v.SetString(ev.String())
		} else {
			v.SetInt(ev.Int())
		}
		return
	}
	if v.Type() == rawType {
		v.SetBytes([]byte(`{"plan":"pro","amount":19,"trial":true}`))
		return
	}
	switch v.Kind() {
	case reflect.String:
		v.SetString("x")
	case reflect.Int, reflect.Int64, reflect.Int32:
		v.SetInt(1)
	case reflect.Float64:
		v.SetFloat(0.5)
	case reflect.Bool:
		v.SetBool(true)
	case reflect.Pointer:
		v.Set(reflect.New(v.Type().Elem()))
		fill(v.Elem(), owner, field)
	case reflect.Slice:
		s := reflect.MakeSlice(v.Type(), 1, 1)
		fill(s.Index(0), owner, field)
		v.Set(s)
	case reflect.Map:
		m := reflect.MakeMap(v.Type())
		val := reflect.New(v.Type().Elem()).Elem()
		if v.Type().Elem().Kind() == reflect.Interface {
			val.Set(reflect.ValueOf("v"))
		} else {
			fill(val, owner, field)
		}
		m.SetMapIndex(reflect.ValueOf("k"), val)
		v.Set(m)
	case reflect.Struct:
		t := v.Type()
		for i := 0; i < t.NumField(); i++ {
			if t.Field(i).IsExported() {
				fill(v.Field(i), t.Name(), t.Field(i).Name)
			}
		}
	}
}

func filled[T any]() T {
	var x T
	fill(reflect.ValueOf(&x).Elem(), "", "")
	return x
}

type golden struct {
	name, tsType string
	v            any
}

func goldens() []golden {
	changeSource := filled[query.ChangeItem]()
	changeSource.Kind = "source"
	changeRate := filled[query.ChangeItem]()
	changeRate.Kind = "rate"
	return []golden{
		{"window", "Window", filled[query.Window]()},
		{"features", "Features", filled[query.Features]()},
		{"site", "Site", filled[query.Site]()},
		{"siteStatus", "SiteStatus", filled[query.SiteStatus]()},
		{"siteSummary", "SiteSummary", filled[query.SiteSummary]()},
		{"totals", "Totals", filled[query.Totals]()},
		{"stats", "Stats", filled[query.StatsResult]()},
		{"point", "Point", filled[query.Point]()},
		{"bucketExtra", "BucketExtra", filled[query.BucketExtra]()},
		{"series", "Series", filled[query.SeriesResult]()},
		{"row", "Row", filled[query.Row]()},
		{"changeDay", "ChangeItem", filled[query.ChangeItem]()},
		{"changeSource", "ChangeItem", changeSource},
		{"changeRate", "ChangeItem", changeRate},
		{"changes", "Changes", filled[query.ChangesResult]()},
		{"heatmap", "Heatmap", filled[query.HeatmapResult]()},
		{"liveEvent", "LiveEvent", filled[query.LiveEvent]()},
		{"live", "Live", filled[query.LiveResult]()},
		{"person", "Person", filled[query.Person]()},
		{"sessionRow", "SessionRow", filled[query.SessionRow]()},
		{"step", "Step", filled[query.Step]()},
		{"goalHit", "GoalHit", filled[query.GoalHit]()},
		{"journeySession", "JourneySession", filled[query.JourneySession]()},
		{"campaign", "Campaign", filled[query.Campaign]()},
		{"aiReferral", "AIReferral", filled[query.AIReferral]()},
		{"eventProp", "EventProp", filled[query.EventProp]()},
		{"eventRow", "EventRow", filled[query.EventRow]()},
		{"eventDetail", "EventDetail", filled[query.EventDetailResult]()},
		{"goal", "Goal", filled[query.Goal]()},
		{"goalStats", "GoalStats", filled[query.GoalStats]()},
		{"goalRow", "GoalRow", filled[query.GoalRow]()},
		{"firstTouchRow", "FirstTouchRow", filled[query.FirstTouchRow]()},
		{"goalDetail", "GoalDetail", filled[query.GoalDetailResult]()},
		{"pathRow", "PathRow", filled[query.PathRow]()},
		{"pathsReport", "PathsReport", filled[query.PathsReport]()},
		{"funnelStep", "FunnelStep", filled[query.FunnelStep]()},
		{"funnel", "Funnel", filled[query.Funnel]()},
		{"funnelStepResult", "FunnelStepResult", filled[query.FunnelStepResult]()},
		{"funnelReport", "FunnelReport", filled[query.FunnelReportResult]()},
		{"dropoffPerson", "DropoffPerson", filled[query.DropoffPerson]()},
		{"money", "Money", filled[query.Money]()},
		{"purchase", "Purchase", filled[query.Purchase]()},
		{"revenue", "Revenue", filled[query.RevenueResult]()},
		{"revenueRow", "RevenueRow", filled[query.RevenueRow]()},
		{"crawlers", "Crawlers", filled[query.CrawlersResult]()},
		{"checkItem", "CheckItem", filled[install.CheckItem]()},
		{"installCheck", "InstallCheck", filled[install.InstallCheck]()},
		{"note", "Note", filled[meta.Note]()},
		{"savedView", "SavedView", filled[meta.SavedView]()},
		{"share", "Share", filled[meta.Share]()},
		{"shareMeta", "ShareMeta", filled[meta.ShareMeta]()},
		{"apiToken", "ApiToken", filled[meta.APIToken]()},
		{"newToken", "NewToken", filled[meta.NewToken]()},
		{"whoAmI", "WhoAmI", filled[meta.WhoAmI]()},
	}
}

func renderGolden(t *testing.T) []byte {
	t.Helper()
	gs := goldens()
	var types []string
	for _, g := range gs {
		if !slices.Contains(types, g.tsType) {
			types = append(types, g.tsType)
		}
	}
	sort.Strings(types)
	var b bytes.Buffer
	b.WriteString("// Code generated by `go test ./internal/query -run Golden -update`. DO NOT EDIT.\n")
	b.WriteString("// Every Go contract type, fully populated, must satisfy its §0.5 TypeScript type: `pnpm build` (tsc) fails on drift.\n\n")
	fmt.Fprintf(&b, "import type {\n  %s,\n} from './types'\n", strings.Join(types, ",\n  "))
	for _, g := range gs {
		j, err := json.MarshalIndent(g.v, "", "  ")
		if err != nil {
			t.Fatalf("marshal %s: %v", g.name, err)
		}
		fmt.Fprintf(&b, "\nexport const %s = %s satisfies %s\n", g.name, j, g.tsType)
	}
	return b.Bytes()
}

// TestContractGolden keeps web/src/api/contract.golden.ts current. Run with -update after a contract change.
func TestContractGolden(t *testing.T) {
	got := renderGolden(t)
	if *update {
		if err := os.WriteFile(goldenPath, got, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden (run with -update): %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("%s is stale: run go test ./internal/query -run Golden -update, then pnpm build", goldenPath)
	}
}
