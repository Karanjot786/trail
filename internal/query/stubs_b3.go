package query

// P0 stubs for B3's queries (plan §0.6). B3 deletes each stub as it implements it, then this file.

import "database/sql"

// GoalDetail returns one goal's numbers and first-touch credit.
func GoalDetail(db *sql.DB, p Params, id int64) (GoalDetailResult, error) {
	return GoalDetailResult{}, ErrNotImplemented
}

// PathsToGoal returns the common paths converters took.
func PathsToGoal(db *sql.DB, p Params, goal int64) (PathsReport, error) {
	return PathsReport{}, ErrNotImplemented
}

// FunnelReport runs a stored funnel over the window.
func FunnelReport(db *sql.DB, p Params, id int64) (FunnelReportResult, error) {
	return FunnelReportResult{}, ErrNotImplemented
}

// FunnelDropoff lists people who left after step, and the total count.
func FunnelDropoff(db *sql.DB, p Params, id int64, step int) ([]DropoffPerson, int, error) {
	return nil, 0, ErrNotImplemented
}

// Crawlers returns the AI crawler report.
func Crawlers(db *sql.DB, p Params) (CrawlersResult, error) {
	return CrawlersResult{}, ErrNotImplemented
}

// CrawlTotal returns bot requests in [from, to] and whether crawler ingest is set up for the site.
func CrawlTotal(db *sql.DB, site string, from, to int64) (int, bool, error) {
	return 0, false, ErrNotImplemented
}
