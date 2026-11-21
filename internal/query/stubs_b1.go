package query

// P0 stubs for B1's queries (plan §0.6). B1 deletes each stub as it implements it, then this file.

import (
	"context"
	"database/sql"
	"io"
	"time"
)

// ResolveWindow turns range + cmp + tz into a Window (§0.3).
func ResolveWindow(rangeKey, cmp string, now time.Time, loc *time.Location, dataStart int64) (Window, error) {
	return Window{}, ErrNotImplemented
}

// SiteFeatures reports which optional screens a site has data for.
func SiteFeatures(db *sql.DB, site string) (Features, error) { return Features{}, ErrNotImplemented }

// SitesSummary returns one All websites row per site.
func SitesSummary(db *sql.DB, p Params, sites []string) ([]SiteSummary, error) {
	return nil, ErrNotImplemented
}

// Changes ranks the What changed items.
func Changes(db *sql.DB, p Params) (ChangesResult, error) { return ChangesResult{}, ErrNotImplemented }

// Heatmap returns visitors by weekday and hour over the last four weeks.
func Heatmap(db *sql.DB, p Params) (HeatmapResult, error) { return HeatmapResult{}, ErrNotImplemented }

// Live returns the last minutes of activity.
func Live(db *sql.DB, p Params) (LiveResult, error) { return LiveResult{}, ErrNotImplemented }

// Sessions lists sessions (optionally one person's) and the total count.
func Sessions(db *sql.DB, p Params, person string) ([]SessionRow, int, error) {
	return nil, 0, ErrNotImplemented
}

// Campaigns lists UTM campaigns.
func Campaigns(db *sql.DB, p Params) ([]Campaign, error) { return nil, ErrNotImplemented }

// AIReferrals lists AI assistants that sent visitors.
func AIReferrals(db *sql.DB, p Params) ([]AIReferral, error) { return nil, ErrNotImplemented }

// ExportEvents streams the site's raw events as NDJSON.
func ExportEvents(ctx context.Context, db *sql.DB, site string, w io.Writer) error {
	return ErrNotImplemented
}

// FirstTouch builds the first-touch attribution CTE for persons (B1 Task 2).
func FirstTouch(db *sql.DB, p Params, persons string, args []any) (string, []any) { return "", args }
