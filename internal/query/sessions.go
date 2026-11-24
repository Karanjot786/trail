package query

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// sessionAgg aggregates ev (from base) into one row per session.
const sessionAgg = `SELECT session_id, min(ts) AS start, max(` + activeEnd + `) AS end, max(` + activeEnd + `)-min(ts) AS dur,
  sum(type='pageview') AS pv, max(engaged_ms) AS em, max(type IN ('event','identify')) AS ce
FROM sev GROUP BY session_id HAVING pv>0`

// activeEnd is a row's last moment of activity: a pageview whose engage events were folded
// into it ends dwell_ms after it started; every other row ends at its own ts.
// It must match the events_site_end index expression (store.migrateVersioned, v3).
const activeEnd = "(ts+dwell_ms)"

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

// sortSpec resolves "col" or "-col" against an allowlist of SQL expressions; "" uses def.
func sortSpec(sortKey, def string, cols map[string]string) (string, error) {
	if sortKey == "" {
		sortKey = def
	}
	dir := " ASC"
	if k, ok := strings.CutPrefix(sortKey, "-"); ok {
		sortKey, dir = k, " DESC"
	}
	col, ok := cols[sortKey]
	if !ok {
		return "", fmt.Errorf("sort %q: %w", sortKey, ErrBadSort)
	}
	return col + dir, nil
}

// ErrBadSort is returned for a sort column outside the endpoint's allowlist.
var ErrBadSort = errors.New("unknown sort")

// personLabel is how a person is shown: the identified user id, else "Visitor" and the
// first four characters of the anonymous id.
func personLabel(person string, identified bool) string {
	if identified {
		return person
	}
	short := person
	if len(short) > 4 {
		short = short[:4]
	}
	return "Visitor " + strings.ToUpper(short)
}

func offsetOf(p Params) int { return max(p.Offset, 0) }

var visitorSorts = map[string]string{"last": "last", "visits": "visits", "pages": "pages", "duration": "dur"}

