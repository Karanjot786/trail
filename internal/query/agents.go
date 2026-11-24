package query

import (
	"database/sql"
	"fmt"
	"sort"

	"trail/internal/agents"
)

const (
	maxAgentPages  = 50 // pages in the agents report
	maxAgentLatest = 50 // latest sessions in the agents report
)

// viaRank orders the ways an agent is recognised, weakest first; 0 = not an agent.
var viaRank = map[string]int{"ua": 1, "ip": 2, "relay": 3, "sig": 4}

var viaByRank = []string{"", "ua", "ip", "relay", "sig"}

// agentName names an agent id from the catalogue; an unknown id names itself.
func agentName(id string) (name, provider string) {
	if a, ok := agents.Lookup(id); ok {
		return a.Name, a.Provider
	}
	return id, id
}

// agentSess is one agent session, aggregated from its events.
type agentSess struct {
	id, person, agent string
	via               int // best viaRank in the session
	start, end        int64
	pages             int
	entry             string
	goals             map[int64]bool
}

// agentScan reads every AI agent event of p's window (env applies, filters do not, as
// Stats.AgentSessions) and returns its sessions in start order, plus each path's pageviews by agent.
func agentScan(db *sql.DB, p Params, goals []Goal) ([]*agentSess, map[string]map[string]int, map[string]map[string]bool, error) {
	q := `SELECT session_id, anon_id, agent, agent_via, ts, type, path, name, dwell_ms FROM events
WHERE site_id=? AND agent<>'' AND ts BETWEEN ? AND ?`
	args := []any{p.Site, p.From, p.To}
	if p.Env != "" && p.Env != "all" {
		q += " AND env=?"
		args = append(args, p.Env)
	}
	q += " ORDER BY ts, id"
	byID := map[string]*agentSess{}
	list := []*agentSess{}
	pathViews := map[string]map[string]int{} // path → agent → pageviews
	pathSess := map[string]map[string]bool{} // path → sessions
	err := forRows(db, q, args, func(r *sql.Rows) error {
		var sid, anon, agent, via string
		var st Step
		var dwell int64
		if err := r.Scan(&sid, &anon, &agent, &via, &st.TS, &st.Type, &st.Path, &st.Name, &dwell); err != nil {
			return err
		}
		s := byID[sid]
		if s == nil {
			s = &agentSess{id: sid, person: anon, agent: agent, start: st.TS, goals: map[int64]bool{}}
			byID[sid] = s
			list = append(list, s)
		}
		s.agent = max(s.agent, agent)
		s.via = max(s.via, viaRank[via])
		s.end = max(s.end, st.TS+dwell)
		for _, g := range goals {
			if goalHit(g, st) {
				s.goals[g.ID] = true
			}
		}
		if st.Type != "pageview" {
			return nil
		}
		s.pages++
		if s.entry == "" {
			s.entry = st.Path
		}
		if pathViews[st.Path] == nil {
			pathViews[st.Path], pathSess[st.Path] = map[string]int{}, map[string]bool{}
		}
		pathViews[st.Path][agent]++
		pathSess[st.Path][sid] = true
		return nil
	})
	if err != nil {
		return nil, nil, nil, fmt.Errorf("agents: %w", err)
	}
	return list, pathViews, pathSess, nil
}

