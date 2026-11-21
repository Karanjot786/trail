package query

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// outboundName is the catalogue row that groups every outbound link click.
const outboundName = "Outbound link"

const (
	maxCatalogue     = 1000 // event names in the catalogue
	maxPropKeys      = 20   // property keys per event
	maxPropTop       = 3    // top values per key in the catalogue
	maxPropValues    = 50   // values per key in the event detail
	maxEventLatest   = 15   // latest occurrences in the event detail
	outboundTargetSQ = `coalesce(nullif(name,''), CASE WHEN json_valid(props) THEN json_extract(props,'$.url') END, '')`
	// propValueSQ renders a json_each value as text, keeping booleans readable.
	propValueSQ = `CASE j.type WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'null' THEN 'null' ELSE CAST(j.value AS TEXT) END`
	// propsEachSQ iterates an event's props, treating malformed or empty props as {}.
	propsEachSQ = `json_each(CASE WHEN json_valid(ev.props) AND json_type(ev.props)='object' THEN ev.props ELSE '{}' END) j`
)

// ---- Buckets shared by the conversion reports ----

// bucketKind is the window's bucket, or hour for windows of a day or less when no window is resolved.
func bucketKind(p Params) string {
	if p.Win.Bucket != "" {
		return p.Win.Bucket
	}
	if p.To-p.From < int64(24*time.Hour/time.Millisecond) {
		return "hour"
	}
	return "day"
}

// bucketStarts lists the bucket starts covering [from, to] in loc, stepping by calendar hour or day (DST safe).
func bucketStarts(from, to int64, kind string, loc *time.Location) []int64 {
	if loc == nil {
		loc = time.UTC
	}
	if to < from {
		return []int64{}
	}
	t := time.UnixMilli(from).In(loc)
	if kind == "hour" {
		t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, loc)
	} else {
		t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	}
	out := []int64{}
	for ; t.UnixMilli() <= to; t = nextBucket(t, kind, loc) {
		out = append(out, t.UnixMilli())
	}
	return out
}

func nextBucket(t time.Time, kind string, loc *time.Location) time.Time {
	if kind == "hour" {
		return t.Add(time.Hour)
	}
	return time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, loc)
}

// bucketAt is the index of the bucket holding ts, or -1.
func bucketAt(starts []int64, ts int64) int {
	return sort.Search(len(starts), func(i int) bool { return starts[i] > ts }) - 1
}

// nowMs is the report clock: p.Now, or the wall clock when unset.
func nowMs(p Params) int64 {
	if p.Now.IsZero() {
		return time.Now().UnixMilli()
	}
	return p.Now.UnixMilli()
}

