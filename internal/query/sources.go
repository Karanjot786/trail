package query

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// sourceRule names a referrer. Host matches the bare referrer host or any subdomain of it;
// a Host ending in "." matches any host that starts with it (google.co.in, google.de, …).
// UTM, when set, also matches a direct visit with that utm_source.
// Provider names the company behind an AI source (the same names as the crawler catalogue).
type sourceRule struct {
	Host, UTM, Name, Channel, Provider string
}

// aiProvider is the company behind AI source name; an unknown source names itself.
func aiProvider(name string) string {
	for _, r := range sourceRules {
		if r.Channel == "AI" && r.Name == name && r.Provider != "" {
			return r.Provider
		}
	}
	return name
}

// sourceRules is the compile-time list behind sourceNameExpr, channelExpr and aiSourceExpr.
// AI rules come first so gemini.google.com is not read as Google search.
var sourceRules = []sourceRule{
	{Host: "chatgpt.com", UTM: "chatgpt.com", Name: "ChatGPT", Channel: "AI", Provider: "OpenAI"},
	{Host: "chat.openai.com", Name: "ChatGPT", Channel: "AI", Provider: "OpenAI"},
	{Host: "perplexity.ai", Name: "Perplexity", Channel: "AI", Provider: "Perplexity"},
	{Host: "claude.ai", Name: "Claude", Channel: "AI", Provider: "Anthropic"},
	{Host: "gemini.google.com", Name: "Gemini", Channel: "AI", Provider: "Google"},
	{Host: "copilot.microsoft.com", Name: "Copilot", Channel: "AI", Provider: "Microsoft"},
	{Host: "chat.deepseek.com", Name: "DeepSeek", Channel: "AI", Provider: "DeepSeek"},
	{Host: "grok.com", Name: "Grok", Channel: "AI", Provider: "xAI"},
	{Host: "meta.ai", Name: "Meta AI", Channel: "AI", Provider: "Meta"},
	{Host: "chat.mistral.ai", Name: "Le Chat", Channel: "AI", Provider: "Mistral"},
	{Host: "you.com", Name: "You.com", Channel: "AI", Provider: "You.com"},
	{Host: "phind.com", Name: "Phind", Channel: "AI", Provider: "Phind"},

	{Host: "google.", Name: "Google", Channel: "Organic search"},
	{Host: "bing.com", Name: "Bing", Channel: "Organic search"},
	{Host: "duckduckgo.com", Name: "DuckDuckGo", Channel: "Organic search"},
	{Host: "search.brave.com", Name: "Brave Search", Channel: "Organic search"},
	{Host: "yandex.", Name: "Yandex", Channel: "Organic search"},
	{Host: "baidu.com", Name: "Baidu", Channel: "Organic search"},
	{Host: "ecosia.org", Name: "Ecosia", Channel: "Organic search"},
	{Host: "kagi.com", Name: "Kagi", Channel: "Organic search"},

	{Host: "t.co", Name: "X", Channel: "Social"},
	{Host: "x.com", Name: "X", Channel: "Social"},
	{Host: "twitter.com", Name: "X", Channel: "Social"},
	{Host: "news.ycombinator.com", Name: "Hacker News", Channel: "Social"},
	{Host: "reddit.com", Name: "Reddit", Channel: "Social"},
	{Host: "linkedin.com", Name: "LinkedIn", Channel: "Social"},
	{Host: "lnkd.in", Name: "LinkedIn", Channel: "Social"},
	{Host: "facebook.com", Name: "Facebook", Channel: "Social"},
	{Host: "instagram.com", Name: "Instagram", Channel: "Social"},
	{Host: "youtube.com", Name: "YouTube", Channel: "Social"},
	{Host: "bsky.app", Name: "Bluesky", Channel: "Social"},
	{Host: "threads.net", Name: "Threads", Channel: "Social"},

	{Host: "github.com", Name: "GitHub", Channel: "Referral"},
}

// Generated once from sourceRules (constants only, quotes doubled): never from user input.
// They read the columns referrer_host, utm_source, utm_medium and utm_campaign of one event,
// which for source purposes is a session's landing pageview.
var (
	sourceNameExpr = buildSourceName()
	channelExpr    = buildChannel()
	aiSourceExpr   = buildAISource()
)

