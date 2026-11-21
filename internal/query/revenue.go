package query

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
)

const maxPurchases = 100 // latest purchases listed on the Revenue screen

// revenueDims are the first-touch dimensions revenue can be credited to.
var revenueDims = map[string]bool{"source": true, "channel": true, "campaign": true, "entry": true, "country": true, "device": true}

// touch is one session's landing pageview: when the visit started and where it came from.
type touch struct {
	session, source, channel, campaign, entry, country, device string
	start                                                      int64
}

// key is the touch's value for a first-touch dim; empty values read "(none)".
func (t touch) key(dim string) string {
	var v string
	switch dim {
	case "source":
		v = t.source
	case "channel":
		v = t.channel
	case "campaign":
		v = t.campaign
	case "entry":
		v = t.entry
	case "country":
		v = t.country
	case "device":
		v = t.device
	}
	if v == "" {
		return "(none)"
	}
	return v
}

// sessionTouches returns every session ever (same env, no bots) of the listed persons, oldest first.
// Source and channel are named only on each person's first session (the first touch; the rule CASE is
// costly), later sessions carry them empty. Only the persons' own anon ids are scanned (events_site_anon_ts).
func sessionTouches(db *sql.DB, p Params, persons []string) (map[string][]touch, error) {
	out := map[string][]touch{}
	if len(persons) == 0 {
		return out, nil
	}
	who, err := json.Marshal(persons)
	if err != nil {
		return nil, err
	}
	q := `WITH idm AS (SELECT anon_id, user_id FROM identity_map WHERE site_id=? AND rowid IN
  (SELECT min(rowid) FROM identity_map WHERE site_id=? GROUP BY anon_id)),
who(person) AS (SELECT value FROM json_each(?)),
anons(anon_id) AS (SELECT person FROM who UNION SELECT anon_id FROM idm WHERE user_id IN (SELECT person FROM who)),
sess AS (SELECT COALESCE(idm.user_id, e.anon_id) AS person, e.session_id, min(e.ts) AS ts, e.referrer_host,
    e.utm_source, e.utm_medium, e.utm_campaign, e.path, e.country, e.device
  FROM events e LEFT JOIN idm USING(anon_id)
  WHERE e.site_id=? AND ` + actorCond(p, "e") + ` AND e.type='pageview' AND e.anon_id IN (SELECT anon_id FROM anons)`
	args := []any{p.Site, p.Site, string(who), p.Site}
	if p.Env != "" && p.Env != "all" {
		q += " AND e.env=?"
		args = append(args, p.Env)
	}
	// min(ts) with bare columns: SQLite takes the other columns from the session's first pageview.
	q += ` GROUP BY e.session_id)
SELECT person, session_id, ts, CASE WHEN pn=1 THEN ` + sourceNameExpr + ` ELSE '' END,
  CASE WHEN pn=1 THEN ` + channelExpr + ` ELSE '' END, utm_campaign, path, country, device FROM (
  SELECT *, row_number() OVER (PARTITION BY person ORDER BY ts, session_id) AS pn FROM sess
  WHERE person IN (SELECT person FROM who))
ORDER BY person, ts, session_id`
	err = forRows(db, q, args, func(r *sql.Rows) error {
		var person string
		var t touch
		if err := r.Scan(&person, &t.session, &t.start, &t.source, &t.channel, &t.campaign, &t.entry, &t.country, &t.device); err != nil {
			return err
		}
		out[person] = append(out[person], t)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("session touches: %w", err)
	}
	return out, nil
}

// firstTouch is a person's first session ever, given their sessions oldest first; none reads Direct.
func firstTouch(sessions []touch) touch {
	if len(sessions) > 0 {
		return sessions[0]
	}
	return touch{source: "Direct", channel: "Direct"}
}

// sale is one Purchase event in range.
type sale struct {
	ts, amount            int64
	person, session, plan string
	currency              string
	identified            bool
}

// loadPurchases returns the purchases in p's window (every currency), newest first.
func loadPurchases(db *sql.DB, p Params) ([]sale, error) {
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	out := []sale{}
	err = forRows(db, cte+`SELECT ts, person, ident, session_id, `+amountMinorExpr+`, `+currencyExpr+`,
  coalesce(CAST(json_extract(props,'$.plan') AS TEXT),'')
FROM ev WHERE `+purchaseWhere+` AND json_valid(props) ORDER BY ts DESC, id DESC`, args, func(r *sql.Rows) error {
		var b sale
		if err := r.Scan(&b.ts, &b.person, &b.identified, &b.session, &b.amount, &b.currency, &b.plan); err != nil {
			return err
		}
		out = append(out, b)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("purchases: %w", err)
	}
	return out, nil
}

// siteCurrency is the most common purchase currency in the window, else ever, else USD.
func siteCurrency(db *sql.DB, p Params, inRange []sale) (string, error) {
	n := map[string]int{}
	for _, b := range inRange {
		n[b.currency]++
	}
	best := ""
	for c, k := range n {
		if best == "" || k > n[best] || (k == n[best] && c < best) {
			best = c
		}
	}
	if best != "" {
		return best, nil
	}
	q := `SELECT ` + currencyExpr + ` FROM events WHERE site_id=? AND ` + peopleOnly("events") + ` AND ` + purchaseWhere +
		` AND json_valid(props) GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`
	err := db.QueryRow(q, p.Site).Scan(&best)
	switch {
	case err == sql.ErrNoRows:
		return "USD", nil
	case err != nil:
		return "", fmt.Errorf("currency: %w", err)
	}
	return best, nil
}

// money sums purchases in currency; other counts the purchases in any other currency.
func money(list []sale, currency string) (m Money, other int) {
	buyers := map[string]bool{}
	for _, b := range list {
		if b.currency != currency {
			other++
			continue
		}
		m.NetMinor += b.amount
		m.Purchases++
		buyers[b.person] = true
	}
	m.Buyers = len(buyers)
	if m.Purchases > 0 {
		m.AovMinor = m.NetMinor / int64(m.Purchases)
	}
	return m, other
}

// Revenue returns the window's revenue as reported by the site's Purchase events, in the site currency:
// totals for the window and the comparison window, the series and the 100 latest purchases.
func Revenue(db *sql.DB, p Params) (RevenueResult, error) {
	res := RevenueResult{Currency: "USD", Series: []Point{}, PrevSeries: []Point{}, Purchases: []Purchase{}}
	if p.Site == "" {
		return res, nil // no site, nothing to report
	}
	if err := needSite(p); err != nil {
		return res, err
	}
	list, err := loadPurchases(db, p)
	if err != nil {
		return res, err
	}
	if res.Currency, err = siteCurrency(db, p, list); err != nil {
		return res, err
	}
	res.Cur, res.OtherCurrencyPurchases = money(list, res.Currency)
	if pp, ok := p.Prev(); ok {
		prevList, err := loadPurchases(db, pp)
		if err != nil {
			return res, err
		}
		m, _ := money(prevList, res.Currency)
		res.Prev = &m
	}
	res.Series, res.PrevSeries, err = seriesWithPrev(p, func(q Params) ([]Point, error) {
		cte, args, err := base(q)
		if err != nil {
			return nil, err
		}
		return bucketValues(db, q, cte+`SELECT ts, '', `+amountMinorExpr+` FROM ev WHERE `+purchaseWhere+
			` AND json_valid(props) AND `+currencyExpr+`=?`, append(args, res.Currency), false)
	})
	if err != nil {
		return res, fmt.Errorf("revenue series: %w", err)
	}

	latest := make([]sale, 0, maxPurchases)
	persons := []string{}
	seen := map[string]bool{}
	for _, b := range list {
		if b.currency != res.Currency {
			continue
		}
		latest = append(latest, b)
		if !seen[b.person] {
			seen[b.person] = true
			persons = append(persons, b.person)
		}
		if len(latest) == maxPurchases {
			break
		}
	}
	touches, err := sessionTouches(db, p, persons)
	if err != nil {
		return res, err
	}
	for _, b := range latest {
		res.Purchases = append(res.Purchases, Purchase{
			TS: b.ts, Person: b.person, Label: personLabel(b.person, b.identified), SessionID: b.session,
			AmountMinor: b.amount, Plan: b.plan, VisitsBefore: visitsBefore(touches[b.person], b.session, b.ts),
		})
	}
	return res, nil
}

// visitsBefore counts the person's sessions that started before the session at (session, ts).
func visitsBefore(sessions []touch, session string, ts int64) int {
	start := ts
	for _, s := range sessions {
		if s.session == session {
			start = s.start
		}
	}
	n := 0
	for _, s := range sessions {
		if s.session != session && s.start < start {
			n++
		}
	}
	return n
}

// RevenueBreakdown credits the window's revenue (site currency) to each buyer's first touch by dim:
// source, channel, campaign, entry, country or device.
func RevenueBreakdown(db *sql.DB, p Params, dim string) ([]RevenueRow, error) {
	if !revenueDims[dim] {
		return nil, fmt.Errorf("revenue dim %q: %w", dim, ErrBadDim)
	}
	if err := needSite(p); err != nil {
		return nil, err
	}
	list, err := loadPurchases(db, p)
	if err != nil {
		return nil, err
	}
	currency, err := siteCurrency(db, p, list)
	if err != nil {
		return nil, err
	}
	credit, total, err := creditRevenue(db, p, list, currency, nil, nil)
	if err != nil {
		return nil, err
	}
	rows := []RevenueRow{}
	for key, c := range credit[dim] {
		r := RevenueRow{Key: key, RevenueMinor: c.amount, Purchases: c.purchases, Buyers: len(c.buyers)}
		if total > 0 {
			r.Share = float64(c.amount) / float64(total)
		}
		rows = append(rows, r)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].RevenueMinor != rows[j].RevenueMinor {
			return rows[i].RevenueMinor > rows[j].RevenueMinor
		}
		return rows[i].Key < rows[j].Key
	})
	if len(rows) > maxLimit {
		rows = rows[:maxLimit]
	}
	return rows, nil
}

