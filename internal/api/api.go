// Package api serves the dashboard JSON under /api/*. Callers must wrap it in auth.
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"trail/internal/query"
)

type site struct {
	ID     string `json:"id"`
	Domain string `json:"domain"`
}

type server struct {
	db    *sql.DB
	sites map[string]string
	list  []site
	tz    *time.Location
}

// errBadRequest marks client errors that map to 400.
var errBadRequest = errors.New("bad request")

// New returns the /api/* handler. sites maps id to domain; tz sets day buckets.
func New(db *sql.DB, sites map[string]string, tz *time.Location) http.Handler {
	s := &server{db: db, sites: sites, tz: tz, list: []site{}}
	for id, d := range sites {
		s.list = append(s.list, site{ID: id, Domain: d})
	}
	slices.SortFunc(s.list, func(a, b site) int { return strings.Compare(a.ID, b.ID) })

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/sites", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, s.list) })
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
	return mux
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
		switch {
		case errors.Is(err, errBadRequest) || errors.Is(err, query.ErrBadDim):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case err != nil:
			log.Printf("api %s: %v", r.URL.Path, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
		default:
			writeJSON(w, v)
		}
	}
}

func (s *server) params(r *http.Request) (query.Params, error) {
	q := r.URL.Query()
	p := query.Params{Site: q.Get("site"), Env: q.Get("env"), TZ: s.tz, Filters: map[string]string{}}
	if _, ok := s.sites[p.Site]; !ok {
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
	if p.From > p.To {
		return p, errors.New("from after to")
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
