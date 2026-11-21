// Command trail is a self-hosted web analytics server.
//
//	trail [serve]  run the server (default)
//	trail seed     fill TRAIL_DB with fake data
package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"log"
	mrand "math/rand/v2"
	"net/http"
	"os"
	"os/signal"
	"path"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"trail/internal/api"
	"trail/internal/auth"
	"trail/internal/demo"
	"trail/internal/enrich"
	"trail/internal/ingest"
	"trail/internal/mcp"
	"trail/internal/meta"
	"trail/internal/seed"
	"trail/internal/sites"
	"trail/internal/store"
	"trail/web"
)

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
		err = runSeed()
	default:
		fmt.Fprintln(os.Stderr, "usage: trail [serve|seed]")
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

func runSeed() error {
	sites, err := parseSites(os.Getenv("TRAIL_SITES"))
	if err != nil {
		return err
	}
	ids := []string{"demo", "docs"}
	if len(sites) > 0 {
		ids = ids[:0]
		for id := range sites {
			ids = append(ids, id)
		}
		slices.Sort(ids)
	}
	path := env("TRAIL_DB", "trail.db")
	st, err := store.Open(path)
	if err != nil {
		return err
	}
	specs := make([]seed.SiteSpec, 0, len(ids))
	for _, id := range ids {
		specs = append(specs, seed.SiteSpec{ID: id, Revenue: true, Crawlers: true})
	}
	if err := seed.Seed(st, specs, 30, 2000, time.Now(), mrand.New(mrand.NewPCG(uint64(time.Now().UnixNano()), 1))); err != nil {
		_ = st.Close()
		return err
	}
	if err := st.Close(); err != nil {
		return err
	}
	fmt.Printf("seeded %s for sites %v\n", path, ids)
	return nil
}

func runServe() error {
	password := os.Getenv("TRAIL_PASSWORD")
	if password == "" {
		fmt.Fprintln(os.Stderr, "trail: TRAIL_PASSWORD is required (it protects the dashboard)")
		os.Exit(1)
	}
	envSites, err := parseSites(os.Getenv("TRAIL_SITES"))
	if err != nil {
		return err
	}
	rps, err := parseRPS(os.Getenv("TRAIL_INGEST_RPS"))
	if err != nil {
		return err
	}
	tz, err := time.LoadLocation(env("TRAIL_TZ", "Asia/Kolkata"))
	if err != nil {
		return fmt.Errorf("TRAIL_TZ: %w", err)
	}
	geo, err := enrich.OpenGeo(os.Getenv("TRAIL_GEO_DB"))
	if err != nil {
		return err
	}
	defer geo.Close()
	secret, err := parseSecret(os.Getenv("TRAIL_SECRET"))
	if err != nil {
		return err
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
	if err != nil {
		return errors.Join(err, st.Close())
	}
	if len(reg.List()) == 0 {
		log.Print("no sites yet: add one in the dashboard (Settings) or with TRAIL_SITES")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	st.Start(ctx)

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		return err
	}
	a := auth.New(password, secret)
	a.SetTokens(tokens)
	var demoH http.Handler
	if os.Getenv("TRAIL_DEMO") == "1" {
		if demoH, err = demo.New(tz, time.Now); err != nil {
			return fmt.Errorf("demo: %w", err)
		}
		log.Print("demo: serving sample data at /demo and /api/demo/")
	}
	mux := routes(st, geo, reg, tz, a, dist, demoH, rps)

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
// rps limits ingest per client IP (0: no limit).
func routes(st *store.Store, geo *enrich.Geo, reg *sites.Registry, tz *time.Location, a *auth.Auth, dist fs.FS, demoH http.Handler, rps float64) *http.ServeMux {
	a.SetLookup(func(plain string) (auth.Token, bool) { return meta.LookupToken(st.DB(), plain) })
	apiH := api.New(st.DB(), reg, tz, api.WithEnvTokens(a.EnvTokens()))
	ingestOpts := []ingest.Option{ingest.WithPrivate(ingest.NewPrivate(tz, time.Now))}
	if rps > 0 {
		ingestOpts = append(ingestOpts, ingest.WithRateLimit(rps, int(max(1, 2*rps))))
	}
	v1 := a.API(rewrite("/api/v1/", "/api/", apiH))

	mux := http.NewServeMux()
	mux.Handle("/_t/e", ingest.New(st, geo, reg, ingestOpts...))
	mux.Handle("/_t/", ingest.TrackerFiles())
	mux.HandleFunc("POST /api/login", a.Login)
	mux.Handle("/api/", a.Require(apiH))
	mux.Handle("/api/v1/", v1) // scope matrix of plan §0.12
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
