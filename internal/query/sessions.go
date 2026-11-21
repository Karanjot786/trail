package query

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// sessionAgg aggregates ev (from base) into one row per session.
const sessionAgg = `SELECT session_id, min(ts) AS start, max(ts) AS end, max(ts)-min(ts) AS dur, sum(type='pageview') AS pv,
  max(engaged_ms) AS em, max(type IN ('event','identify')) AS ce
FROM ev GROUP BY session_id`

// engagedExpr is 1 when a sessionAgg row is an engaged session (GA4 rule).
const engagedExpr = `(pv>=2 OR em>=10000 OR ce)`

// bounce is 1 − engaged/sessions, and 0 when there are no sessions.
func bounce(sessions, engaged int) float64 {
	if sessions == 0 {
		return 0
	}
	return 1 - float64(engaged)/float64(sessions)
}

// Step is one entry in a session timeline. Engage events are folded into the
// pageview they belong to (engagedMs, scrollPct) rather than listed.
type Step struct {
	TS        int64           `json:"ts"`
	Type      string          `json:"type"`
	Path      string          `json:"path"`
	Name      string          `json:"name"`
	EngagedMs int             `json:"engagedMs"`
	ScrollPct int             `json:"scrollPct"`
	Props     json.RawMessage `json:"props"`
}

// Journey returns every non-bot session of person on site, oldest first.
// person is a user id or an anon id, resolved through identity_map as in base.
func Journey(db *sql.DB, site, person string) ([]Session, error) {
	const q = `WITH idm AS (SELECT anon_id, user_id FROM identity_map WHERE site_id=? AND rowid IN
  (SELECT min(rowid) FROM identity_map WHERE site_id=? GROUP BY anon_id))
SELECT e.session_id, e.ts, e.type, e.path, e.name, e.engaged_ms, e.scroll_pct, e.props, ` + sourceExpr + `
FROM events e LEFT JOIN idm USING(anon_id)
WHERE e.site_id=? AND e.is_bot=0 AND COALESCE(idm.user_id, e.anon_id)=?
ORDER BY e.ts, e.id`

	out := []Session{}
	bySession := map[string]int{}
	lastPV := map[string]int{} // session → index of its latest pageview step
	err := forRows(db, q, []any{site, site, site, person}, func(r *sql.Rows) error {
		var sid, props, src string
		var s Step
		if err := r.Scan(&sid, &s.TS, &s.Type, &s.Path, &s.Name, &s.EngagedMs, &s.ScrollPct, &props, &src); err != nil {
			return err
		}
		i, ok := bySession[sid]
		if !ok {
			i = len(out)
			bySession[sid] = i
			out = append(out, Session{SessionID: sid, Start: s.TS, Source: src, Steps: []Step{}, Goals: []GoalHit{}})
		}
		sess := &out[i]
		if s.Type == "engage" {
			if j, ok := lastPV[sid]; ok {
				pv := &sess.Steps[j]
				pv.EngagedMs = max(pv.EngagedMs, s.EngagedMs)
				pv.ScrollPct = max(pv.ScrollPct, s.ScrollPct)
				return nil
			}
		}
		s.Props = json.RawMessage(`{}`)
		if props != "" && json.Valid([]byte(props)) {
			s.Props = json.RawMessage(props)
		}
		if s.Type == "pageview" {
			lastPV[sid] = len(sess.Steps)
		}
		sess.Steps = append(sess.Steps, s)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("journey: %w", err)
	}
	return out, nil
}
