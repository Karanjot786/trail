package query

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

const (
	lowBaseVisitors = 20 // a first-touch row with fewer visitors is flagged lowBase
	maxFirstTouch   = 50 // rows in the sources and landings tables
)

// getGoal loads goal id of site, or ErrNotFound.
func getGoal(db *sql.DB, site string, id int64) (Goal, error) {
	var g Goal
	err := db.QueryRow(`SELECT id, name, kind, match FROM goals WHERE site_id=? AND id=?`, site, id).
		Scan(&g.ID, &g.Name, &g.Kind, &g.Match)
	if err == sql.ErrNoRows {
		return g, fmt.Errorf("goal %d: %w", id, ErrNotFound)
	}
	if err != nil {
		return g, fmt.Errorf("goal %d: %w", id, err)
	}
	return g, nil
}

// goalWhere is the SQL condition (over ev) for a hit of g: an event name, an exact path or a path prefix (match ending in *).
// substr = is case-sensitive like the exact match; LIKE is not.
func goalWhere(g Goal) (string, []any) {
	switch {
	case g.Kind == "event":
		return "type='event' AND name=?", []any{g.Match}
	case strings.HasSuffix(g.Match, "*"):
		prefix := strings.TrimSuffix(g.Match, "*")
		return "type='pageview' AND substr(path, 1, length(?)) = ?", []any{prefix, prefix}
	default:
		return "type='pageview' AND path=?", []any{g.Match}
	}
}

// withoutGoalFilter drops a goal filter: a goal report filtered on a goal would only see converters.
func withoutGoalFilter(p Params) Params {
	if _, ok := p.Filters["goal"]; !ok {
		return p
	}
	f := make(map[string]string, len(p.Filters))
	for k, v := range p.Filters {
		if k != "goal" {
			f[k] = v
		}
	}
	p.Filters = f
	return p
}

// goalStats counts hits, converters and the converter rate over every visitor in q's window.
func goalStats(db *sql.DB, q Params, g Goal) (GoalStats, error) {
	var s GoalStats
	cte, args, err := base(q)
	if err != nil {
		return s, err
	}
	where, wargs := goalWhere(g)
	var total int
	if err := db.QueryRow(cte+`SELECT count(DISTINCT person), coalesce(sum(`+where+`),0),
  count(DISTINCT CASE WHEN `+where+` THEN person END) FROM ev`, append(append(args, wargs...), wargs...)...).
		Scan(&total, &s.Conversions, &s.Visitors); err != nil {
		return s, fmt.Errorf("goal stats: %w", err)
	}
	if total > 0 {
		s.Rate = float64(s.Visitors) / float64(total)
	}
	return s, nil
}

// goalHit is a converter's first hit of the goal in the window.
type goalHit struct {
	person, session string
	ts              int64
}

