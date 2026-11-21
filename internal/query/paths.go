package query

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const (
	maxPathRows  = 20 // rows in the paths report
	maxPathPages = 4  // pages kept before the goal; longer paths become first 2, "…", last 1
)

// PathsToGoal returns the most common paths converters took inside their converting visit:
// [source, up to 4 pages before the hit (repeats collapsed), goal name], ranked by people.
func PathsToGoal(db *sql.DB, p Params, goal int64) (PathsReport, error) {
	res := PathsReport{Rows: []PathRow{}}
	if err := needSite(p); err != nil {
		return res, err
	}
	g, err := getGoal(db, p.Site, goal)
	if err != nil {
		return res, err
	}
	res.Goal = g
	p, _ = withoutGoalFilter(p)
	hits, _, err := firstHits(db, p, g)
	if err != nil {
		return res, err
	}
	res.Converters = len(hits)
	if len(hits) == 0 {
		return res, nil
	}
	sessions := make([]string, len(hits))
	for i, h := range hits {
		sessions[i] = h.session
	}
	ids, err := json.Marshal(sessions)
	if err != nil {
		return res, err
	}
	type visit struct {
		source string
		pages  []pageAt
	}
	visits := map[string]*visit{}
	cte, args, err := base(p)
	if err != nil {
		return res, err
	}
	err = forRows(db, cte+`SELECT session_id, ts, path, `+sourceNameExpr+` FROM ev
WHERE type='pageview' AND session_id IN (SELECT value FROM json_each(?)) ORDER BY session_id, ts, id`,
		append(args, string(ids)), func(r *sql.Rows) error {
			var sid, path, src string
			var ts int64
			if err := r.Scan(&sid, &ts, &path, &src); err != nil {
				return err
			}
			v := visits[sid]
			if v == nil {
				v = &visit{source: src} // the visit's landing pageview carries its source
				visits[sid] = v
			}
			v.pages = append(v.pages, pageAt{ts, path})
			return nil
		})
	if err != nil {
		return res, fmt.Errorf("paths: %w", err)
	}

	byKey := map[string]*PathRow{}
	for _, h := range hits {
		v := visits[h.session]
		if v == nil {
			v = &visit{source: "Direct"}
		}
		steps := append([]string{v.source}, pathBefore(v.pages, h.ts)...)
		steps = append(steps, g.Name)
		k := strings.Join(steps, "\x00")
		r := byKey[k]
		if r == nil {
			r = &PathRow{Steps: steps}
			byKey[k] = r
		}
		r.People++
	}
	for _, r := range byKey {
		r.Share = float64(r.People) / float64(res.Converters)
		res.Rows = append(res.Rows, *r)
	}
	sort.Slice(res.Rows, func(i, j int) bool {
		a, b := res.Rows[i], res.Rows[j]
		if a.People != b.People {
			return a.People > b.People
		}
		return strings.Join(a.Steps, "\x00") < strings.Join(b.Steps, "\x00")
	})
	if len(res.Rows) > maxPathRows {
		res.Rows = res.Rows[:maxPathRows]
	}
	return res, nil
}

type pageAt struct {
	ts   int64
	path string
}

// pathBefore lists the pages viewed before ts, consecutive repeats collapsed; more than 4 become
// the first 2, "…" and the last 1.
func pathBefore(pages []pageAt, ts int64) []string {
	seq := []string{}
	for _, pg := range pages {
		if pg.ts >= ts {
			break
		}
		if len(seq) == 0 || seq[len(seq)-1] != pg.path {
			seq = append(seq, pg.path)
		}
	}
	if len(seq) > maxPathPages {
		seq = []string{seq[0], seq[1], "…", seq[len(seq)-1]}
	}
	return seq
}
