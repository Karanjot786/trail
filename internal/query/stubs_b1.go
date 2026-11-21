package query

// P0 stubs for B1's queries (plan §0.6). B1 deletes each stub as it implements it, then this file.

import (
	"context"
	"database/sql"
	"io"
)

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

// Campaigns lists UTM campaigns.
func Campaigns(db *sql.DB, p Params) ([]Campaign, error) { return nil, ErrNotImplemented }

// AIReferrals lists AI assistants that sent visitors.
func AIReferrals(db *sql.DB, p Params) ([]AIReferral, error) { return nil, ErrNotImplemented }

// ExportEvents streams the site's raw events as NDJSON.
func ExportEvents(ctx context.Context, db *sql.DB, site string, w io.Writer) error {
	return ErrNotImplemented
}
