// Package query answers the dashboard's questions from the events table.
// Every query resolves people at read time through identity_map and excludes bots.
package query

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ErrBadDim is returned for a breakdown or filter dimension outside the allowlist.
var ErrBadDim = errors.New("unknown dimension")

// ErrBadMetric is returned for a series metric outside the allowlist.
var ErrBadMetric = errors.New("unknown metric")

// Dimension kinds. Row dims filter and group event rows; session dims are read from a
// session's landing pageview (or last pageview, for exit) and filter whole sessions.
const (
	dimRow = iota
	dimSession
	dimExit
	dimEvent
	dimGoal
	dimClock // dow, hour: local weekday (Mon=0) or hour of the event
)

type dimDef struct {
	kind int
	expr string // SQL over one events row; compile-time constants only
}

// dims maps public dimension names to their definitions. User input never becomes SQL text.
var dims = map[string]dimDef{
	"path": {dimRow, "path"}, "route": {dimRow, "route"}, "host": {dimRow, "host"},
	"country": {dimRow, "country"}, "region": {dimRow, "region"}, "city": {dimRow, "city"},
	"device": {dimRow, "device"}, "browser": {dimRow, "browser"}, "os": {dimRow, "os"},
	"referrer": {dimSession, "referrer_host"}, "source": {dimSession, sourceNameExpr},
	"channel": {dimSession, channelExpr}, "ai_source": {dimSession, aiSourceExpr}, "entry": {dimSession, "path"},
	"utm_source": {dimSession, "utm_source"}, "utm_medium": {dimSession, "utm_medium"},
	"utm_campaign": {dimSession, "utm_campaign"}, "utm_term": {dimSession, "utm_term"},
	"utm_content": {dimSession, "utm_content"},
	"exit":        {dimExit, "path"}, "event": {dimEvent, "name"}, "goal": {dimGoal, ""},
	"dow":  {dimClock, "(CAST(strftime('%w', ts/1000 + ?, 'unixepoch') AS INTEGER)+6)%7"},
	"hour": {dimClock, "CAST(strftime('%H', ts/1000 + ?, 'unixepoch') AS INTEGER)"},
}

// outboundKey is the event-dim key that stands for every outbound link click.
const outboundKey = "Outbound link"

// tzOffset is p.TZ's UTC offset in seconds at the window end. dow and hour use this one
// offset for the whole range, so on a window that crosses a DST change the hours on the
// other side are off by one hour (an accepted approximation; buckets in Series are exact).
func (p Params) tzOffset() int {
	if p.TZ == nil {
		return 0
	}
	_, off := time.UnixMilli(p.To).In(p.TZ).Zone()
	return off
}

