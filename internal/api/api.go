// Package api serves the dashboard JSON under /api/*. Callers must wrap it in auth.
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trail/internal/query"
	"trail/internal/sites"
)

type server struct {
	db    *sql.DB
	sites *sites.Registry
	tz    *time.Location
}

// maxSpan caps a query range (ms) so series bucketing stays bounded.
const maxSpan = 400 * 24 * 60 * 60 * 1000

// errBadRequest marks client errors that map to 400.
var errBadRequest = errors.New("bad request")

// New returns the /api/* handler. reg holds the sites; tz sets day buckets.
func New(db *sql.DB, reg *sites.Registry, tz *time.Location) http.Handler {
	s := &server{db: db, sites: reg, tz: tz}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/sites", s.listSites)
	mux.HandleFunc("POST /api/sites", s.createSite)
	mux.HandleFunc("PATCH /api/sites/{id}", s.updateSite)
	mux.HandleFunc("DELETE /api/sites/{id}", s.deleteSite)
	mux.HandleFunc("GET /api/sites/{id}/status", s.siteStatus)
	mux.HandleFunc("GET /api/stats", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Stats(s.db, p)
	}))
	mux.HandleFunc("GET /api/series", s.handle(func(p query.Params, r *http.Request) (any, error) {
		return query.Series(s.db, p, r.URL.Query().Get("metric"))
	}))
	mux.HandleFunc("GET /api/breakdown", s.handle(func(p query.Params, r *http.Request) (any, error) {
		q := r.URL.Query()
		return query.Breakdown(s.db, p, q.Get("dim"), q.Get("q"), atoi(q.Get("limit")))
	}))
	mux.HandleFunc("GET /api/visitors", s.handle(func(p query.Params, r *http.Request) (any, error) {
		q := r.URL.Query()
		return query.Visitors(s.db, p, q.Get("q"), atoi(q.Get("limit")))
	}))
	mux.HandleFunc("GET /api/journey", s.handle(func(p query.Params, r *http.Request) (any, error) {
		person := r.URL.Query().Get("person")
		if person == "" {
			return nil, errBadRequest
		}
		return query.Journey(s.db, p.Site, person)
	}))
	mux.HandleFunc("GET /api/goals/report", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.GoalReport(s.db, p)
	}))
	mux.HandleFunc("GET /api/delivery", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return query.Delivery(s.db, p)
	}))
	mux.HandleFunc("GET /api/goals", s.listGoals)
	mux.HandleFunc("POST /api/goals", s.createGoal)
	mux.HandleFunc("DELETE /api/goals/{id}", s.deleteGoal)
	return mux
}

// maxGoalBody caps a goal create body; a valid goal is well under 1 KB.
const maxGoalBody = 4 << 10

func (s *server) listGoals(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	if !s.known(site) {
		http.Error(w, "unknown site", http.StatusBadRequest)
		return
	}
	goals, err := query.ListGoals(s.db, site)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, goals)
}

func (s *server) createGoal(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Site, Name, Kind, Match string
	}
	if !readJSON(w, r, &in) {
		return
	}
	if !s.known(in.Site) {
		http.Error(w, "unknown site", http.StatusBadRequest)
		return
	}
	g, err := query.CreateGoal(s.db, in.Site, query.Goal{Name: in.Name, Kind: in.Kind, Match: in.Match})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, g)
}

func (s *server) deleteGoal(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if !s.known(site) || err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := query.DeleteGoal(s.db, site, id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// readJSON decodes a small JSON body into v, or writes the error and returns false.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	// A non-JSON type (e.g. text/plain) is what a cross-site form can send.
	if mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mt != "application/json" {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxGoalBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return false
	}
	return true
}

func (s *server) known(id string) bool {
	_, ok := s.sites.Get(id)
	return ok
}

// fail maps err to 400, 404 or 500.
func (s *server) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, errBadRequest) || errors.Is(err, query.ErrBadDim) || errors.Is(err, query.ErrBadMetric) ||
		errors.Is(err, query.ErrBadGoal) || errors.Is(err, sites.ErrInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, query.ErrGoalNotFound) || errors.Is(err, sites.ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, sites.ErrExists):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		log.Printf("api %s: %v", r.URL.Path, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// handle parses common params, runs fn, and maps errors to 400 or 500.
func (s *server) handle(fn func(query.Params, *http.Request) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, err := s.params(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		v, err := fn(p, r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeJSON(w, v)
	}
}

func (s *server) params(r *http.Request) (query.Params, error) {
	q := r.URL.Query()
	p := query.Params{Site: q.Get("site"), Env: q.Get("env"), TZ: s.tz, Filters: map[string]string{}}
	if !s.known(p.Site) {
		return p, errors.New("unknown site")
	}
	switch p.Env {
	case "":
		p.Env = "production"
	case "production", "preview", "development", "all":
	default:
		return p, errors.New("bad env")
	}

	now := time.Now().UnixMilli()
	p.To, p.From = now, now-24*60*60*1000
	for key, dst := range map[string]*int64{"from": &p.From, "to": &p.To} {
		if v := q.Get(key); v != "" {
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				return p, errors.New("bad " + key)
			}
			*dst = n
		}
	}
	if p.From < 0 || p.From > p.To || p.To-p.From > maxSpan {
		return p, errors.New("bad range: need 0 <= from <= to and at most 400 days")
	}

	for _, f := range q["f"] {
		dim, val, ok := strings.Cut(f, ":")
		if !ok || dim == "" {
			return p, errors.New("bad filter, want f=dim:value")
		}
		p.Filters[dim] = val
	}
	return p, nil
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s) // empty or junk → 0 → query default
	return n
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("api: encode: %v", err)
	}
}
