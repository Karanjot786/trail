package api

import (
	"net/http"
	"strings"

	"trail/internal/auth"
	"trail/internal/meta"
)

// WithEnvTokens lists the TRAIL_API_TOKENS entries next to the stored tokens.
func WithEnvTokens(toks []auth.Token) Option { return func(s *server) { s.envTokens = toks } }

func (s *server) tokenRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/tokens", s.cookieOnly(s.listTokens))
	mux.HandleFunc("POST /api/tokens", s.cookieOnly(s.createToken))
	mux.HandleFunc("DELETE /api/tokens/{id}", s.cookieOnly(s.revokeToken))
	mux.HandleFunc("GET /api/whoami", s.whoami)
}

// cookieOnly refuses bearer tokens: minting tokens, share links and raw
// exports stays with the dashboard owner, so a token can never widen itself.
func (s *server) cookieOnly(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.TokenFrom(r.Context()); ok {
			http.Error(w, "forbidden: use the dashboard for this", http.StatusForbidden)
			return
		}
		h(w, r)
	}
}

func (s *server) listTokens(w http.ResponseWriter, r *http.Request) {
	stored, err := meta.ListTokens(s.db)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	out := make([]meta.APIToken, 0, len(s.envTokens)+len(stored))
	for _, t := range s.envTokens {
		out = append(out, meta.APIToken{ID: t.ID, Name: t.Name, Scope: t.Scope, FromEnv: true})
	}
	writeJSON(w, append(out, stored...))
}

func (s *server) createToken(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string  `json:"name"`
		Scope string  `json:"scope"`
		Site  *string `json:"site"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	site := ""
	if in.Site != nil {
		if site = *in.Site; !s.known(site) {
			http.Error(w, "unknown site", http.StatusBadRequest)
			return
		}
	}
	for _, t := range s.envTokens {
		if strings.EqualFold(t.Name, strings.TrimSpace(in.Name)) {
			http.Error(w, "a token with that name is set in TRAIL_API_TOKENS", http.StatusBadRequest)
			return
		}
	}
	t, err := meta.CreateToken(s.db, in.Name, in.Scope, site)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeCreated(w, t)
}

func (s *server) revokeToken(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if strings.HasPrefix(id, "env:") {
		http.Error(w, "this token is set in TRAIL_API_TOKENS; remove it there", http.StatusBadRequest)
		return
	}
	if err := meta.RevokeToken(s.db, id); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// whoami describes the calling token (/api/v1/whoami). The cookie owner is "owner" with write scope.
func (s *server) whoami(w http.ResponseWriter, r *http.Request) {
	t, ok := auth.TokenFrom(r.Context())
	if !ok {
		writeJSON(w, meta.WhoAmI{Name: "owner", Scope: meta.ScopeWrite})
		return
	}
	out := meta.WhoAmI{Name: t.Name, Scope: t.Scope}
	if t.Site != "" {
		out.Site = &t.Site
	}
	writeJSON(w, out)
}