const (
	defaultLimit = 100
	maxLimit     = 1000
	onlineWindow = 5 * time.Minute
	foldLookback = int64(24 * time.Hour / time.Millisecond) // how far back a folded pageview's dwell can reach
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
	Actor         string // "" or "human": people only; "all": people and AI agents
	lookback      int64  // ms: also read folded pageviews that started up to this long before From and are still in dwell at From
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

// pageDims are the row dims about one page. In sev they select whole sessions that viewed
// the page instead of filtering rows.
var pageDims = map[string]bool{"path": true, "route": true, "host": true}

// base builds the person CTEs for p, with env and filters applied:
//   - idm maps anon ids to user ids;
//   - ev holds the rows that match every filter (page counts, visitors, breakdown keys);
//   - sev holds every row of the sessions that viewed a page matching the path, route and
//     host filters, with all other conditions the same as ev. Session metrics (sessions,
//     duration, bounce, entry, exit, sources, campaigns) read sev, so a page filter keeps
//     whole sessions. With no page filter sev is ev.
func base(p Params) (string, []any, error) {
	evW, evA, err := evWhere(p, false)
	if err != nil {
		return "", nil, err
	}
	src, srcA, args := "events e", []any(nil), []any{p.Site, p.Site}
	if p.lookback > 0 {
		// The window, plus the folded pageviews that started up to lookback before it and are still in
		// dwell at its start. Two reads, not an OR: the second walks events_site_end (ts is its third
		// column, so the rows already in the window are dropped before the table is touched), and
		// costs the pageviews in dwell, not the lookback day. INDEXED BY pins it; left to itself the
		// planner scans events_site_ts over the whole lookback.
		src = `(SELECT * FROM events WHERE site_id=? AND ts BETWEEN ? AND ?
    UNION ALL SELECT * FROM events INDEXED BY events_site_end WHERE site_id=? AND type='pageview' AND dwell_ms>0 AND ` +
			activeEnd + `>=? AND ts>=? AND ts<?) e`
		srcA = []any{p.Site, p.From, p.To, p.Site, p.From, p.From - p.lookback, p.From}
	}
	args = append(append(args, srcA...), evA...)
	var sb strings.Builder
	sb.WriteString(`WITH idm AS (SELECT anon_id, user_id FROM identity_map WHERE site_id=? AND rowid IN
  (SELECT min(rowid) FROM identity_map WHERE site_id=? GROUP BY anon_id)),
ev AS (SELECT e.*, COALESCE(idm.user_id, e.anon_id) AS person, idm.user_id IS NOT NULL AS ident
  FROM ` + src + ` LEFT JOIN idm USING(anon_id)
  WHERE ` + evW + `),
`)
	hasPage := false
	for k := range p.Filters {
		if pageDims[k] {
			hasPage = true
		}
	}
	if !hasPage {
		sb.WriteString("sev AS (SELECT * FROM ev)\n")
		return sb.String(), args, nil
	}
	sevW, sevA, err := evWhere(p, true)
	if err != nil {
		return "", nil, err
	}
	sb.WriteString(`sev AS (SELECT e.*, COALESCE(idm.user_id, e.anon_id) AS person, idm.user_id IS NOT NULL AS ident
  FROM ` + src + ` LEFT JOIN idm USING(anon_id)
  WHERE ` + sevW + `)
`)
	return sb.String(), append(append(args, srcA...), sevA...), nil
}

// evWhere is the WHERE clause (on alias e) for p's window, actor, env and filters. With
// skipPage, path, route and host become "sessions that viewed a matching page".
func evWhere(p Params, skipPage bool) (string, []any, error) {
	var sb strings.Builder
	lo := p.From // earliest ts a session subquery reads
	args := []any{p.Site}
	if p.lookback > 0 {
		// base reads the window and the folded pageviews still in dwell from its own source.
		lo = p.From - p.lookback
		sb.WriteString("e.site_id=? AND " + actorCond(p, "e"))
	} else {
		sb.WriteString("e.site_id=? AND e.ts BETWEEN ? AND ? AND " + actorCond(p, "e"))
		args = append(args, p.From, p.To)
	}
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
		d, ok := dims[k]
		if !ok {
			return "", nil, fmt.Errorf("filter %q: %w", k, ErrBadDim)
		}
		v := p.Filters[k]
		switch d.kind {
		case dimRow:
			if skipPage && pageDims[k] {
				sb.WriteString(" AND e.session_id IN (SELECT session_id FROM events WHERE site_id=? AND type='pageview' AND ts BETWEEN ? AND ? AND " + d.expr + "=?)")
				args = append(args, p.Site, lo, p.To, v)
				continue
			}
			sb.WriteString(" AND e." + d.expr + "=?") // expr comes from the dims allowlist
			args = append(args, v)
		case dimClock:
			n, err := strconv.Atoi(v)
			if err != nil {
				n = -1
			}
			sb.WriteString(" AND " + strings.ReplaceAll(d.expr, "ts/1000", "e.ts/1000") + "=?")
			args = append(args, p.tzOffset(), n)
		case dimSession:
			// Sources are sent only on the landing pageview, so keep whole sessions whose
			// landing pageview matches; a row filter would make every session a bounce.
			sb.WriteString(" AND e.session_id IN (SELECT session_id FROM (SELECT session_id, min(ts), " + d.expr +
				" AS v FROM events WHERE site_id=? AND type='pageview' AND ts BETWEEN ? AND ? GROUP BY session_id) WHERE v=?)")
			args = append(args, p.Site, lo, p.To, v)
		case dimExit:
			sb.WriteString(" AND e.session_id IN (SELECT session_id FROM (SELECT session_id, max(ts), path" +
				" AS v FROM events WHERE site_id=? AND type='pageview' AND ts BETWEEN ? AND ? GROUP BY session_id) WHERE v=?)")
			args = append(args, p.Site, lo, p.To, v)
		case dimEvent:
			// An event filter keeps whole sessions that fired the event.
			if v == outboundKey {
				sb.WriteString(" AND e.session_id IN (SELECT session_id FROM events WHERE site_id=? AND type<>'pageview' AND type='outbound' AND ts BETWEEN ? AND ?)")
				args = append(args, p.Site, lo, p.To)
				continue
			}
			sb.WriteString(" AND e.session_id IN (SELECT session_id FROM events WHERE site_id=? AND type<>'pageview' AND type='event' AND name<>'' AND name=?)")
			args = append(args, p.Site, v)
		case dimGoal:
			// A goal filter keeps whole sessions that hit the goal (any kind of goal).
			sb.WriteString(" AND e.session_id IN (SELECT x.session_id FROM events x JOIN goals g ON g.id=? AND g.site_id=x.site_id" +
				" WHERE x.site_id=? AND x.ts BETWEEN ? AND ? AND " + goalHitCond + ")")
			args = append(args, v, p.Site, lo, p.To)
		}
	}
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
	if r.AgentSessions, err = agentSessions(db, p); err != nil {
		return r, err
	}
	return r, nil
}

