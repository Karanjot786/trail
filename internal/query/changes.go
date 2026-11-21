package query

import (
	"database/sql"
	"fmt"
	"math"
	"sort"
	"time"
)

const (
	maxChanges      = 4
	changeDayMin    = 12   // a day item needs at least 12 visitors on the day…
	changeDayBefore = 5    // …and 5 the day before
	changeSourceMin = 5    // a source item needs a gain or loss of 5 visitors or more
	changeRateMin   = 0.01 // a rate item needs a move of 1 point or more
)

// Changes ranks the What changed items (plan §B1-6):
//   - day: on day-bucket windows, the day that added the most visitors over the day before
//     (at least 12 that day and 5 the day before), with the source that added the most;
//   - source: the source with the largest visitor gain or loss against the comparison period;
//   - rate: bounce rate and conversion rate when they moved by at least 1 point.
//
// Items are ranked by visitors added, then by the size of the change, and capped at 4.
func Changes(db *sql.DB, p Params) (ChangesResult, error) {
	res := ChangesResult{Items: []ChangeItem{}}
	type ranked struct {
		item         ChangeItem
		added, delta float64
	}
	var all []ranked
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	bucket := p.Win.Bucket
	if p.Win.Key == "" && p.To-p.From > int64(48*time.Hour/time.Millisecond) {
		bucket = "day"
	}
	if bucket == "day" {
		it, ok, err := dayChange(db, p, loc)
		if err != nil {
			return res, err
		}
		if ok {
			all = append(all, ranked{it, it.Added, it.Added})
		}
	}
	if pp, ok := prevParams(p); ok && !p.Win.Basis.None {
		cur, err := sourceVisitors(db, p)
		if err != nil {
			return res, err
		}
		prev, err := sourceVisitors(db, pp)
		if err != nil {
			return res, err
		}
		best, bestD := "", 0
		for _, k := range unionKeys(cur, prev) {
			if d := cur[k] - prev[k]; abs(d) > abs(bestD) {
				best, bestD = k, d
			}
		}
		if abs(bestD) >= changeSourceMin {
			all = append(all, ranked{ChangeItem{Kind: "source", Key: best, Cur: float64(cur[best]), Prev: float64(prev[best]),
				Basis: p.Win.Basis.Text}, float64(abs(bestD)), float64(abs(bestD))})
		}
		goal, err := convGoal(db, p.Site, p.Conv)
		if err != nil {
			return res, err
		}
		ct, err := totals(db, p, goal)
		if err != nil {
			return res, err
		}
		pt, err := totals(db, pp, goal)
		if err != nil {
			return res, err
		}
		if pt.Sessions > 0 && ct.Sessions > 0 && math.Abs(ct.Bounce-pt.Bounce) >= changeRateMin {
			all = append(all, ranked{ChangeItem{Kind: "rate", Metric: "bounce", Cur: ct.Bounce, Prev: pt.Bounce, N: pt.Sessions,
				Basis: p.Win.Basis.Text}, 0, math.Abs(ct.Bounce - pt.Bounce)})
		}
		if goal != nil && pt.BaseVisitors > 0 && ct.BaseVisitors > 0 && ct.ConvVisitors+pt.ConvVisitors > 0 &&
			math.Abs(ct.ConvRate-pt.ConvRate) >= changeRateMin {
			all = append(all, ranked{ChangeItem{Kind: "rate", Metric: "conversion", Cur: ct.ConvRate, Prev: pt.ConvRate,
				N: pt.BaseVisitors, Basis: p.Win.Basis.Text}, 0, math.Abs(ct.ConvRate - pt.ConvRate)})
		}
	}
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].added != all[j].added {
			return all[i].added > all[j].added
		}
		return all[i].delta > all[j].delta
	})
	for i := 0; i < len(all) && i < maxChanges; i++ {
		res.Items = append(res.Items, all[i].item)
	}
	return res, nil
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func unionKeys(a, b map[string]int) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range []map[string]int{a, b} {
		for k := range m {
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
	}
	sort.Strings(out)
	return out
}

// sourceVisitors counts distinct people per landing source.
func sourceVisitors(db *sql.DB, p Params) (map[string]int, error) {
	cte, args, err := base(p)
	if err != nil {
		return nil, err
	}
	out := map[string]int{}
	err = forRows(db, cte+`SELECT source, count(DISTINCT person) FROM (`+sessSrc+`) GROUP BY 1`, args, func(r *sql.Rows) error {
		var k string
		var n int
		if err := r.Scan(&k, &n); err != nil {
			return err
		}
		out[k] = n
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("source visitors: %w", err)
	}
	return out, nil
}

// dayChange finds the completed day of the window that added the most visitors over the day before.
func dayChange(db *sql.DB, p Params, loc *time.Location) (ChangeItem, bool, error) {
	dp := p
	dp.From = dayAt(time.UnixMilli(p.From).In(loc), -1).UnixMilli()
	cte, args, err := base(dp)
	if err != nil {
		return ChangeItem{}, false, err
	}
	dayKey := func(ms int64) string { return time.UnixMilli(ms).In(loc).Format("2006-01-02") }
	people := map[string]map[string]bool{}
	err = forRows(db, cte+`SELECT ts, person FROM ev`, args, func(r *sql.Rows) error {
		var ts int64
		var person string
		if err := r.Scan(&ts, &person); err != nil {
			return err
		}
		k := dayKey(ts)
		if people[k] == nil {
			people[k] = map[string]bool{}
		}
		people[k][person] = true
		return nil
	})
	if err != nil {
		return ChangeItem{}, false, fmt.Errorf("day visitors: %w", err)
	}
	bySource := map[string]map[string]map[string]bool{} // day → source → people
	err = forRows(db, cte+`SELECT start, source, person FROM (`+sessSrc+`)`, args, func(r *sql.Rows) error {
		var ts int64
		var src, person string
		if err := r.Scan(&ts, &src, &person); err != nil {
			return err
		}
		k := dayKey(ts)
		if bySource[k] == nil {
			bySource[k] = map[string]map[string]bool{}
		}
		if bySource[k][src] == nil {
			bySource[k][src] = map[string]bool{}
		}
		bySource[k][src][person] = true
		return nil
	})
	if err != nil {
		return ChangeItem{}, false, fmt.Errorf("day sources: %w", err)
	}
	today := dayKey(p.now().UnixMilli())
	var best ChangeItem
	found := false
	for _, start := range bucketStarts(p.From, p.To, "day", loc) {
		d := time.UnixMilli(start).In(loc)
		k, before := d.Format("2006-01-02"), dayAt(d, -1)
		if k == today { // a running day is not compared with a whole one
			continue
		}
		cur, prev := len(people[k]), len(people[before.Format("2006-01-02")])
		if cur < changeDayMin || prev < changeDayBefore || cur <= prev || found && float64(cur-prev) <= best.Added {
			continue
		}
		found = true
		best = ChangeItem{Kind: "day", Day: k, Cur: float64(cur), Prev: float64(prev), Added: float64(cur - prev),
			Basis: "vs " + weekdayLabel(before) + " (the day before)"}
		srcBefore := bySource[before.Format("2006-01-02")]
		topSrc, topGain := "", 0
		for _, s := range unionKeys(counts(bySource[k]), counts(srcBefore)) {
			if g := len(bySource[k][s]) - len(srcBefore[s]); g > topGain {
				topSrc, topGain = s, g
			}
		}
		if topSrc != "" {
			best.Source = &topSrc
		}
	}
	return best, found, nil
}

func counts(m map[string]map[string]bool) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = len(v)
	}
	return out
}
