package query

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const maxGoalsPerSite = 50

// ErrBadGoal is returned when a goal fails validation or its name is taken.
var ErrBadGoal = errors.New("bad goal")

// ErrGoalNotFound is returned when a goal id does not exist for the site.
var ErrGoalNotFound = errors.New("goal not found")

// Goal is a conversion target: a page path (optionally ending in *) or a custom event name.
type Goal struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Match string `json:"match"`
}

// GoalPrev is a goal's numbers for the previous equal-length range.
type GoalPrev struct {
	Conversions int     `json:"conversions"`
	Visitors    int     `json:"visitors"`
	Rate        float64 `json:"rate"`
}

// GoalRow is one /api/goals/report row. Rate is goal visitors / all visitors (0–1).
type GoalRow struct {
	Goal
	Conversions int      `json:"conversions"`
	Visitors    int      `json:"visitors"`
	Rate        float64  `json:"rate"`
	Prev        GoalPrev `json:"prev"`
}

// DeliveryResult is the /api/delivery payload.
type DeliveryResult struct {
	Events      int     `json:"events"`
	Retried     int     `json:"retried"`
	RetriedRate float64 `json:"retriedRate"`
}

// ListGoals returns the site's goals, oldest first. Never nil.
func ListGoals(db *sql.DB, site string) ([]Goal, error) {
	out := []Goal{}
	err := forRows(db, `SELECT id, name, kind, match FROM goals WHERE site_id=? ORDER BY id`, []any{site}, func(r *sql.Rows) error {
		var g Goal
		if err := r.Scan(&g.ID, &g.Name, &g.Kind, &g.Match); err != nil {
			return err
		}
		out = append(out, g)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list goals: %w", err)
	}
	return out, nil
}

// CreateGoal validates and stores g for site. Validation failures wrap ErrBadGoal.
func CreateGoal(db *sql.DB, site string, g Goal) (Goal, error) {
	g, err := validGoal(g)
	if err != nil {
		return g, err
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM goals WHERE site_id=?`, site).Scan(&n); err != nil {
		return g, fmt.Errorf("create goal: %w", err)
	}
	if n >= maxGoalsPerSite {
		return g, fmt.Errorf("%w: at most %d goals per site", ErrBadGoal, maxGoalsPerSite)
	}
	res, err := db.Exec(`INSERT INTO goals(site_id, name, kind, match, created) VALUES(?,?,?,?,?)`,
		site, g.Name, g.Kind, g.Match, time.Now().UnixMilli())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			return g, fmt.Errorf("%w: a goal named %q already exists", ErrBadGoal, g.Name)
		}
		return g, fmt.Errorf("create goal: %w", err)
	}
	if g.ID, err = res.LastInsertId(); err != nil {
		return g, fmt.Errorf("create goal: %w", err)
	}
	return g, nil
}

// validGoal trims g and checks name 1-60, kind page|event and match 1-200.
func validGoal(g Goal) (Goal, error) {
	g.Name, g.Match = strings.TrimSpace(g.Name), strings.TrimSpace(g.Match)
	nameLen, matchLen := utf8.RuneCountInString(g.Name), utf8.RuneCountInString(g.Match)
	switch {
	case nameLen < 1 || nameLen > 60:
		return g, fmt.Errorf("%w: name must be 1-60 characters", ErrBadGoal)
	case g.Kind != "page" && g.Kind != "event":
		return g, fmt.Errorf("%w: kind must be page or event", ErrBadGoal)
	case matchLen < 1 || matchLen > 200:
		return g, fmt.Errorf("%w: match must be 1-200 characters", ErrBadGoal)
	}
	return g, nil
}

// UpdateGoal replaces the name, kind and match of site's goal g.ID, or returns ErrGoalNotFound.
func UpdateGoal(db *sql.DB, site string, g Goal) (Goal, error) {
	g, err := validGoal(g)
	if err != nil {
		return g, err
	}
	res, err := db.Exec(`UPDATE goals SET name=?, kind=?, match=? WHERE id=? AND site_id=?`, g.Name, g.Kind, g.Match, g.ID, site)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			return g, fmt.Errorf("%w: a goal named %q already exists", ErrBadGoal, g.Name)
		}
		return g, fmt.Errorf("update goal: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return g, ErrGoalNotFound
	}
	return g, nil
}

// DeleteGoal removes a goal of site, or returns ErrGoalNotFound.
func DeleteGoal(db *sql.DB, site string, id int64) error {
	res, err := db.Exec(`DELETE FROM goals WHERE id=? AND site_id=?`, id, site)
	if err != nil {
		return fmt.Errorf("delete goal: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrGoalNotFound
	}
	return nil
}

// GoalReport returns every goal of p.Site with conversions, visitors and rate for
// the range and the previous equal-length range. It reuses the dashboard filters.
func GoalReport(db *sql.DB, p Params) ([]GoalRow, error) {
	goals, err := ListGoals(db, p.Site)
	if err != nil {
		return nil, err
	}
	out := make([]GoalRow, 0, len(goals))
	prev := p
	prev.From, prev.To = p.From-(p.To-p.From), p.From-1
	curTotal, err := allVisitors(db, p)
	if err != nil {
		return nil, err
	}
	prevTotal, err := allVisitors(db, prev)
	if err != nil {
		return nil, err
	}
	for _, g := range goals {
		cur, err := goalNumbers(db, p, g, curTotal)
		if err != nil {
			return nil, err
		}
		pr, err := goalNumbers(db, prev, g, prevTotal)
		if err != nil {
			return nil, err
		}
		out = append(out, GoalRow{Goal: g, Conversions: cur.Conversions, Visitors: cur.Visitors, Rate: cur.Rate, Prev: pr})
	}
	return out, nil
}

// allVisitors counts distinct visitors in range (the rate denominator).
func allVisitors(db *sql.DB, p Params) (int, error) {
	cte, args, err := base(p)
	if err != nil {
		return 0, err
	}
	var total int
	if err := db.QueryRow(cte+`SELECT count(DISTINCT person) FROM ev`, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("goal visitors: %w", err)
	}
	return total, nil
}

func goalNumbers(db *sql.DB, p Params, g Goal, total int) (GoalPrev, error) {
	var n GoalPrev
	cte, args, err := base(p)
	if err != nil {
		return n, err
	}
	var where string
	switch {
	case g.Kind == "event":
		where, args = "type='event' AND name=?", append(args, g.Match)
	case strings.HasSuffix(g.Match, "*"):
		// substr = is case-sensitive like the exact-path goal; LIKE is not.
		prefix := strings.TrimSuffix(g.Match, "*")
		where, args = `type='pageview' AND substr(path, 1, length(?)) = ?`, append(args, prefix, prefix)
	default:
		where, args = "type='pageview' AND path=?", append(args, g.Match)
	}
	if err := db.QueryRow(cte+`SELECT count(*), count(DISTINCT person) FROM ev WHERE `+where, args...).
		Scan(&n.Conversions, &n.Visitors); err != nil {
		return n, fmt.Errorf("goal %q: %w", g.Name, err)
	}
	if total > 0 {
		n.Rate = float64(n.Visitors) / float64(total)
	}
	return n, nil
}

// Delivery counts non-bot events in range and those that arrived on a retry.
func Delivery(db *sql.DB, p Params) (DeliveryResult, error) {
	var d DeliveryResult
	cte, args, err := base(p)
	if err != nil {
		return d, err
	}
	if err := db.QueryRow(cte+`SELECT count(*), coalesce(sum(retry>=1),0) FROM ev`, args...).
		Scan(&d.Events, &d.Retried); err != nil {
		return d, fmt.Errorf("delivery: %w", err)
	}
	if d.Events > 0 {
		d.RetriedRate = float64(d.Retried) / float64(d.Events)
	}
	return d, nil
}