// agentSessions counts the AI agent sessions in p's window, whatever p.Actor says: env applies,
// filters do not (the KPI note says how many sessions the people numbers leave out).
func agentSessions(db *sql.DB, p Params) (int, error) {
	q := `SELECT count(DISTINCT session_id) FROM events WHERE site_id=? AND agent<>'' AND ts BETWEEN ? AND ?`
	args := []any{p.Site, p.From, p.To}
	if p.Env != "" && p.Env != "all" {
		q += " AND env=?"
		args = append(args, p.Env)
	}
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("agent sessions: %w", err)
	}
	return n, nil
}

// now is the query clock: p.Now, or the wall clock when unset.
func (p Params) now() time.Time {
	if p.Now.IsZero() {
		return time.Now()
	}
	return p.Now
}

// online counts people seen in the five minutes before p.Now.
func online(db *sql.DB, p Params) (int, error) { return activeNow(db, p) }

// activeNow counts the people seen in the five minutes before p.Now, in p's env and
// filters. Live reads the same rows, so the two numbers agree. Actor is ignored (people only).
func activeNow(db *sql.DB, p Params) (int, error) {
	nowMs := p.now().UnixMilli()
	lp := p
	lp.Actor = ""
	from := nowMs - onlineWindow.Milliseconds()
	// A pageview with engage folded into it is active until ts+dwell_ms, so look back a day for those.
	lp.From, lp.To, lp.lookback = from, nowMs, foldLookback
	cte, args, err := base(lp)
	if err != nil {
		return 0, err
	}
	var n int
	if err := db.QueryRow(cte+`SELECT count(DISTINCT person) FROM ev WHERE `+activeEnd+`>=?`, append(args, from)...).Scan(&n); err != nil {
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
	if err := db.QueryRow(cte+`SELECT count(DISTINCT CASE WHEN type='pageview' THEN person END), coalesce(sum(type='pageview'),0),
  count(DISTINCT CASE WHEN type IN ('event','outbound') THEN person END) FROM ev`, args...).
		Scan(&t.Visitors, &t.Pageviews, &t.EventPeople); err != nil {
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
		if err := db.QueryRow(bcte+`SELECT count(DISTINCT CASE WHEN type='pageview' THEN person END) FROM ev`, bargs...).Scan(&t.BaseVisitors); err != nil {
			return t, fmt.Errorf("base visitors: %w", err)
		}
	}
	if goal != nil {
		where, gargs := goalWhere(*goal)
		if err := db.QueryRow(cte+`SELECT count(*), count(DISTINCT CASE WHEN `+pvPeople+` THEN person END) FROM ev WHERE (`+where+`)`, append(args, gargs...)...).
			Scan(&t.Conversions, &t.ConvVisitors); err != nil {
			return t, fmt.Errorf("conversions: %w", err)
		}
		if t.BaseVisitors > 0 {
			t.ConvRate = float64(t.ConvVisitors) / float64(t.BaseVisitors)
		}
	}
	return t, nil
}

// sessSrc is one row per session in ev (from base) with the session's landing pageview:
// start, source name, channel, AI source, entry path and UTM tags. SQLite takes the bare
// columns of a min() aggregate from the row holding the minimum, i.e. the landing pageview.
var sessSrc = `SELECT session_id, person, min(ts) AS start, ` + sourceNameExpr + ` AS source, ` + channelExpr + ` AS channel,
  ` + aiSourceExpr + ` AS ai, path AS entry, country, city, device, browser, os, referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content
FROM sev WHERE type='pageview' GROUP BY session_id`

var seriesMetrics = map[string]bool{
	"visitors": true, "pageviews": true, "sessions": true, "duration": true,
	"bounce": true, "conversion": true, "revenue": true,
}

// buckets is a series' bucket grid: sorted bucket starts, the last bucket that has begun, and
// the window end. Bucket i covers [starts[i], starts[i+1]).
type buckets struct {
	starts []int64
	last   int
}

func (b buckets) index(ms int64) (int, bool) {
	i := sort.Search(len(b.starts), func(i int) bool { return b.starts[i] > ms }) - 1
	return i, i >= 0
}

// legacyBuckets is the v2 grid for requests without a resolved window: hours for spans
// of 48 h or less (starting at From's hour), otherwise days.
func legacyBuckets(p Params, loc *time.Location) (buckets, string) {
	bucket := "day"
	trunc := func(t time.Time) time.Time { return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc) }
	next := func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
	if p.To-p.From <= int64(48*time.Hour/time.Millisecond) {
		bucket = "hour"
		trunc = func(t time.Time) time.Time { return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, loc) }
		next = func(t time.Time) time.Time { return t.Add(time.Hour) }
	}
	b := buckets{starts: []int64{}}
	for t := trunc(time.UnixMilli(p.From).In(loc)); t.UnixMilli() <= p.To; t = next(t) {
		b.starts = append(b.starts, t.UnixMilli())
	}
	b.last = len(b.starts) - 1
	return b, bucket
}