// firstHits returns each converter's first hit in p's window, in hit order, and the number of hits.
func firstHits(db *sql.DB, p Params, g Goal) ([]goalHit, int, error) {
	cte, args, err := base(p)
	if err != nil {
		return nil, 0, err
	}
	where, wargs := goalWhere(g)
	out := []goalHit{}
	seen := map[string]bool{}
	n := 0
	err = forRows(db, cte+`SELECT person, session_id, ts FROM ev WHERE `+where+` ORDER BY ts, id`, append(args, wargs...), func(r *sql.Rows) error {
		var h goalHit
		if err := r.Scan(&h.person, &h.session, &h.ts); err != nil {
			return err
		}
		n++
		if !seen[h.person] {
			seen[h.person] = true
			out = append(out, h)
		}
		return nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("goal hits: %w", err)
	}
	return out, n, nil
}

// GoalDetail returns one goal's numbers for the window and the comparison window, its converter
// series, first-touch sources and landing pages, and which visit converted. Unknown ids wrap ErrNotFound.
func GoalDetail(db *sql.DB, p Params, id int64) (GoalDetailResult, error) {
	res := GoalDetailResult{Series: []Point{}, PrevSeries: []Point{}, Sources: []FirstTouchRow{}, Landings: []FirstTouchRow{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	g, err := getGoal(db, p.Site, id)
	if err != nil {
		return res, err
	}
	res.Goal = g
	p = withoutGoalFilter(p)
	if pp, ok := p.Prev(); ok {
		prev, err := goalStats(db, pp, g)
		if err != nil {
			return res, err
		}
		res.Prev = &prev
	}
	where, wargs := goalWhere(g)
	res.Series, res.PrevSeries, err = seriesWithPrev(p, func(q Params) ([]Point, error) {
		cte, args, err := base(q)
		if err != nil {
			return nil, err
		}
		return bucketValues(db, q, cte+`SELECT ts, person, 0 FROM ev WHERE `+where, append(args, wargs...), true)
	})
	if err != nil {
		return res, fmt.Errorf("goal series: %w", err)
	}

	hits, nHits, err := firstHits(db, p, g)
	if err != nil {
		return res, err
	}
	cte, args, err := base(p)
	if err != nil {
		return res, err
	}
	persons := []string{}
	err = forRows(db, cte+`SELECT DISTINCT person FROM ev`, args, func(r *sql.Rows) error {
		var s string
		if err := r.Scan(&s); err != nil {
			return err
		}
		persons = append(persons, s)
		return nil
	})
	if err != nil {
		return res, fmt.Errorf("goal visitors: %w", err)
	}
	touches, err := sessionTouches(db, p, persons)
	if err != nil {
		return res, err
	}
	converters := make(map[string]bool, len(hits))
	for _, h := range hits {
		converters[h.person] = true
	}
	res.Cur = GoalStats{Conversions: nHits, Visitors: len(hits)}
	if len(persons) > 0 {
		res.Cur.Rate = float64(len(hits)) / float64(len(persons))
	}

	// Revenue of the converters, credited to their first touch (the same rule as RevenueBreakdown).
	list, err := loadPurchases(db, p)
	if err != nil {
		return res, err
	}
	currency, err := siteCurrency(db, p, list)
	if err != nil {
		return res, err
	}
	credit, _, err := creditRevenue(db, p, list, currency, converters, touches)
	if err != nil {
		return res, err
	}

	first := func(person string) touch { return firstTouch(touches[person]) }
	res.Sources = firstTouchRows(persons, converters, first, "source", credit["source"], res.Cur.Visitors)
	res.Landings = firstTouchRows(persons, converters, first, "entry", credit["entry"], res.Cur.Visitors)

	for _, h := range hits {
		switch visitNumber(touches[h.person], h.session, h.ts) {
		case 1:
			res.ByVisit.First++
		case 2:
			res.ByVisit.Second++
		default:
			res.ByVisit.Later++
		}
	}
	return res, nil
}

// visitNumber is the 1-based number, over all time, of the visit at (session, ts).
func visitNumber(sessions []touch, session string, ts int64) int {
	return visitsBefore(sessions, session, ts) + 1
}

// firstTouchRows credits converters to their first-touch key for dim. visitors per key counts every
// visitor of the window with that first touch, so rate = converted / visitors of that key.
func firstTouchRows(persons []string, converters map[string]bool, first func(string) touch, dim string,
	credit map[string]*credited, totalConverted int) []FirstTouchRow {
	byKey := map[string]*FirstTouchRow{}
	for _, person := range persons {
		k := first(person).key(dim)
		r := byKey[k]
		if r == nil {
			r = &FirstTouchRow{Key: k}
			byKey[k] = r
		}
		r.Visitors++
		if converters[person] {
			r.Converted++
		}
	}
	out := []FirstTouchRow{}
	for k, r := range byKey {
		if r.Converted == 0 {
			continue
		}
		r.Rate = float64(r.Converted) / float64(r.Visitors)
		r.LowBase = r.Visitors < lowBaseVisitors
		if totalConverted > 0 {
			r.Share = float64(r.Converted) / float64(totalConverted)
		}
		if c := credit[k]; c != nil {
			r.RevenueMinor = c.amount
		}
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Converted != out[j].Converted {
			return out[i].Converted > out[j].Converted
		}
		return out[i].Key < out[j].Key
	})
	if len(out) > maxFirstTouch {
		out = out[:maxFirstTouch]
	}
	return out
}