func sqlStr(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// ruleMatch is the SQL condition for one rule.
func ruleMatch(r sourceRule) string {
	var c string
	if strings.HasSuffix(r.Host, ".") {
		c = "(substr(referrer_host,1," + strconv.Itoa(len(r.Host)) + ")=" + sqlStr(r.Host) +
			" OR instr(referrer_host," + sqlStr("."+r.Host) + ")>0)"
	} else {
		c = "(referrer_host=" + sqlStr(r.Host) + " OR substr(referrer_host,-" + strconv.Itoa(len(r.Host)+1) + ")=" + sqlStr("."+r.Host) + ")"
	}
	if r.UTM != "" {
		c = "(" + c + " OR (referrer_host='' AND utm_source=" + sqlStr(r.UTM) + "))"
	}
	return c
}

func buildSourceName() string {
	var b strings.Builder
	b.WriteString("(CASE")
	for _, r := range sourceRules {
		b.WriteString(" WHEN " + ruleMatch(r) + " THEN " + sqlStr(r.Name))
	}
	b.WriteString(" WHEN referrer_host!='' THEN referrer_host WHEN utm_source!='' THEN utm_source ELSE 'Direct' END)")
	return b.String()
}

func buildChannel() string {
	var b strings.Builder
	b.WriteString("(CASE")
	for _, r := range sourceRules {
		if r.Channel == "AI" {
			b.WriteString(" WHEN " + ruleMatch(r) + " THEN 'AI'")
		}
	}
	b.WriteString(" WHEN lower(utm_medium) IN ('email','newsletter') THEN 'Email'")
	b.WriteString(" WHEN lower(utm_medium) IN ('cpc','ppc') OR substr(lower(utm_medium),1,4)='paid' THEN 'Paid'")
	for _, ch := range []string{"Organic search", "Social", "Referral"} {
		for _, r := range sourceRules {
			if r.Channel == ch {
				b.WriteString(" WHEN " + ruleMatch(r) + " THEN " + sqlStr(ch))
			}
		}
	}
	b.WriteString(" WHEN utm_source!='' OR utm_medium!='' OR utm_campaign!='' THEN 'Campaign'")
	b.WriteString(" WHEN referrer_host!='' THEN 'Referral' ELSE 'Direct' END)")
	return b.String()
}

func buildAISource() string {
	var b strings.Builder
	b.WriteString("(CASE")
	for _, r := range sourceRules {
		if r.Channel == "AI" {
			b.WriteString(" WHEN " + ruleMatch(r) + " THEN " + sqlStr(r.Name))
		}
	}
	b.WriteString(" ELSE '' END)")
	return b.String()
}

// ftCols maps the dims that carry first-touch conversion and revenue columns to the ft column.
var ftCols = map[string]string{
	"source": "source", "channel": "channel", "ai_source": "CASE WHEN channel='AI' THEN source ELSE '' END",
	"utm_campaign": "campaign", "entry": "entry", "country": "country", "device": "device",
}

// sessCols maps each session dim to its sessSrc column (compile-time constants).
var sessCols = map[string]string{
	"referrer": "referrer_host", "source": "source", "channel": "channel", "ai_source": "ai", "entry": "entry",
	"utm_source": "utm_source", "utm_medium": "utm_medium", "utm_campaign": "utm_campaign",
	"utm_term": "utm_term", "utm_content": "utm_content",
}

// sessRows is one row per session with a pageview: sessSrc's landing columns plus the session
// aggregates (pv, dur) and eng (1 when engaged). It follows base()'s CTE.
func sessRows() string {
	return `, ss AS (SELECT s.*, a.pv AS pv, a.dur AS dur, ` + engagedExpr + ` AS eng
  FROM (` + sessSrc + `) s JOIN (` + sessionAgg + `) a USING(session_id))
`
}

// Breakdown returns the top values of dim by visitors (exit: by exits). q filters keys by
// case-insensitive substring. Rows carry sessions and bounce; the dims in ftCols also carry
// the conversion rate and revenue credited by first touch; entry adds entries and the top
// source, exit adds exits, views and exit rate, city adds country and region.
func Breakdown(db *sql.DB, p Params, dim, q string, limit int) ([]Row, error) {
	return breakdown(db, p, dim, q, limit, nil)
}

// breakdown is Breakdown; conv, when not nil, receives each first-touch key's converting people
// (the numerator of its ConvRate).
func breakdown(db *sql.DB, p Params, dim, q string, limit int, conv map[string]int) ([]Row, error) {
	d, ok := dims[dim]
	if !ok {
		return nil, fmt.Errorf("dim %q: %w", dim, ErrBadDim)
	}
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	search := ""
	var tail []any
	if q != "" {
		search = " AND instr(lower(k), lower(?))>0"
		tail = append(tail, q)
	}
	tail = append(tail, clampLimit(limit))
	order := ` GROUP BY k ORDER BY 2 DESC, 3 DESC, 4 DESC, 1 LIMIT ?`

	// Every query yields k, visitors, pageviews, total, sessions, engaged, country, region.
	var sqlText string
	switch d.kind {
	case dimRow, dimClock:
		expr := d.expr
		if d.kind == dimClock {
			expr = "CAST(" + d.expr + " AS TEXT)"
			args = append(args, p.tzOffset())
		}
		sqlText = cte + `SELECT k, count(DISTINCT person), sum(type='pageview'), count(*), count(DISTINCT session_id),
  count(DISTINCT CASE WHEN eng THEN session_id END), max(country), max(region)
FROM (SELECT ` + expr + ` AS k, e.person, e.type, e.session_id, e.country, e.region, ` + engagedExpr + ` AS eng
  FROM ev e JOIN (` + sessionAgg + `) a USING(session_id))
WHERE k!='' AND type<>'engage'` + search + order
	case dimSession:
		sqlText = cte + sessRows() + `SELECT k, count(DISTINCT person), sum(pv), 0, count(*), sum(eng), '', ''
FROM (SELECT ` + sessCols[dim] + ` AS k, person, pv, eng FROM ss) WHERE k!=''` + search + order
	case dimExit:
		return exitRows(db, cte, args, search, tail)
	case dimEvent:
		sqlText = cte + `SELECT k, count(DISTINCT person), 0, count(*), count(DISTINCT session_id), 0, '', ''
FROM (SELECT CASE WHEN type='outbound' THEN '` + outboundKey + `' ELSE name END AS k, person, session_id
  FROM ev WHERE type<>'pageview' AND type IN ('outbound','event') AND (type='outbound' OR name!=''))
WHERE k!=''` + search + order
	case dimGoal:
		args = append(args, p.Site)
		sqlText = cte + `SELECT k, count(DISTINCT person), 0, count(*), count(DISTINCT session_id), 0, '', ''
FROM (SELECT g.name AS k, x.person, x.session_id FROM ev x JOIN goals g ON g.site_id=? WHERE ` + goalHitCond + `)
WHERE k!=''` + search + order
	}
	rows := []Row{}
	err = forRows(db, sqlText, append(args, tail...), func(r *sql.Rows) error {
		var row Row
		var sessions, engaged int
		if err := r.Scan(&row.Key, &row.Visitors, &row.Pageviews, &row.Total, &sessions, &engaged, &row.Country, &row.Region); err != nil {
			return err
		}
		if d.kind != dimEvent && d.kind != dimGoal {
			row.Total = 0
			b := bounce(sessions, engaged)
			row.Sessions, row.Bounce = &sessions, &b
		}
		if dim != "city" {
			row.Country, row.Region = "", ""
		}
		if dim == "entry" {
			row.Entries = row.Sessions
		}
		rows = append(rows, row)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("breakdown %s: %w", dim, err)
	}
	if dim == "entry" {
		if err := entryTopSources(db, cte, args, rows); err != nil {
			return nil, err
		}
	}
	if col, ok := ftCols[dim]; ok && len(rows) > 0 {
		if err := firstTouchColumns(db, p, cte, args, col, rows, conv); err != nil {
			return nil, err
		}
	}
	return rows, nil
}

// exitRows lists the last pageview paths of sessions with exits, views and exit rate.
func exitRows(db *sql.DB, cte string, args []any, search string, tail []any) ([]Row, error) {
	sqlText := cte + `SELECT k, v.visitors, v.views, x.exits FROM
  (SELECT exitp AS k, count(*) AS exits FROM (SELECT session_id, max(ts), path AS exitp FROM ev WHERE type='pageview' GROUP BY session_id) GROUP BY exitp) x
  JOIN (SELECT path, count(DISTINCT person) AS visitors, count(*) AS views FROM ev WHERE type='pageview' GROUP BY path) v ON v.path=x.k
WHERE k!=''` + search + ` ORDER BY 4 DESC, 2 DESC, 1 LIMIT ?`
	rows := []Row{}
	err := forRows(db, sqlText, append(args, tail...), func(r *sql.Rows) error {
		var row Row
		var exits, views int
		if err := r.Scan(&row.Key, &row.Visitors, &views, &exits); err != nil {
			return err
		}
		rate := 0.0
		if views > 0 {
			rate = float64(exits) / float64(views)
		}
		row.Pageviews, row.Exits, row.Views, row.ExitRate = views, &exits, &views, &rate
		rows = append(rows, row)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("breakdown exit: %w", err)
	}
	return rows, nil
}

// entryTopSources sets each entry row's most common landing source (ties: by name).
func entryTopSources(db *sql.DB, cte string, args []any, rows []Row) error {
	idx := map[string]int{}
	for i, r := range rows {
		idx[r.Key] = i
	}
	best := map[string]int{}
	err := forRows(db, cte+sessRows()+`SELECT entry, source, count(*) FROM ss GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2`, args,
		func(r *sql.Rows) error {
			var entry, src string
			var n int
			if err := r.Scan(&entry, &src, &n); err != nil {
				return err
			}
			if i, ok := idx[entry]; ok && n > best[entry] {
				best[entry], rows[i].Top = n, src
			}
			return nil
		})
	if err != nil {
		return fmt.Errorf("entry sources: %w", err)
	}
	return nil
}

// mainCurrency is the most common purchase currency among p's rows ("" without purchases).
func mainCurrency(db *sql.DB, cte string, args []any) (string, error) {
	var cur string
	err := db.QueryRow(cte+`SELECT `+currencyExpr+` FROM ev WHERE `+purchaseWhere+` GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`, args...).Scan(&cur)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("currency: %w", err)
	}
	return cur, nil
}

// firstTouchColumns credits conversions and revenue of the people in range to their first
// touch: convRate = converters / people whose first touch is the row's key (nil without a goal
// or without such people), revenueMinor = their purchases in range in the main currency.
// conv, when not nil and the site has a goal, receives every key's converting people (rows or not).
func firstTouchColumns(db *sql.DB, p Params, cte string, args []any, col string, rows []Row, conv map[string]int) error {
	goal, err := convGoal(db, p.Site, p.Conv)
	if err != nil {
		return err
	}
	cur, err := mainCurrency(db, cte, args)
	if err != nil {
		return err
	}
	convExpr, gargs := "0", []any(nil)
	if goal != nil {
		var where string
		where, gargs = goalWhere(*goal)
		convExpr = "max(CASE WHEN " + where + " THEN 1 ELSE 0 END)"
	}
	ft, ftArgs := FirstTouch(db, p, "SELECT DISTINCT person FROM ev", nil)
	q := cte + ", " + ft + `, pp AS (SELECT person, ` + convExpr + ` AS conv,
  coalesce(sum(CASE WHEN ` + purchaseWhere + ` AND ` + currencyExpr + `=? THEN ` + amountMinorExpr + ` END),0) AS rev
  FROM ev GROUP BY person)
SELECT ` + col + `, count(*), sum(pp.conv), sum(pp.rev) FROM ft JOIN pp USING(person) GROUP BY 1`
	qargs := append(append(append(append([]any{}, args...), ftArgs...), gargs...), cur)
	idx := map[string]int{}
	for i, r := range rows {
		idx[r.Key] = i
		zero, z := int64(0), 0.0
		rows[i].RevenueMinor = &zero
		if goal != nil {
			rows[i].ConvRate = &z
		}
	}
	err = forRows(db, q, qargs, func(r *sql.Rows) error {
		var key string
		var people, nconv int
		var rev int64
		if err := r.Scan(&key, &people, &nconv, &rev); err != nil {
			return err
		}
		if goal != nil && conv != nil {
			conv[key] = nconv
		}
		i, ok := idx[key]
		if !ok {
			return nil
		}
		rows[i].RevenueMinor = &rev
		if goal != nil && people > 0 {
			rate := float64(nconv) / float64(people)
			rows[i].ConvRate = &rate
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("first touch columns: %w", err)
	}
	return nil
}
