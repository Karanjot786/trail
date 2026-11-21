package query

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

const maxAIPages = 50 // pages in the AI visibility report

// listedCrawlers are the crawlers whose operators publish IP lists (plan §0.11), so their
// requests can be verified. verifiedShare is measured among these only.
var listedCrawlers = map[string]bool{
	"GPTBot": true, "OAI-SearchBot": true, "ChatGPT-User": true, "OAI-AdsBot": true,
	"PerplexityBot": true, "Perplexity-User": true,
}

// aiTouchCol keys a person's first touch by AI source and landing page ("" when the first touch
// was not an AI assistant); it reads firstTouchCTE's ft columns. keySep joins the two parts.
const (
	keySep     = "\x1f"
	aiTouchCol = "CASE WHEN channel='AI' THEN source || char(31) || entry ELSE '' END"
)

// crawlAgg is one window's crawler requests: by step (crawled = training, indexing and general;
// fetched = fetch), by provider and by path.
type crawlAgg struct {
	crawled, fetched         int
	listed, verified         int // requests from listedCrawlers, and the verified among them
	provCrawled, provFetched map[string]int
	pages                    map[string]*AIPageRow
}

func crawlSteps(db *sql.DB, p Params) (crawlAgg, error) {
	a := crawlAgg{provCrawled: map[string]int{}, provFetched: map[string]int{}, pages: map[string]*AIPageRow{}}
	err := forRows(db, `SELECT bot, path, verified, sum(n), max(last_ts) FROM crawl_hits
WHERE site_id=? AND hour BETWEEN ? AND ? GROUP BY bot, path, verified`, []any{p.Site, p.From, p.To}, func(r *sql.Rows) error {
		var bot, path string
		var verified bool
		var n int
		var last int64
		if err := r.Scan(&bot, &path, &verified, &n, &last); err != nil {
			return err
		}
		prov, cat := crawlerInfo(bot)
		pg := a.pages[path]
		if pg == nil {
			pg = &AIPageRow{Path: path}
			a.pages[path] = pg
		}
		if pg.LastCrawled == nil || last > *pg.LastCrawled {
			pg.LastCrawled = &last
		}
		if cat == "fetch" {
			a.fetched += n
			a.provFetched[prov] += n
			pg.Fetched += n
		} else {
			a.crawled += n
			a.provCrawled[prov] += n
			pg.Crawled += n
		}
		if listedCrawlers[bot] {
			a.listed += n
			if verified {
				a.verified += n
			}
		}
		return nil
	})
	if err != nil {
		return a, fmt.Errorf("ai visibility crawls: %w", err)
	}
	return a, nil
}

// aiVisits is one window's AI referral side: sessions from AI assistants (as AIReferrals counts
// them) and people whose first touch was an AI assistant and who hit the goal (firstTouchColumns,
// as AIReferral.ConvRate), by provider and by landing page.
type aiVisits struct {
	visited, converted          int
	provVisited, provConverted  map[string]int
	pageVisits, pageConversions map[string]int
}

func aiVisitSteps(db *sql.DB, p Params, hasGoal bool) (aiVisits, error) {
	v := aiVisits{provVisited: map[string]int{}, provConverted: map[string]int{},
		pageVisits: map[string]int{}, pageConversions: map[string]int{}}
	cte, args, err := base(p)
	if err != nil {
		return v, err
	}
	conv := map[string]int{}
	jobs := []func() error{func() error {
		return forRows(db, cte+sessRows()+`SELECT ai, entry, count(*) FROM ss WHERE ai!='' GROUP BY 1, 2`, args,
			func(r *sql.Rows) error {
				var ai, entry string
				var n int
				if err := r.Scan(&ai, &entry, &n); err != nil {
					return err
				}
				v.visited += n
				v.provVisited[aiProvider(ai)] += n
				if entry != "" {
					v.pageVisits[entry] += n
				}
				return nil
			})
	}}
	if hasGoal {
		jobs = append(jobs, func() error { return firstTouchColumns(db, p, cte, args, aiTouchCol, nil, conv) })
	}
	if err := parallel(jobs...); err != nil {
		return v, fmt.Errorf("ai visits: %w", err)
	}
	for key, n := range conv {
		ai, entry, ok := strings.Cut(key, keySep)
		if !ok {
			continue // not an AI first touch
		}
		v.converted += n
		v.provConverted[aiProvider(ai)] += n
		v.pageConversions[entry] += n
	}
	return v, nil
}

