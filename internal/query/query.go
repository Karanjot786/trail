// Package query answers the dashboard's questions from the events table.
// Every query resolves people at read time through identity_map and excludes bots.
package query

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// ErrBadDim is returned for a breakdown or filter dimension outside the allowlist.
var ErrBadDim = errors.New("unknown dimension")

// ErrBadMetric is returned for a series metric outside the allowlist.
var ErrBadMetric = errors.New("unknown metric")

// dims maps public dimension names to columns. User input never becomes a column name.
var dims = map[string]string{
	"path": "path", "route": "route", "host": "host", "referrer": "referrer_host",
	"utm_source": "utm_source", "utm_medium": "utm_medium", "utm_campaign": "utm_campaign",
	"country": "country", "device": "device", "browser": "browser", "os": "os",
	"event": "name", "goal": "",
}

const (
	defaultLimit = 100
	maxLimit     = 1000
	onlineWindow = 5 * time.Minute
)

// Params scopes a dashboard query. Env "" or "all" means every environment.
type Params struct {
	Site, Env     string
	From, To      int64             // unix ms, inclusive; = Win.From, Win.To (kept for existing callers)
	Win           Window            // resolved window, including Prev*
	Filters       map[string]string // dim → value
	TZ            *time.Location
	Now           time.Time // server clock; the demo pins it
	Conv          int64     // goal id for conversion columns; 0 = the site's first goal
	Limit, Offset int
	Sort          string
}

// Prev returns the comparison window as Params; false when Win.PrevFrom is nil.
func (p Params) Prev() (Params, bool) {
	if p.Win.PrevFrom == nil || p.Win.PrevTo == nil {
		return Params{}, false
	}
	q := p
	q.From, q.To = *p.Win.PrevFrom, *p.Win.PrevTo
	q.Win.From, q.Win.To = q.From, q.To
	q.Win.PrevFrom, q.Win.PrevTo = nil, nil
	return q, true
}

// The v3 JSON types (Totals, StatsResult, Point, SeriesResult, Row, Person/Visitor) live in types.go.

// base builds the person CTE (idm, ev) for p, with env and filters applied.
func base(p Params) (string, []any, error) {
	var sb strings.Builder
	sb.WriteString(`WITH idm AS (SELECT anon_id, user_id FROM identity_map WHERE site_id=? AND rowid IN
  (SELECT min(rowid) FROM identity_map WHERE site_id=? GROUP BY anon_id)),
ev AS (SELECT e.*, COALESCE(idm.user_id, e.anon_id) AS person, idm.user_id IS NOT NULL AS ident
  FROM events e LEFT JOIN idm USING(anon_id)
  WHERE e.site_id=? AND e.ts BETWEEN ? AND ? AND e.is_bot=0`)
	args := []any{p.Site, p.Site, p.Site, p.From, p.To}
	if p.Env != "" && p.Env != "all" {
		sb.WriteString(" AND e.env=?")
		args = append(args, p.Env)
	}
	keys := make([]string, 0, len(p.Filters))
	for k := range p.Filters {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		col, ok := dims[k]
		if !ok {
			return "", nil, fmt.Errorf("filter %q: %w", k, ErrBadDim)
		}
		switch k {
		case "goal":
			// A goal filter keeps whole sessions that hit the goal (any kind of goal).
			sb.WriteString(" AND e.session_id IN (SELECT x.session_id FROM events x JOIN goals g ON g.id=? AND g.site_id=x.site_id" +
				" WHERE x.site_id=? AND x.ts BETWEEN ? AND ? AND " + goalHitCond + ")")
			args = append(args, p.Filters[k], p.Site, p.From, p.To)
			continue
		case "event":
			// An event filter keeps whole sessions that fired the event.
			sb.WriteString(" AND e.session_id IN (SELECT session_id FROM events WHERE site_id=? AND type='event' AND name=?)")
			args = append(args, p.Site, p.Filters[k])
			continue
		case "referrer", "utm_source", "utm_medium", "utm_campaign":
			// Sources are sent only on the landing pageview, so keep whole sessions
			// that arrived from them; a row filter would make every session a bounce.
			sb.WriteString(" AND e.session_id IN (SELECT session_id FROM events WHERE site_id=? AND " + col + "=?)")
			args = append(args, p.Site, p.Filters[k])
			continue
		}
		sb.WriteString(" AND e." + col + "=?") // col comes from the dims allowlist
		args = append(args, p.Filters[k])
	}
	sb.WriteString(")\n")
	return sb.String(), args, nil
}

// Stats returns every headline number for the window and its comparison period, plus
// visitors online in the five minutes before p.Now.
func Stats(db *sql.DB, p Params) (StatsResult, error) {
	r := StatsResult{Window: p.Win}
	goal, err := convGoal(db, p.Site, p.Conv)
	if err != nil {
		return r, err
	}
	if r.Totals, err = totals(db, p, goal); err != nil {
		return r, err
	}
	if pp, ok := prevParams(p); ok {
		pt, err := totals(db, pp, goal)
		if err != nil {
			return r, err
		}
		r.Prev = &pt
	}
	if goal != nil {
		r.Conv = &ConvRef{GoalID: goal.ID, Name: goal.Name}
	}
	if r.Online, err = online(db, p); err != nil {
		return r, err
	}
	return r, nil
}

