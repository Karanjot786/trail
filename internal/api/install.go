package api

import (
	"compress/gzip"
	"log"
	"net/http"
	"sync"
	"time"

	"trail/internal/install"
	"trail/internal/query"
)

// checkTTL is how long an install check result is reused per site.
const checkTTL = 30 * time.Second

// WithFetcher replaces the install check's home-page fetcher (tests).
func WithFetcher(f install.Fetcher) Option { return func(s *server) { s.fetcher = f } }

type checkCache struct {
	mu   sync.Mutex
	byID map[string]cachedCheck
}

type cachedCheck struct {
	res install.InstallCheck
	at  time.Time
}

func (s *server) installRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sites/{id}/check", s.siteCheck)
	mux.HandleFunc("GET /api/sites/{id}/export", s.cookieOnly(s.siteExport))
}

// siteCheck runs the debug-my-install checklist, cached for 30 s per site.
func (s *server) siteCheck(w http.ResponseWriter, r *http.Request) {
	site, ok := s.sites.Get(r.PathValue("id"))
	if !ok || !s.siteOK(w, r, site.ID) {
		if !ok {
			http.NotFound(w, r)
		}
		return
	}
	s.checks.mu.Lock()
	c, hit := s.checks.byID[site.ID]
	s.checks.mu.Unlock()
	if hit && s.now().Sub(c.at) < checkTTL {
		writeJSON(w, c.res)
		return
	}
	res, err := install.Check(r.Context(), s.db, s.sites, site, r.Host, s.fetcher)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.checks.mu.Lock()
	s.checks.byID[site.ID] = cachedCheck{res: res, at: s.now()}
	s.checks.mu.Unlock()
	writeJSON(w, res)
}

// siteExport streams every raw event of the site as gzipped NDJSON (cookie only).
func (s *server) siteExport(w http.ResponseWriter, r *http.Request) {
	site, ok := s.sites.Get(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	day := s.now().In(s.tz).Format(time.DateOnly)
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Content-Encoding", "gzip")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Disposition", `attachment; filename="trail-`+site.ID+`-events-`+day+`.ndjson.gz"`)
	gz := gzip.NewWriter(w)
	if err := query.ExportEvents(r.Context(), s.db, site.ID, gz); err != nil {
		log.Printf("export %s: %v", site.ID, err) // headers are sent; the client sees a truncated file
	}
	if err := gz.Close(); err != nil {
		log.Printf("export %s: %v", site.ID, err)
	}
}