// Visitors lists people seen in range (sort last (default, newest first), visits, pages or
// duration, "-" for descending) with p.Limit/p.Offset, and the total number of people.
// q matches the person id (user id or anon id) by case-insensitive substring.
func Visitors(db *sql.DB, p Params, q string) ([]Person, int, error) {
	order, err := sortSpec(p.Sort, "-last", visitorSorts)
	if err != nil {
		return nil, 0, err
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, 0, err
	}
	where, qargs := "", []any(nil)
	if q != "" {
		where, qargs = " WHERE instr(lower(person), lower(?))>0", []any{q}
	}
	// evp is ev without engage rows that belong to no pageview session, cut to the columns Visitors
	// reads (it is built once and read three times). People without a pageview are dropped by px.
	evpCols := "person, ident, ts, dwell_ms, session_id, type, country, region, city, device, browser, os"
	cte += `, evp AS (SELECT ` + evpCols + ` FROM ev WHERE (type<>'engage' OR session_id IN (SELECT session_id FROM ev WHERE type='pageview')))
`
	// total is the people count before LIMIT: one window count, so ev is read once. A page past
	// the end returns no rows to carry it; that case counts on its own.
	sqlText := cte + `, px AS (SELECT person, max(ident) AS ident, min(ts) AS first, max(` + activeEnd + `) AS last,
    count(DISTINCT CASE WHEN session_id IN (SELECT session_id FROM ev WHERE type='pageview') THEN session_id END) AS visits,
    sum(type='pageview') AS pages FROM evp` + where + ` GROUP BY person HAVING pages>0),
  pd AS (SELECT person, sum(d) AS dur FROM (SELECT person, max(` + activeEnd + `)-min(ts) AS d FROM evp GROUP BY session_id
    HAVING sum(type='pageview')>0) GROUP BY person),
  pl AS (SELECT person, max(ts), country, region, city, device, browser, os FROM evp GROUP BY person),
  ps AS (SELECT person, min(ts), ` + sourceNameExpr + ` AS source FROM ev WHERE type='pageview' GROUP BY person)
SELECT px.person, px.ident, px.first, px.last, px.visits, px.pages, coalesce(pd.dur,0), pl.country, pl.region, pl.city,
  pl.device, pl.browser, pl.os, coalesce(ps.source,'Direct'), count(*) OVER ()
FROM px JOIN pl USING(person) LEFT JOIN pd USING(person) LEFT JOIN ps USING(person)
ORDER BY ` + order + `, px.person LIMIT ? OFFSET ?`
	qa := append(append(append([]any{}, args...), qargs...), clampLimit(p.Limit), offsetOf(p))
	out := []Person{}
	total := 0
	err = forRows(db, sqlText, qa, func(r *sql.Rows) error {
		var v Person
		if err := r.Scan(&v.Person, &v.Identified, &v.FirstSeen, &v.LastSeen, &v.Visits, &v.Pages, &v.DurationMs,
			&v.Country, &v.Region, &v.City, &v.Device, &v.Browser, &v.OS, &v.Source, &total); err != nil {
			return err
		}
		v.Label = personLabel(v.Person, v.Identified)
		out = append(out, v)
		return nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("visitors: %w", err)
	}
	if len(out) == 0 && offsetOf(p) > 0 {
		if err := db.QueryRow(cte+`SELECT count(*) FROM (SELECT person FROM evp`+where+` GROUP BY person HAVING sum(type='pageview')>0)`, append(append([]any{}, args...), qargs...)...).
			Scan(&total); err != nil {
			return nil, 0, fmt.Errorf("visitors total: %w", err)
		}
	}
	if err := addVisitsTotal(db, p.Site, out); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// addVisitsTotal sets VisitsAll on each person: every non-bot session ever, counted the way Journey
// lists them (same identity resolution, no range, env or filters), so a row and its journey agree.
func addVisitsTotal(db *sql.DB, site string, people []Person) error {
	if len(people) == 0 {
		return nil
	}
	ids := make([]string, len(people))
	for i, v := range people {
		ids[i] = v.Person
	}
	idsJSON, err := json.Marshal(ids)
	if err != nil {
		return fmt.Errorf("visits total: %w", err)
	}
	q := `WITH idm AS (SELECT anon_id, user_id FROM identity_map WHERE site_id=? AND rowid IN
  (SELECT min(rowid) FROM identity_map WHERE site_id=? GROUP BY anon_id)),
ids AS (SELECT value AS id FROM json_each(?)),
anons AS (SELECT id AS anon_id FROM ids UNION SELECT anon_id FROM identity_map WHERE site_id=? AND user_id IN (SELECT id FROM ids))
SELECT COALESCE(idm.user_id, e.anon_id) AS person, count(DISTINCT e.session_id)
FROM events e LEFT JOIN idm USING(anon_id)
WHERE e.site_id=? AND ` + journeyCond + ` AND e.anon_id IN (SELECT anon_id FROM anons)
GROUP BY 1`
	n := map[string]int{}
	err = forRows(db, q, []any{site, site, string(idsJSON), site, site}, func(r *sql.Rows) error {
		var person string
		var c int
		if err := r.Scan(&person, &c); err != nil {
			return err
		}
		n[person] = c
		return nil
	})
	if err != nil {
		return fmt.Errorf("visits total: %w", err)
	}
	for i := range people {
		people[i].VisitsAll = max(n[people[i].Person], people[i].Visits)
	}
	return nil
}

var sessionSorts = map[string]string{"start": "sx.start", "duration": "sx.dur", "pages": "sx.pv"}

// Sessions lists sessions in range (sort start (default, newest first), duration or pages,
// "-" for descending) with p.Limit/p.Offset, and the total. person, when set, keeps one
// person's sessions. Goals are the ids of the goals hit in the session; revenue is the
// session's purchases in the range's main currency.
func Sessions(db *sql.DB, p Params, person string) ([]SessionRow, int, error) {
	order, err := sortSpec(p.Sort, "-start", sessionSorts)
	if err != nil {
		return nil, 0, err
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, 0, err
	}
	where, wargs := "", []any(nil)
	if person != "" {
		where, wargs = " WHERE sx.person=?", []any{person}
	}
	sx := cte + `, sx AS (SELECT session_id, person, max(ident) AS ident, min(ts) AS start, max(` + activeEnd + `)-min(ts) AS dur,
  sum(type='pageview') AS pv, max(agent) AS agent FROM sev GROUP BY session_id HAVING pv>0)
`
	var total int
	if err := db.QueryRow(sx+`SELECT count(*) FROM sx`+where, append(append([]any{}, args...), wargs...)...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("sessions total: %w", err)
	}
	sqlText := sx + `, sl AS (` + sessSrc + `),
  se AS (SELECT session_id, max(ts), path AS exitp FROM sev WHERE type='pageview' GROUP BY session_id)
SELECT sx.session_id, sx.person, sx.ident, sx.start, sx.dur, sx.pv, coalesce(sl.entry,''), coalesce(se.exitp,''),
  coalesce(sl.source,'Direct'), coalesce(sl.country,''), coalesce(sl.city,''), coalesce(sl.device,''),
  coalesce(sl.browser,''), coalesce(sl.os,''), sx.agent
FROM sx LEFT JOIN sl USING(session_id) LEFT JOIN se USING(session_id)` + where + `
ORDER BY ` + order + `, sx.session_id DESC LIMIT ? OFFSET ?`
	qa := append(append(append([]any{}, args...), wargs...), clampLimit(p.Limit), offsetOf(p))
	out := []SessionRow{}
	idx := map[string]int{}
	err = forRows(db, sqlText, qa, func(r *sql.Rows) error {
		var s SessionRow
		var ident bool
		if err := r.Scan(&s.SessionID, &s.Person, &ident, &s.Start, &s.DurationMs, &s.Pages, &s.Entry, &s.Exit,
			&s.Source, &s.Country, &s.City, &s.Device, &s.Browser, &s.OS, &s.Agent); err != nil {
			return err
		}
		s.Label, s.Goals = personLabel(s.Person, ident), []int64{}
		idx[s.SessionID] = len(out)
		out = append(out, s)
		return nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("sessions: %w", err)
	}
	if len(out) == 0 {
		return out, total, nil
	}
	ids := make([]any, 0, len(out))
	for _, s := range out {
		ids = append(ids, s.SessionID)
	}
	in := " IN (?" + strings.Repeat(",?", len(ids)-1) + ")"
	err = forRows(db, cte+`SELECT x.session_id, g.id FROM ev x JOIN goals g ON g.site_id=?
WHERE x.session_id`+in+` AND `+goalHitCond+` GROUP BY 1, 2 ORDER BY 1, 2`,
		append(append(append([]any{}, args...), p.Site), ids...), func(r *sql.Rows) error {
			var sid string
			var gid int64
			if err := r.Scan(&sid, &gid); err != nil {
				return err
			}
			out[idx[sid]].Goals = append(out[idx[sid]].Goals, gid)
			return nil
		})
	if err != nil {
		return nil, 0, fmt.Errorf("session goals: %w", err)
	}
	cur, err := mainCurrency(db, cte, args)
	if err != nil || cur == "" {
		return out, total, err
	}
	err = forRows(db, cte+`SELECT session_id, sum(`+amountMinorExpr+`) FROM ev WHERE `+purchaseWhere+` AND `+currencyExpr+`=?
  AND session_id`+in+` GROUP BY 1`, append(append(append([]any{}, args...), cur), ids...), func(r *sql.Rows) error {
		var sid string
		var amt int64
		if err := r.Scan(&sid, &amt); err != nil {
			return err
		}
		out[idx[sid]].RevenueMinor = amt
		return nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("session revenue: %w", err)
	}
	return out, total, nil
}

// goalHit reports whether a journey step hits g.
func goalHit(g Goal, s Step) bool {
	if g.Kind == "event" {
		return s.Type == "event" && s.Name == g.Match
	}
	if s.Type != "pageview" {
		return false
	}
	if prefix, ok := strings.CutSuffix(g.Match, "*"); ok {
		return strings.HasPrefix(s.Path, prefix)
	}
	return s.Path == g.Match
}

var journeySQL = `WITH idm AS (SELECT anon_id, user_id FROM identity_map WHERE site_id=? AND rowid IN
  (SELECT min(rowid) FROM identity_map WHERE site_id=? GROUP BY anon_id)),
anons AS (SELECT anon_id FROM idm WHERE user_id=?
  UNION SELECT ? WHERE NOT EXISTS (SELECT 1 FROM idm WHERE anon_id=?))
SELECT e.session_id, e.ts, e.type, e.path, e.name, e.engaged_ms, e.scroll_pct, e.props, ` + sourceNameExpr + `,
  e.country, e.city, e.device, e.agent, e.agent_via, e.dwell_ms
FROM anons CROSS JOIN events e INDEXED BY events_site_anon_ts LEFT JOIN idm USING(anon_id)
WHERE e.site_id=? AND e.anon_id=anons.anon_id AND ` + journeyCond + `
ORDER BY e.ts, e.id`

// Journey returns every session of person on site (a person's or an AI agent's, never other bots), oldest first, numbered from the
// person's first visit ever. person is a user id or an anon id, resolved through identity_map
// as in base. Each session lists the goals among goals it hit (first hit of each).
func Journey(db *sql.DB, site, person string, goals []Goal) ([]JourneySession, error) {
	out := []JourneySession{}
	bySession := map[string]int{}
	lastPV := map[string]int{} // session → index of its latest pageview step
	hit := map[string]map[int64]bool{}
	via := map[string]int{} // session → best viaRank seen
	err := forRows(db, journeySQL, []any{site, site, person, person, person, site}, func(r *sql.Rows) error {
		var sid, props, src, country, city, device, agent, agentVia string
		var dwell int64
		var s Step
		if err := r.Scan(&sid, &s.TS, &s.Type, &s.Path, &s.Name, &s.EngagedMs, &s.ScrollPct, &props, &src,
			&country, &city, &device, &agent, &agentVia, &dwell); err != nil {
			return err
		}
		i, ok := bySession[sid]
		if !ok {
			i = len(out)
			bySession[sid] = i
			hit[sid] = map[int64]bool{}
			out = append(out, JourneySession{SessionID: sid, Start: s.TS, Source: src, Steps: []Step{}, Goals: []GoalHit{},
				Visit: i + 1, Country: country, City: city, Device: device})
		}
		sess := &out[i]
		sess.DurationMs = max(sess.DurationMs, s.TS+dwell-sess.Start)
		sess.Agent = max(sess.Agent, agent)
		if agent != "" {
			via[sid] = max(via[sid], viaRank[agentVia], 1)
			sess.Via = viaByRank[via[sid]]
			sess.Verified = via[sid] >= viaRank["ip"]
		}
		for _, g := range goals {
			if !hit[sid][g.ID] && goalHit(g, s) {
				hit[sid][g.ID] = true
				sess.Goals = append(sess.Goals, GoalHit{ID: g.ID, Name: g.Name, TS: s.TS})
			}
		}
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

// KeepSessions returns the sessions of js that have at least one row inside p's env and
// filters (the same rows base(p) keeps). The window is the span of js itself, so the scan
// stays bounded by one person's history. Agents are not excluded: a journey is one actor's
// history (journeyCond), so the actor is not narrowed again here.
func KeepSessions(db *sql.DB, p Params, js []JourneySession) ([]JourneySession, error) {
	if len(js) == 0 {
		return js, nil
	}
	lp := p
	lp.Actor = ActorAll
	lp.From, lp.To = js[0].Start, js[0].Start
	ids := make([]any, 0, len(js))
	marks := make([]string, 0, len(js))
	for _, j := range js {
		lp.From = min(lp.From, j.Start)
		lp.To = max(lp.To, j.Start)
		for _, st := range j.Steps {
			lp.To = max(lp.To, st.TS)
		}
		ids = append(ids, j.SessionID)
		marks = append(marks, "?")
	}
	cte, args, err := base(lp)
	if err != nil {
		return nil, err
	}
	keep := map[string]bool{}
	err = forRows(db, cte+"SELECT DISTINCT session_id FROM ev WHERE session_id IN ("+strings.Join(marks, ",")+")",
		append(args, ids...), func(r *sql.Rows) error {
			var sid string
			if err := r.Scan(&sid); err != nil {
				return err
			}
			keep[sid] = true
			return nil
		})
	if err != nil {
		return nil, err
	}
	out := make([]JourneySession, 0, len(js))
	for _, j := range js {
		if keep[j.SessionID] {
			out = append(out, j)
		}
	}
	return out, nil
}
