// Command trail is a self-hosted web analytics server.
//
//	trail [serve]  run the server (default)
//	trail health   exit 0 if the local server answers /healthz (Docker HEALTHCHECK)
//	trail reset-password  replace the generated dashboard password and print it
//	trail seed     fill TRAIL_DB with fake data
//	trail demo record --out DIR --plan FILE [--now RFC3339]
//	trail crawlers import --site ID [--format combined|caddy] [--since auto|RFC3339] [--url URL --token T] FILE|-
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	mrand "math/rand/v2"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // zone names work on hosts and images without a zoneinfo database

	"trail/internal/agents"
	"trail/internal/api"
	"trail/internal/auth"
	"trail/internal/crawlers"
	"trail/internal/demo"
	"trail/internal/edgegeo"
	"trail/internal/enrich"
	"trail/internal/ingest"
	"trail/internal/mcp"
	"trail/internal/meta"
	"trail/internal/netx"
	"trail/internal/query"
	"trail/internal/seed"
	"trail/internal/sites"
	"trail/internal/store"
	"trail/web"
)

func init() {
	// The crawler report names each bot's provider and category from the ingest catalogue.
	query.CrawlerInfo = crawlers.Info
}

func main() {
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "serve":
		err = runServe()
	case "seed":
		err = runSeed(os.Args[2:])
	case "demo":
		err = runDemo(os.Args[2:], os.Stdout)
	case "crawlers":
		err = runCrawlers(os.Args[2:], os.Stdin, os.Stdout)
	case "health":
		err = runHealth(env("TRAIL_ADDR", ":8080"), 3*time.Second)
	case "reset-password":
		err = runResetPassword(env("TRAIL_DB", "trail.db"), os.Getenv("TRAIL_PASSWORD") != "", os.Stdout)
	case "compact":
		err = runCompact(env("TRAIL_DB", "trail.db"), os.Stdout)
	case "unfold":
		err = runUnfold(env("TRAIL_DB", "trail.db"), os.Stdout)
	case "version", "--version", "-v":
		fmt.Println("trail", version)
	default:
		fmt.Fprintln(os.Stderr, "usage: trail [serve|seed|crawlers import|health|reset-password|compact|unfold|version]")
		os.Exit(2)
	}
	if err != nil {
		log.Fatalf("trail %s: %v", cmd, err)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// parseSites parses TRAIL_SITES ("id=domain,id2=domain2") into id→domain.
func parseSites(s string) (map[string]string, error) {
	sites := map[string]string{}
	for part := range strings.SplitSeq(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, domain, ok := strings.Cut(part, "=")
		id, domain = strings.TrimSpace(id), strings.TrimSpace(domain)
		if !ok || id == "" || domain == "" {
			return nil, fmt.Errorf("TRAIL_SITES: bad entry %q, want id=domain", part)
		}
		sites[id] = strings.ToLower(domain)
	}
	return sites, nil
}

// runDemo runs `trail demo record`: it records the static demo fixtures.
func runDemo(args []string, out io.Writer) error {
	if len(args) == 0 || args[0] != "record" {
		return errors.New("usage: trail demo record --out DIR --plan FILE [--now RFC3339]")
	}
	fs := flag.NewFlagSet("demo record", flag.ContinueOnError)
	dir := fs.String("out", "", "output directory (e.g. web/public/demo-data)")
	planPath := fs.String("plan", "testdata/fixtures/plan.json", "recording plan")
	nowFlag := fs.String("now", "", "pinned clock, RFC 3339 (default: now, to the minute)")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *dir == "" {
		return errors.New("demo record: --out is required")
	}
	tz, err := time.LoadLocation(env("TRAIL_TZ", "Asia/Kolkata"))
	if err != nil {
		return fmt.Errorf("TRAIL_TZ: %w", err)
	}
	now := time.Now().Truncate(time.Minute)
	if *nowFlag != "" {
		if now, err = time.Parse(time.RFC3339, *nowFlag); err != nil {
			return fmt.Errorf("--now: %w", err)
		}
	}
	plan, err := demo.LoadPlan(*planPath)
	if err != nil {
		return err
	}
	man, err := demo.Record(context.Background(), plan, *dir, now, tz)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "recorded %d responses into %s\n", len(man.Keys), *dir)
	return nil
}

