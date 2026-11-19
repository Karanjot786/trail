// Package seed fills a store with realistic fake analytics data for development.
package seed

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"slices"
	"strings"
	"time"

	"trail/internal/enrich"
	"trail/internal/store"
)

var (
	paths = []string{
		"/", "/docs", "/docs/components", "/docs/components/data-story",
		"/docs/components/tutorial", "/docs/installation", "/pricing",
		"/blog", "/blog/42", "/blog/117", "/changelog", "/signup", "/login",
	}
	referrers = []weighted{
		{"", 40}, {"https://www.google.com/", 30}, {"https://github.com/", 15},
		{"https://t.co/", 5}, {"https://news.ycombinator.com/", 5}, {"https://www.linkedin.com/", 5},
	}
	countries = []weighted{
		{"IN", 62}, {"US", 12}, {"GB", 5}, {"DE", 4}, {"SG", 4}, {"AE", 3},
		{"CA", 3}, {"BD", 3}, {"NP", 2}, {"FR", 2},
	}
	cities = map[string][2]string{
		"IN": {"Maharashtra", "Mumbai"}, "US": {"California", "San Francisco"},
		"GB": {"England", "London"}, "DE": {"Berlin", "Berlin"}, "SG": {"", "Singapore"},
		"AE": {"Dubai", "Dubai"}, "CA": {"Ontario", "Toronto"}, "BD": {"Dhaka", "Dhaka"},
		"NP": {"Bagmati", "Kathmandu"}, "FR": {"Île-de-France", "Paris"},
	}
	devices = []device{
		{"mobile", "Chrome", "Android", 45}, {"mobile", "Safari", "iOS", 15},
		{"mobile", "Samsung Browser", "Android", 5}, {"desktop", "Chrome", "Windows", 15},
		{"desktop", "Chrome", "Mac", 8}, {"desktop", "Safari", "Mac", 4},
		{"desktop", "Firefox", "GNU/Linux", 3}, {"desktop", "Edge", "Windows", 3},
		{"tablet", "Safari", "iOS", 2},
	}
	customEvents = []string{"Signup", "Copy Code", "Search", "Theme Toggle"}
)

type weighted struct {
	v string
	w int
}

type device struct {
	device, browser, os string
	w                   int
}

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

// Seed generates `persons` people across `sites` over the `days` before now.
// Persons get 1–4 sessions of 1–6 pageviews each; about 30% identify, about
// 5% are bots, and geo is India-heavy.
func Seed(s *store.Store, sites []string, days, persons int, now time.Time, rng *rand.Rand) error {
	if len(sites) == 0 || days <= 0 {
		return fmt.Errorf("seed: need at least one site and a positive day count")
	}
	w := &writer{st: s}
	span := int64(days) * 24 * int64(time.Hour/time.Millisecond)
	end := now.UnixMilli()

	for p := range persons {
		site := sites[rng.IntN(len(sites))]
		host := site
		if !strings.Contains(host, ".") {
			host += ".com"
		}
		base := store.Event{
			SiteID: site, AnonID: id(rng), Host: host, Env: "production",
			Country: pick(rng, countries), IsBot: rng.IntN(100) < 5,
		}
		base.Region, base.City = cities[base.Country][0], cities[base.Country][1]
		d := pickDevice(rng)
		base.Device, base.Browser, base.OS = d.device, d.browser, d.os
		if base.IsBot {
			base.Device, base.Browser, base.OS = "desktop", "Googlebot", "GNU/Linux"
		}
		if rng.IntN(100) < 4 {
			base.Env, base.Host = "preview", site+"-git-main.vercel.app"
		}
		identified := !base.IsBot && rng.IntN(100) < 30
		userID := ""

		nSessions := 1 + rng.IntN(4)
		identifyAt := rng.IntN(nSessions)
		starts := make([]int64, nSessions)
		for i := range starts {
			starts[i] = end - span + rng.Int64N(span)
		}
		slices.Sort(starts)

		for si, ts := range starts {
			ev := base
			ev.SessionID = id(rng)
			ev.UserID = userID
			ref := pick(rng, referrers)
			if !base.IsBot && rng.IntN(10) == 0 {
				ev.UTMSource, ev.UTMMedium, ev.UTMCampaign = "newsletter", "email", "nov-launch"
				ref = ""
			}
			ev.RefURL = ref
			ev.RefHost = enrich.RefHost(ref, host)
			nViews := 1 + rng.IntN(6)
			for v := range nViews {
				if ts > end {
					break
				}
				pv := ev
				pv.Type, pv.TS = "pageview", ts
				pv.Path = paths[rng.IntN(len(paths))]
				if v == 0 && rng.IntN(2) == 0 {
					pv.Path = "/"
				}
				pv.Route = enrich.DeriveRoute(pv.Path)
				if v > 0 { // referrer only on the landing pageview
					pv.RefURL, pv.RefHost = "", ""
				}
				w.add(pv)

				engaged := 1000 + rng.IntN(120000)
				eg := pv
				eg.Type, eg.TS = "engage", ts+int64(engaged)
				eg.RefURL, eg.RefHost = "", ""
				eg.EngagedMs, eg.ScrollPct = engaged, 10+rng.IntN(91)
				if eg.TS <= end {
					w.add(eg)
				}

				if !base.IsBot {
					extra := pv
					extra.RefURL, extra.RefHost = "", ""
					extra.TS = ts + int64(rng.IntN(engaged))
					switch r := rng.IntN(100); {
					case r < 4:
						extra.Type, extra.Name = "error", "TypeError"
						extra.Props = mustJSON(map[string]string{"message": "Cannot read properties of undefined (reading 'map')"})
					case r < 10:
						extra.Type, extra.Name = "outbound", "https://github.com/"
						extra.Props = mustJSON(map[string]string{"url": "https://github.com/trail/trail"})
					case r < 16:
						extra.Type, extra.Name = "event", customEvents[rng.IntN(len(customEvents))]
						extra.Props = mustJSON(map[string]string{"plan": "free"})
					default:
						extra.Type = ""
					}
					if extra.Type != "" && extra.TS <= end {
						w.add(extra)
					}
				}
				ts += int64(engaged) + int64(rng.IntN(5000))
			}

			// Identify in one session; events in later sessions carry the user id.
			if identified && si == identifyAt && ts <= end {
				userID = fmt.Sprintf("user_%d", p)
				idf := ev
				idf.RefURL, idf.RefHost = "", ""
				idf.Type, idf.TS, idf.UserID = "identify", ts, userID
				idf.Path, idf.Route = "/signup", "/signup"
				w.add(idf)
				sg := idf
				sg.Type, sg.Name, sg.TS = "event", "Signup", ts+1
				w.add(sg)
			}
		}
	}
	if w.err != nil {
		return w.err
	}
	if err := s.Flush(); err != nil {
		return err
	}
	if n := s.Dropped(); n > 0 {
		return fmt.Errorf("seed: store dropped %d events", n)
	}
	return nil
}

func mustJSON(v map[string]string) string {
	b, _ := json.Marshal(v) // map[string]string cannot fail to marshal
	return string(b)
}