type credited struct {
	amount    int64
	purchases int
	buyers    map[string]bool
}

// creditRevenue credits purchases in currency to their buyer's first touch, per dim and key.
// only, when set, restricts the buyers; known, when set, already holds the buyers' sessions. total is the credited net.
func creditRevenue(db *sql.DB, p Params, list []sale, currency string, only map[string]bool,
	known map[string][]touch) (map[string]map[string]*credited, int64, error) {
	persons := []string{}
	seen := map[string]bool{}
	for _, b := range list {
		if b.currency == currency && !seen[b.person] && (only == nil || only[b.person]) {
			seen[b.person] = true
			persons = append(persons, b.person)
		}
	}
	if known == nil {
		var err error
		if known, err = sessionTouches(db, p, persons); err != nil {
			return nil, 0, err
		}
	}
	out := map[string]map[string]*credited{}
	var total int64
	for dim := range revenueDims {
		out[dim] = map[string]*credited{}
	}
	for _, b := range list {
		if b.currency != currency || !seen[b.person] {
			continue
		}
		total += b.amount
		t := firstTouch(known[b.person])
		for dim := range revenueDims {
			k := t.key(dim)
			c := out[dim][k]
			if c == nil {
				c = &credited{buyers: map[string]bool{}}
				out[dim][k] = c
			}
			c.amount += b.amount
			c.purchases++
			c.buyers[b.person] = true
		}
	}
	return out, total, nil
}