// now is the query clock: p.Now, or the wall clock when unset.
func (p Params) now() time.Time {
	if p.Now.IsZero() {
		return time.Now()
	}
	return p.Now
}

// online counts people seen in the five minutes before p.Now.
func online(db *sql.DB, p Params) (int, error) {
	nowMs := p.now().UnixMilli()
	var n int
	if err := db.QueryRow(`SELECT count(DISTINCT anon_id) FROM events WHERE site_id=? AND ts>=? AND ts<=? AND is_bot=0`,
		p.Site, nowMs-onlineWindow.Milliseconds(), nowMs).Scan(&n); err != nil {
		return 0, fmt.Errorf("online: %w", err)
	}
	return n, nil
}

func totals(db *sql.DB, p Params, goal *Goal) (Totals, error) {
	var t Totals
	cte, args, err := base(p)
	if err != nil {
		return t, err
	}
	if err := db.QueryRow(cte+`SELECT count(DISTINCT person), coalesce(sum(type='pageview'),0) FROM ev`, args...).
		Scan(&t.Visitors, &t.Pageviews); err != nil {
		return t, fmt.Errorf("totals: %w", err)
	}
	var engaged int
	var dur float64
	if err := db.QueryRow(cte+`SELECT count(*), coalesce(sum(`+engagedExpr+`),0), coalesce(avg(dur),0) FROM (`+sessionAgg+`)`, args...).
		Scan(&t.Sessions, &engaged, &dur); err != nil {
		return t, fmt.Errorf("sessions: %w", err)
	}
	t.Bounce = bounce(t.Sessions, engaged)
	t.DurationMs = int64(math.Round(dur))
	if err := db.QueryRow(cte+`, pc AS (SELECT `+currencyExpr+` AS cur, `+amountMinorExpr+` AS amt FROM ev WHERE `+purchaseWhere+`)
SELECT coalesce(sum(amt),0), count(*) FROM pc
WHERE cur=(SELECT cur FROM pc GROUP BY cur ORDER BY count(*) DESC, cur LIMIT 1)`, args...).
		Scan(&t.RevenueMinor, &t.Purchases); err != nil {
		return t, fmt.Errorf("revenue: %w", err)
	}
	t.BaseVisitors = t.Visitors
	if bp, ok := withoutGoalFilter(p); ok {
		bcte, bargs, err := base(bp)
		if err != nil {
			return t, err
		}
		if err := db.QueryRow(bcte+`SELECT count(DISTINCT person) FROM ev`, bargs...).Scan(&t.BaseVisitors); err != nil {
			return t, fmt.Errorf("base visitors: %w", err)
		}
	}
	if goal != nil {
		where, gargs := goalWhere(*goal)
		if err := db.QueryRow(cte+`SELECT count(*), count(DISTINCT person) FROM ev WHERE `+where, append(args, gargs...)...).
			Scan(&t.Conversions, &t.ConvVisitors); err != nil {
			return t, fmt.Errorf("conversions: %w", err)
		}
		if t.BaseVisitors > 0 {
			t.ConvRate = float64(t.ConvVisitors) / float64(t.BaseVisitors)
		}
	}
	return t, nil
}

// Series returns metric (visitors|pageviews|bounce) bucketed by hour for
// ranges of 48 h or less, otherwise by day, in p.TZ.
func Series(db *sql.DB, p Params, metric string) (SeriesResult, error) {
	switch metric {
	case "visitors", "pageviews", "bounce":
	default:
		return SeriesResult{}, fmt.Errorf("metric %q: %w", metric, ErrBadMetric)
	}
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	res := SeriesResult{Metric: metric, Bucket: "day", Points: []Point{}, Prev: []Point{}}
	trunc := func(ms int64) time.Time {
		t := time.UnixMilli(ms).In(loc)
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	}
	next := func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
	if p.To-p.From <= int64(48*time.Hour/time.Millisecond) {
		res.Bucket = "hour"
		trunc = func(ms int64) time.Time {
			t := time.UnixMilli(ms).In(loc)
			return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, loc)
		}
		next = func(t time.Time) time.Time { return t.Add(time.Hour) }
	}
	index := map[int64]int{}
	for t := trunc(p.From); t.UnixMilli() <= p.To; t = next(t) {
		index[t.UnixMilli()] = len(res.Points)
		res.Points = append(res.Points, Point{T: t.UnixMilli()})
	}
	vals := make([]float64, len(res.Points))
	bucketOf := func(ms int64) (int, bool) {
		i, ok := index[trunc(ms).UnixMilli()]
		return i, ok
	}

	cte, args, err := base(p)
	if err != nil {
		return res, err
	}
	switch metric {
	case "pageviews":
		err = scanTS(db, cte+`SELECT ts FROM ev WHERE type='pageview'`, args, func(ts int64) {
			if i, ok := bucketOf(ts); ok {
				vals[i]++
			}
		})
	case "visitors":
		seen := make([]map[string]bool, len(res.Points))
		err = forRows(db, cte+`SELECT ts, person FROM ev`, args, func(r *sql.Rows) error {
			var ts int64
			var person string
			if err := r.Scan(&ts, &person); err != nil {
				return err
			}
			if i, ok := bucketOf(ts); ok {
				if seen[i] == nil {
					seen[i] = map[string]bool{}
				}
				seen[i][person] = true
			}
			return nil
		})
		for i, s := range seen {
			vals[i] = float64(len(s))
		}
	case "bounce":
		sessions := make([]int, len(res.Points))
		engaged := make([]int, len(res.Points))
		err = forRows(db, cte+`SELECT start, `+engagedExpr+` FROM (`+sessionAgg+`)`, args, func(r *sql.Rows) error {
			var start int64
			var eng int
			if err := r.Scan(&start, &eng); err != nil {
				return err
			}
			if i, ok := bucketOf(start); ok {
				sessions[i]++
				engaged[i] += eng
			}
			return nil
		})
		for i := range res.Points {
			vals[i] = bounce(sessions[i], engaged[i])
		}
	}
	if err != nil {
		return res, fmt.Errorf("series %s: %w", metric, err)
	}
	for i := range res.Points {
		res.Points[i].V = &vals[i]
	}
	return res, nil
}

