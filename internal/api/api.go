// Package api serves the dashboard JSON under /api/*. Callers must wrap it in auth.
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"trail/internal/auth"
	"trail/internal/install"
	"trail/internal/meta"
	"trail/internal/query"
	"trail/internal/sites"
)

type server struct {
	db    *sql.DB
	sites *sites.Registry
	tz    *time.Location
	now   func() time.Time

	envTokens []auth.Token
	fetcher   install.Fetcher
	checks    checkCache

	startMu sync.Mutex
	starts  map[string]startCache
}

type startCache struct {
	ts int64
	at time.Time
}

// Option configures New.
type Option func(*server)

// WithClock pins the server clock (the demo and tests use it).
func WithClock(now func() time.Time) Option { return func(s *server) { s.now = now } }

// maxSpan caps a query range (ms) so series bucketing stays bounded.
const maxSpan = 400 * 24 * 60 * 60 * 1000

var (
	// errBadRequest marks client errors that map to 400.
	errBadRequest = errors.New("bad request")
	// errSiteScope marks a token used outside its site (403).
	errSiteScope = errors.New("token is limited to another site")
)

// checkTokenSite refuses a site-bound bearer token on any other site (plan §0.12).
func checkTokenSite(r *http.Request, site string) error {
	if t, ok := auth.TokenFrom(r.Context()); ok && t.Site != "" && t.Site != site {
		return fmt.Errorf("%w: token is limited to site %s", errSiteScope, t.Site)
	}
	return nil
}

// New returns the /api/* handler. reg holds the sites; tz sets day buckets.
func New(db *sql.DB, reg *sites.Registry, tz *time.Location, opts ...Option) http.Handler {
	return newServer(db, reg, tz, opts...).routes()
}

func newServer(db *sql.DB, reg *sites.Registry, tz *time.Location, opts ...Option) *server {
	s := &server{db: db, sites: reg, tz: tz, now: time.Now, starts: map[string]startCache{},
		fetcher: install.NewSafeFetcher(), checks: checkCache{byID: map[string]cachedCheck{}}}
	for _, o := range opts {
		o(s)
	}
	return s
}

func (s *server) routes() http.Handler {

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/sites", s.listSites)
	mux.HandleFunc("POST /api/sites", s.allSitesToken(s.createSite))
	mux.HandleFunc("PATCH /api/sites/{id}", s.allSitesToken(s.updateSite))
	mux.HandleFunc("DELETE /api/sites/{id}", s.allSitesToken(s.deleteSite))
	mux.HandleFunc("GET /api/sites/{id}/status", s.siteStatus)
	s.reportRoutes(mux)
	s.metaRoutes(mux)
	s.tokenRoutes(mux)
	s.shareRoutes(mux)
	s.installRoutes(mux)
	mux.HandleFunc("POST /api/crawls", s.postCrawls)
	mux.HandleFunc("GET /api/goals", s.listGoals)
	mux.HandleFunc("POST /api/goals", s.createGoal)
	mux.HandleFunc("DELETE /api/goals/{id}", s.deleteGoal)
	return mux
}

// maxGoalBody caps a goal create body; a valid goal is well under 1 KB.
const maxGoalBody = 4 << 10

