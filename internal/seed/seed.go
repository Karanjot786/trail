// Package seed fills a store with realistic fake analytics data for development and the demo.
package seed

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"slices"
	"strings"
	"time"

	"trail/internal/enrich"
	"trail/internal/store"
)

// SiteSpec is one site to seed. Revenue adds Purchase events; Crawlers adds AI crawler hits.
type SiteSpec struct {
	ID       string
	Revenue  bool
	Crawlers bool
}

type weighted struct {
	v string
	w int
}

type city struct {
	name, region string
	w            int
}

type country struct {
	code   string
	w      int
	cities []city
}

type device struct {
	device, browser, os string
	w                   int
}

// campaign is a UTM-tagged arrival; ref is the referrer the click comes with.
type campaign struct{ source, medium, name, ref string }

type bot struct {
	name string
	base int // requests per day
}

var (
	paths = []string{
		"/", "/docs", "/docs/components", "/docs/components/data-story",
		"/docs/components/tutorial", "/docs/installation", "/pricing",
		"/blog", "/blog/launch-week", "/blog/117", "/changelog", "/signup", "/login",
		"/templates/reel-starter",
	}
	referrers = []weighted{
		{"", 36}, {"https://www.google.com/", 28}, {"https://github.com/ksd/trail", 10},
		{"https://t.co/", 5}, {"https://news.ycombinator.com/item?id=42190311", 4}, {"https://www.linkedin.com/", 4},
		{"https://www.reddit.com/r/selfhosted/", 3}, {"https://www.bing.com/", 3}, {"https://duckduckgo.com/", 1},
	}
	// About 6% of sessions arrive from an AI assistant.
	aiReferrers = []weighted{
		{"https://chatgpt.com/", 50}, {"https://www.perplexity.ai/", 20}, {"https://claude.ai/", 15},
		{"https://gemini.google.com/", 10}, {"https://copilot.microsoft.com/", 5},
	}
	campaigns = []campaign{
		{"x", "social", "launch-week", "https://t.co/"},
		{"newsletter", "email", "nov-digest", ""},
		{"google", "cpc", "brand", "https://www.google.com/"},
	}
	// Countries, cities and weights of the prototype (docs/design/dashboard/proto-d/js/data.js).
	countries = []country{
		{"IN", 58, []city{{"Bengaluru", "Karnataka", 8}, {"Mumbai", "Maharashtra", 6}, {"Pune", "Maharashtra", 4},
			{"New Delhi", "Delhi", 5}, {"Hyderabad", "Telangana", 4}, {"Chennai", "Tamil Nadu", 3}, {"Kolkata", "West Bengal", 2},
			{"Ahmedabad", "Gujarat", 2}, {"Jaipur", "Rajasthan", 1}, {"Kochi", "Kerala", 1}}},
		{"US", 11, []city{{"San Francisco", "California", 3}, {"New York", "New York", 3}, {"Austin", "Texas", 2},
			{"Seattle", "Washington", 2}, {"Chicago", "Illinois", 1}}},
		{"GB", 5, []city{{"London", "England", 4}, {"Manchester", "England", 1}}},
		{"SG", 4, []city{{"Singapore", "Singapore", 1}}},
		{"DE", 3, []city{{"Berlin", "Berlin", 2}, {"Munich", "Bavaria", 1}}},
		{"BD", 3, []city{{"Dhaka", "Dhaka", 1}}},
		{"AE", 3, []city{{"Dubai", "Dubai", 2}, {"Abu Dhabi", "Abu Dhabi", 1}}},
		{"CA", 2, []city{{"Toronto", "Ontario", 2}, {"Vancouver", "British Columbia", 1}}},
		{"NP", 2, []city{{"Kathmandu", "Bagmati", 1}}},
		{"JP", 2, []city{{"Tokyo", "Tokyo", 1}}},
		{"ID", 2, []city{{"Jakarta", "Jakarta", 1}}},
		{"BR", 2, []city{{"São Paulo", "São Paulo", 1}}},
		{"FR", 1, []city{{"Paris", "Île-de-France", 1}}},
		{"AU", 1, []city{{"Sydney", "New South Wales", 1}}},
		{"NL", 1, []city{{"Amsterdam", "North Holland", 1}}},
		{"LK", 1, []city{{"Colombo", "Western", 1}}},
	}
	devices = []device{
		{"mobile", "Chrome", "Android", 45}, {"mobile", "Safari", "iOS", 15},
		{"mobile", "Samsung Browser", "Android", 5}, {"desktop", "Chrome", "Windows", 15},
		{"desktop", "Chrome", "Mac", 8}, {"desktop", "Safari", "Mac", 4},
		{"desktop", "Firefox", "GNU/Linux", 3}, {"desktop", "Edge", "Windows", 3},
		{"tablet", "Safari", "iOS", 2},
	}
	customEvents = []string{"Copy Code", "Copy Code", "Download Template", "Search", "Theme Toggle"}
	// The AI crawler catalogue of the prototype, with requests per day.
	bots = []bot{
		{"GPTBot", 34}, {"ChatGPT-User", 22}, {"OAI-SearchBot", 18}, {"ClaudeBot", 26}, {"Claude-User", 9},
		{"Claude-SearchBot", 7}, {"PerplexityBot", 16}, {"Perplexity-User", 11}, {"Google-Extended", 14},
		{"Applebot", 12}, {"Amazonbot", 15}, {"Bytespider", 19}, {"CCBot", 10}, {"Meta-ExternalAgent", 13},
		{"DuckAssistBot", 4}, {"MistralAI-User", 3},
	}
	crawlPaths = []string{"/docs/components/data-story", "/docs/installation", "/docs/components", "/", "/pricing",
		"/blog/launch-week", "/changelog", "/templates/reel-starter", "/llms.txt", "/robots.txt", "/sitemap.xml"}
)