// Series returns metric for every bucket of p.Win (hours of a one-day window, otherwise days,
// in p.TZ), and Prev for the same bucket offsets of the comparison window. Buckets that have
// not begun are nil. With extras, Extras[i] holds bucket i's top 3 sources, goal conversions
// and revenue. Requests without a resolved window (Win.Key == "") use the v2 grid.
func Series(db *sql.DB, p Params, metric string, extras bool) (SeriesResult, error) {
	if !seriesMetrics[metric] {
		return SeriesResult{}, fmt.Errorf("metric %q: %w", metric, ErrBadMetric)
	}
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	res := SeriesResult{Window: p.Win, Metric: metric, Points: []Point{}, Prev: []Point{}}
	goal, err := convGoal(db, p.Site, p.Conv)
	if err != nil {
		return res, err
	}
	var cur buckets
	if p.Win.Key == "" {
		cur, res.Bucket = legacyBuckets(p, loc)
	} else {
		res.Bucket = p.Win.Bucket
		cur = buckets{starts: BucketStarts(p.Win, loc), last: p.Win.LastBucket}
	}
	if res.Points, err = seriesPoints(db, p, metric, cur, goal); err != nil {
		return res, err
	}
	if pp, ok := p.Prev(); ok {
		pb := buckets{starts: bucketStarts(pp.From, pp.To, res.Bucket, loc)}
		pb.last, _ = pb.index(pp.To)
		if res.Prev, err = seriesPoints(db, pp, metric, pb, goal); err != nil {
			return res, err
		}
	}
	if extras {
		if res.Extras, err = seriesExtras(db, p, cur, goal); err != nil {
			return res, err
		}
	}
	return res, nil
}

