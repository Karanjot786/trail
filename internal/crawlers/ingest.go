package crawlers

import (
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"
)

// maxPath caps a stored path (bytes, cut on a rune boundary).
const maxPath = 512

type hitKey struct {
	hour     int64
	bot      string
	path     string
	status   int
	verified bool
}

type hit struct{ n, last int64 }

// Ingest stores the records whose user agent is in the catalogue for site,
// adding to crawl_hits per hour x bot x path x status class (1 to 5, or 0 when
// the status is unknown) x verified. A record is verified when it has an IP
// and verify(bot, ip) says the IP is in the bot's published list; a nil
// verify leaves every record unverified. The path loses its query and
// fragment and is capped at 512 bytes. It returns how many records were kept.
func Ingest(db *sql.DB, site string, recs []Record, verify func(bot, ip string) bool) (int, error) {
	agg := map[hitKey]*hit{}
	kept := 0
	for _, r := range recs {
		name, _, _, ok := Lookup(r.UA)
		known := r.Status == 0 || (r.Status >= 100 && r.Status <= 599)
		if !ok || r.TS <= 0 || !known {
			continue
		}
		verified := verify != nil && r.IP != "" && verify(name, r.IP)
		k := hitKey{hour: r.TS - r.TS%3_600_000, bot: name, path: cleanPath(r.Path), status: r.Status / 100, verified: verified}
		h := agg[k]
		if h == nil {
			h = &hit{}
			agg[k] = h
		}
		h.n++
		h.last = max(h.last, r.TS)
		kept++
	}
	if len(agg) == 0 {
		return 0, nil
	}
	tx, err := db.Begin()
	if err != nil {
		return 0, fmt.Errorf("ingest crawls: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	stmt, err := tx.Prepare(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, verified, n, last_ts) VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(site_id, hour, bot, path, status, verified) DO UPDATE SET n=n+excluded.n, last_ts=max(last_ts, excluded.last_ts)`)
	if err != nil {
		return 0, fmt.Errorf("ingest crawls: %w", err)
	}
	defer stmt.Close()
	for k, h := range agg {
		if _, err := stmt.Exec(site, k.hour, k.bot, k.path, k.status, k.verified, h.n, h.last); err != nil {
			return 0, fmt.Errorf("ingest crawls: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("ingest crawls: %w", err)
	}
	return kept, nil
}

// LastTS is the newest stored crawl request for site (unix ms), 0 when none.
// `trail crawlers import --since auto` skips records at or before it.
func LastTS(db *sql.DB, site string) (int64, error) {
	var ts sql.NullInt64
	if err := db.QueryRow(`SELECT max(last_ts) FROM crawl_hits WHERE site_id=?`, site).Scan(&ts); err != nil {
		return 0, fmt.Errorf("last crawl: %w", err)
	}
	return ts.Int64, nil
}

func cleanPath(p string) string {
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	if i := strings.Index(p, "://"); i >= 0 { // absolute-form request target
		if j := strings.IndexByte(p[i+3:], '/'); j >= 0 {
			p = p[i+3+j:]
		} else {
			p = "/"
		}
	}
	if len(p) > maxPath {
		p = p[:maxPath]
		for !utf8.ValidString(p) {
			p = p[:len(p)-1]
		}
	}
	if p == "" {
		p = "/"
	}
	return p
}
