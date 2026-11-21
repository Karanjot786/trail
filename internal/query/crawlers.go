package query

import (
	"database/sql"
	"fmt"
	"sort"
	"time"
)

// CrawlerInfo names a crawler's provider and category (training, indexing, fetch, general).
// cmd/trail sets it from internal/crawlers.Lookup; when nil, the bot is its own provider in "general".
var CrawlerInfo func(bot string) (provider, category string)

const maxCrawlPages = 50 // pages in the crawler report

var crawlCategories = []string{"training", "indexing", "fetch", "general"}

func crawlerInfo(bot string) (provider, category string) {
	if CrawlerInfo != nil {
		provider, category = CrawlerInfo(bot)
	}
	if provider == "" {
		provider = bot
	}
	switch category {
	case "training", "indexing", "fetch":
	default:
		category = "general"
	}
	return provider, category
}

// crawlConfigured reports whether the site has ever received crawler data.
func crawlConfigured(db *sql.DB, site string) (bool, error) {
	var ok bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM crawl_hits WHERE site_id=?)`, site).Scan(&ok); err != nil {
		return false, fmt.Errorf("crawlers configured: %w", err)
	}
	return ok, nil
}

// CrawlTotal returns the crawler requests whose hour falls in [from, to], and whether crawler ingest is set up.
func CrawlTotal(db *sql.DB, site string, from, to int64) (int, bool, error) {
	ok, err := crawlConfigured(db, site)
	if err != nil || !ok {
		return 0, ok, err
	}
	var n int
	if err := db.QueryRow(`SELECT coalesce(sum(n),0) FROM crawl_hits WHERE site_id=? AND hour BETWEEN ? AND ?`, site, from, to).
		Scan(&n); err != nil {
		return 0, true, fmt.Errorf("crawl total: %w", err)
	}
	return n, true, nil
}

// crawlWindow widens a single-day window to the last 7 days (crawlers visit too rarely for hourly
// buckets), comparing with the 7 days before when the window had a comparison.
func crawlWindow(p Params) Params {
	if bucketKind(p) != "hour" {
		return p
	}
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	end := time.UnixMilli(p.To).In(loc)
	start := time.Date(end.Year(), end.Month(), end.Day()-6, 0, 0, 0, 0, loc)
	hadPrev := p.Win.PrevFrom != nil
	w := p.Win
	w.Key, w.Label, w.Bucket = "7d", "Last 7 days", "day"
	w.From, w.To = start.UnixMilli(), p.To
	w.PrevFrom, w.PrevTo = nil, nil
	w.Basis = Basis{Text: "no comparison", Short: "no comparison", None: true}
	if hadPrev {
		pf := time.Date(start.Year(), start.Month(), start.Day()-7, 0, 0, 0, 0, loc).UnixMilli()
		pt := start.UnixMilli() - 1
		w.PrevFrom, w.PrevTo = &pf, &pt
		w.Basis = Basis{Text: "vs the previous 7 days", Short: "vs previous 7 days", Why: "a single day is widened to the last 7 days"}
	}
	starts := bucketStarts(w.From, w.To, "day", loc)
	w.LastBucket = max(bucketAt(starts, nowMs(p)), 0)
	if nowMs(p) > w.To {
		w.LastBucket = len(starts) - 1
	}
	p.Win, p.From, p.To = w, w.From, w.To
	return p
}

// Crawlers returns the AI crawler report: requests by category, provider and crawler (with the
// comparison window's numbers), a per-bucket series by category and the top 50 pages.
func Crawlers(db *sql.DB, p Params) (CrawlersResult, error) {
	res := CrawlersResult{Categories: []CrawlCategoryRow{}, Providers: []CrawlProvider{}, Series: []CrawlPoint{}, Pages: []CrawlPage{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	p = crawlWindow(p)
	res.Window = p.Win
	ok, err := crawlConfigured(db, p.Site)
	if err != nil {
		return res, err
	}
	res.Configured = ok

	starts := bucketStarts(p.From, p.To, bucketKind(p), p.TZ)
	res.Series = make([]CrawlPoint, len(starts))
	for i, t := range starts {
		res.Series[i] = CrawlPoint{T: t}
	}
	byBot := map[string]int{}
	byCat := map[string]int{}
	err = forRows(db, `SELECT hour, bot, sum(n) FROM crawl_hits WHERE site_id=? AND hour BETWEEN ? AND ? GROUP BY hour, bot`,
		[]any{p.Site, p.From, p.To}, func(r *sql.Rows) error {
			var hour int64
			var bot string
			var n int
			if err := r.Scan(&hour, &bot, &n); err != nil {
				return err
			}
			_, cat := crawlerInfo(bot)
			res.Total += n
			byBot[bot] += n
			byCat[cat] += n
			if i := bucketAt(starts, hour); i >= 0 {
				pt := &res.Series[i]
				switch cat {
				case "training":
					pt.Training += n
				case "indexing":
					pt.Indexing += n
				case "fetch":
					pt.Fetch += n
				default:
					pt.General += n
				}
			}
			return nil
		})
	if err != nil {
		return res, fmt.Errorf("crawlers: %w", err)
	}

	var prevBot, prevCat map[string]int
	if pp, has := p.Prev(); has && ok {
		prevBot, prevCat = map[string]int{}, map[string]int{}
		total := 0
		err = forRows(db, `SELECT bot, sum(n) FROM crawl_hits WHERE site_id=? AND hour BETWEEN ? AND ? GROUP BY bot`,
			[]any{p.Site, pp.From, pp.To}, func(r *sql.Rows) error {
				var bot string
				var n int
				if err := r.Scan(&bot, &n); err != nil {
					return err
				}
				_, cat := crawlerInfo(bot)
				prevBot[bot] += n
				prevCat[cat] += n
				total += n
				return nil
			})
		if err != nil {
			return res, fmt.Errorf("crawlers prev: %w", err)
		}
		res.PrevTotal = &total
	}
	prevOf := func(m map[string]int, k string) *int {
		if m == nil {
			return nil
		}
		v := m[k]
		return &v
	}
	for _, c := range crawlCategories {
		res.Categories = append(res.Categories, CrawlCategoryRow{Key: c, Requests: byCat[c], Prev: prevOf(prevCat, c)})
	}

	bots := map[string]bool{}
	for b := range byBot {
		bots[b] = true
	}
	for b := range prevBot {
		bots[b] = true
	}
	providers := map[string]*CrawlProvider{}
	provTotal := map[string]int{}
	for b := range bots {
		prov, cat := crawlerInfo(b)
		cp := providers[prov]
		if cp == nil {
			cp = &CrawlProvider{Provider: prov, Crawlers: []CrawlerRow{}}
			providers[prov] = cp
		}
		cp.Crawlers = append(cp.Crawlers, CrawlerRow{Name: b, Category: cat, Requests: byBot[b], Prev: prevOf(prevBot, b)})
		provTotal[prov] += byBot[b]
	}
	for _, cp := range providers {
		sort.Slice(cp.Crawlers, func(i, j int) bool {
			if cp.Crawlers[i].Requests != cp.Crawlers[j].Requests {
				return cp.Crawlers[i].Requests > cp.Crawlers[j].Requests
			}
			return cp.Crawlers[i].Name < cp.Crawlers[j].Name
		})
		res.Providers = append(res.Providers, *cp)
	}
	sort.Slice(res.Providers, func(i, j int) bool {
		a, b := res.Providers[i].Provider, res.Providers[j].Provider
		if provTotal[a] != provTotal[b] {
			return provTotal[a] > provTotal[b]
		}
		return a < b
	})

	if res.Pages, err = crawlPages(db, p, res.Total); err != nil {
		return res, err
	}
	return res, nil
}

// crawlPages ranks paths by crawler requests, naming each path's busiest crawler.
func crawlPages(db *sql.DB, p Params, total int) ([]CrawlPage, error) {
	type agg struct {
		page   CrawlPage
		topBot int
	}
	byPath := map[string]*agg{}
	err := forRows(db, `SELECT path, bot, sum(n), max(last_ts) FROM crawl_hits WHERE site_id=? AND hour BETWEEN ? AND ?
GROUP BY path, bot ORDER BY path, bot`, []any{p.Site, p.From, p.To}, func(r *sql.Rows) error {
		var path, bot string
		var n int
		var last int64
		if err := r.Scan(&path, &bot, &n, &last); err != nil {
			return err
		}
		a := byPath[path]
		if a == nil {
			a = &agg{page: CrawlPage{Path: path}}
			byPath[path] = a
		}
		a.page.Requests += n
		a.page.LastSeen = max(a.page.LastSeen, last)
		if n > a.topBot {
			a.topBot = n
			a.page.Provider, a.page.Category = crawlerInfo(bot)
			a.page.Crawler = bot
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("crawl pages: %w", err)
	}
	out := make([]CrawlPage, 0, len(byPath))
	for _, a := range byPath {
		if total > 0 {
			a.page.Share = float64(a.page.Requests) / float64(total)
		}
		out = append(out, a.page)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Requests != out[j].Requests {
			return out[i].Requests > out[j].Requests
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > maxCrawlPages {
		out = out[:maxCrawlPages]
	}
	return out, nil
}
