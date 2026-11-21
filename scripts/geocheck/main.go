// Command geocheck validates a DB-IP Lite Country mmdb before it replaces the
// embedded one: right database type, a recent build, and known answers.
//
//	go run ./scripts/geocheck path/to/dbip-country-lite.mmdb
package main

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strings"
	"time"

	"github.com/oschwald/maxminddb-golang/v2"
)

const maxAge = 120 * 24 * time.Hour // DB-IP ships monthly; older means a stale or wrong file

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: geocheck FILE.mmdb")
		os.Exit(2)
	}
	build, err := check(os.Args[1], time.Now())
	if err != nil {
		fmt.Fprintln(os.Stderr, "geocheck:", err)
		os.Exit(1)
	}
	fmt.Println(build)
}

// check returns the build month (YYYY-MM) of a valid country database.
func check(path string, now time.Time) (string, error) {
	db, err := maxminddb.Open(path)
	if err != nil {
		return "", err
	}
	defer db.Close()
	m := db.Metadata
	if !strings.HasPrefix(m.DatabaseType, "DBIP-Country") {
		return "", fmt.Errorf("database type %q, want DBIP-Country*", m.DatabaseType)
	}
	built := time.Unix(int64(m.BuildEpoch), 0).UTC() //nolint:gosec // epoch fits int64
	if age := now.Sub(built); age < -24*time.Hour || age > maxAge {
		return "", fmt.Errorf("build date %s is not recent", built.Format(time.DateOnly))
	}
	if m.NodeCount == 0 || m.IPVersion != 6 {
		return "", errors.New("empty tree or IPv4-only database")
	}
	for ip, want := range map[string]string{"8.8.8.8": "US", "49.36.0.1": "IN"} {
		var rec struct {
			Country struct {
				ISOCode string `maxminddb:"iso_code"`
			} `maxminddb:"country"`
		}
		if err := db.Lookup(netip.MustParseAddr(ip)).Decode(&rec); err != nil {
			return "", fmt.Errorf("lookup %s: %w", ip, err)
		}
		if rec.Country.ISOCode != want {
			return "", fmt.Errorf("%s resolved to %q, want %s", ip, rec.Country.ISOCode, want)
		}
	}
	return built.Format("2006-01"), nil
}
