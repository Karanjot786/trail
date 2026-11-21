package query

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

const liveStreamCap = 50

// Live returns the five minutes of activity ending at p.Now: people active, pageviews and
// custom events (the stream, newest first, capped at 50 with the full count), and the
// countries, landing sources and current pages of the active people.
func Live(db *sql.DB, p Params) (LiveResult, error) {
	now := p.now().UnixMilli()
	res := LiveResult{AsOf: now, Countries: []KeyCount{}, Sources: []KeyCount{}, Pages: []KeyCount{}, Stream: []LiveEvent{}}
	lp := p
	lp.From, lp.To = now-onlineWindow.Milliseconds(), now
	cte, args, err := base(lp)
	if err != nil {
		return res, err
	}
	// The landing source of each active session, read from the session's whole history.
	srcCTE := cte + `, act AS (SELECT DISTINCT session_id FROM ev),
  src AS (SELECT session_id, min(ts), ` + sourceNameExpr + ` AS source FROM events
    WHERE site_id=? AND type='pageview' AND session_id IN (SELECT session_id FROM act) GROUP BY session_id)
`
	sargs := append(append([]any{}, args...), p.Site)
	if err := db.QueryRow(cte+`SELECT count(DISTINCT person), count(*), coalesce(sum(type IN ('pageview','event')),0) FROM ev`, args...).
		Scan(&res.Active, &res.Events5m, &res.StreamTotal); err != nil {
		return res, fmt.Errorf("live totals: %w", err)
	}
	err = forRows(db, srcCTE+`SELECT ev.ts, ev.person, ev.ident, ev.session_id, ev.type, ev.path, ev.name, ev.country, ev.city,
  coalesce(src.source,'Direct')
FROM ev LEFT JOIN src USING(session_id) WHERE ev.type IN ('pageview','event') ORDER BY ev.ts DESC, ev.id DESC LIMIT ?`,
		append(sargs, liveStreamCap), func(r *sql.Rows) error {
			var e LiveEvent
			var ident bool
			if err := r.Scan(&e.TS, &e.Person, &ident, &e.SessionID, &e.Type, &e.Path, &e.Name, &e.Country, &e.City, &e.Source); err != nil {
				return err
			}
			e.Label = personLabel(e.Person, ident)
			res.Stream = append(res.Stream, e)
			return nil
		})
	if err != nil {
		return res, fmt.Errorf("live stream: %w", err)
	}
	// Each active person's latest event gives their country, source and current page.
	countries, sources, pages := map[string]int{}, map[string]int{}, map[string]int{}
	err = forRows(db, srcCTE+`, last AS (SELECT person, max(ts), session_id, country FROM ev GROUP BY person),
  lastpv AS (SELECT person, max(ts), path FROM ev WHERE type='pageview' GROUP BY person)
SELECT last.country, coalesce(src.source,'Direct'), coalesce(lastpv.path,'')
FROM last LEFT JOIN src USING(session_id) LEFT JOIN lastpv USING(person)`, sargs, func(r *sql.Rows) error {
		var c, s, pg string
		if err := r.Scan(&c, &s, &pg); err != nil {
			return err
		}
		if c != "" {
			countries[c]++
		}
		sources[s]++
		if pg != "" {
			pages[pg]++
		}
		return nil
	})
	if err != nil {
		return res, fmt.Errorf("live tallies: %w", err)
	}
	res.Countries, res.Sources, res.Pages = tally(countries), tally(sources), tally(pages)
	return res, nil
}

// tally sorts counts by count, then key.
func tally(m map[string]int) []KeyCount {
	out := make([]KeyCount, 0, len(m))
	for k, n := range m {
		out = append(out, KeyCount{Key: k, Count: n})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return strings.Compare(out[i].Key, out[j].Key) < 0
	})
	return out
}