// seedOpts are the `trail seed` flags.
type seedOpts struct {
	sites, revenue, crawlers []string
	days, persons            int
	seed                     uint64
}

// parseSeedFlags reads `trail seed [--sites a,b] [--days N] [--persons N] [--seed N] [--revenue a] [--crawlers a]`.
// Sites default to TRAIL_SITES, else demo and docs; a zero seed means a random one.
func parseSeedFlags(args []string) (seedOpts, error) {
	fs := flag.NewFlagSet("seed", flag.ContinueOnError)
	sitesFlag := fs.String("sites", "", "comma-separated site ids (default: TRAIL_SITES, else demo,docs)")
	days := fs.Int("days", 30, "days of history")
	persons := fs.Int("persons", 2000, "people to generate")
	seedN := fs.Uint64("seed", 0, "random seed (0: random)")
	revenue := fs.String("revenue", "", "comma-separated site ids that get Purchase events")
	crawls := fs.String("crawlers", "", "comma-separated site ids that get AI crawler hits")
	if err := fs.Parse(args); err != nil {
		return seedOpts{}, err
	}
	o := seedOpts{days: *days, persons: *persons, seed: *seedN, sites: splitList(*sitesFlag),
		revenue: splitList(*revenue), crawlers: splitList(*crawls)}
	if len(o.sites) == 0 {
		envSites, err := parseSites(os.Getenv("TRAIL_SITES"))
		if err != nil {
			return o, err
		}
		for id := range envSites {
			o.sites = append(o.sites, id)
		}
		slices.Sort(o.sites)
	}
	if len(o.sites) == 0 {
		o.sites = []string{"demo", "docs"}
	}
	if o.days < 1 || o.days > 400 || o.persons < 1 || o.persons > 1_000_000 {
		return o, errors.New("seed: --days must be 1-400 and --persons 1-1000000")
	}
	for _, id := range append(slices.Clone(o.revenue), o.crawlers...) {
		if !slices.Contains(o.sites, id) {
			return o, fmt.Errorf("seed: %q is not one of --sites", id)
		}
	}
	return o, nil
}

