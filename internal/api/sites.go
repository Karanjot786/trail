package api

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"trail/internal/auth"
	"trail/internal/query"
	"trail/internal/sites"
)

type activity struct {
	LastEventAt *int64 `json:"lastEventAt"` // unix ms; null before the first event
	Events24h   int    `json:"events24h"`
}

// activity reads a site's newest event and its event count over the last 24h.
// Both are index lookups on events(site_id, ts).
func (s *server) activity(id string) (activity, error) {
	var a activity
	var last sql.NullInt64
	if err := s.db.QueryRow(`SELECT max(ts) FROM events WHERE site_id=?`, id).Scan(&last); err != nil {
		return a, err
	}
	if last.Valid {
		a.LastEventAt = &last.Int64
	}
	since := time.Now().Add(-24 * time.Hour).UnixMilli()
	err := s.db.QueryRow(`SELECT count(*) FROM events WHERE site_id=? AND ts>=?`, id, since).Scan(&a.Events24h)
	return a, err
}

// siteInfo is the /api/sites entry for site: its settings, activity and features.
func (s *server) siteInfo(site sites.Site) (query.Site, error) {
	a, err := s.activity(site.ID)
	if err != nil {
		return query.Site{}, err
	}
	f, err := query.SiteFeatures(s.db, site.ID)
	if err != nil && !errors.Is(err, query.ErrNotImplemented) {
		return query.Site{}, err
	}
	return query.Site{ID: site.ID, Domain: site.Domain, Origins: site.Origins, Created: site.Created,
		LastEventAt: a.LastEventAt, Events24h: a.Events24h, Features: f}, nil
}

func (s *server) out(w http.ResponseWriter, r *http.Request, site sites.Site) (query.Site, bool) {
	o, err := s.siteInfo(site)
	if err != nil {
		s.fail(w, r, err)
		return o, false
	}
	return o, true
}

// allSitesToken refuses a bearer token bound to one site: adding, editing
// or removing sites needs the owner or an all-sites token.
func (s *server) allSitesToken(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if t, ok := auth.TokenFrom(r.Context()); ok && t.Site != "" {
			http.Error(w, "token is limited to site "+t.Site, http.StatusForbidden)
			return
		}
		h(w, r)
	}
}

func (s *server) listSites(w http.ResponseWriter, r *http.Request) {
	list := s.sites.List()
	out := make([]query.Site, 0, len(list))
	t, scoped := auth.TokenFrom(r.Context())
	for _, site := range list {
		if scoped && t.Site != "" && t.Site != site.ID {
			continue
		}
		o, ok := s.out(w, r, site)
		if !ok {
			return
		}
		out = append(out, o)
	}
	writeJSON(w, out)
}

func (s *server) createSite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID      string   `json:"id"`
		Domain  string   `json:"domain"`
		Origins []string `json:"origins"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	site, err := s.sites.Add(sites.Site{ID: in.ID, Domain: in.Domain, Origins: in.Origins})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if o, ok := s.out(w, r, site); ok {
		w.Header().Set("Content-Type", "application/json") // before WriteHeader, or it is lost
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, o)
	}
}

func (s *server) updateSite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Domain  *string   `json:"domain"`
		Origins *[]string `json:"origins"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	site, ok := s.sites.Get(r.PathValue("id"))
	if !ok {
		s.fail(w, r, sites.ErrNotFound)
		return
	}
	if in.Domain != nil {
		site.Domain = *in.Domain
	}
	if in.Origins != nil {
		site.Origins = *in.Origins
	}
	site, err := s.sites.Update(site)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if o, ok := s.out(w, r, site); ok {
		writeJSON(w, o)
	}
}

// deleteSite stops ingest for the site. ?purge=1 also deletes its data.
func (s *server) deleteSite(w http.ResponseWriter, r *http.Request) {
	purge := r.URL.Query().Get("purge")
	if purge != "" && purge != "0" && purge != "1" {
		http.Error(w, "purge must be 0 or 1", http.StatusBadRequest)
		return
	}
	if err := s.sites.Remove(r.PathValue("id"), purge == "1"); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// siteStatus backs the install panel's live check. rejected24h counts events
// refused for their origin since this process started (at most the last day).
func (s *server) siteStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.known(id) {
		s.fail(w, r, sites.ErrNotFound)
		return
	}
	if err := checkTokenSite(r, id); err != nil {
		s.fail(w, r, err)
		return
	}
	a, err := s.activity(id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, struct {
		activity
		Rejected24h int `json:"rejected24h"`
	}{a, s.sites.Rejected24h(id)})
}
