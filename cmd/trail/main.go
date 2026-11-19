// Command trail is a self-hosted web analytics server.
//
//	trail [serve]  run the server (default)
//	trail seed     fill TRAIL_DB with fake data
package main

import (
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"slices"
	"strings"
	"time"

	"trail/internal/seed"
	"trail/internal/store"
)

func main() {
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "serve":
		fmt.Println("trail: serve (not implemented yet)")
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
	if err := seed.Seed(st, ids, 30, 2000, time.Now(), rand.New(rand.NewPCG(uint64(time.Now().UnixNano()), 1))); err != nil {
		_ = st.Close()
		return err
	}
	if err := st.Close(); err != nil {
		return err
	}
	fmt.Printf("seeded %s for sites %v\n", path, ids)
	return nil
}