func splitList(s string) []string {
	var out []string
	for part := range strings.SplitSeq(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func runSeed(args []string) error {
	o, err := parseSeedFlags(args)
	if err != nil {
		return err
	}
	path := env("TRAIL_DB", "trail.db")
	if err := seedDB(path, o, time.Now()); err != nil {
		return err
	}
	fmt.Printf("seeded %s for sites %v\n", path, o.sites)
	return nil
}

func seedDB(path string, o seedOpts, now time.Time) error {
	st, err := store.Open(path)
	if err != nil {
		return err
	}
	seedN := o.seed
	if seedN == 0 {
		seedN = uint64(now.UnixNano())
	}
	specs := make([]seed.SiteSpec, 0, len(o.sites))
	for _, id := range o.sites {
		specs = append(specs, seed.SiteSpec{ID: id, Revenue: slices.Contains(o.revenue, id), Crawlers: slices.Contains(o.crawlers, id)})
	}
	err = seed.Seed(st, specs, o.days, o.persons, now, mrand.New(mrand.NewPCG(seedN, 1)))
	return errors.Join(err, st.Close())
}

func runServe() error {
	envSites, err := parseSites(os.Getenv("TRAIL_SITES"))
	if err != nil {
		return err
	}
	rps, err := parseRPS(os.Getenv("TRAIL_INGEST_RPS"))
	if err != nil {
		return err
	}
	ips, err := netx.ParseTrusted(os.Getenv("TRAIL_TRUSTED_PROXIES"))
	if err != nil {
		return fmt.Errorf("TRAIL_TRUSTED_PROXIES: %w", err)
	}
	listsOff, err := parseAgentLists(os.Getenv("TRAIL_AGENT_LISTS"))
	if err != nil {
		return err
	}
	tz, err := serverTZ()
	if err != nil {
		return err
	}
	log.Printf("time zone: %s (TRAIL_TZ)", tz)
	geo, err := enrich.OpenGeo(os.Getenv("TRAIL_GEO_DB"))
	if err != nil {
		return err
	}
	defer geo.Close()
	if gi := geo.Info(); gi.Source != enrich.SourceNone {
		log.Printf("geo: %s database, built %s", gi.Source, gi.Build)
	}
	if s := os.Getenv("TRAIL_SECRET"); s != "" {
		if _, err := parseSecret(s); err != nil {
			return err
		}
	}
	tokens, err := auth.ParseTokens(os.Getenv("TRAIL_API_TOKENS"))
	if err != nil {
		return err
	}
	st, err := store.Open(env("TRAIL_DB", "trail.db"))
	if err != nil {
		return err
	}
	reg, err := sites.Open(st.DB())
	if err == nil {
		err = addEnvSites(reg, envSites)
	}
	var a *auth.Auth
	if err == nil {
		a, err = serverAuth(st.DB(), os.Getenv("TRAIL_PASSWORD"), os.Getenv("TRAIL_SECRET"), log.Printf)
	}
	if err != nil {
		return errors.Join(err, st.Close())
	}
	if len(reg.List()) == 0 {
		log.Print("no sites yet: add one in the dashboard (Settings) or with TRAIL_SITES")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	st.Start(ctx)
	// AI agent lists and key directories: fetched in the background and
	// refreshed daily; ingest never waits on them.
	dir := agents.NewDirectory(agents.DirOptions{Disabled: listsOff})
	dir.Start(ctx)
	if listsOff {
		log.Print("agents: TRAIL_AGENT_LISTS=off, AI agents are recognised by user agent only")
	}

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		return err
	}
	a.SetTokens(tokens)
	var demoH http.Handler
	if os.Getenv("TRAIL_DEMO") == "1" {
		if demoH, err = demo.New(tz, time.Now); err != nil {
			return fmt.Errorf("demo: %w", err)
		}
		log.Print("demo: serving sample data at /demo and /api/demo/")
	}
	ids := make([]string, 0, len(envSites))
	for id := range envSites {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	cfg := appConfig{Version: version, TZ: tz.String(), Demo: demoH != nil,
		IngestRPS: rps, EnvSites: ids, EnvTokens: len(tokens), DBFile: env("TRAIL_DB", "trail.db")}
	mux := routes(st, geo, reg, tz, a, dist, demoH, rps, ips, dir, cfg)

	srv := &http.Server{
		Addr:              env("TRAIL_ADDR", ":8080"),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	log.Printf("trail listening on %s (sites: %d, api tokens: %d)", srv.Addr, len(reg.List()), len(tokens))

	select {
	case err = <-errc:
	case <-ctx.Done():
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err = srv.Shutdown(shutCtx)
	}
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	return errors.Join(err, st.Close())
}

// addEnvSites registers TRAIL_SITES entries that the database lacks. Sites
// already there keep any edits made in the dashboard.
func addEnvSites(reg *sites.Registry, env map[string]string) error {
	for id, domain := range env {
		if _, err := reg.Add(sites.Site{ID: id, Domain: domain}); err != nil && !errors.Is(err, sites.ErrExists) {
			return fmt.Errorf("TRAIL_SITES %s: %w", id, err)
		}
	}
	return nil
}

// parseAgentLists reads TRAIL_AGENT_LISTS: empty (the default) fetches the
// published AI agent IP lists and signature key directories about once a
// day; "off" never fetches them, so agents are recognised by user agent only.
func parseAgentLists(s string) (off bool, err error) {
	switch s {
	case "":
		return false, nil
	case "off":
		return true, nil
	}
	return false, fmt.Errorf(`TRAIL_AGENT_LISTS: want "" or "off", got %q`, s)
}

// agentDirectory is what the server needs from the AI agent directory
// (agents.Directory): classification for ingest and the API's hooks.
type agentDirectory interface {
	ingest.Classifier
	api.AgentHooks
}

// parseRPS reads TRAIL_INGEST_RPS: requests per second per client IP on
// /_t/e, with a burst of twice that. Default 50; 0 turns the limit off.
func parseRPS(s string) (float64, error) {
	if s == "" {
		return 50, nil
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil || n < 0 || n != n {
		return 0, fmt.Errorf("TRAIL_INGEST_RPS: want a number >= 0, got %q", s)
	}
	return n, nil
}

// routes builds the server's handler tree. demoH (nil when TRAIL_DEMO is off)
// is the public demo API; it owns its own DB and refuses anything but GET.
// rps limits ingest per client IP (0: no limit); ips decides which proxies
// may report that IP (nil: netx.Default). dir recognises AI agents for
// ingest and the API (nil: none).
// version is set at build time with -ldflags "-X main.version=…".
var version = "dev"

// appConfig is the /api/config payload (Config in web/src/api/types.ts).
type appConfig struct {
	Version   string         `json:"version"`
	TZ        string         `json:"tz"`
	Demo      bool           `json:"demo"`
	Geo       enrich.GeoInfo `json:"geo"` // set by routes from the open database
	IngestRPS float64        `json:"ingestRps"`
	EnvSites  []string       `json:"envSites"`
	EnvTokens int            `json:"envTokens"`
	DBFile    string         `json:"dbFile"`
}

func routes(st *store.Store, geo *enrich.Geo, reg *sites.Registry, tz *time.Location, a *auth.Auth, dist fs.FS, demoH http.Handler, rps float64, ips *netx.Resolver, dir agentDirectory, cfg appConfig) *http.ServeMux {
	a.SetLookup(func(plain string) (auth.Token, bool) { return meta.LookupToken(st.DB(), plain) })
	// Failed logins are counted per visitor, not per proxy.
	loginIPs := ips
	if loginIPs == nil {
		loginIPs = netx.Default()
	}
	a.SetClientIP(loginIPs.ClientIP)
	apiOpts := []api.Option{api.WithEnvTokens(a.EnvTokens())}
	// Client IP and location: signed first-party proxy forwards (keyed by the
	// site's crawl tokens) and Cloudflare edges, else netx and the database.
	rv := edgegeo.Resolver{Now: time.Now, Net: ips, Keys: func(site, prefix string) [][]byte {
		k, err := meta.ProxyKeys(st.DB(), site, prefix)
		if err != nil {
			log.Printf("ingest: %v", err) // names neither the prefix nor the site's tokens
		}
		return k
	}}
	ingestOpts := []ingest.Option{ingest.WithPrivate(ingest.NewPrivate(tz, time.Now)), ingest.WithProxies(ips), ingest.WithResolver(rv)}
	if dir != nil {
		ingestOpts = append(ingestOpts, ingest.WithAgents(dir))
		apiOpts = append(apiOpts, api.WithAgents(dir))
	}
	apiH := api.New(st.DB(), reg, tz, apiOpts...)
	if rps > 0 {
		ingestOpts = append(ingestOpts, ingest.WithRateLimit(rps, int(max(1, 2*rps))))
	}
	v1 := a.API(rewrite("/api/v1/", "/api/", apiH))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := st.DB().PingContext(ctx); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
		_, _ = io.WriteString(w, "ok\n")
	})
	mux.Handle("/_t/e", ingest.New(st, geo, reg, ingestOpts...))
	mux.Handle("/_t/", ingest.TrackerFiles())
	mux.HandleFunc("POST /api/login", a.Login)
	mux.Handle("/api/", a.Require(apiH))
	cfg.Geo = geo.Info()
	if cfg.EnvSites == nil {
		cfg.EnvSites = []string{}
	}
	mux.Handle("GET /api/config", a.Require(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(cfg)
	})))
	mux.Handle("/api/v1/", v1)                                    // scope matrix of plan §0.12
	mux.Handle("/api/share/", api.ShareHandler(st.DB(), reg, tz)) // read-only links; the token is the credential
	mux.Handle("/mcp", a.API(mcp.New(st.DB(), reg, tz)))
	if demoH != nil {
		mux.Handle("/api/demo/", demoH) // unauthenticated; rewrites to /api/ itself
	}
	mux.Handle("/", spaHandler(dist))
	return mux
}

// rewrite serves h with the path prefix from replaced by to.
func rewrite(from, to string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r2 := r.Clone(r.Context())
		r2.URL.Path = to + strings.TrimPrefix(r.URL.Path, from)
		r2.URL.RawPath = ""
		h.ServeHTTP(w, r2)
	})
}

