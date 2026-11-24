package query

import (
	"database/sql"
	"fmt"
	"time"
)

const (
	heatWeeks     = 4
	heatThreshold = 150
	heatClearness = 1.2 // the peak is clear when it beats the runner-up by 20%
)

// Heatmap counts distinct visitor-hours by local weekday (Mon=0) and hour over the 28 days
// ending at the window end, in p.TZ (exact across DST). It ignores the dow and hour filters
// (they would empty the other cells). Under 150 visitor-hours the status is "sparse". The
// peak is "clear" when it is at least 1.2 times the runner-up; otherwise busiest names the
// best 3 to 6-hour band of the weekday or weekend averages.
func Heatmap(db *sql.DB, p Params) (HeatmapResult, error) {
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	to := p.To
	if p.Win.Key != "" {
		to = p.Win.To
	}
	from := dayAt(time.UnixMilli(to).In(loc), -(heatWeeks*7 - 1)).UnixMilli()
	res := HeatmapResult{From: from, To: to, Weeks: heatWeeks, Threshold: heatThreshold, Status: "sparse", Cells: make([][]int, 7)}
	for d := range res.Cells {
		res.Cells[d] = make([]int, 24)
	}
	hp := p
	hp.From, hp.To = from, to
	if _, ok := p.Filters["dow"]; ok || p.Filters["hour"] != "" {
		hp.Filters = map[string]string{}
		for k, v := range p.Filters {
			if k != "dow" && k != "hour" {
				hp.Filters[k] = v
			}
		}
	}
	cte, args, err := base(hp)
	if err != nil {
		return res, err
	}
	seen := map[string]bool{}
	err = forRows(db, cte+`SELECT ts, person FROM ev WHERE type<>'engage'`, args, func(r *sql.Rows) error {
		var ts int64
		var person string
		if err := r.Scan(&ts, &person); err != nil {
			return err
		}
		t := time.UnixMilli(ts).In(loc)
		key := person + t.Format("|2006-01-02T15")
		if seen[key] {
			return nil
		}
		seen[key] = true
		res.Cells[(int(t.Weekday())+6)%7][t.Hour()]++
		return nil
	})
	if err != nil {
		return res, fmt.Errorf("heatmap: %w", err)
	}
	runnerUp := 0
	for d, row := range res.Cells {
		for h, v := range row {
			res.Total += v
			switch {
			case v > res.Max:
				runnerUp, res.Max = res.Max, v
				res.Peak = &HeatPeak{Dow: d, Hour: h, Value: v}
			case v > runnerUp:
				runnerUp = v
			}
		}
	}
	if res.Total >= heatThreshold {
		res.Status = "ok"
	}
	if res.Peak == nil {
		return res, nil
	}
	res.Clear = float64(res.Max) >= heatClearness*float64(runnerUp)
	if !res.Clear {
		res.Busiest = busiestBand(res.Cells)
	}
	return res, nil
}

// busiestBand picks the group (weekdays Mon–Fri or weekend Sat–Sun) whose hourly averages
// have the best 3-hour band, then widens it to the longest band (up to 6 hours) whose mean
// stays within 90% of that best 3-hour mean.
func busiestBand(cells [][]int) *HeatBusiest {
	groups := []struct {
		name string
		dows []int
	}{{"Weekday", []int{0, 1, 2, 3, 4}}, {"Weekend", []int{5, 6}}}
	var best *HeatBusiest
	bestTop := -1.0
	for _, g := range groups {
		var avg [24]float64
		for h := range avg {
			for _, d := range g.dows {
				avg[h] += float64(cells[d][h])
			}
			avg[h] /= float64(len(g.dows))
		}
		bandMean := func(n int) (float64, int) {
			top, at := -1.0, 0
			for start := 0; start+n <= 24; start++ {
				sum := 0.0
				for h := start; h < start+n; h++ {
					sum += avg[h]
				}
				if m := sum / float64(n); m > top {
					top, at = m, start
				}
			}
			return top, at
		}
		top, start := bandMean(3)
		if top <= bestTop {
			continue
		}
		n := 3
		for k := 4; k <= 6; k++ {
			if m, s := bandMean(k); m >= 0.9*top {
				n, start = k, s
			}
		}
		bestTop = top
		best = &HeatBusiest{FromHour: start, ToHour: start + n, Dows: g.dows,
			Label: fmt.Sprintf("%s %s (%02d:00–%02d:00)", g.name, partOfDay(start, start+n), start, start+n)}
	}
	return best
}

// partOfDay names the part of the day a band [from, to) centres on.
func partOfDay(from, to int) string {
	switch mid := (from + to) / 2; {
	case mid < 5:
		return "nights"
	case mid < 12:
		return "mornings"
	case mid < 17:
		return "afternoons"
	case mid < 22:
		return "evenings"
	}
	return "nights"
}
