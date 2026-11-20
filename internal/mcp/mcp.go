// Package mcp serves Trail's read-only reports as Model Context Protocol tools
// over streamable HTTP. Callers must wrap the handler in Bearer auth.
package mcp

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"trail/internal/query"
)

// maxBody caps a JSON-RPC request; tool arguments are tiny.
const maxBody = 64 << 10

var now = time.Now // replaced in tests

type site struct {
	ID     string `json:"id"`
	Domain string `json:"domain"`
}

type server struct {
	db    *sql.DB
	sites map[string]string
	tz    *time.Location
}

// Common tool arguments. Range is a preset string or {from,to} in unix ms.
type (
	statsIn struct {
		Site    string            `json:"site" jsonschema:"site id from list_sites"`
		Range   any               `json:"range,omitempty" jsonschema:"24h, 7d, 30d, 90d or 12mo (default 7d), or {from,to} in unix ms"`
		Env     string            `json:"env,omitempty" jsonschema:"production (default), preview, development or all"`
		Filters map[string]string `json:"filters,omitempty" jsonschema:"dimension to exact value, e.g. {\"country\":\"IN\"}"`
	}
	seriesIn struct {
		Site   string `json:"site" jsonschema:"site id from list_sites"`
		Metric string `json:"metric" jsonschema:"visitors, pageviews or bounce"`
		Range  any    `json:"range,omitempty" jsonschema:"24h, 7d, 30d, 90d or 12mo (default 7d), or {from,to} in unix ms"`
	}
	breakdownIn struct {
		Site  string `json:"site" jsonschema:"site id from list_sites"`
		Dim   string `json:"dim" jsonschema:"one of path, route, host, referrer, utm_source, utm_medium, utm_campaign, country, device, browser, os, event"`
		Range any    `json:"range,omitempty" jsonschema:"24h, 7d, 30d, 90d or 12mo (default 7d), or {from,to} in unix ms"`
		Limit int    `json:"limit,omitempty" jsonschema:"max rows (default 100)"`
	}
	visitorsIn struct {
		Site  string `json:"site" jsonschema:"site id from list_sites"`
		Range any    `json:"range,omitempty" jsonschema:"24h, 7d, 30d, 90d or 12mo (default 7d), or {from,to} in unix ms"`
		Q     string `json:"q,omitempty" jsonschema:"search by person id"`
		Limit int    `json:"limit,omitempty" jsonschema:"max rows (default 100)"`
	}
	journeyIn struct {
		Site   string `json:"site" jsonschema:"site id from list_sites"`
		Person string `json:"person" jsonschema:"person id from list_visitors"`
	}
	goalsIn struct {
		Site  string `json:"site" jsonschema:"site id from list_sites"`
		Range any    `json:"range,omitempty" jsonschema:"24h, 7d, 30d, 90d or 12mo (default 7d), or {from,to} in unix ms"`
	}
)

// New returns the /mcp handler. It is stateless: every POST carries one
// JSON-RPC message and gets a JSON reply.
func New(db *sql.DB, sites map[string]string, tz *time.Location) http.Handler {
	s := &server{db: db, sites: sites, tz: tz}
	srv := sdk.NewServer(&sdk.Implementation{Name: "trail", Title: "Trail analytics", Version: "2"}, &sdk.ServerOptions{
		Instructions: "Read-only web analytics. Call list_sites first; every other tool needs a site id.",
	})
	ro := &sdk.ToolAnnotations{ReadOnlyHint: true}
	add := func(name, desc string) *sdk.Tool { return &sdk.Tool{Name: name, Description: desc, Annotations: ro} }

	sdk.AddTool(srv, add("list_sites", "List tracked sites (id and domain)."),
		func(context.Context, *sdk.CallToolRequest, struct{}) (*sdk.CallToolResult, any, error) {
			return nil, s.list(), nil
		})
	sdk.AddTool(srv, add("get_stats", "Visitors, pageviews and bounce rate for a range, with the previous period and visitors online now."),
		func(_ context.Context, _ *sdk.CallToolRequest, in statsIn) (*sdk.CallToolResult, any, error) {
			p, err := s.params(in.Site, in.Range, in.Env, in.Filters)
			if err != nil {
				return nil, nil, err
			}
			return wrap(query.Stats(s.db, p))
		})
	sdk.AddTool(srv, add("get_series", "Time series of one metric, bucketed by hour or day."),
		func(_ context.Context, _ *sdk.CallToolRequest, in seriesIn) (*sdk.CallToolResult, any, error) {
			p, err := s.params(in.Site, in.Range, "", nil)
			if err != nil {
				return nil, nil, err
			}
			return wrap(query.Series(s.db, p, in.Metric))
		})
	sdk.AddTool(srv, add("get_breakdown", "Top values of one dimension (paths, referrers, countries, devices, events...) by visitors."),
		func(_ context.Context, _ *sdk.CallToolRequest, in breakdownIn) (*sdk.CallToolResult, any, error) {
			p, err := s.params(in.Site, in.Range, "", nil)
			if err != nil {
				return nil, nil, err
			}
			return wrap(query.Breakdown(s.db, p, in.Dim, "", in.Limit))
		})
	sdk.AddTool(srv, add("list_visitors", "Recent visitors (people) with first/last seen, visits, country, device and source."),
		func(_ context.Context, _ *sdk.CallToolRequest, in visitorsIn) (*sdk.CallToolResult, any, error) {
			p, err := s.params(in.Site, in.Range, "", nil)
			if err != nil {
				return nil, nil, err
			}
			return wrap(query.Visitors(s.db, p, in.Q, in.Limit))
		})
	sdk.AddTool(srv, add("get_journey", "One person's sessions and every step in them, newest first."),
		func(_ context.Context, _ *sdk.CallToolRequest, in journeyIn) (*sdk.CallToolResult, any, error) {
			if err := s.site(in.Site); err != nil {
				return nil, nil, err
			}
			if in.Person == "" {
				return nil, nil, errors.New("person is required")
			}
			return wrap(query.Journey(s.db, in.Site, in.Person))
		})
	sdk.AddTool(srv, add("goal_report", "Conversions, converting visitors and conversion rate for each goal, with the previous period."),
		func(_ context.Context, _ *sdk.CallToolRequest, in goalsIn) (*sdk.CallToolResult, any, error) {
			p, err := s.params(in.Site, in.Range, "", nil)
			if err != nil {
				return nil, nil, err
			}
			return wrap(query.GoalReport(s.db, p))
		})

	h := sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return srv }, &sdk.StreamableHTTPOptions{
		Stateless:           true,
		JSONResponse:        true,
		MaxRequestBodyBytes: maxBody,
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Clients that only send Accept: application/json still get JSON back.
		if r.Method == http.MethodPost && !strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
			r.Header.Set("Accept", "application/json, text/event-stream")
		}
		h.ServeHTTP(w, r)
	})
}

