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
	hour   int64
	bot    string
	path   string
	status int
}

type hit struct{ n, last int64 }

// Ingest stores the records whose user agent is in the catalogue for site,
// adding to crawl_hits per hour x bot x path x status class (2, 3, 4 or 5).
// The path loses its query and fragment and is capped at 512 bytes. It returns
// how many records were kept.
func Ingest(db *sql.DB, site string, recs []Record) (int, error) {
	agg := map[hitKey]*hit{}
	kept := 0
	for _, r := range recs {
		name, _, _, ok := Lookup(r.UA)
		class := r.Status / 100
		if !ok || r.TS <= 0 || class < 1 || class > 5 {
			continue
		}
		k := hitKey{hour: r.TS - r.TS%3_600_000, bot: name, path: cleanPath(r.Path), status: class}
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
	stmt, err := tx.Prepare(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, n, last_ts) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(site_id, hour, bot, path, status) DO UPDATE SET n=n+excluded.n, last_ts=max(last_ts, excluded.last_ts)`)
	if err != nil {
		return 0, fmt.Errorf("ingest crawls: %w", err)
	}
	defer stmt.Close()
	for k, h := range agg {
		if _, err := stmt.Exec(site, k.hour, k.bot, k.path, k.status, h.n, h.last); err != nil {
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
