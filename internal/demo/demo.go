// Package demo serves a public, read-only dashboard API over sample data.
//
// Isolation is the point: the demo owns a private in-memory SQLite database that
// it builds itself, so it takes no reference to the real database, never reads a
// real site, and has no write route. Everything but GET is refused.
package demo

import (
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"trail/internal/api"
	"trail/internal/seed"
	"trail/internal/sites"
	"trail/internal/store"
)

const (
	siteID  = "demo" // revenue and crawlers
	domain  = "demo.trail.dev"
	docsID  = "docs" // neither
	docsDom = "docs.trail.dev"
	prefix  = "/api/demo/"
	days    = 60 // two 30-day periods, so "Last 30 Days" has a real previous period to compare with
	persons = 1800
	// reseedAt is the minute after midnight (in the demo's zone) when data is rebuilt.
	reseedAt = 5 * time.Minute
	// grace lets requests already running on the old snapshot finish before it closes.
	grace = time.Minute
)

// routes is the allowlist of demo endpoints: every read route of the
// dashboard except the install check, raw export, config, tokens and shares.
// Anything else is a 404.
var routes = map[string]bool{}

// idRoutes are the allowlisted routes with a numeric or site id in the path.
var idRoutes = regexp.MustCompile(`^(goals/[0-9]+/detail|funnels/[0-9]+/(report|dropoff)|sites/(demo|docs)/status)$`)

func init() {
	for _, r := range strings.Fields(`sites sites/summary stats series breakdown changes heatmap live visitors sessions
		journey campaigns ai-referrals events events/detail goals goals/report paths funnels revenue revenue/breakdown
		crawlers notes views delivery`) {
		routes[r] = true
	}
}

// Allowed reports whether route (the path after /api/) is a demo route.
func Allowed(route string) bool { return routes[route] || idRoutes.MatchString(route) }

// snapshot is one generation of demo data and the API handler bound to it.
type snapshot struct {
	st *store.Store
	h  http.Handler
}

type demo struct {
	tz   *time.Location
	now  func() time.Time
	snap atomic.Pointer[snapshot]
}

// New returns the /api/demo/* handler. It builds the sample data now and rebuilds
// it every day at 00:05 in tz. Mount it at "/api/demo/" without stripping the prefix.
func New(tz *time.Location, now func() time.Time) (http.Handler, error) {
	d, err := newDemo(tz, now)
	if err != nil {
		return nil, err
	}
	d.schedule()
	return d, nil
}

func newDemo(tz *time.Location, now func() time.Time) (*demo, error) {
	d := &demo{tz: tz, now: now}
	if err := d.reseed(); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *demo) cur() *snapshot { return d.snap.Load() }

// reseed builds fresh sample data in a new private database and swaps it in.
// Data is deterministic for a given day: same seed, and dates are relative to the
// end of today in tz. Events fall across today, so the day fills in as it goes.
func (d *demo) reseed() error {
	st, err := store.Open(":memory:") // private to this connection pool, never shared
	if err != nil {
		return fmt.Errorf("demo db: %w", err)
	}
	// One connection keeps every query on the same in-memory database.
	st.DB().SetMaxOpenConns(1)
	if err := fill(st, d.tz, d.now()); err != nil {
		_ = st.Close()
		return err
	}
	// The registry lives in the same private database, so it holds only the demo sites.
	reg, err := sites.Open(st.DB())
	if err == nil {
		_, err = reg.Add(sites.Site{ID: siteID, Domain: domain})
	}
	if err == nil {
		_, err = reg.Add(sites.Site{ID: docsID, Domain: docsDom})
	}
	if err != nil {
		_ = st.Close()
		return fmt.Errorf("demo site: %w", err)
	}
	// Pin the sites' created time to the clock, so recordings are byte-identical.
	if _, err := st.DB().Exec(`UPDATE sites SET created=?`, d.now().UnixMilli()); err == nil {
		reg, err = sites.Open(st.DB())
	}
	if err != nil {
		_ = st.Close()
		return fmt.Errorf("demo site: %w", err)
	}
	next := &snapshot{st: st, h: api.New(st.DB(), reg, d.tz, api.WithClock(d.now))}
	if old := d.snap.Swap(next); old != nil {
		time.AfterFunc(grace, func() { _ = old.st.Close() })
	}
	return nil
}

func fill(st *store.Store, tz *time.Location, now time.Time) error {
	rng := rand.New(rand.NewPCG(42, 42))
	specs := []seed.SiteSpec{{ID: siteID, Revenue: true, Crawlers: true}, {ID: docsID}}
	if err := seed.Seed(st, specs, days, persons, now, rng); err != nil {
		return fmt.Errorf("demo seed: %w", err)
	}
	db := st.DB()
	for id, host := range map[string]string{siteID: domain, docsID: docsDom} {
		if _, err := db.Exec(`UPDATE events SET host=? WHERE site_id=? AND env='production'`, host, id); err != nil {
			return fmt.Errorf("demo host: %w", err)
		}
	}
	return nil // the seed adds the goals, a funnel and a note per site
}

// schedule rebuilds the data at the next 00:05 in the demo's zone, then repeats.
func (d *demo) schedule() {
	t := d.now().In(d.tz)
	at := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, d.tz).Add(reseedAt)
	if !at.After(t) {
		at = time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, d.tz).Add(reseedAt)
	}
	// ponytail: the timer chain lives for the process; add a Close if embedding needs it.
	time.AfterFunc(at.Sub(t), func() {
		if err := d.reseed(); err != nil {
			log.Printf("demo: reseed: %v", err) // keep serving the previous data
		}
		d.schedule()
	})
}

// ServeHTTP refuses anything but GET, allows only the listed routes, and
// defaults the site to demo (a request naming another site gets the API's 400).
func (d *demo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "demo is read-only", http.StatusForbidden)
		return
	}
	route, ok := strings.CutPrefix(r.URL.Path, prefix)
	if !ok || !Allowed(route) {
		http.NotFound(w, r)
		return
	}
	q := r.URL.Query()
	if !q.Has("site") {
		q.Set("site", siteID)
	}
	r2 := r.Clone(r.Context())
	r2.URL.Path, r2.URL.RawPath, r2.URL.RawQuery = "/api/"+route, "", q.Encode()
	d.cur().h.ServeHTTP(w, r2)
}