const (
	spikeDaysAgo = 8 // the Hacker News spike, with a note
	livePeople   = 6 // people active in the five minutes before now
	quietMs      = int64(30 * time.Minute / time.Millisecond)
	dayMs        = int64(24 * time.Hour / time.Millisecond)
)

func pick(rng *rand.Rand, ws []weighted) string {
	total := 0
	for _, w := range ws {
		total += w.w
	}
	n := rng.IntN(total)
	for _, w := range ws {
		if n < w.w {
			return w.v
		}
		n -= w.w
	}
	return ws[len(ws)-1].v
}

func pickCountry(rng *rand.Rand) (string, string, string) {
	total := 0
	for _, c := range countries {
		total += c.w
	}
	n := rng.IntN(total)
	c := countries[len(countries)-1]
	for _, cc := range countries {
		if n < cc.w {
			c = cc
			break
		}
		n -= cc.w
	}
	ct := 0
	for _, x := range c.cities {
		ct += x.w
	}
	m := rng.IntN(ct)
	for _, x := range c.cities {
		if m < x.w {
			return c.code, x.region, x.name
		}
		m -= x.w
	}
	return c.code, c.cities[0].region, c.cities[0].name
}

func pickDevice(rng *rand.Rand) device {
	n := rng.IntN(100)
	for _, d := range devices {
		if n < d.w {
			return d
		}
		n -= d.w
	}
	return devices[0]
}

func id(rng *rand.Rand) string {
	return fmt.Sprintf("%016x%016x", rng.Uint64(), rng.Uint64())
}

// writer enqueues events and flushes often enough that the store queue never overflows.
type writer struct {
	st  *store.Store
	n   int
	err error
}

func (w *writer) add(e store.Event) {
	if w.err != nil {
		return
	}
	w.st.Enqueue(e)
	w.n++
	if w.n%2000 == 0 {
		w.err = w.st.Flush()
	}
}

// gen holds one seeding run.
type gen struct {
	w        *writer
	rng      *rand.Rand
	end      int64
	purchase map[string]bool // site → Revenue
	nextUser int
}

// Seed generates `persons` people across `sites` over the `days` before now. Persons get 1–4
// sessions of 1–6 pageviews; about 30% identify (and sign up), about 5% are bots, geo is
// India-heavy; about 6% of sessions come from AI assistants and about 10% from three UTM
// campaigns. Revenue sites get Purchase events (19 or 49 USD) on about 3% of signup sessions,
// Crawlers sites get AI crawler hits. Every site gets a spike 8 days before now with a note,
// the goals Signup and Pricing, the funnel "Docs to signup", and 6 people active in the last
// five minutes. The output depends only on sites, days, persons, now and rng.
func Seed(s *store.Store, sites []SiteSpec, days, persons int, now time.Time, rng *rand.Rand) error {
	if len(sites) == 0 || days <= 0 {
		return fmt.Errorf("seed: need at least one site and a positive day count")
	}
	g := &gen{w: &writer{st: s}, rng: rng, end: now.UnixMilli(), purchase: map[string]bool{}}
	for _, sp := range sites {
		g.purchase[sp.ID] = sp.Revenue
	}
	span := int64(days) * dayMs
	for range persons {
		sp := sites[rng.IntN(len(sites))]
		nSessions := 1 + rng.IntN(4)
		starts := make([]int64, nSessions)
		for i := range starts {
			starts[i] = g.end - span + rng.Int64N(span-quietMs) // the last minutes belong to the live people
		}
		slices.Sort(starts)
		g.person(sp.ID, starts, "", false)
	}
	// The spike: extra people from Hacker News on one day.
	if days > spikeDaysAgo {
		spikeDay := g.end - int64(spikeDaysAgo)*dayMs
		extra := max(20, persons/days*2)
		for range extra {
			sp := sites[rng.IntN(len(sites))]
			g.person(sp.ID, []int64{spikeDay - rng.Int64N(dayMs/2)}, "https://news.ycombinator.com/item?id=42190311", false)
		}
	}
	// People on the site right now.
	for _, sp := range sites {
		for range livePeople {
			g.person(sp.ID, []int64{g.end - 4*60_000 + rng.Int64N(3*60_000)}, "", true)
		}
	}
	if g.w.err != nil {
		return g.w.err
	}
	if err := s.Flush(); err != nil {
		return err
	}
	if n := s.Dropped(); n > 0 {
		return fmt.Errorf("seed: store dropped %d events", n)
	}
	for _, sp := range sites {
		if err := meta(s.DB(), sp, now, days); err != nil {
			return err
		}
		if sp.Crawlers {
			if err := crawls(s.DB(), sp.ID, now, days, rng); err != nil {
				return err
			}
		}
	}
	return nil
}

