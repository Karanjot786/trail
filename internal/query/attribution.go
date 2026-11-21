package query

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// goalHitCond is true when events row x is a hit of goals row g: an event goal matches the
// event name, a page goal the exact path or, when it ends in *, the path prefix (case-sensitive).
const goalHitCond = `((g.kind='event' AND x.type='event' AND x.name=g.match) OR
  (g.kind='page' AND x.type='pageview' AND (CASE WHEN substr(g.match,-1)='*'
    THEN substr(x.path,1,length(g.match)-1)=substr(g.match,1,length(g.match)-1) ELSE x.path=g.match END)))`

// goalWhere is the condition (over ev rows) for hits of g, with its arguments.
func goalWhere(g Goal) (string, []any) {
	switch {
	case g.Kind == "event":
		return "type='event' AND name=?", []any{g.Match}
	case strings.HasSuffix(g.Match, "*"):
		prefix := strings.TrimSuffix(g.Match, "*")
		return "type='pageview' AND substr(path,1,length(?))=?", []any{prefix, prefix}
	}
	return "type='pageview' AND path=?", []any{g.Match}
}

// convGoal returns goal id of site, or the site's first goal when id is 0 or unknown; nil without goals.
func convGoal(db *sql.DB, site string, id int64) (*Goal, error) {
	var g Goal
	err := db.QueryRow(`SELECT id, name, kind, match FROM goals WHERE site_id=? ORDER BY id=? DESC, id LIMIT 1`, site, id).
		Scan(&g.ID, &g.Name, &g.Kind, &g.Match)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("conversion goal: %w", err)
	}
	return &g, nil
}

// prevParams is the comparison period of p. A resolved window (Win.Key set) uses Win.Prev*;
// a legacy from/to request compares with the equal-length span just before.
func prevParams(p Params) (Params, bool) {
	if p.Win.Key != "" {
		return p.Prev()
	}
	q := p
	q.From, q.To = p.From-(p.To-p.From), p.From-1
	return q, true
}

// withoutGoalFilter drops the goal filter, so conversion rates keep their denominator.
func withoutGoalFilter(p Params) (Params, bool) {
	if _, ok := p.Filters["goal"]; !ok {
		return p, false
	}
	q := p
	q.Filters = make(map[string]string, len(p.Filters))
	for k, v := range p.Filters {
		if k != "goal" {
			q.Filters[k] = v
		}
	}
	return q, true
}

// FirstTouch builds the first-touch attribution CTE fragment
//
//	ft(person, source, channel, campaign, entry, country, device)
//
// from the landing pageview of each listed person's first session ever (all time, same env,
// bots excluded). persons is a SQL subquery returning a column named person, and args are its
// arguments. Append ", "+cte after base()'s CTE (it reads base's idm) and outArgs after base's args.
// Only the persons in the subquery are scanned, through events_site_anon_ts.
func FirstTouch(db *sql.DB, p Params, persons string, args []any) (cte string, outArgs []any) {
	_ = db // the fragment is pure SQL; db is kept for the contract signature
	return firstTouchCTE(p, "ft", `source, channel, campaign, entry, country, device`,
		sourceNameExpr+` AS source, `+channelExpr+` AS channel, f.utm_campaign AS campaign, f.path AS entry,
    f.country AS country, f.device AS device`, persons, args)
}

// firstTouchCTE builds name(person, cols…) from each listed person's first pageview ever;
// sel computes cols over events row f (unqualified columns resolve to f).
func firstTouchCTE(p Params, name, cols, sel, persons string, args []any) (string, []any) {
	env := ""
	out := []any{p.Site}
	if p.Env != "" && p.Env != "all" {
		env = " AND f.env=?"
		out = append(out, p.Env)
	}
	out = append(out, args...)
	out = append(out, args...)
	return name + ` AS (SELECT person, ` + cols + ` FROM (
  SELECT COALESCE(m.user_id, f.anon_id) AS person, ` + sel + `,
    row_number() OVER (PARTITION BY COALESCE(m.user_id, f.anon_id) ORDER BY f.ts, f.id) AS rn
  FROM events f LEFT JOIN idm m ON m.anon_id=f.anon_id
  WHERE f.site_id=? AND f.is_bot=0 AND f.type='pageview'` + env + `
    AND f.anon_id IN (SELECT anon_id FROM idm WHERE user_id IN (` + persons + `)
      UNION ALL SELECT person FROM (` + persons + `))
) WHERE rn=1)
`, out
}

// SiteFeatures reports which optional screens a site has data for: revenue when it ever sent a
// Purchase, crawlers when any crawler request was ingested, and its most common purchase currency.
func SiteFeatures(db *sql.DB, site string) (Features, error) {
	f := Features{Currency: "USD"}
	err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM events WHERE site_id=? AND `+purchaseWhere+`),
  EXISTS(SELECT 1 FROM crawl_hits WHERE site_id=?)`, site, site).Scan(&f.Revenue, &f.Crawlers)
	if err != nil {
		return f, fmt.Errorf("site features: %w", err)
	}
	if !f.Revenue {
		return f, nil
	}
	if err := db.QueryRow(`SELECT `+currencyExpr+` FROM events WHERE site_id=? AND `+purchaseWhere+`
  GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`, site).Scan(&f.Currency); err != nil {
		return f, fmt.Errorf("site currency: %w", err)
	}
	return f, nil
}