// Agents is the AI agents report: sessions of AI browsing agents that ran the site's script,
// verified (ip, relay or sig) or claimed (UA only), per bucket, per agent, per page, and the
// newest 50 sessions. Conversions are agent sessions that hit the conversion goal.
func Agents(db *sql.DB, p Params) (AgentsResult, error) {
	res := AgentsResult{Window: p.Win, Series: []AgentPoint{}, Agents: []AgentRow{}, Pages: []AgentPage{}, Latest: []AgentSession{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	goals, err := ListGoals(db, p.Site)
	if err != nil {
		return res, err
	}
	goal, err := convGoal(db, p.Site, p.Conv)
	if err != nil {
		return res, err
	}
	if goal != nil {
		res.Conv = &ConvRef{GoalID: goal.ID, Name: goal.Name}
	}
	sessions, pathViews, pathSess, err := agentScan(db, p, goals)
	if err != nil {
		return res, err
	}

	starts := bucketStarts(p.From, p.To, bucketKind(p), p.TZ)
	res.Series = make([]AgentPoint, len(starts))
	for i, t := range starts {
		res.Series[i] = AgentPoint{T: t}
	}
	rows := map[string]*AgentRow{}
	for _, s := range sessions {
		verified := s.via >= viaRank["ip"]
		res.Sessions++
		res.Pageviews += s.pages
		if verified {
			res.VerifiedSessions++
		}
		if goal != nil && s.goals[goal.ID] {
			res.Conversions++
		}
		if i := bucketAt(starts, s.start); i >= 0 {
			if verified {
				res.Series[i].Verified++
			} else {
				res.Series[i].Claimed++
			}
		}
		row := rows[s.agent]
		if row == nil {
			name, prov := agentName(s.agent)
			row = &AgentRow{Agent: s.agent, Name: name, Provider: prov}
			rows[s.agent] = row
		}
		row.Sessions++
		row.Pageviews += s.pages
		row.LastSeen = max(row.LastSeen, s.end)
		if verified {
			row.Verified++
		}
	}

	if pp, ok := p.Prev(); ok {
		prev, _, _, err := agentScan(db, pp, nil)
		if err != nil {
			return res, err
		}
		n := len(prev)
		res.PrevSessions = &n
		byAgent := map[string]int{}
		for _, s := range prev {
			byAgent[s.agent]++
		}
		for _, row := range rows {
			v := byAgent[row.Agent]
			row.Prev = &v
		}
	}
	for _, row := range rows {
		res.Agents = append(res.Agents, *row)
	}
	sort.Slice(res.Agents, func(i, j int) bool {
		a, b := res.Agents[i], res.Agents[j]
		if a.Sessions != b.Sessions {
			return a.Sessions > b.Sessions
		}
		return a.Name < b.Name
	})

	res.Pages = agentPages(pathViews, pathSess)
	res.Latest = latestAgentSessions(sessions)
	return res, nil
}

// agentPages ranks the paths agents viewed by pageviews, naming each path's busiest agent.
func agentPages(views map[string]map[string]int, sess map[string]map[string]bool) []AgentPage {
	out := make([]AgentPage, 0, len(views))
	for path, byAgent := range views {
		pg := AgentPage{Path: path, Sessions: len(sess[path])}
		top := 0
		for agent, n := range byAgent {
			pg.Pageviews += n
			if n > top || (n == top && agent < pg.TopAgent) {
				top, pg.TopAgent = n, agent
			}
		}
		out = append(out, pg)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Pageviews != out[j].Pageviews {
			return out[i].Pageviews > out[j].Pageviews
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > maxAgentPages {
		out = out[:maxAgentPages]
	}
	return out
}

// latestAgentSessions is the newest 50 sessions, newest first.
func latestAgentSessions(sessions []*agentSess) []AgentSession {
	list := append([]*agentSess(nil), sessions...)
	sort.Slice(list, func(i, j int) bool {
		if list[i].start != list[j].start {
			return list[i].start > list[j].start
		}
		return list[i].id > list[j].id
	})
	if len(list) > maxAgentLatest {
		list = list[:maxAgentLatest]
	}
	out := make([]AgentSession, 0, len(list))
	for _, s := range list {
		name, prov := agentName(s.agent)
		out = append(out, AgentSession{SessionID: s.id, Person: s.person, Agent: s.agent, Name: name, Provider: prov,
			Via: viaByRank[max(s.via, 1)], Start: s.start, DurationMs: s.end - s.start, Pages: s.pages, Entry: s.entry,
			Goals: len(s.goals)})
	}
	return out
}