// Breakdown returns the top values of dim by visitors. q filters keys by
// case-insensitive substring.
func Breakdown(db *sql.DB, p Params, dim, q string, limit int) ([]Row, error) {
	col, ok := dims[dim]
	if !ok || col == "" {
		return nil, fmt.Errorf("dim %q: %w", dim, ErrBadDim)
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	where := col + "!=''" // col comes from the dims allowlist
	if dim == "event" {
		where += " AND type='event'"
	}
	if q != "" {
		where += " AND instr(lower(" + col + "), lower(?))>0"
		args = append(args, q)
	}
	args = append(args, clampLimit(limit))
	sqlText := cte + `SELECT ` + col + `, count(DISTINCT person), coalesce(sum(type='pageview'),0), count(*)
FROM ev WHERE ` + where + ` GROUP BY ` + col + ` ORDER BY 2 DESC, 3 DESC, 4 DESC, 1 LIMIT ?`

	rows := []Row{}
	err = forRows(db, sqlText, args, func(r *sql.Rows) error {
		var row Row
		if err := r.Scan(&row.Key, &row.Visitors, &row.Pageviews, &row.Total); err != nil {
			return err
		}
		if dim != "event" {
			row.Total = 0
		}
		rows = append(rows, row)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("breakdown %s: %w", dim, err)
	}
	return rows, nil
}

// Visitors lists people seen in range, most recent first. q matches the
// person id (user id or anon id) by case-insensitive substring.
func Visitors(db *sql.DB, p Params, q string, limit int) ([]Visitor, error) {
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	where := ""
	if q != "" {
		where = "WHERE instr(lower(person), lower(?))>0"
		args = append(args, q)
	}
	args = append(args, clampLimit(limit))
	sqlText := cte + `SELECT person, max(ident), min(ts), max(ts), count(DISTINCT session_id),
  max(lc), max(ld), max(fs)
FROM (SELECT person, ident, ts, session_id,
  first_value(country) OVER (PARTITION BY person ORDER BY ts DESC) AS lc,
  first_value(device) OVER (PARTITION BY person ORDER BY ts DESC) AS ld,
  first_value(` + sourceExpr + `) OVER (PARTITION BY person ORDER BY ts) AS fs
  FROM ev ` + where + `)
GROUP BY person ORDER BY 4 DESC LIMIT ?`

	out := []Visitor{}
	err = forRows(db, sqlText, args, func(r *sql.Rows) error {
		var v Visitor
		if err := r.Scan(&v.Person, &v.Identified, &v.FirstSeen, &v.LastSeen, &v.Visits,
			&v.Country, &v.Device, &v.Source); err != nil {
			return err
		}
		out = append(out, v)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("visitors: %w", err)
	}
	return out, nil
}

// sourceExpr is an event's traffic source: referrer host, else utm_source, else "" (direct).
const sourceExpr = `CASE WHEN referrer_host!='' THEN referrer_host ELSE utm_source END`

func clampLimit(n int) int {
	switch {
	case n <= 0:
		return defaultLimit
	case n > maxLimit:
		return maxLimit
	}
	return n
}

func forRows(db *sql.DB, q string, args []any, fn func(*sql.Rows) error) error {
	rows, err := db.Query(q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := fn(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

func scanTS(db *sql.DB, q string, args []any, fn func(int64)) error {
	return forRows(db, q, args, func(r *sql.Rows) error {
		var ts int64
		if err := r.Scan(&ts); err != nil {
			return err
		}
		fn(ts)
		return nil
	})
}
