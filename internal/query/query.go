// Package query answers the dashboard's questions from the events table.
// Every query resolves people at read time through identity_map and excludes bots.
package query

import (
	"database/sql"
	"errors"
	"fmt"
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
	"event": "name",
}

const (
	defaultLimit = 100
	maxLimit     = 1000
	onlineWindow = 5 * time.Minute
)

// Params scopes a dashboard query. Env "" or "all" means every environment.
type Params struct {
	Site, Env string
	From, To  int64 // unix ms, inclusive
	Filters   map[string]string
	TZ        *time.Location
}

// Totals is one period's headline numbers. Bounce is a 0–1 fraction.
type Totals struct {
	Visitors  int     `json:"visitors"`
	Pageviews int     `json:"pageviews"`
	Bounce    float64 `json:"bounce"`
}

// StatsResult is the /api/stats payload.
type StatsResult struct {
	Totals
	Prev   Totals `json:"prev"`
	Online int    `json:"online"`
}

// Point is one series bucket: start time (unix ms) and value.
type Point struct {
	T int64   `json:"t"`
	V float64 `json:"v"`
}

// SeriesResult is the /api/series payload.
type SeriesResult struct {
	Bucket string  `json:"bucket"`
	Points []Point `json:"points"`
}

// Row is one breakdown row. Total is filled only for dim=event.
type Row struct {
	Key       string `json:"key"`
	Visitors  int    `json:"visitors"`
	Pageviews int    `json:"pageviews"`
	Total     int    `json:"total"`
}

// Visitor is one person in the visitors list.
type Visitor struct {
	Person     string `json:"person"`
	Identified bool   `json:"identified"`
	FirstSeen  int64  `json:"firstSeen"`
	LastSeen   int64  `json:"lastSeen"`
	Visits     int    `json:"visits"`
	Country    string `json:"country"`
	Device     string `json:"device"`
	Source     string `json:"source"`
}

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

// Stats returns visitors, pageviews and bounce for the range and the previous
// equal-length range, plus visitors online in the last five minutes.
func Stats(db *sql.DB, p Params) (StatsResult, error) {
	var r StatsResult
	cur, err := totals(db, p)
	if err != nil {
		return r, err
	}
	prev := p
	prev.From, prev.To = p.From-(p.To-p.From), p.From-1
	pt, err := totals(db, prev)
	if err != nil {
		return r, err
	}
	since := time.Now().Add(-onlineWindow).UnixMilli()
	if err := db.QueryRow(`SELECT count(DISTINCT anon_id) FROM events WHERE site_id=? AND ts>=? AND is_bot=0`,
		p.Site, since).Scan(&r.Online); err != nil {
		return r, fmt.Errorf("online: %w", err)
	}
	r.Totals, r.Prev = cur, pt
	return r, nil
}

func totals(db *sql.DB, p Params) (Totals, error) {
	var t Totals
	cte, args, err := base(p)
	if err != nil {
		return t, err
	}
	if err := db.QueryRow(cte+`SELECT count(DISTINCT person), coalesce(sum(type='pageview'),0) FROM ev`, args...).
		Scan(&t.Visitors, &t.Pageviews); err != nil {
		return t, fmt.Errorf("totals: %w", err)
	}
	var sessions, engaged int
	if err := db.QueryRow(cte+`SELECT count(*), coalesce(sum(`+engagedExpr+`),0) FROM (`+sessionAgg+`)`, args...).
		Scan(&sessions, &engaged); err != nil {
		return t, fmt.Errorf("bounce: %w", err)
	}
	t.Bounce = bounce(sessions, engaged)
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
	res := SeriesResult{Bucket: "day", Points: []Point{}}
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
				res.Points[i].V++
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
			res.Points[i].V = float64(len(s))
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
			res.Points[i].V = bounce(sessions[i], engaged[i])
		}
	}
	if err != nil {
		return res, fmt.Errorf("series %s: %w", metric, err)
	}
	return res, nil
}

// Breakdown returns the top values of dim by visitors. q filters keys by
// case-insensitive substring.
func Breakdown(db *sql.DB, p Params, dim, q string, limit int) ([]Row, error) {
	col, ok := dims[dim]
	if !ok {
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
