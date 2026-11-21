package api

import (
	"net/http"

	"trail/internal/auth"
	"trail/internal/meta"
	"trail/internal/query"
)

// metaRoutes wires notes, saved views, funnel definitions and goal edits.
func (s *server) metaRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/notes", s.handle(func(p query.Params, _ *http.Request) (any, error) {
		return meta.ListNotes(s.db, p.Site, p.From, p.To)
	}))
	mux.HandleFunc("POST /api/notes", s.addNote)
	mux.HandleFunc("DELETE /api/notes/{id}", s.deleteNote)

	mux.HandleFunc("GET /api/views", s.listViews)
	mux.HandleFunc("POST /api/views", s.addView)
	mux.HandleFunc("DELETE /api/views/{id}", s.deleteView)

	mux.HandleFunc("GET /api/funnels", s.listFunnels)
	mux.HandleFunc("POST /api/funnels", s.saveFunnel)
	mux.HandleFunc("PATCH /api/funnels/{id}", s.saveFunnel)
	mux.HandleFunc("DELETE /api/funnels/{id}", s.deleteFunnel)

	mux.HandleFunc("PATCH /api/goals/{id}", s.updateGoal)
}

// siteOK writes 400 for an unknown site or 403 for a token bound to another
// site, and reports whether the request may go on.
func (s *server) siteOK(w http.ResponseWriter, r *http.Request, site string) bool {
	if !s.known(site) {
		http.Error(w, "unknown site", http.StatusBadRequest)
		return false
	}
	if err := checkTokenSite(r, site); err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return false
	}
	return true
}

func writeCreated(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, v)
}

func (s *server) addNote(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Site  string `json:"site"`
		TS    int64  `json:"ts"`
		Label string `json:"label"`
		Kind  string `json:"kind"`
	}
	if !readJSON(w, r, &in) || !s.siteOK(w, r, in.Site) {
		return
	}
	n, err := meta.AddNote(s.db, meta.Note{Site: in.Site, TS: in.TS, Label: in.Label, Kind: in.Kind})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeCreated(w, n)
}

func (s *server) deleteNote(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !s.siteOK(w, r, site) {
		return
	}
	if err := meta.DeleteNote(s.db, site, id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listViews lists saved views; a site-bound token sees only its site's views.
func (s *server) listViews(w http.ResponseWriter, r *http.Request) {
	views, err := meta.ListViews(s.db)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if t, ok := auth.TokenFrom(r.Context()); ok && t.Site != "" {
		kept := []meta.SavedView{}
		for _, v := range views {
			if v.Site != nil && *v.Site == t.Site {
				kept = append(kept, v)
			}
		}
		views = kept
	}
	writeJSON(w, views)
}

func (s *server) addView(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string  `json:"name"`
		Site  *string `json:"site"`
		State string  `json:"state"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Site != nil && !s.siteOK(w, r, *in.Site) {
		return
	}
	if t, ok := auth.TokenFrom(r.Context()); ok && t.Site != "" && in.Site == nil {
		http.Error(w, "token is limited to site "+t.Site, http.StatusForbidden)
		return
	}
	v, err := meta.AddView(s.db, meta.SavedView{Name: in.Name, Site: in.Site, State: in.State})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeCreated(w, v)
}

func (s *server) deleteView(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err == nil {
		err = meta.DeleteView(s.db, id)
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) listFunnels(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	if !s.siteOK(w, r, site) {
		return
	}
	list, err := query.ListFunnels(s.db, site)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, list)
}

// saveFunnel creates (POST) or replaces (PATCH /{id}) a funnel definition.
func (s *server) saveFunnel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Site     string             `json:"site"`
		Name     string             `json:"name"`
		WindowMs int64              `json:"windowMs"`
		Steps    []query.FunnelStep `json:"steps"`
	}
	if !readJSON(w, r, &in) || !s.siteOK(w, r, in.Site) {
		return
	}
	f := query.Funnel{Name: in.Name, WindowMs: in.WindowMs, Steps: in.Steps}
	if r.Method == http.MethodPost {
		f, err := query.CreateFunnel(s.db, in.Site, f)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeCreated(w, f)
		return
	}
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	f.ID = id
	if f, err = query.UpdateFunnel(s.db, in.Site, f); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, f)
}

func (s *server) deleteFunnel(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !s.siteOK(w, r, site) {
		return
	}
	if err := query.DeleteFunnel(s.db, site, id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) updateGoal(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Site, Name, Kind, Match string
	}
	if !readJSON(w, r, &in) || !s.siteOK(w, r, in.Site) {
		return
	}
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	g, err := query.UpdateGoal(s.db, in.Site, query.Goal{ID: id, Name: in.Name, Kind: in.Kind, Match: in.Match})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, g)
}
