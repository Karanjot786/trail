package query

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// ErrBadFunnel is returned when a funnel definition fails validation or its name is taken.
var ErrBadFunnel = errors.New("bad funnel")

const maxFunnelsPerSite = 20

// funnelWindows are the allowed conversion windows (1h, 1d, 7d, 30d) in ms.
var funnelWindows = map[int64]bool{
	int64(time.Hour / time.Millisecond): true, int64(24 * time.Hour / time.Millisecond): true,
	int64(7 * 24 * time.Hour / time.Millisecond): true, int64(30 * 24 * time.Hour / time.Millisecond): true,
}

// ListFunnels returns site's funnels, oldest first. Never nil.
func ListFunnels(db *sql.DB, site string) ([]Funnel, error) {
	out := []Funnel{}
	err := forRows(db, `SELECT id, name, window_ms, steps, created FROM funnels WHERE site_id=? ORDER BY id`, []any{site},
		func(r *sql.Rows) error {
			f, err := scanFunnel(r)
			if err == nil {
				out = append(out, f)
			}
			return err
		})
	if err != nil {
		return nil, fmt.Errorf("list funnels: %w", err)
	}
	return out, nil
}

// GetFunnel returns one of site's funnels, or ErrNotFound.
func GetFunnel(db *sql.DB, site string, id int64) (Funnel, error) {
	f, err := scanFunnel(db.QueryRow(`SELECT id, name, window_ms, steps, created FROM funnels WHERE site_id=? AND id=?`, site, id))
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	if err != nil {
		return f, fmt.Errorf("get funnel: %w", err)
	}
	return f, nil
}

func scanFunnel(r interface{ Scan(...any) error }) (Funnel, error) {
	var f Funnel
	var steps string
	if err := r.Scan(&f.ID, &f.Name, &f.WindowMs, &steps, &f.Created); err != nil {
		return f, err
	}
	if err := json.Unmarshal([]byte(steps), &f.Steps); err != nil {
		return f, fmt.Errorf("funnel %d steps: %w", f.ID, err)
	}
	if f.Steps == nil {
		f.Steps = []FunnelStep{}
	}
	return f, nil
}

// validFunnel normalises f and checks it: name 1-60, 2-8 steps, each step a
// page or event with match 1-200 characters, window 1h, 1d, 7d or 30d.
func validFunnel(f Funnel) (Funnel, error) {
	f.Name = strings.TrimSpace(f.Name)
	if l := utf8.RuneCountInString(f.Name); l < 1 || l > 60 {
		return f, fmt.Errorf("%w: name must be 1-60 characters", ErrBadFunnel)
	}
	if !funnelWindows[f.WindowMs] {
		return f, fmt.Errorf("%w: windowMs must be 1 hour, 1 day, 7 days or 30 days", ErrBadFunnel)
	}
	if len(f.Steps) < 2 || len(f.Steps) > 8 {
		return f, fmt.Errorf("%w: a funnel has 2-8 steps", ErrBadFunnel)
	}
	for i, s := range f.Steps {
		s.Match, s.Label = strings.TrimSpace(s.Match), strings.TrimSpace(s.Label)
		if s.Kind != "page" && s.Kind != "event" {
			return f, fmt.Errorf("%w: step %d kind must be page or event", ErrBadFunnel, i+1)
		}
		if l := utf8.RuneCountInString(s.Match); l < 1 || l > 200 {
			return f, fmt.Errorf("%w: step %d match must be 1-200 characters", ErrBadFunnel, i+1)
		}
		if utf8.RuneCountInString(s.Label) > 60 {
			return f, fmt.Errorf("%w: step %d label must be at most 60 characters", ErrBadFunnel, i+1)
		}
		if s.Label == "" {
			s.Label = s.Match
		}
		f.Steps[i] = s
	}
	return f, nil
}

// CreateFunnel validates and stores f for site.
func CreateFunnel(db *sql.DB, site string, f Funnel) (Funnel, error) {
	f, err := validFunnel(f)
	if err != nil {
		return f, err
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM funnels WHERE site_id=?`, site).Scan(&n); err != nil {
		return f, fmt.Errorf("create funnel: %w", err)
	}
	if n >= maxFunnelsPerSite {
		return f, fmt.Errorf("%w: at most %d funnels per site", ErrBadFunnel, maxFunnelsPerSite)
	}
	steps, _ := json.Marshal(f.Steps)
	f.Created = time.Now().UnixMilli()
	res, err := db.Exec(`INSERT INTO funnels(site_id, name, window_ms, steps, created) VALUES(?,?,?,?,?)`,
		site, f.Name, f.WindowMs, string(steps), f.Created)
	if err != nil {
		return f, uniqueErr(err, ErrBadFunnel, f.Name, "create funnel")
	}
	if f.ID, err = res.LastInsertId(); err != nil {
		return f, fmt.Errorf("create funnel: %w", err)
	}
	return f, nil
}

// UpdateFunnel replaces the name, window and steps of site's funnel f.ID.
func UpdateFunnel(db *sql.DB, site string, f Funnel) (Funnel, error) {
	f, err := validFunnel(f)
	if err != nil {
		return f, err
	}
	steps, _ := json.Marshal(f.Steps)
	res, err := db.Exec(`UPDATE funnels SET name=?, window_ms=?, steps=? WHERE id=? AND site_id=?`,
		f.Name, f.WindowMs, string(steps), f.ID, site)
	if err != nil {
		return f, uniqueErr(err, ErrBadFunnel, f.Name, "update funnel")
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return f, ErrNotFound
	}
	return GetFunnel(db, site, f.ID)
}

// DeleteFunnel removes one of site's funnels.
func DeleteFunnel(db *sql.DB, site string, id int64) error {
	res, err := db.Exec(`DELETE FROM funnels WHERE id=? AND site_id=?`, id, site)
	if err != nil {
		return fmt.Errorf("delete funnel: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// uniqueErr turns a UNIQUE violation into a friendly validation error.
func uniqueErr(err, bad error, name, op string) error {
	if strings.Contains(err.Error(), "UNIQUE constraint") {
		return fmt.Errorf("%w: the name %q is already taken", bad, name)
	}
	return fmt.Errorf("%s: %w", op, err)
}