// seriesPoints computes metric per bucket of b over p's rows; buckets after b.last are nil.
func seriesPoints(db *sql.DB, p Params, metric string, b buckets, goal *Goal) ([]Point, error) {
	n := len(b.starts)
	vals := make([]float64, n)
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	// perBucket runs q (first column ts) and calls fn with the bucket of each row.
	perBucket := func(q string, qargs []any, dest func() []any, fn func(i int)) error {
		return forRows(db, q, qargs, func(r *sql.Rows) error {
			var ts int64
			if err := r.Scan(append([]any{&ts}, dest()...)...); err != nil {
				return err
			}
			if i, ok := b.index(ts); ok && i < n {
				fn(i)
			}
			return nil
		})
	}
	distinct := func(q string, qargs []any) ([]map[string]bool, error) {
		sets := make([]map[string]bool, n)
		var person string
		err := perBucket(q, qargs, func() []any { return []any{&person} }, func(i int) {
			if sets[i] == nil {
				sets[i] = map[string]bool{}
			}
			sets[i][person] = true
		})
		return sets, err
	}
	switch metric {
	case "pageviews":
		err = perBucket(cte+`SELECT ts FROM ev WHERE type='pageview'`, args, func() []any { return nil }, func(i int) { vals[i]++ })
	case "visitors":
		var sets []map[string]bool
		sets, err = distinct(cte+`SELECT ts, person FROM ev WHERE type='pageview'`, args)
		for i, s := range sets {
			vals[i] = float64(len(s))
		}
	case "sessions", "duration", "bounce":
		sessions, engaged := make([]int, n), make([]int, n)
		durs := make([]float64, n)
		var eng int
		var dur float64
		err = perBucket(cte+`SELECT start, `+engagedExpr+`, dur FROM (`+sessionAgg+`)`, args,
			func() []any { return []any{&eng, &dur} },
			func(i int) { sessions[i]++; engaged[i] += eng; durs[i] += dur })
		for i := range vals {
			switch metric {
			case "sessions":
				vals[i] = float64(sessions[i])
			case "duration":
				if sessions[i] > 0 {
					vals[i] = durs[i] / float64(sessions[i])
				}
			default:
				vals[i] = bounce(sessions[i], engaged[i])
			}
		}
	case "conversion":
		if goal == nil {
			break
		}
		bp, _ := withoutGoalFilter(p)
		bcte, bargs, berr := base(bp)
		if berr != nil {
			return nil, berr
		}
		baseSets, err1 := distinct(bcte+`SELECT ts, person FROM ev WHERE type='pageview'`, bargs)
		if err1 != nil {
			err = err1
			break
		}
		where, gargs := goalWhere(*goal)
		var convSets []map[string]bool
		convSets, err = distinct(cte+`SELECT ts, person FROM ev WHERE `+where, append(args, gargs...))
		for i := range vals {
			if len(baseSets[i]) > 0 {
				n := 0
				for person := range convSets[i] {
					if baseSets[i][person] {
						n++
					}
				}
				vals[i] = float64(n) / float64(len(baseSets[i]))
			}
		}
	case "revenue":
		var amt int64
		err = perBucket(cte+revenueRows, args, func() []any { return []any{&amt} }, func(i int) { vals[i] += float64(amt) })
	}
	if err != nil {
		return nil, fmt.Errorf("series %s: %w", metric, err)
	}
	pts := make([]Point, n)
	for i := range pts {
		pts[i].T = b.starts[i]
		if i <= b.last {
			pts[i].V = &vals[i]
		}
	}
	return pts, nil
}

// revenueRows lists (ts, amount in minor units) of the purchases in ev that are in the
// period's main currency (the most common one); it follows base()'s CTE.
const revenueRows = `, pc AS (SELECT ts, ` + currencyExpr + ` AS cur, ` + amountMinorExpr + ` AS amt FROM ev WHERE ` + purchaseWhere + `)
SELECT ts, amt FROM pc WHERE cur=(SELECT cur FROM pc GROUP BY cur ORDER BY count(*) DESC, cur LIMIT 1)`

// seriesExtras fills each bucket's top 3 sources by visitors, goal conversions and revenue.
func seriesExtras(db *sql.DB, p Params, b buckets, goal *Goal) ([]BucketExtra, error) {
	n := len(b.starts)
	out := make([]BucketExtra, n)
	src := make([]map[string]map[string]bool, n)
	for i := range out {
		out[i] = BucketExtra{T: b.starts[i], TopSources: []TopSource{}}
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	err = forRows(db, cte+`SELECT start, source, person FROM (`+sessSrc+`)`, args, func(r *sql.Rows) error {
		var ts int64
		var s, person string
		if err := r.Scan(&ts, &s, &person); err != nil {
			return err
		}
		if i, ok := b.index(ts); ok {
			if src[i] == nil {
				src[i] = map[string]map[string]bool{}
			}
			if src[i][s] == nil {
				src[i][s] = map[string]bool{}
			}
			src[i][s][person] = true
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("series sources: %w", err)
	}
	for i, m := range src {
		for k, people := range m {
			out[i].TopSources = append(out[i].TopSources, TopSource{Key: k, Visitors: len(people)})
		}
		sort.Slice(out[i].TopSources, func(a, c int) bool {
			x, y := out[i].TopSources[a], out[i].TopSources[c]
			return x.Visitors > y.Visitors || x.Visitors == y.Visitors && x.Key < y.Key
		})
		if len(out[i].TopSources) > 3 {
			out[i].TopSources = out[i].TopSources[:3]
		}
	}
	if goal != nil {
		where, gargs := goalWhere(*goal)
		if err := scanTS(db, cte+`SELECT ts FROM ev WHERE `+where, append(args, gargs...), func(ts int64) {
			if i, ok := b.index(ts); ok {
				out[i].Conversions++
			}
		}); err != nil {
			return nil, fmt.Errorf("series conversions: %w", err)
		}
	}
	err = forRows(db, cte+revenueRows, args, func(r *sql.Rows) error {
		var ts, amt int64
		if err := r.Scan(&ts, &amt); err != nil {
			return err
		}
		if i, ok := b.index(ts); ok {
			out[i].RevenueMinor += amt
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("series revenue: %w", err)
	}
	return out, nil
}

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
