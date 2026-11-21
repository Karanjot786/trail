package api

import (
	"errors"
	"net/http"
	"strconv"

	"trail/internal/auth"
	"trail/internal/query"
)

// list is a report result plus its total row count (sent as X-Total-Count).
type list struct {
	rows  any
	total int
}

// reportRoutes wires the v3 report routes of plan §0.4 to their query functions.
func (s *server) reportRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/stats", s.handleAll(func(p query.Params, _ *http.Request) (any, error) {
		st, err := query.Stats(s.db, p)
		if err != nil {
			return nil, err
		}
		if p.Site != "all" {
			n, configured, err := query.CrawlTotal(s.db, p.Site, p.From, p.To)
			switch {
			case errors.Is(err, query.ErrNotImplemented):
			case err != nil:
				return nil, err
			case configured:
				st.BotRequests = &n
			}
		}
		return st, nil
	}))
	mux.HandleFunc("GET /api/series", s.handleAll(func(p query.Params, r *http.Request) (any, error) {
		return query.Series(s.db, p, r.URL.Query().Get("metric"), r.URL.Query().Get("extras") == "1")
	}))
	mux.HandleFunc("GET /api/breakdown", s.handleAll(func(p query.Params, r *http.Request) (any, error) {
		q := r.URL.Query()
		return query.Breakdown(s.db, p, q.Get("dim"), q.Get("q"), p.Limit)
	}))
	mux.HandleFunc("GET /api/sites/summary", s.handleAll(func(p query.Params, r *http.Request) (any, error) {
		return query.SitesSummary(s.db, p, s.visibleSiteIDs(r))
	}))
	mux.HandleFunc("GET /api/changes", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Changes(s.db, p)
	}))
	mux.HandleFunc("GET /api/heatmap", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Heatmap(s.db, p)
	}))
	mux.HandleFunc("GET /api/live", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Live(s.db, p)
	}))
	mux.HandleFunc("GET /api/visitors", s.handle(func(p query.Params, r *http.Request) (any, error) {
		rows, total, err := query.Visitors(s.db, p, r.URL.Query().Get("q"))
		return list{rows, total}, err
	}))
	mux.HandleFunc("GET /api/sessions", s.handle(func(p query.Params, r *http.Request) (any, error) {
		rows, total, err := query.Sessions(s.db, p, r.URL.Query().Get("person"))
		return list{rows, total}, err
	}))
	mux.HandleFunc("GET /api/journey", s.handle(func(p query.Params, r *http.Request) (any, error) {
		person := r.URL.Query().Get("person")
		if person == "" {
			return nil, errBadRequest
		}
		goals, err := query.ListGoals(s.db, p.Site)
		if err != nil {
			return nil, err
		}
		return query.Journey(s.db, p.Site, person, goals)
	}))
	mux.HandleFunc("GET /api/campaigns", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Campaigns(s.db, p)
	}))
	mux.HandleFunc("GET /api/ai-referrals", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.AIReferrals(s.db, p)
	}))
	mux.HandleFunc("GET /api/events", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.EventCatalogue(s.db, p)
	}))
	mux.HandleFunc("GET /api/events/detail", s.handle(func(p query.Params, r *http.Request) (any, error) {
		name := r.URL.Query().Get("name")
		if name == "" {
			return nil, errBadRequest
		}
		return query.EventDetail(s.db, p, name)
	}))
	mux.HandleFunc("GET /api/goals/report", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.GoalReport(s.db, p)
	}))
	mux.HandleFunc("GET /api/goals/{id}/detail", s.handle(func(p query.Params, r *http.Request) (any, error) {
		id, err := pathID(r)
		if err != nil {
			return nil, err
		}
		return query.GoalDetail(s.db, p, id)
	}))
	mux.HandleFunc("GET /api/paths", s.handle(func(p query.Params, r *http.Request) (any, error) {
		id, err := strconv.ParseInt(r.URL.Query().Get("goal"), 10, 64)
		if err != nil {
			return nil, errBadRequest
		}
		return query.PathsToGoal(s.db, p, id)
	}))
	mux.HandleFunc("GET /api/funnels/{id}/report", s.handle(func(p query.Params, r *http.Request) (any, error) {
		id, err := s.funnelID(p, r)
		if err != nil {
			return nil, err
		}
		return query.FunnelReport(s.db, p, id)
	}))
	mux.HandleFunc("GET /api/funnels/{id}/dropoff", s.handle(func(p query.Params, r *http.Request) (any, error) {
		id, err := s.funnelID(p, r)
		if err != nil {
			return nil, err
		}
		step, err := strconv.Atoi(r.URL.Query().Get("step"))
		if err != nil || step < 0 {
			return nil, errBadRequest
		}
		rows, total, err := query.FunnelDropoff(s.db, p, id, step)
		return list{rows, total}, err
	}))
	mux.HandleFunc("GET /api/revenue", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Revenue(s.db, p)
	}))
	mux.HandleFunc("GET /api/revenue/breakdown", s.handle(func(p query.Params, r *http.Request) (any, error) {
		return query.RevenueBreakdown(s.db, p, r.URL.Query().Get("dim"))
	}))
	mux.HandleFunc("GET /api/crawlers", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Crawlers(s.db, p)
	}))
	mux.HandleFunc("GET /api/delivery", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Delivery(s.db, p)
	}))
	// AI agents plan §0.5. P0 wires the stubs (501); B-api fills them and may move ai-setup to ai_setup.go.
	mux.HandleFunc("GET /api/ai-visibility", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.AIVisibility(s.db, p)
	}))
	mux.HandleFunc("GET /api/agents", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Agents(s.db, p)
	}))
	mux.HandleFunc("GET /api/ai-setup", s.aiSetup)
}

// aiSetup is GET /api/ai-setup?site=: the Unlock AI crawlers card's status (no range).
func (s *server) aiSetup(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	if !s.siteOK(w, r, site) {
		return
	}
	res, err := query.AISetupFor(s.db, site, s.now())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, res)
}

// funnelID parses {id} and checks the funnel exists for the site (404 otherwise).
func (s *server) funnelID(p query.Params, r *http.Request) (int64, error) {
	id, err := pathID(r)
	if err != nil {
		return 0, err
	}
	if _, err := query.GetFunnel(s.db, p.Site, id); err != nil {
		return 0, err
	}
	return id, nil
}

// pathID parses the {id} path segment.
func pathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, errBadRequest
	}
	return id, nil
}

// visibleSiteIDs is every site id, or only the bearer token's site.
func (s *server) visibleSiteIDs(r *http.Request) []string {
	ids := []string{}
	t, scoped := auth.TokenFrom(r.Context())
	for _, site := range s.sites.List() {
		if scoped && t.Site != "" && t.Site != site.ID {
			continue
		}
		ids = append(ids, site.ID)
	}
	return ids
}
