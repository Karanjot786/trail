package query

import (
	"database/sql"
	"fmt"
	"time"
)

const setupWindow = 24 * time.Hour

// AISetupFor is the status behind the Unlock AI crawlers card at now: whether crawler requests
// are arriving (receiving: a hit in the last 24 h; quiet: only older hits; none: never) and the
// AI agent sessions that started in the last 24 h. Lists is left empty for the handler to fill.
func AISetupFor(db *sql.DB, site string, now time.Time) (AISetup, error) {
	res := AISetup{Crawls: AISetupCrawls{State: "none"}, Lists: []AIList{}}
	end := now.UnixMilli()
	since := now.Add(-setupWindow).UnixMilli()

	var last sql.NullInt64
	if err := db.QueryRow(`SELECT max(last_ts), coalesce(sum(CASE WHEN last_ts>? AND last_ts<=? THEN n END),0)
FROM crawl_hits WHERE site_id=?`, since, end, site).Scan(&last, &res.Crawls.Last24h); err != nil {
		return res, fmt.Errorf("ai setup crawls: %w", err)
	}
	if last.Valid {
		res.Crawls.LastAt = &last.Int64
		res.Crawls.State = "quiet"
		if last.Int64 > since {
			res.Crawls.State = "receiving"
		}
	}

	var agentLast sql.NullInt64
	if err := db.QueryRow(`SELECT max(ts) FROM events WHERE site_id=? AND agent<>'' AND ts<=?`, site, end).
		Scan(&agentLast); err != nil {
		return res, fmt.Errorf("ai setup agents: %w", err)
	}
	if agentLast.Valid {
		res.Agents.LastAt = &agentLast.Int64
	}
	// A session counts when it started in the window, so the start is read over the whole session.
	if err := db.QueryRow(`SELECT count(*) FROM (SELECT min(ts) AS start FROM events
  WHERE site_id=? AND agent<>'' AND session_id IN
    (SELECT session_id FROM events WHERE site_id=? AND agent<>'' AND ts BETWEEN ? AND ?)
  GROUP BY session_id) WHERE start BETWEEN ? AND ?`, site, site, since, end, since, end).Scan(&res.Agents.Last24h); err != nil {
		return res, fmt.Errorf("ai setup agent sessions: %w", err)
	}
	return res, nil
}

// GeoStatusFor is the location source that answered most of site's events in the 24 h before
// now (an empty source reads as db), with its share; nil when there were no events.
func GeoStatusFor(db *sql.DB, site string, now time.Time) (*GeoStatus, error) {
	var best string
	var bestN, total int
	err := forRows(db, `SELECT geo_src, count(*) FROM events WHERE site_id=? AND ts BETWEEN ? AND ? GROUP BY geo_src ORDER BY 2 DESC, 1`,
		[]any{site, now.Add(-setupWindow).UnixMilli(), now.UnixMilli()}, func(r *sql.Rows) error {
			var src string
			var n int
			if err := r.Scan(&src, &n); err != nil {
				return err
			}
			if total == 0 {
				best, bestN = src, n
			}
			total += n
			return nil
		})
	if err != nil {
		return nil, fmt.Errorf("geo status: %w", err)
	}
	if total == 0 {
		return nil, nil
	}
	if best == "" {
		best = "db"
	}
	return &GeoStatus{Source: best, Share: float64(bestN) / float64(total)}, nil
}