func (s *server) list() []site {
	out := make([]site, 0, len(s.sites))
	for id, d := range s.sites {
		out = append(out, site{ID: id, Domain: d})
	}
	slices.SortFunc(out, func(a, b site) int { return strings.Compare(a.ID, b.ID) })
	return out
}

func (s *server) site(id string) error {
	if _, ok := s.sites[id]; !ok {
		return fmt.Errorf("unknown site %q; call list_sites", id)
	}
	return nil
}

// wrap adapts a query result to a tool result. A query error becomes a tool
// error (isError:true); a nil slice becomes [] so clients never see null.
func wrap[T any](v T, err error) (*sdk.CallToolResult, any, error) {
	if err != nil {
		if errors.Is(err, query.ErrBadDim) || errors.Is(err, query.ErrBadMetric) {
			return nil, nil, err
		}
		log.Printf("mcp: query: %v", err)
		return nil, nil, errors.New("query failed")
	}
	b, _ := json.Marshal(v)
	if string(b) == "null" {
		return nil, []any{}, nil
	}
	return nil, v, nil
}

var presets = map[string]time.Duration{
	"24h":  24 * time.Hour,
	"7d":   7 * 24 * time.Hour,
	"30d":  30 * 24 * time.Hour,
	"90d":  90 * 24 * time.Hour,
	"12mo": 365 * 24 * time.Hour,
}

// maxSpan matches the dashboard API's 400-day cap.
const maxSpan = 400 * 24 * time.Hour

func (s *server) params(id string, rng any, env string, filters map[string]string) (query.Params, error) {
	p := query.Params{Site: id, Env: env, TZ: s.tz, Filters: filters}
	if err := s.site(id); err != nil {
		return p, err
	}
	switch p.Env {
	case "":
		p.Env = "production"
	case "production", "preview", "development", "all":
	default:
		return p, fmt.Errorf("bad env %q", env)
	}
	if p.Filters == nil {
		p.Filters = map[string]string{}
	}
	end := now()
	p.To = end.UnixMilli()
	switch r := rng.(type) {
	case nil:
		p.From = end.Add(-presets["7d"]).UnixMilli()
	case string:
		d, ok := presets[r]
		if !ok {
			return p, fmt.Errorf("bad range %q: want 24h, 7d, 30d, 90d, 12mo or {from,to}", r)
		}
		p.From = end.Add(-d).UnixMilli()
	case map[string]any:
		from, ok1 := r["from"].(float64)
		to, ok2 := r["to"].(float64)
		if !ok1 || !ok2 || len(r) != 2 {
			return p, errors.New("bad range: want {from,to} in unix ms")
		}
		p.From, p.To = int64(from), int64(to)
	default:
		return p, errors.New("bad range: want a preset string or {from,to}")
	}
	if p.From < 0 || p.From > p.To || p.To-p.From > maxSpan.Milliseconds() {
		return p, errors.New("bad range: need 0 <= from <= to and at most 400 days")
	}
	return p, nil
}
