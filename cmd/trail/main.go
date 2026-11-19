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
	"strings"
	"syscall"
	"time"

	"trail/internal/api"
	"trail/internal/auth"
	"trail/internal/enrich"
	"trail/internal/ingest"
	"trail/internal/seed"
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
	if err := seed.Seed(st, ids, 30, 2000, time.Now(), mrand.New(mrand.NewPCG(uint64(time.Now().UnixNano()), 1))); err != nil {
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
	sites, err := parseSites(os.Getenv("TRAIL_SITES"))
	if err != nil {
		return err
	}
	if len(sites) == 0 {
		log.Print("warning: TRAIL_SITES is empty, so every ingest request will be rejected")
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
	st, err := store.Open(env("TRAIL_DB", "trail.db"))
	if err != nil {
		return err
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return fmt.Errorf("session secret: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	st.Start(ctx)

	dist, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		return err
	}
	a := auth.New(password, secret)
	mux := http.NewServeMux()
	mux.Handle("/_t/e", ingest.New(st, geo, sites))
	mux.Handle("/_t/t.js", ingest.TrackerHandler(ingest.JS))
	mux.HandleFunc("POST /api/login", a.Login)
	mux.Handle("/api/", a.Require(api.New(st.DB(), sites, tz)))
	mux.Handle("/", spaHandler(dist))

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
	log.Printf("trail listening on %s (sites: %d)", srv.Addr, len(sites))

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