func (s *server) listGoals(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	if !s.siteOK(w, r, site) {
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
	if !s.siteOK(w, r, in.Site) {
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
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if !s.siteOK(w, r, site) {
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
	case errors.Is(err, errSiteScope):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, errBadRequest) || errors.Is(err, query.ErrNeedSite) || errors.Is(err, query.ErrBadDim) || errors.Is(err, query.ErrBadMetric) ||
		errors.Is(err, query.ErrBadGoal) || errors.Is(err, query.ErrBadFunnel) || errors.Is(err, sites.ErrInvalid) ||
		errors.Is(err, meta.ErrInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, query.ErrGoalNotFound) || errors.Is(err, query.ErrNotFound) || errors.Is(err, sites.ErrNotFound) ||
		errors.Is(err, meta.ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, meta.ErrGone):
		http.Error(w, err.Error(), http.StatusGone)
	case errors.Is(err, sites.ErrExists):
		http.Error(w, err.Error(), http.StatusConflict)
	case errors.Is(err, query.ErrNotImplemented):
		http.Error(w, "not implemented yet", http.StatusNotImplemented)
	default:
		log.Printf("api %s: %v", r.URL.Path, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// handle parses common params for a per-site report, runs fn, and maps errors to 400 or 500.
func (s *server) handle(fn func(query.Params, *http.Request) (any, error)) http.HandlerFunc {
	return s.handleSites(false, fn)
}

// handleAll is handle for reports that also accept site=all.
func (s *server) handleAll(fn func(query.Params, *http.Request) (any, error)) http.HandlerFunc {
	return s.handleSites(true, fn)
}

// paramFail answers a parameter error: 403 for a token bound to another site, else 400.
func (s *server) paramFail(w http.ResponseWriter, _ *http.Request, err error) {
	if errors.Is(err, errSiteScope) {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}
	http.Error(w, err.Error(), http.StatusBadRequest)
}

func (s *server) handleSites(allowAll bool, fn func(query.Params, *http.Request) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, err := s.paramsFor(r, allowAll)
		if err != nil {
			s.paramFail(w, r, err)
			return
		}
		format, err := exportFormat(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if format != "" { // an export carries every row, not the page on screen
			p.Limit, p.Offset = maxLimit, 0
		}
		v, err := fn(p, r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if l, ok := v.(list); ok {
			w.Header().Set("X-Total-Count", strconv.Itoa(l.total))
			v = l.rows
		}
		if format != "" {
			if err := writeExport(w, format, strings.TrimPrefix(r.URL.Path, "/api/"), p, v); err != nil {
				if errors.Is(err, errNoRows) {
					w.Header().Del("Content-Disposition")
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}
				log.Printf("export %s: %v", r.URL.Path, err)
			}
			return
		}
		writeJSON(w, v)
	}
}

// params parses the common report parameters (plan §0.3) for a per-site report.
func (s *server) params(r *http.Request) (query.Params, error) { return s.paramsFor(r, false) }

// sortRe allowlists the shape of a sort key; each endpoint maps it to a column itself.
var sortRe = regexp.MustCompile(`^-?[a-zA-Z_]{1,32}$`)

// paramsFor parses the report parameters. allowAll lets site=all through.
func (s *server) paramsFor(r *http.Request, allowAll bool) (query.Params, error) {
	q := r.URL.Query()
	p := query.Params{Site: q.Get("site"), Env: q.Get("env"), TZ: s.tz, Filters: map[string]string{}, Now: s.now()}
	switch {
	case p.Site == "all":
		if !allowAll {
			return p, query.ErrNeedSite
		}
	case !s.known(p.Site):
		return p, errors.New("unknown site")
	}
	if err := checkTokenSite(r, p.Site); err != nil {
		return p, err
	}
	switch p.Env {
	case "":
		p.Env = "production"
	case "production", "preview", "development", "all":
	default:
		return p, errors.New("bad env")
	}
	if tz := q.Get("tz"); tz != "" && len(tz) <= 64 {
		if loc, err := time.LoadLocation(tz); err == nil {
			p.TZ = loc
		}
	}
	if err := s.window(&p, q); err != nil {
		return p, err
	}
	for _, f := range q["f"] {
		dim, val, ok := strings.Cut(f, ":")
		if !ok || dim == "" {
			return p, errors.New("bad filter, want f=dim:value")
		}
		if !filterDims[dim] {
			return p, query.ErrBadDim
		}
		if _, dup := p.Filters[dim]; dup {
			return p, errors.New("bad filter: one value per dimension")
		}
		p.Filters[dim] = val
	}
	if v := q.Get("conv"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 0 {
			return p, errors.New("bad conv")
		}
		p.Conv = n
	}
	p.Limit = defaultLimit
	if n, err := strconv.Atoi(q.Get("limit")); err == nil {
		p.Limit = min(max(n, 1), maxLimit)
	}
	if n, err := strconv.Atoi(q.Get("offset")); err == nil && n > 0 {
		p.Offset = n
	}
	if v := q.Get("sort"); v != "" {
		if !sortRe.MatchString(v) {
			return p, errors.New("bad sort")
		}
		p.Sort = v
	}
	return p, nil
}

const (
	defaultLimit = 100
	maxLimit     = 1000
)

// filterDims is the Dim allowlist of web/src/api/types.ts.
var filterDims = map[string]bool{}

func init() {
	for _, d := range strings.Fields(`path route host entry exit referrer source channel ai_source
		utm_source utm_medium utm_campaign utm_term utm_content country region city device browser os
		event goal dow hour`) {
		filterDims[d] = true
	}
}

// window resolves range/cmp (or the legacy from/to) into p.Win, p.From and p.To.
func (s *server) window(p *query.Params, q url.Values) error {
	rangeKey, cmp := q.Get("range"), q.Get("cmp")
	if cmp == "" {
		cmp = "prev"
	}
	var legacyFrom, legacyTo int64
	legacy := !q.Has("range") && (q.Has("from") || q.Has("to"))
	if legacy {
		legacyTo, legacyFrom = p.Now.UnixMilli(), p.Now.UnixMilli()-24*60*60*1000
		for key, dst := range map[string]*int64{"from": &legacyFrom, "to": &legacyTo} {
			if v := q.Get(key); v != "" {
				n, err := strconv.ParseInt(v, 10, 64)
				if err != nil {
					return errors.New("bad " + key)
				}
				*dst = n
			}
		}
		if legacyFrom < 0 || legacyFrom > legacyTo || legacyTo-legacyFrom > maxSpan {
			return errors.New("bad range: need 0 <= from <= to and at most 400 days")
		}
		day := func(ms int64) string { return time.UnixMilli(ms).In(p.TZ).Format(time.DateOnly) }
		rangeKey = "c:" + day(legacyFrom) + "~" + day(legacyTo)
	}
	if rangeKey == "" {
		rangeKey = "30d"
	}
	win, err := query.ResolveWindow(rangeKey, cmp, p.Now, p.TZ, s.dataStart(p.Site))
	if err != nil {
		return fmt.Errorf("%w: %w", errBadRequest, err)
	}
	if legacy {
		win.From, win.To = legacyFrom, legacyTo
	}
	p.Win, p.From, p.To = win, win.From, win.To
	return nil
}

// dataStart is the site's first event (unix ms), cached for a minute; 0 when unknown.
func (s *server) dataStart(site string) int64 {
	if site == "all" {
		return 0
	}
	s.startMu.Lock()
	defer s.startMu.Unlock()
	if c, ok := s.starts[site]; ok && s.now().Sub(c.at) < time.Minute {
		return c.ts
	}
	var ts sql.NullInt64
	if err := s.db.QueryRow(`SELECT min(ts) FROM events WHERE site_id=?`, site).Scan(&ts); err != nil {
		return 0
	}
	s.starts[site] = startCache{ts: ts.Int64, at: s.now()}
	return ts.Int64
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("api: encode: %v", err)
	}
}
