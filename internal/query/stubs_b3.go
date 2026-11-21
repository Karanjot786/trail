package query

// P0 stubs for B3's queries (plan §0.6). B3 deletes each stub as it implements it, then this file.

import "database/sql"

// Crawlers returns the AI crawler report.
func Crawlers(db *sql.DB, p Params) (CrawlersResult, error) {
	return CrawlersResult{}, ErrNotImplemented
}

// CrawlTotal returns bot requests in [from, to] and whether crawler ingest is set up for the site.
func CrawlTotal(db *sql.DB, site string, from, to int64) (int, bool, error) {
	return 0, false, ErrNotImplemented
}
