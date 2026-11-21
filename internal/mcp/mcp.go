// Package mcp serves Trail's reports as Model Context Protocol tools over
// streamable HTTP. Callers must wrap the handler in auth.API: every tool is
// read-only except add_note, which needs a notes or write token.
package mcp

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"trail/internal/auth"
	"trail/internal/meta"
	"trail/internal/query"
	"trail/internal/sites"
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
	sites *sites.Registry
	tz    *time.Location
}

const (
	rangeDoc = "today, yesterday, wtd, mtd, lastmonth, 7d, 30d (default), 90d, 12mo, d:YYYY-MM-DD, c:YYYY-MM-DD~YYYY-MM-DD; also 24h or {from,to} in unix ms"
	dimDoc   = "one of path, route, host, entry, exit, referrer, source, channel, ai_source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, country, region, city, device, browser, os, event, goal, dow, hour"
)

// Scope is the argument set every report tool takes.
type Scope struct {
	Site    string            `json:"site" jsonschema:"site id from list_sites"`
	Range   any               `json:"range,omitempty" jsonschema:"today, yesterday, wtd, mtd, lastmonth, 7d, 30d (default), 90d, 12mo, d:YYYY-MM-DD, c:YYYY-MM-DD~YYYY-MM-DD; also 24h or {from,to} in unix ms"`
	Cmp     string            `json:"cmp,omitempty" jsonschema:"comparison: prev (default), none or c:YYYY-MM-DD (custom start)"`
	TZ      string            `json:"tz,omitempty" jsonschema:"IANA time zone for day boundaries, e.g. Europe/Berlin (default: the server's)"`
	Env     string            `json:"env,omitempty" jsonschema:"production (default), preview, development or all"`
	Filters map[string]string `json:"filters,omitempty" jsonschema:"dimension to exact value, e.g. {\"country\":\"IN\"}"`
	Actor   string            `json:"actor,omitempty" jsonschema:"human (default) or all: count AI browsing agents as visitors"`
}

type (
	seriesIn struct {
		Scope
		Metric string `json:"metric" jsonschema:"visitors, pageviews, sessions, duration, bounce, conversion or revenue"`
	}
	breakdownIn struct {
		Scope
		Dim   string `json:"dim" jsonschema:"one of path, route, host, entry, exit, referrer, source, channel, ai_source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, country, region, city, device, browser, os, event, goal, dow, hour"`
		Limit int    `json:"limit,omitempty" jsonschema:"max rows (default 100, at most 1000)"`
	}
	visitorsIn struct {
		Scope
		Q     string `json:"q,omitempty" jsonschema:"search by person id"`
		Limit int    `json:"limit,omitempty" jsonschema:"max rows (default 100, at most 1000)"`
	}
	sessionsIn struct {
		Scope
		Person string `json:"person,omitempty" jsonschema:"only this person's sessions"`
		Limit  int    `json:"limit,omitempty" jsonschema:"max rows (default 100, at most 1000)"`
	}
	journeyIn struct {
		Site   string `json:"site" jsonschema:"site id from list_sites"`
		Person string `json:"person" jsonschema:"person id from list_visitors"`
	}
	eventIn struct {
		Scope
		Name string `json:"name" jsonschema:"event name from list_events"`
	}
	idIn struct {
		Scope
		ID int64 `json:"id" jsonschema:"id from goal_report or list_funnels"`
	}
	dropoffIn struct {
		Scope
		ID   int64 `json:"id" jsonschema:"funnel id from list_funnels"`
		Step int   `json:"step" jsonschema:"1-based step number; lists people who reached it and did not reach the next"`
	}
	siteIn struct {
		Site string `json:"site" jsonschema:"site id from list_sites"`
	}
	noteIn struct {
		Site  string `json:"site" jsonschema:"site id from list_sites"`
		TS    int64  `json:"ts,omitempty" jsonschema:"when it happened, unix ms (default now)"`
		Label string `json:"label" jsonschema:"what happened, 1-80 characters"`
		Kind  string `json:"kind,omitempty" jsonschema:"deploy, campaign, press or other (default)"`
	}
)

// goalOut is get_goal: the goal's numbers plus the paths converters took.
type goalOut struct {
	Detail query.GoalDetailResult `json:"detail"`
	Paths  query.PathsReport      `json:"paths"`
}

