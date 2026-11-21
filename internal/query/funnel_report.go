package query

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// ErrBadRequest is returned for a request that names something out of range (a funnel step, for example).
var ErrBadRequest = errors.New("bad request")

// loadFunnel reads funnel id of site, or ErrNotFound.
// It stands in for GetFunnel (funnel_defs.go) until that lands; drop it at integration.
func loadFunnel(db *sql.DB, site string, id int64) (Funnel, error) {
	f := Funnel{Steps: []FunnelStep{}}
	var steps string
	err := db.QueryRow(`SELECT id, name, window_ms, steps, created FROM funnels WHERE site_id=? AND id=?`, site, id).
		Scan(&f.ID, &f.Name, &f.WindowMs, &steps, &f.Created)
	if err == sql.ErrNoRows {
		return f, fmt.Errorf("funnel %d: %w", id, ErrNotFound)
	}
	if err != nil {
		return f, fmt.Errorf("funnel %d: %w", id, err)
	}
	if err := json.Unmarshal([]byte(steps), &f.Steps); err != nil {
		return f, fmt.Errorf("funnel %d steps: %w", id, err)
	}
	if f.Steps == nil {
		f.Steps = []FunnelStep{}
	}
	return f, nil
}

// funnelRun is how far one person got: the time each reached step was matched.
type funnelRun struct {
	person string
	at     []int64
}

// stepMatches reports whether a pageview or event row satisfies step s.
func stepMatches(s FunnelStep, typ, path, name string) bool {
	if s.Kind == "event" {
		return typ == "event" && name == s.Match
	}
	if typ != "pageview" {
		return false
	}
	if prefix, ok := strings.CutSuffix(s.Match, "*"); ok {
		return strings.HasPrefix(path, prefix)
	}
	return path == s.Match
}