// person writes one person's sessions starting at starts. forceRef, when set, is the
// referrer of every session (the spike); live people are always human, in production.
func (g *gen) person(site string, starts []int64, forceRef string, live bool) {
	rng := g.rng
	host := site
	if !strings.Contains(host, ".") {
		host += ".com"
	}
	base := store.Event{SiteID: site, AnonID: id(rng), Host: host, Env: "production", IsBot: rng.IntN(100) < 5 && forceRef == "" && !live}
	base.Country, base.Region, base.City = pickCountry(rng)
	d := pickDevice(rng)
	base.Device, base.Browser, base.OS = d.device, d.browser, d.os
	if base.IsBot {
		base.Device, base.Browser, base.OS = "desktop", "Googlebot", "GNU/Linux"
	}
	if rng.IntN(100) < 4 && !live {
		base.Env, base.Host = "preview", site+"-git-main.vercel.app"
	}
	identified := !base.IsBot && rng.IntN(100) < 30
	identifyAt := rng.IntN(len(starts))
	userID := ""
	plan := []string{"free", "pro", "team"}[rng.IntN(3)]

	for si, ts := range starts {
		ev := base
		ev.SessionID = id(rng)
		ev.UserID = userID
		ref := forceRef
		if ref == "" {
			switch r := rng.IntN(100); {
			case base.IsBot:
				ref = pick(rng, referrers)
			case r < 6:
				ref = pick(rng, aiReferrers)
			case r < 16:
				c := campaigns[rng.IntN(len(campaigns))]
				ev.UTMSource, ev.UTMMedium, ev.UTMCampaign = c.source, c.medium, c.name
				ref = c.ref
			default:
				ref = pick(rng, referrers)
			}
		}
		ev.RefURL = ref
		ev.RefHost = enrich.RefHost(ref, host)
		nViews := 1 + rng.IntN(6)
		bouncy := rng.IntN(100) < 40 // single short pageview, like real bounces
		if bouncy {
			nViews = 1
		}
		for v := range nViews {
			if ts > g.end {
				break
			}
			pv := ev
			pv.Type, pv.TS = "pageview", ts
			pv.Path = paths[rng.IntN(len(paths))]
			if v == 0 && rng.IntN(2) == 0 {
				pv.Path = "/"
			}
			pv.Route = enrich.DeriveRoute(pv.Path)
			if v > 0 { // referrer and UTM tags only on the landing pageview
				pv.RefURL, pv.RefHost = "", ""
				pv.UTMSource, pv.UTMMedium, pv.UTMCampaign = "", "", ""
			}
			g.w.add(pv)

			engaged := 1000 + rng.IntN(120000)
			if bouncy {
				engaged = 500 + rng.IntN(8000)
			}
			plain := pv
			plain.RefURL, plain.RefHost, plain.UTMSource, plain.UTMMedium, plain.UTMCampaign = "", "", "", "", ""
			eg := plain
			eg.Type, eg.TS = "engage", ts+int64(engaged)
			eg.EngagedMs, eg.ScrollPct = engaged, 10+rng.IntN(91)
			if eg.TS <= g.end {
				g.w.add(eg)
			}
			if !base.IsBot {
				extra := plain
				extra.TS = ts + int64(rng.IntN(engaged))
				switch r := rng.IntN(100); {
				case r < 4:
					extra.Type, extra.Name = "error", "TypeError"
					extra.Props = mustJSON(map[string]any{"message": "Cannot read properties of undefined (reading 'map')"})
				case r < 10:
					extra.Type, extra.Name = "outbound", "https://github.com/"
					extra.Props = mustJSON(map[string]any{"url": "https://github.com/ksd/trail"})
				case r < 16:
					extra.Type, extra.Name = "event", customEvents[rng.IntN(len(customEvents))]
					extra.Props = mustJSON(map[string]any{"page": pv.Path})
				default:
					extra.Type = ""
				}
				if extra.Type != "" && extra.TS <= g.end {
					g.w.add(extra)
				}
			}
			ts += int64(engaged) + int64(rng.IntN(5000))
		}

		// Identify and sign up in one session; events in later sessions carry the user id.
		if identified && si == identifyAt && ts+2 <= g.end {
			g.nextUser++
			userID = fmt.Sprintf("user_%d", g.nextUser)
			idf := ev
			idf.RefURL, idf.RefHost, idf.UTMSource, idf.UTMMedium, idf.UTMCampaign = "", "", "", "", ""
			idf.Type, idf.TS, idf.UserID = "identify", ts, userID
			idf.Path, idf.Route = "/signup", "/signup"
			g.w.add(idf)
			sg := idf
			sg.Type, sg.Name, sg.TS = "event", "Signup", ts+1
			sg.Props = mustJSON(map[string]any{"plan": plan})
			g.w.add(sg)
			if g.purchase[site] && rng.IntN(100) < 3 {
				pu := sg
				pu.Name, pu.TS = "Purchase", ts+2
				amount := 19
				if plan == "team" {
					amount = 49
				}
				pu.Props = mustJSON(map[string]any{"amount": amount, "currency": "USD", "plan": plan})
				g.w.add(pu)
			}
		}
	}
}