// New returns the /mcp handler. It is stateless: every POST carries one
// JSON-RPC message and gets a JSON reply.
func New(db *sql.DB, reg *sites.Registry, tz *time.Location) http.Handler {
	s := &server{db: db, sites: reg, tz: tz}
	srv := sdk.NewServer(&sdk.Implementation{Name: "trail", Title: "Trail analytics", Version: "3"}, &sdk.ServerOptions{
		Instructions: "Web analytics for the sites in list_sites. Call list_sites first, then what_changed for a site " +
			"to see what moved; every other tool needs a site id. Ranges use keys like 7d, 30d, mtd or d:2026-11-12, " +
			"and every report compares with the previous period unless cmp is none. Only add_note writes.",
	})
	ro := &sdk.ToolAnnotations{ReadOnlyHint: true}

	sdk.AddTool(srv, &sdk.Tool{Name: "list_sites", Description: "List tracked sites (id and domain).", Annotations: ro},
		func(ctx context.Context, _ *sdk.CallToolRequest, _ struct{}) (*sdk.CallToolResult, any, error) {
			return nil, s.list(ctx), nil
		})
	report(srv, s, "get_stats", "Headline numbers for a range (visitors, page views, sessions, duration, bounce, conversions, revenue) with the previous period and visitors online now.",
		func(p query.Params, _ Scope) (any, error) { return query.Stats(s.db, p) })
	report(srv, s, "get_series", "Time series of one metric, bucketed by hour or day, with the previous period.",
		func(p query.Params, in seriesIn) (any, error) { return query.Series(s.db, p, in.Metric, false) })
	report(srv, s, "get_breakdown", "Top values of one dimension (pages, sources, channels, countries, devices, events...) by visitors.",
		func(p query.Params, in breakdownIn) (any, error) {
			return query.Breakdown(s.db, p, in.Dim, "", clamp(in.Limit))
		})
	report(srv, s, "list_visitors", "Visitors (people) with first and last seen, visits, location, device and source.",
		func(p query.Params, in visitorsIn) (any, error) {
			p.Limit = clamp(in.Limit)
			rows, _, err := query.Visitors(s.db, p, in.Q)
			return rows, err
		})
	report(srv, s, "get_sessions", "Sessions with duration, pages, entry and exit, source, goals and revenue.",
		func(p query.Params, in sessionsIn) (any, error) {
			p.Limit = clamp(in.Limit)
			rows, _, err := query.Sessions(s.db, p, in.Person)
			return rows, err
		})
	sdk.AddTool(srv, &sdk.Tool{Name: "get_journey", Description: "One person's sessions and every step in them, newest first.", Annotations: ro},
		func(ctx context.Context, _ *sdk.CallToolRequest, in journeyIn) (*sdk.CallToolResult, any, error) {
			if err := s.site(ctx, in.Site); err != nil {
				return nil, nil, err
			}
			if in.Person == "" {
				return nil, nil, errors.New("person is required")
			}
			goals, err := query.ListGoals(s.db, in.Site)
			if err != nil {
				return wrap[any](nil, err)
			}
			return wrap(query.Journey(s.db, in.Site, in.Person, goals))
		})
	report(srv, s, "goal_report", "Conversions, converting visitors and conversion rate for each goal, with the previous period.",
		func(p query.Params, _ Scope) (any, error) { return query.GoalReport(s.db, p) })
	report(srv, s, "get_goal", "One goal in detail: numbers, series, first-touch sources and landing pages, and the paths converters took.",
		func(p query.Params, in idIn) (any, error) {
			d, err := query.GoalDetail(s.db, p, in.ID)
			if err != nil {
				return nil, err
			}
			paths, err := query.PathsToGoal(s.db, p, in.ID)
			return goalOut{Detail: d, Paths: paths}, err
		})
	report(srv, s, "get_campaigns", "UTM campaigns with visitors, sessions, bounce, conversion and revenue.",
		func(p query.Params, _ Scope) (any, error) { return query.Campaigns(s.db, p) })
	report(srv, s, "get_ai_referrals", "AI assistants (ChatGPT, Perplexity, Claude...) that sent visitors.",
		func(p query.Params, _ Scope) (any, error) { return query.AIReferrals(s.db, p) })
	report(srv, s, "list_events", "Custom and outbound events with counts, people and their properties.",
		func(p query.Params, _ Scope) (any, error) { return query.EventCatalogue(s.db, p) })
	report(srv, s, "get_event", "One event in detail: counts, series, property values and the latest occurrences.",
		func(p query.Params, in eventIn) (any, error) {
			if in.Name == "" {
				return nil, errors.New("name is required")
			}
			return query.EventDetail(s.db, p, in.Name)
		})
	sdk.AddTool(srv, &sdk.Tool{Name: "list_funnels", Description: "The site's funnel definitions.", Annotations: ro},
		func(ctx context.Context, _ *sdk.CallToolRequest, in siteIn) (*sdk.CallToolResult, any, error) {
			if err := s.site(ctx, in.Site); err != nil {
				return nil, nil, err
			}
			return wrap(query.ListFunnels(s.db, in.Site))
		})
	report(srv, s, "get_funnel", "Run a funnel: people reaching each step, conversion from start and from the previous step, and the biggest drop.",
		func(p query.Params, in idIn) (any, error) { return query.FunnelReport(s.db, p, in.ID) })
	report(srv, s, "get_funnel_dropoff", "People who reached a funnel step and did not reach the next one.",
		func(p query.Params, in dropoffIn) (any, error) {
			rows, _, err := query.FunnelDropoff(s.db, p, in.ID, in.Step)
			return rows, err
		})
	report(srv, s, "get_revenue", "Revenue reported by the site (Purchase events): net, purchases, buyers, average order, series and latest purchases.",
		func(p query.Params, _ Scope) (any, error) { return query.Revenue(s.db, p) })
	report(srv, s, "get_heatmap", "Visitors by weekday and hour over the last four weeks, with the busiest hours.",
		func(p query.Params, _ Scope) (any, error) { return query.Heatmap(s.db, p) })
	report(srv, s, "get_live", "What is happening right now: active visitors, countries, sources, pages and the latest events.",
		func(p query.Params, _ Scope) (any, error) { return query.Live(s.db, p) })
	report(srv, s, "what_changed", "The few biggest changes against the comparison period (busy days, sources gained or lost, rate changes). A good first call after list_sites.",
		func(p query.Params, _ Scope) (any, error) { return query.Changes(s.db, p) })
	report(srv, s, "get_crawlers", "AI crawler requests from server logs, by category, provider, crawler and page. "+
		"Includes the verified share where crawlers publish IP lists.",
		func(p query.Params, _ Scope) (any, error) { return query.Crawlers(s.db, p) })
	report(srv, s, "get_ai_visibility", "The AI visibility funnel: crawled, fetched for an answer, cited (no public source), "+
		"visited from AI assistants and converted, by provider and page.",
		func(p query.Params, _ Scope) (any, error) { return query.AIVisibility(s.db, p) })
	report(srv, s, "get_agents", "AI browsing agents that ran the site's script: sessions, verified or claimed, pages and latest sessions.",
		func(p query.Params, _ Scope) (any, error) { return query.Agents(s.db, p) })
	report(srv, s, "list_notes", "Chart notes (deploys, campaigns, press) in the range.",
		func(p query.Params, _ Scope) (any, error) { return meta.ListNotes(s.db, p.Site, p.From, p.To) })

	sdk.AddTool(srv, &sdk.Tool{Name: "add_note", Description: "Add a chart note (a deploy, campaign or press mention). Needs a notes or write token.",
		Annotations: &sdk.ToolAnnotations{ReadOnlyHint: false}},
		func(ctx context.Context, _ *sdk.CallToolRequest, in noteIn) (*sdk.CallToolResult, any, error) {
			if err := s.site(ctx, in.Site); err != nil {
				return nil, nil, err
			}
			if t, ok := auth.TokenFrom(ctx); !ok || (t.Scope != meta.ScopeNotes && t.Scope != meta.ScopeWrite) {
				return nil, nil, errors.New("add_note needs a token with the notes or write scope")
			}
			if in.TS == 0 {
				in.TS = now().UnixMilli()
			}
			n, err := meta.AddNote(s.db, meta.Note{Site: in.Site, TS: in.TS, Label: in.Label, Kind: in.Kind})
			if errors.Is(err, meta.ErrInvalid) {
				return nil, nil, err
			}
			return wrap(n, err)
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

// scoped is any tool input that carries the common Scope.
type scoped interface{ scope() Scope }

func (s Scope) scope() Scope { return s }

// report registers a read-only report tool: it resolves the Scope into
// Params, then runs fn.
func report[In scoped](srv *sdk.Server, s *server, name, desc string, fn func(query.Params, In) (any, error)) {
	sdk.AddTool(srv, &sdk.Tool{Name: name, Description: desc, Annotations: &sdk.ToolAnnotations{ReadOnlyHint: true}},
		func(ctx context.Context, _ *sdk.CallToolRequest, in In) (*sdk.CallToolResult, any, error) {
			p, err := s.params(ctx, in.scope())
			if err != nil {
				return nil, nil, err
			}
			return wrap(fn(p, in))
		})
}

func clamp(n int) int {
	if n <= 0 {
		return 100
	}
	return min(n, 1000)
}

// list returns the sites the caller may see (a site-bound token sees one).
func (s *server) list(ctx context.Context) []site {
	t, scoped := auth.TokenFrom(ctx)
	out := []site{}
	for _, x := range s.sites.List() {
		if scoped && t.Site != "" && t.Site != x.ID {
			continue
		}
		out = append(out, site{ID: x.ID, Domain: x.Domain})
	}
	return out
}

func (s *server) site(ctx context.Context, id string) error {
	if _, ok := s.sites.Get(id); !ok {
		return fmt.Errorf("unknown site %q; call list_sites", id)
	}
	if t, ok := auth.TokenFrom(ctx); ok && t.Site != "" && t.Site != id {
		return fmt.Errorf("token is limited to site %s", t.Site)
	}
	return nil
}

// userErrs are query errors whose text is safe and useful to the model.
var userErrs = []error{query.ErrBadRequest, query.ErrBadDim, query.ErrBadMetric, query.ErrNotFound, query.ErrGoalNotFound, query.ErrNeedSite, query.ErrNotImplemented}

// wrap adapts a query result to a tool result. A query error becomes a tool
// error (isError:true); a nil slice becomes [] so clients never see null.
func wrap[T any](v T, err error) (*sdk.CallToolResult, any, error) {
	if err != nil {
		for _, e := range userErrs {
			if errors.Is(err, e) {
				return nil, nil, err
			}
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

// legacy are the v2 duration presets, still accepted.
var legacy = map[string]time.Duration{"24h": 24 * time.Hour}

// maxSpan matches the dashboard API's 400-day cap.
const maxSpan = 400 * 24 * time.Hour

func (s *server) params(ctx context.Context, in Scope) (query.Params, error) {
	p := query.Params{Site: in.Site, Env: in.Env, TZ: s.tz, Filters: in.Filters, Now: now(), Limit: 100}
	if err := s.site(ctx, in.Site); err != nil {
		return p, err
	}
	switch p.Env {
	case "":
		p.Env = "production"
	case "production", "preview", "development", "all":
	default:
		return p, fmt.Errorf("bad env %q", in.Env)
	}
	switch in.Actor {
	case "", query.ActorHuman, query.ActorAll:
		p.Actor = in.Actor
	default:
		return p, fmt.Errorf("bad actor %q: want human or all", in.Actor)
	}
	if p.Filters == nil {
		p.Filters = map[string]string{}
	}
	if in.TZ != "" && len(in.TZ) <= 64 {
		if loc, err := time.LoadLocation(in.TZ); err == nil {
			p.TZ = loc
		}
	}
	cmp := in.Cmp
	if cmp == "" {
		cmp = "prev"
	}
	key := "30d"
	var legacyFrom, legacyTo int64
	switch r := in.Range.(type) {
	case nil:
	case string:
		if r == "" {
			return p, fmt.Errorf("bad range: want %s", rangeDoc)
		}
		if d, ok := legacy[r]; ok {
			legacyTo, legacyFrom = p.Now.UnixMilli(), p.Now.Add(-d).UnixMilli()
			break
		}
		key = r
	case map[string]any:
		from, ok1 := r["from"].(float64)
		to, ok2 := r["to"].(float64)
		if !ok1 || !ok2 || len(r) != 2 {
			return p, errors.New("bad range: want {from,to} in unix ms")
		}
		legacyFrom, legacyTo = int64(from), int64(to)
		if legacyFrom < 0 || legacyFrom > legacyTo || legacyTo-legacyFrom > maxSpan.Milliseconds() {
			return p, errors.New("bad range: need 0 <= from <= to and at most 400 days")
		}
	default:
		return p, errors.New("bad range: want a range key or {from,to}")
	}
	if legacyTo != 0 {
		day := func(ms int64) string { return time.UnixMilli(ms).In(p.TZ).Format(time.DateOnly) }
		key = "c:" + day(legacyFrom) + "~" + day(legacyTo)
	}
	win, err := query.ResolveWindow(key, cmp, p.Now, p.TZ, 0)
	if err != nil {
		return p, fmt.Errorf("bad range or cmp: %w", err)
	}
	if win.Invalid != "" {
		return p, fmt.Errorf("bad range %q: want %s", key, rangeDoc)
	}
	if legacyTo != 0 {
		win.From, win.To = legacyFrom, legacyTo
	}
	p.Win, p.From, p.To = win, win.From, win.To
	return p, nil
}