// bucketValues runs q, whose rows are (ts, key, v), and returns one point per bucket of p's window.
// It sums v, or counts distinct keys when distinct is set. Buckets that start after now are nil.
func bucketValues(db *sql.DB, p Params, q string, args []any, distinct bool) ([]Point, error) {
	starts := bucketStarts(p.From, p.To, bucketKind(p), p.TZ)
	vals := make([]float64, len(starts))
	seen := make([]map[string]bool, len(starts))
	err := forRows(db, q, args, func(r *sql.Rows) error {
		var ts int64
		var key string
		var v float64
		if err := r.Scan(&ts, &key, &v); err != nil {
			return err
		}
		i := bucketAt(starts, ts)
		if i < 0 {
			return nil
		}
		if !distinct {
			vals[i] += v
			return nil
		}
		if seen[i] == nil {
			seen[i] = map[string]bool{}
		}
		if !seen[i][key] {
			seen[i][key] = true
			vals[i]++
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	now := nowMs(p)
	out := make([]Point, len(starts))
	for i, t := range starts {
		out[i] = Point{T: t}
		if t <= now {
			out[i].V = &vals[i]
		}
	}
	return out, nil
}

// seriesWithPrev runs one series for p and, when p has a comparison window, for that window too.
func seriesWithPrev(p Params, run func(Params) ([]Point, error)) (cur, prev []Point, err error) {
	if cur, err = run(p); err != nil {
		return nil, nil, err
	}
	prev = []Point{}
	if pp, ok := p.Prev(); ok {
		if prev, err = run(pp); err != nil {
			return nil, nil, err
		}
	}
	return cur, prev, nil
}

// personLabel is how a person is shown: the identified id, else "Visitor" and the last 4 characters of the anon id.
func personLabel(person string, identified bool) string {
	if identified {
		return person
	}
	var tail []rune
	for _, r := range strings.ToUpper(person) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			tail = append(tail, r)
		}
	}
	if len(tail) > 4 {
		tail = tail[len(tail)-4:]
	}
	if len(tail) == 0 {
		return "Visitor"
	}
	return "Visitor " + string(tail)
}

// decodeProps parses a props column into a map; anything malformed becomes {}.
func decodeProps(s string) map[string]any {
	out := map[string]any{}
	if s != "" {
		if err := json.Unmarshal([]byte(s), &out); err != nil || out == nil {
			return map[string]any{}
		}
	}
	return out
}

// outboundHost is the host of an outbound link target, or the target itself when it does not parse.
func outboundHost(target string) string {
	if u, err := url.Parse(target); err == nil && u.Hostname() != "" {
		return u.Hostname()
	}
	return target
}

// ---- Event catalogue ----

type propAgg struct {
	total  int
	values map[string]int
}

// EventCatalogue lists the custom events in range plus one "Outbound link" row, by count.
// Each row carries up to 20 property keys with their distinct count and 3 most common values.
func EventCatalogue(db *sql.DB, p Params) ([]EventRow, error) {
	if err := needSite(p); err != nil {
		return nil, err
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	rows := []EventRow{}
	byName := map[string]int{}
	err = forRows(db, cte+`SELECT name, count(*), count(DISTINCT person), max(ts) FROM ev
WHERE type='event' GROUP BY name ORDER BY 2 DESC, 1 LIMIT ?`, append(args, maxCatalogue), func(r *sql.Rows) error {
		e := EventRow{Kind: "custom", Props: []EventProp{}}
		if err := r.Scan(&e.Name, &e.Count, &e.People, &e.LastSeen); err != nil {
			return err
		}
		byName[e.Name] = len(rows)
		rows = append(rows, e)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("event catalogue: %w", err)
	}

	aggs := map[string]map[string]*propAgg{}
	err = forRows(db, cte+`SELECT ev.name, j.key, `+propValueSQ+`, count(*) FROM ev, `+propsEachSQ+`
WHERE ev.type='event' GROUP BY 1, 2, 3`, args, func(r *sql.Rows) error {
		var name, key, val string
		var n int
		if err := r.Scan(&name, &key, &val, &n); err != nil {
			return err
		}
		if _, ok := byName[name]; !ok {
			return nil
		}
		addProp(aggs, name, key, val, n)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("event props: %w", err)
	}

	out := EventRow{Name: outboundName, Kind: "outbound", Props: []EventProp{}}
	var last sql.NullInt64
	if err := db.QueryRow(cte+`SELECT count(*), count(DISTINCT person), max(ts) FROM ev WHERE type='outbound'`, args...).
		Scan(&out.Count, &out.People, &last); err != nil {
		return nil, fmt.Errorf("outbound: %w", err)
	}
	if out.Count > 0 {
		out.LastSeen = last.Int64
		err = forRows(db, cte+`SELECT `+outboundTargetSQ+`, count(*) FROM ev WHERE type='outbound' GROUP BY 1`, args, func(r *sql.Rows) error {
			var target string
			var n int
			if err := r.Scan(&target, &n); err != nil {
				return err
			}
			addProp(aggs, outboundName, "host", outboundHost(target), n)
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("outbound hosts: %w", err)
		}
		byName[outboundName] = len(rows)
		rows = append(rows, out)
	}

	for i := range rows {
		rows[i].Props = catalogueProps(aggs[rows[i].Name])
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Count != rows[j].Count {
			return rows[i].Count > rows[j].Count
		}
		return rows[i].Name < rows[j].Name
	})
	return rows, nil
}

func addProp(aggs map[string]map[string]*propAgg, name, key, val string, n int) {
	keys := aggs[name]
	if keys == nil {
		keys = map[string]*propAgg{}
		aggs[name] = keys
	}
	a := keys[key]
	if a == nil {
		a = &propAgg{values: map[string]int{}}
		keys[key] = a
	}
	a.total += n
	a.values[val] += n
}

// catalogueProps ranks keys by occurrences and keeps the top 20, each with its 3 most common values.
func catalogueProps(keys map[string]*propAgg) []EventProp {
	out := []EventProp{}
	names := make([]string, 0, len(keys))
	for k := range keys {
		names = append(names, k)
	}
	sort.Slice(names, func(i, j int) bool {
		a, b := keys[names[i]], keys[names[j]]
		if a.total != b.total {
			return a.total > b.total
		}
		return names[i] < names[j]
	})
	if len(names) > maxPropKeys {
		names = names[:maxPropKeys]
	}
	for _, k := range names {
		a := keys[k]
		vals := make([]string, 0, len(a.values))
		for v := range a.values {
			vals = append(vals, v)
		}
		sort.Slice(vals, func(i, j int) bool {
			if a.values[vals[i]] != a.values[vals[j]] {
				return a.values[vals[i]] > a.values[vals[j]]
			}
			return vals[i] < vals[j]
		})
		if len(vals) > maxPropTop {
			vals = vals[:maxPropTop]
		}
		out = append(out, EventProp{Key: k, Distinct: len(a.values), Top: vals})
	}
	return out
}

// ---- Event detail ----

// eventWhere selects one catalogue row's events: a custom event by name, or every outbound click.
func eventWhere(name string) (string, []any) {
	if name == outboundName {
		return "type='outbound'", nil
	}
	return "type='event' AND name=?", []any{name}
}

// EventDetail returns one event's counts (and the comparison period's), its series, a breakdown of
// every property (up to 50 values per key) and its 15 latest occurrences. An unknown name gives zeros.
func EventDetail(db *sql.DB, p Params, name string) (EventDetailResult, error) {
	res := EventDetailResult{Name: name, Series: []Point{}, PrevSeries: []Point{}, Props: []EventPropRows{}, Latest: []EventLatest{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	where, wargs := eventWhere(name)
	counts := func(q Params) (EventCounts, error) {
		var c EventCounts
		cte, args, err := base(q)
		if err != nil {
			return c, err
		}
		err = db.QueryRow(cte+`SELECT count(*), count(DISTINCT person) FROM ev WHERE `+where, append(args, wargs...)...).
			Scan(&c.Count, &c.People)
		return c, err
	}
	cur, err := counts(p)
	if err != nil {
		return res, fmt.Errorf("event detail: %w", err)
	}
	res.Count, res.People = cur.Count, cur.People
	if pp, ok := p.Prev(); ok {
		prev, err := counts(pp)
		if err != nil {
			return res, fmt.Errorf("event detail prev: %w", err)
		}
		res.Prev = &prev
	}
	res.Series, res.PrevSeries, err = seriesWithPrev(p, func(q Params) ([]Point, error) {
		cte, args, err := base(q)
		if err != nil {
			return nil, err
		}
		return bucketValues(db, q, cte+`SELECT ts, '', 1 FROM ev WHERE `+where, append(args, wargs...), false)
	})
	if err != nil {
		return res, fmt.Errorf("event series: %w", err)
	}

	cte, args, err := base(p)
	if err != nil {
		return res, err
	}
	if res.Props, err = eventPropRows(db, cte, args, name, where, wargs); err != nil {
		return res, fmt.Errorf("event props: %w", err)
	}
	err = forRows(db, cte+`SELECT ts, person, ident, session_id, props, `+outboundTargetSQ+` FROM ev WHERE `+where+
		` ORDER BY ts DESC, id DESC LIMIT ?`, append(append(args, wargs...), maxEventLatest), func(r *sql.Rows) error {
		var l EventLatest
		var ident bool
		var props, target string
		if err := r.Scan(&l.TS, &l.Person, &ident, &l.SessionID, &props, &target); err != nil {
			return err
		}
		l.Label = personLabel(l.Person, ident)
		l.Props = decodeProps(props)
		if name == outboundName {
			l.Props["host"] = outboundHost(target)
		}
		res.Latest = append(res.Latest, l)
		return nil
	})
	if err != nil {
		return res, fmt.Errorf("event latest: %w", err)
	}
	return res, nil
}

// eventPropRows breaks the event down by every property value: count and distinct people.
func eventPropRows(db *sql.DB, cte string, args []any, name, where string, wargs []any) ([]EventPropRows, error) {
	type val struct {
		v             string
		count, people int
	}
	byKey := map[string][]val{}
	totals := map[string]int{}
	add := func(key string, v val) {
		byKey[key] = append(byKey[key], v)
		totals[key] += v.count
	}
	if name == outboundName {
		hosts := map[string]*val{}
		people := map[string]map[string]bool{}
		err := forRows(db, cte+`SELECT `+outboundTargetSQ+`, person FROM ev WHERE `+where, append(args, wargs...), func(r *sql.Rows) error {
			var target, person string
			if err := r.Scan(&target, &person); err != nil {
				return err
			}
			h := outboundHost(target)
			if hosts[h] == nil {
				hosts[h], people[h] = &val{v: h}, map[string]bool{}
			}
			hosts[h].count++
			people[h][person] = true
			return nil
		})
		if err != nil {
			return nil, err
		}
		for h, v := range hosts {
			v.people = len(people[h])
			add("host", *v)
		}
	} else {
		err := forRows(db, cte+`SELECT j.key, `+propValueSQ+`, count(*), count(DISTINCT ev.person) FROM ev, `+propsEachSQ+
			` WHERE `+strings.ReplaceAll(where, "type=", "ev.type=")+` GROUP BY 1, 2`, append(args, wargs...), func(r *sql.Rows) error {
			var key string
			var v val
			if err := r.Scan(&key, &v.v, &v.count, &v.people); err != nil {
				return err
			}
			add(key, v)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	keys := make([]string, 0, len(byKey))
	for k := range byKey {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if totals[keys[i]] != totals[keys[j]] {
			return totals[keys[i]] > totals[keys[j]]
		}
		return keys[i] < keys[j]
	})
	if len(keys) > maxPropKeys {
		keys = keys[:maxPropKeys]
	}
	out := make([]EventPropRows, 0, len(keys))
	for _, k := range keys {
		vs := byKey[k]
		sort.Slice(vs, func(i, j int) bool {
			if vs[i].count != vs[j].count {
				return vs[i].count > vs[j].count
			}
			return vs[i].v < vs[j].v
		})
		if len(vs) > maxPropValues {
			vs = vs[:maxPropValues]
		}
		rows := make([]EventPropValue, len(vs))
		for i, v := range vs {
			rows[i] = EventPropValue{Value: v.v, Count: v.count, People: v.people}
		}
		out = append(out, EventPropRows{Key: k, Rows: rows})
	}
	return out, nil
}

// needSite rejects site=all (and a missing site) for per-site reports.
func needSite(p Params) error {
	if p.Site == "" || p.Site == "all" {
		return ErrNeedSite
	}
	return nil
}