// AIVisibility is the AI visibility funnel. Every step uses one window (a single day is widened
// to 7 days, as the crawler report): crawled (training, indexing and general crawler requests),
// fetched (fetches for an answer, in requests), cited (no public source, so no number), visited
// (sessions from AI assistants, as AIReferrals) and converted (people whose first touch was an AI
// assistant and who hit the goal, the numerator behind AIReferral.ConvRate). Providers and pages
// join the crawler and referral sides; verifiedShare is measured among crawlers that publish IPs.
func AIVisibility(db *sql.DB, p Params) (AIVisibilityResult, error) {
	res := AIVisibilityResult{Steps: []AIFunnelStep{}, Providers: []AIProviderRow{}, Pages: []AIPageRow{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	p = crawlWindow(p)
	res.Window = p.Win
	configured, err := crawlConfigured(db, p.Site)
	if err != nil {
		return res, err
	}
	goal, err := convGoal(db, p.Site, p.Conv)
	if err != nil {
		return res, err
	}
	if goal != nil {
		res.Conv = &ConvRef{GoalID: goal.ID, Name: goal.Name}
	}
	// The steps of both windows are independent: run them side by side.
	var crawls crawlAgg
	var visits aiVisits
	var prevCrawls *crawlAgg
	var prevVisits *aiVisits
	jobs := []func() error{
		func() (err error) { crawls, err = crawlSteps(db, p); return err },
		func() (err error) { visits, err = aiVisitSteps(db, p, goal != nil); return err },
	}
	if pp, ok := p.Prev(); ok {
		prevCrawls, prevVisits = &crawlAgg{}, &aiVisits{}
		jobs = append(jobs,
			func() (err error) { *prevCrawls, err = crawlSteps(db, pp); return err },
			func() (err error) { *prevVisits, err = aiVisitSteps(db, pp, goal != nil); return err })
	}
	if err := parallel(jobs...); err != nil {
		return res, err
	}

	step := func(key, unit string, val int, prev func() int, ok bool, missing string) AIFunnelStep {
		s := AIFunnelStep{Key: key, Unit: unit, Status: "ok"}
		if !ok {
			s.Status = missing
			return s
		}
		s.Value = &val
		if prevCrawls != nil {
			n := prev()
			s.Prev = &n
		}
		return s
	}
	res.Steps = []AIFunnelStep{
		step("crawled", "requests", crawls.crawled, func() int { return prevCrawls.crawled }, configured, "not_set_up"),
		step("fetched", "requests", crawls.fetched, func() int { return prevCrawls.fetched }, configured, "not_set_up"),
		{Key: "cited", Unit: "requests", Status: "no_source"},
		step("visited", "sessions", visits.visited, func() int { return prevVisits.visited }, true, ""),
		step("converted", "people", visits.converted, func() int { return prevVisits.converted }, goal != nil, "no_goal"),
	}
	if crawls.listed > 0 {
		share := float64(crawls.verified) / float64(crawls.listed)
		res.VerifiedShare = &share
	}
	res.Providers = aiProviders(crawls, visits, goal != nil)
	res.Pages = aiPages(crawls, visits, goal != nil)
	return res, nil
}

// aiProviders is the union of crawler providers and AI-source providers, busiest first.
func aiProviders(c crawlAgg, v aiVisits, hasGoal bool) []AIProviderRow {
	names := map[string]bool{}
	for _, m := range []map[string]int{c.provCrawled, c.provFetched, v.provVisited} {
		for k := range m {
			names[k] = true
		}
	}
	out := make([]AIProviderRow, 0, len(names))
	for name := range names {
		row := AIProviderRow{Provider: name, Crawled: c.provCrawled[name], Fetched: c.provFetched[name], Visited: v.provVisited[name]}
		if hasGoal {
			n := v.provConverted[name]
			row.Converted = &n
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Visited != b.Visited {
			return a.Visited > b.Visited
		}
		if a.Fetched != b.Fetched {
			return a.Fetched > b.Fetched
		}
		if a.Crawled != b.Crawled {
			return a.Crawled > b.Crawled
		}
		return a.Provider < b.Provider
	})
	return out
}

// aiPages joins crawled paths with AI-referral landing paths: visits are AI sessions landing on
// the path, conversions the people whose first touch was an AI assistant landing there and who
// hit the goal. Ranked by fetched, then crawled, then visits; top 50.
func aiPages(c crawlAgg, v aiVisits, hasGoal bool) []AIPageRow {
	pages := c.pages
	for path, n := range v.pageVisits {
		pg := pages[path]
		if pg == nil {
			pg = &AIPageRow{Path: path}
			pages[path] = pg
		}
		pg.Visits = n
	}
	out := make([]AIPageRow, 0, len(pages))
	for _, pg := range pages {
		if hasGoal {
			n := v.pageConversions[pg.Path]
			pg.Conversions = &n
		}
		out = append(out, *pg)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Fetched != b.Fetched {
			return a.Fetched > b.Fetched
		}
		if a.Crawled != b.Crawled {
			return a.Crawled > b.Crawled
		}
		if a.Visits != b.Visits {
			return a.Visits > b.Visits
		}
		return a.Path < b.Path
	})
	if len(out) > maxAIPages {
		out = out[:maxAIPages]
	}
	return out
}
