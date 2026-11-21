package query

import (
	"database/sql"
	"fmt"
	"sort"
)

type utmKey struct{ source, medium, campaign, term, content string }

// Campaigns lists the UTM campaigns of landing pageviews in range, grouped by all five UTM
// tags, with visitors, sessions and bounce (traffic) and the conversion rate and revenue of
// the people whose first touch was that campaign.
func Campaigns(db *sql.DB, p Params) ([]Campaign, error) {
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	const utmCols = `utm_source, utm_medium, utm_campaign, utm_term, utm_content`
	const utmAny = `(utm_source!='' OR utm_medium!='' OR utm_campaign!='')`
	out := []Campaign{}
	idx := map[utmKey]int{}
	err = forRows(db, cte+sessRows()+`SELECT `+utmCols+`, count(DISTINCT person), count(*), sum(eng)
FROM ss WHERE `+utmAny+` GROUP BY 1, 2, 3, 4, 5 ORDER BY 6 DESC, 7 DESC, 3, 1, 2, 4, 5 LIMIT ?`,
		append(append([]any{}, args...), clampLimit(p.Limit)), func(r *sql.Rows) error {
			var c Campaign
			var engaged int
			if err := r.Scan(&c.Source, &c.Medium, &c.Campaign, &c.Term, &c.Content, &c.Visitors, &c.Sessions, &engaged); err != nil {
				return err
			}
			c.Bounce = bounce(c.Sessions, engaged)
			idx[utmKey{c.Source, c.Medium, c.Campaign, c.Term, c.Content}] = len(out)
			out = append(out, c)
			return nil
		})
	if err != nil {
		return nil, fmt.Errorf("campaigns: %w", err)
	}
	if len(out) == 0 {
		return out, nil
	}
	goal, err := convGoal(db, p.Site, p.Conv)
	if err != nil {
		return nil, err
	}
	cur, err := mainCurrency(db, cte, args)
	if err != nil {
		return nil, err
	}
	convExpr, gargs := "0", []any(nil)
	if goal != nil {
		var where string
		where, gargs = goalWhere(*goal)
		convExpr = "max(CASE WHEN " + where + " THEN 1 ELSE 0 END)"
		for i := range out {
			z := 0.0
			out[i].ConvRate = &z
		}
	}
	ftc, ftArgs := firstTouchCTE(p, "fc", utmCols, "f.utm_source AS utm_source, f.utm_medium AS utm_medium, "+
		"f.utm_campaign AS utm_campaign, f.utm_term AS utm_term, f.utm_content AS utm_content", "SELECT DISTINCT person FROM ev", nil)
	q := cte + ", " + ftc + `, pp AS (SELECT person, ` + convExpr + ` AS conv,
  coalesce(sum(CASE WHEN ` + purchaseWhere + ` AND ` + currencyExpr + `=? THEN ` + amountMinorExpr + ` END),0) AS rev
  FROM ev GROUP BY person)
SELECT ` + utmCols + `, count(*), sum(pp.conv), sum(pp.rev) FROM fc JOIN pp USING(person) GROUP BY 1, 2, 3, 4, 5`
	qargs := append(append(append(append([]any{}, args...), ftArgs...), gargs...), cur)
	err = forRows(db, q, qargs, func(r *sql.Rows) error {
		var k utmKey
		var people, conv int
		var rev int64
		if err := r.Scan(&k.source, &k.medium, &k.campaign, &k.term, &k.content, &people, &conv, &rev); err != nil {
			return err
		}
		i, ok := idx[k]
		if !ok {
			return nil
		}
		out[i].RevenueMinor = rev
		if goal != nil && people > 0 {
			rate := float64(conv) / float64(people)
			out[i].ConvRate = &rate
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("campaign credit: %w", err)
	}
	return out, nil
}

// AIReferrals lists the AI assistants that sent visitors in range, with their most common
// landing page and the first-touch conversion rate and revenue (as the ai_source breakdown).
func AIReferrals(db *sql.DB, p Params) ([]AIReferral, error) {
	out, _, err := aiFirstTouch(db, p, true)
	return out, err
}

// aiFirstTouch is the one definition of AI referrals: the AIReferrals rows, plus each AI source's
// converting people (the numerator of its ConvRate; empty when the site has no goal). The AI
// visibility funnel's visited and converted steps read the same numbers. entries fills TopEntry.
func aiFirstTouch(db *sql.DB, p Params, entries bool) ([]AIReferral, map[string]int, error) {
	conv := map[string]int{}
	rows, err := breakdown(db, p, "ai_source", "", clampLimit(p.Limit), conv)
	if err != nil {
		return nil, nil, err
	}
	out := make([]AIReferral, 0, len(rows))
	idx := map[string]int{}
	for _, r := range rows {
		a := AIReferral{Key: r.Key, Visitors: r.Visitors, ConvRate: r.ConvRate}
		if r.Sessions != nil {
			a.Sessions = *r.Sessions
		}
		if r.RevenueMinor != nil {
			a.RevenueMinor = *r.RevenueMinor
		}
		idx[r.Key] = len(out)
		out = append(out, a)
	}
	if len(out) == 0 || !entries {
		return out, conv, nil
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, nil, err
	}
	best := map[string]int{}
	err = forRows(db, cte+sessRows()+`SELECT ai, entry, count(*) FROM ss WHERE ai!='' GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2`, args,
		func(r *sql.Rows) error {
			var ai, entry string
			var n int
			if err := r.Scan(&ai, &entry, &n); err != nil {
				return err
			}
			if i, ok := idx[ai]; ok && n > best[ai] {
				best[ai], out[i].TopEntry = n, entry
			}
			return nil
		})
	if err != nil {
		return nil, nil, fmt.Errorf("ai entries: %w", err)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Visitors > out[j].Visitors })
	return out, conv, nil
}
