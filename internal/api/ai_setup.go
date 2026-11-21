package api

import (
	"net/http"

	"trail/internal/query"
)

// aiSetup is GET /api/ai-setup?site=: the Unlock AI crawlers card's status (no range). The
// crawl and agent numbers come from the database; the list status from the agent directory.
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
	for _, l := range s.agents.Status() {
		item := query.AIList{Name: l.Name, Kind: l.Kind, Entries: l.Entries, OK: l.OK}
		if l.FetchedAt != 0 {
			at := l.FetchedAt
			item.FetchedAt = &at
		}
		res.Lists = append(res.Lists, item)
	}
	writeJSON(w, res) // sets Cache-Control: no-store
}