// serverAuth builds the dashboard guard. TRAIL_PASSWORD wins; without it the
// password generated on first start is used, and printed that one time.
// TRAIL_SECRET wins too; without it the secret stored in the database signs
// cookies, so logins survive restarts with no setup.
func serverAuth(db *sql.DB, password, secretEnv string, logf func(string, ...any)) (*auth.Auth, error) {
	var secret []byte
	var err error
	if secretEnv != "" {
		secret, err = parseSecret(secretEnv)
	} else {
		secret, err = meta.SessionSecret(db)
	}
	if err != nil {
		return nil, err
	}
	if password != "" {
		return auth.New(password, secret), nil
	}
	hash, plain, err := meta.GeneratedPassword(db)
	if err != nil {
		return nil, err
	}
	if plain != "" {
		bar := strings.Repeat("=", 64)
		logf("%s", bar)
		logf("TRAIL_PASSWORD is not set, so Trail generated a dashboard password.")
		logf("Log in with:  %s", plain)
		logf("It is shown only this once. Set TRAIL_PASSWORD to choose your own,")
		logf("or run `trail reset-password` to make a new one.")
		logf("%s", bar)
	} else {
		logf("auth: TRAIL_PASSWORD is not set; using the password generated on first start (`trail reset-password` makes a new one)")
	}
	return auth.NewHashed(hash, secret), nil
}