// meta writes the goals, the funnel and the spike note of a site (idempotent).
func meta(db *sql.DB, sp SiteSpec, now time.Time, days int) error {
	created := now.UnixMilli()
	if _, err := db.Exec(`INSERT OR IGNORE INTO goals(site_id, name, kind, match, created) VALUES(?,?,?,?,?), (?,?,?,?,?)`,
		sp.ID, "Signup", "event", "Signup", created, sp.ID, "Pricing", "page", "/pricing", created); err != nil {
		return fmt.Errorf("seed goals: %w", err)
	}
	steps := mustJSON([]map[string]string{
		{"kind": "page", "match": "/docs*", "label": "Docs"},
		{"kind": "page", "match": "/pricing", "label": "Pricing"},
		{"kind": "page", "match": "/signup", "label": "Signup page"},
		{"kind": "event", "match": "Signup", "label": "Signed up"},
	})
	if _, err := db.Exec(`INSERT OR IGNORE INTO funnels(site_id, name, window_ms, steps, created) VALUES(?,?,?,?,?)`,
		sp.ID, "Docs to signup", 7*dayMs, steps, created); err != nil {
		return fmt.Errorf("seed funnel: %w", err)
	}
	if days > spikeDaysAgo {
		const label = "Launched on Hacker News"
		ts := created - int64(spikeDaysAgo)*dayMs - dayMs/2
		if _, err := db.Exec(`INSERT INTO notes(site_id, ts, label, kind, created)
  SELECT ?,?,?,'press',? WHERE NOT EXISTS (SELECT 1 FROM notes WHERE site_id=? AND label=?)`,
			sp.ID, ts, label, created, sp.ID, label); err != nil {
			return fmt.Errorf("seed note: %w", err)
		}
	}
	return nil
}

// crawls writes AI crawler hits per hour × bot × path × status class (2..5) for the days before now.
func crawls(db *sql.DB, site string, now time.Time, days int, rng *rand.Rand) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("seed crawls: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op after Commit
	ins, err := tx.Prepare(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, n, last_ts) VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(site_id, hour, bot, path, status) DO UPDATE SET n=n+excluded.n, last_ts=max(last_ts, excluded.last_ts)`)
	if err != nil {
		return fmt.Errorf("seed crawls: %w", err)
	}
	defer ins.Close()
	end := now.UnixMilli()
	hourMs := int64(time.Hour / time.Millisecond)
	for d := days - 1; d >= 0; d-- {
		dayStart := end - int64(d+1)*dayMs
		for _, b := range bots {
			n := b.base/2 + rng.IntN(b.base+1)
			for range n {
				ts := dayStart + rng.Int64N(dayMs)
				if ts > end {
					continue
				}
				status := 2 // the status class, as crawlers.Ingest stores it
				if rng.IntN(100) < 6 {
					status = 4
				}
				path := crawlPaths[rng.IntN(len(crawlPaths))]
				if _, err := ins.Exec(site, ts/hourMs*hourMs, b.name, path, status, 1, ts); err != nil {
					return fmt.Errorf("seed crawl hit: %w", err)
				}
			}
		}
	}
	return tx.Commit()
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v) // maps and slices of strings and numbers cannot fail to marshal
	return string(b)
}
