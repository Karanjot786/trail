package meta

import (
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	// ErrInvalid wraps every validation failure (400).
	ErrInvalid = errors.New("invalid")
	// ErrExists is returned for a name that is already taken (409).
	ErrExists = errors.New("already exists")
	// ErrNotFound is returned for an id that does not exist (404).
	ErrNotFound = errors.New("not found")
	// ErrGone is returned for an expired or revoked share link (410).
	ErrGone = errors.New("this link has expired or was revoked")
)

const (
	maxNotes      = 1000 // per list call
	maxViews      = 50
	maxViewState  = 2 << 10
	maxLabelRunes = 80
	maxNameRunes  = 60
)

var noteKinds = map[string]bool{"deploy": true, "campaign": true, "press": true, "other": true}

// ListNotes returns site's notes with ts in [from, to], oldest first. Never nil.
func ListNotes(db *sql.DB, site string, from, to int64) ([]Note, error) {
	rows, err := db.Query(`SELECT id, site_id, ts, label, kind FROM notes WHERE site_id=? AND ts BETWEEN ? AND ?
		ORDER BY ts, id LIMIT ?`, site, from, to, maxNotes)
	if err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}
	defer rows.Close()
	out := []Note{}
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.Site, &n.TS, &n.Label, &n.Kind); err != nil {
			return nil, fmt.Errorf("list notes: %w", err)
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}
	return out, nil
}

// AddNote validates and stores n. Kind defaults to "other".
func AddNote(db *sql.DB, n Note) (Note, error) {
	n.Label = strings.TrimSpace(n.Label)
	if n.Kind == "" {
		n.Kind = "other"
	}
	switch l := utf8.RuneCountInString(n.Label); {
	case l < 1 || l > maxLabelRunes:
		return n, fmt.Errorf("%w: label must be 1-%d characters", ErrInvalid, maxLabelRunes)
	case !noteKinds[n.Kind]:
		return n, fmt.Errorf("%w: kind must be deploy, campaign, press or other", ErrInvalid)
	case n.TS <= 0:
		return n, fmt.Errorf("%w: ts must be a unix ms time", ErrInvalid)
	}
	res, err := db.Exec(`INSERT INTO notes(site_id, ts, label, kind, created) VALUES(?,?,?,?,?)`,
		n.Site, n.TS, n.Label, n.Kind, time.Now().UnixMilli())
	if err != nil {
		return n, fmt.Errorf("add note: %w", err)
	}
	if n.ID, err = res.LastInsertId(); err != nil {
		return n, fmt.Errorf("add note: %w", err)
	}
	return n, nil
}

// DeleteNote removes one of site's notes.
func DeleteNote(db *sql.DB, site string, id int64) error {
	return deleteOne(db, `DELETE FROM notes WHERE id=? AND site_id=?`, id, site)
}

func deleteOne(db *sql.DB, q string, args ...any) error {
	res, err := db.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListViews returns every saved view, oldest first. Never nil.
func ListViews(db *sql.DB) ([]SavedView, error) {
	rows, err := db.Query(`SELECT id, name, site_id, state, created FROM views ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list views: %w", err)
	}
	defer rows.Close()
	out := []SavedView{}
	for rows.Next() {
		var v SavedView
		var site sql.NullString
		if err := rows.Scan(&v.ID, &v.Name, &site, &v.State, &v.Created); err != nil {
			return nil, fmt.Errorf("list views: %w", err)
		}
		if site.Valid {
			v.Site = &site.String
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list views: %w", err)
	}
	return out, nil
}

// AddView validates and stores v: name 1-60 characters, state a query string of
// at most 2 KB, and at most 50 views in all.
func AddView(db *sql.DB, v SavedView) (SavedView, error) {
	v.Name = strings.TrimSpace(v.Name)
	v.State = strings.TrimPrefix(v.State, "?")
	if l := utf8.RuneCountInString(v.Name); l < 1 || l > maxNameRunes {
		return v, fmt.Errorf("%w: name must be 1-%d characters", ErrInvalid, maxNameRunes)
	}
	if len(v.State) > maxViewState {
		return v, fmt.Errorf("%w: state must be at most %d bytes", ErrInvalid, maxViewState)
	}
	if _, err := url.ParseQuery(v.State); err != nil {
		return v, fmt.Errorf("%w: state must be a URL query string", ErrInvalid)
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM views`).Scan(&n); err != nil {
		return v, fmt.Errorf("add view: %w", err)
	}
	if n >= maxViews {
		return v, fmt.Errorf("%w: at most %d saved views", ErrInvalid, maxViews)
	}
	v.Created = time.Now().UnixMilli()
	res, err := db.Exec(`INSERT INTO views(name, site_id, state, created) VALUES(?,?,?,?)`, v.Name, v.Site, v.State, v.Created)
	if err != nil {
		return v, fmt.Errorf("add view: %w", err)
	}
	if v.ID, err = res.LastInsertId(); err != nil {
		return v, fmt.Errorf("add view: %w", err)
	}
	return v, nil
}

// DeleteView removes a saved view. A non-empty site limits the delete to that
// site's own views; a miss is ErrNotFound, so hidden views stay hidden.
func DeleteView(db *sql.DB, id int64, site string) error {
	if site != "" {
		return deleteOne(db, `DELETE FROM views WHERE id=? AND site_id=?`, id, site)
	}
	return deleteOne(db, `DELETE FROM views WHERE id=?`, id)
}