// runResetPassword replaces the generated password in the database at path
// and prints the new one. A running server keeps the old one until restarted.
func runResetPassword(path string, envSet bool, out io.Writer) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("database %s: %w (set TRAIL_DB)", path, err)
	}
	st, err := store.Open(path)
	if err != nil {
		return err
	}
	_, plain, err := meta.ResetPassword(st.DB())
	if err = errors.Join(err, st.Close()); err != nil {
		return err
	}
	fmt.Fprintf(out, "New dashboard password: %s\nRestart Trail to use it.\n", plain)
	if envSet {
		fmt.Fprintln(out, "Note: TRAIL_PASSWORD is set, and it wins over the generated password.")
	}
	return nil
}

// runCompact vacuums the database so the pages freed by the history fold go back to the disk.
func runCompact(path string, out io.Writer) error {
	before, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("database %s: %w (set TRAIL_DB)", path, err)
	}
	if err := store.Compact(path); err != nil {
		return err
	}
	after, err := os.Stat(path)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "Compacted %s: %d MB -> %d MB\n", path, before.Size()>>20, after.Size()>>20)
	return nil
}

// runUnfold turns folded engagement back into engage rows, the shape older binaries read.
// Stop the server first, or it folds them again.
func runUnfold(path string, out io.Writer) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("database %s: %w (set TRAIL_DB)", path, err)
	}
	st, err := store.Open(path)
	if err != nil {
		return err
	}
	n, err := store.Unfold(st.DB())
	if err = errors.Join(err, st.Close()); err != nil {
		return err
	}
	fmt.Fprintf(out, "Unfolded %d engage rows. Stop the server before starting an older binary.\n", n)
	return nil
}

// runHealth asks the server listening on addr for /healthz. A wildcard or
// empty host means this machine.
func runHealth(addr string, timeout time.Duration) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("TRAIL_ADDR %q: %w", addr, err)
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	c := &http.Client{Timeout: timeout}
	resp, err := c.Get("http://" + net.JoinHostPort(host, port) + "/healthz")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz: %s", resp.Status)
	}
	return nil
}

// parseSecret returns TRAIL_SECRET's bytes, which sign session cookies so
// logins survive restarts. Unset means a random per-boot secret.
func parseSecret(s string) ([]byte, error) {
	if s == "" {
		secret := make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			return nil, fmt.Errorf("session secret: %w", err)
		}
		return secret, nil
	}
	if len(s) < 32 {
		return nil, errors.New("TRAIL_SECRET must be at least 32 chars (e.g. openssl rand -hex 32)")
	}
	return []byte(s), nil
}

// spaHandler serves the built dashboard, falling back to index.html for
// client-side routes. Without a build it serves a short notice.
func spaHandler(fsys fs.FS) http.Handler {
	index, err := fs.ReadFile(fsys, "index.html")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintln(w, "trail: dashboard not built (run the web build, then rebuild the binary)")
		})
	}
	files := http.FileServerFS(fsys)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		if strings.HasPrefix(r.URL.Path, "/share/") {
			// The token is in the path: never send it on as a Referer, and keep the page out of search.
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name != "" && name != "index.html" {
			if fi, err := fs.Stat(fsys, name); err == nil && !fi.IsDir() {
				files.ServeHTTP(w, r)
				return
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(index)
	})
}

// serverTZ is the zone for day boundaries: TRAIL_TZ, else UTC.
func serverTZ() (*time.Location, error) {
	loc, err := time.LoadLocation(env("TRAIL_TZ", "UTC"))
	if err != nil {
		return nil, fmt.Errorf("TRAIL_TZ: %w", err)
	}
	return loc, nil
}
