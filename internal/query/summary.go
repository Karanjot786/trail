package query

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const sparkDays = 7

// SitesSummary returns one All websites row per site: visitors in the window and the
// comparison window, people online now, and a 7-point spark of daily visitors ending today.
func SitesSummary(db *sql.DB, p Params, sites []string) ([]SiteSummary, error) {
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	out := make([]SiteSummary, 0, len(sites))
	for _, id := range sites {
		sp := p
		sp.Site = id
		row := SiteSummary{ID: id, Domain: id, Spark: []*float64{}}
		err := db.QueryRow(`SELECT domain FROM sites WHERE id=?`, id).Scan(&row.Domain)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("site %s: %w", id, err)
		}
		if row.Visitors, err = allVisitors(db, sp); err != nil {
			return nil, err
		}
		if pp, ok := prevParams(sp); ok {
			n, err := allVisitors(db, pp)
			if err != nil {
				return nil, err
			}
			row.PrevVisitors = &n
		}
		if row.Online, err = online(db, sp); err != nil {
			return nil, err
		}
		now := sp.now().In(loc)
		sk := sp
		sk.From, sk.To = dayAt(now, -(sparkDays-1)).UnixMilli(), now.UnixMilli()
		b := buckets{starts: bucketStarts(sk.From, sk.To, "day", loc), last: sparkDays - 1}
		pts, err := seriesPoints(db, sk, "visitors", b, nil)
		if err != nil {
			return nil, err
		}
		for _, pt := range pts {
			row.Spark = append(row.Spark, pt.V)
		}
		out = append(out, row)
	}
	return out, nil
}