// funnelRuns walks every person's matching rows in time order. A person enters at their first step-1
// match in the window; each later step must follow in order within WindowMs of that entry.
func funnelRuns(db *sql.DB, p Params, f Funnel) ([]funnelRun, error) {
	runs := []funnelRun{}
	if len(f.Steps) == 0 {
		return runs, nil
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	conds := make([]string, len(f.Steps))
	for i, s := range f.Steps {
		w, wargs := goalWhere(Goal{Kind: s.Kind, Match: s.Match})
		conds[i] = "(" + w + ")"
		args = append(args, wargs...)
	}
	var cur *funnelRun
	done := false
	err = forRows(db, cte+`SELECT person, ts, type, path, name FROM ev WHERE `+strings.Join(conds, " OR ")+
		` ORDER BY person, ts, id`, args, func(r *sql.Rows) error {
		var person, typ, path, name string
		var ts int64
		if err := r.Scan(&person, &ts, &typ, &path, &name); err != nil {
			return err
		}
		if cur == nil || cur.person != person {
			runs = append(runs, funnelRun{person: person})
			cur, done = &runs[len(runs)-1], false
		}
		next := len(cur.at)
		if done || next == len(f.Steps) || !stepMatches(f.Steps[next], typ, path, name) {
			return nil
		}
		if next > 0 && ts-cur.at[0] > f.WindowMs {
			done = true // the window closed before this step
			return nil
		}
		cur.at = append(cur.at, ts)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("funnel: %w", err)
	}
	out := runs[:0]
	for _, r := range runs {
		if len(r.at) > 0 {
			out = append(out, r)
		}
	}
	return out, nil
}

// FunnelReport runs funnel id over the window: people reaching each step, people who left after it,
// conversion from the start and from the previous step, the median time from the previous step and
// the biggest drop (ties go to the earlier step).
func FunnelReport(db *sql.DB, p Params, id int64) (FunnelReportResult, error) {
	res := FunnelReportResult{Window: p.Win, Steps: []FunnelStepResult{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	f, err := loadFunnel(db, p.Site, id)
	if err != nil {
		return res, err
	}
	res.Funnel = f
	runs, err := funnelRuns(db, p, f)
	if err != nil {
		return res, err
	}
	n := len(f.Steps)
	reached := make([]int, n)
	gaps := make([][]int64, n)
	for _, r := range runs {
		for i := range r.at {
			reached[i]++
			if i > 0 {
				gaps[i] = append(gaps[i], r.at[i]-r.at[i-1])
			}
		}
	}
	if n > 0 {
		res.Started = reached[0]
	}
	for i, s := range f.Steps {
		st := FunnelStepResult{Label: s.Label, Reached: reached[i]}
		if i+1 < n {
			st.LeftAfter = reached[i] - reached[i+1]
		}
		if reached[0] > 0 {
			st.FromStart = float64(reached[i]) / float64(reached[0])
		}
		switch {
		case i == 0 && reached[0] > 0:
			st.FromPrev = 1
		case i > 0 && reached[i-1] > 0:
			st.FromPrev = float64(reached[i]) / float64(reached[i-1])
		}
		if len(gaps[i]) > 0 {
			g := gaps[i]
			sort.Slice(g, func(a, b int) bool { return g[a] < g[b] })
			m := g[len(g)/2]
			if len(g)%2 == 0 {
				m = (g[len(g)/2-1] + g[len(g)/2]) / 2
			}
			st.MedianMsFromPrev = &m
		}
		if st.LeftAfter > 0 && (res.BiggestDrop == nil || st.LeftAfter > res.BiggestDrop.People) {
			res.BiggestDrop = &FunnelDrop{After: i + 1, People: st.LeftAfter}
		}
		res.Steps = append(res.Steps, st)
	}
	return res, nil
}

// FunnelDropoff lists the people who reached step (1-based) and never the next one, newest last
// visit first, paged by p.Limit and p.Offset, with the total count. A step outside 1…len wraps ErrBadRequest.
func FunnelDropoff(db *sql.DB, p Params, id int64, step int) ([]DropoffPerson, int, error) {
	out := []DropoffPerson{}
	if err := needSite(p); err != nil {
		return out, 0, err
	}
	f, err := loadFunnel(db, p.Site, id)
	if err != nil {
		return out, 0, err
	}
	if step < 1 || step > len(f.Steps) {
		return out, 0, fmt.Errorf("step %d of %d: %w", step, len(f.Steps), ErrBadRequest)
	}
	runs, err := funnelRuns(db, p, f)
	if err != nil {
		return out, 0, err
	}
	persons := []string{}
	for _, r := range runs {
		if len(r.at) == step && step < len(f.Steps) {
			persons = append(persons, r.person)
		}
	}
	if len(persons) == 0 {
		return out, 0, nil
	}
	who, err := json.Marshal(persons)
	if err != nil {
		return out, 0, err
	}
	cte, args, err := base(p)
	if err != nil {
		return out, 0, err
	}
	type last struct {
		DropoffPerson
		session string
	}
	byPerson := map[string]*last{}
	err = forRows(db, cte+`SELECT person, ident, session_id, ts, type, path, `+sourceNameExpr+` FROM ev
WHERE person IN (SELECT value FROM json_each(?)) AND type='pageview' ORDER BY person, ts, id`, append(args, string(who)),
		func(r *sql.Rows) error {
			var person, sid, typ, path, src string
			var ident bool
			var ts int64
			if err := r.Scan(&person, &ident, &sid, &ts, &typ, &path, &src); err != nil {
				return err
			}
			l := byPerson[person]
			if l == nil {
				l = &last{DropoffPerson: DropoffPerson{Person: person, Label: personLabel(person, ident)}}
				byPerson[person] = l
			}
			if l.session != sid { // a newer visit starts
				l.session, l.LastVisit, l.Source = sid, ts, src
			}
			l.ExitPage = path
			return nil
		})
	if err != nil {
		return out, 0, fmt.Errorf("dropoff: %w", err)
	}
	for _, person := range persons {
		if l := byPerson[person]; l != nil {
			out = append(out, l.DropoffPerson)
		} else { // reached the step only through events; no pageview to show
			out = append(out, DropoffPerson{Person: person, Label: personLabel(person, false)})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].LastVisit != out[j].LastVisit {
			return out[i].LastVisit > out[j].LastVisit
		}
		return out[i].Person < out[j].Person
	})
	total := len(out)
	lo := min(max(p.Offset, 0), total)
	hi := min(lo+clampLimit(p.Limit), total)
	return out[lo:hi], total, nil
}
