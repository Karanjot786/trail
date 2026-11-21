package meta

import (
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"trail/internal/share"
)

// ShareTTLs are the allowed share lifetimes; 0 means the link never expires.
var ShareTTLs = map[string]time.Duration{"24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour, "never": 0}

// CreateShare makes a read-only link to site. state is the dashboard URL
// query it opens with (its f filters are forced on every request). The token
// is returned once; only its SHA-256 is stored.
func CreateShare(db *sql.DB, site, label, state string, hideRevenue bool, ttl time.Duration) (Share, string, error) {
	label = strings.TrimSpace(label)
	state = strings.TrimPrefix(state, "?")
	var out Share
	switch {
	case utf8.RuneCountInString(label) > maxLabelRunes:
		return out, "", fmt.Errorf("%w: label must be at most %d characters", ErrInvalid, maxLabelRunes)
	case len(state) > maxViewState:
		return out, "", fmt.Errorf("%w: state must be at most %d bytes", ErrInvalid, maxViewState)
	case ttl != 0 && ttl != ShareTTLs["24h"] && ttl != ShareTTLs["7d"] && ttl != ShareTTLs["30d"]:
		return out, "", fmt.Errorf("%w: a link lasts 24h, 7d, 30d or never expires", ErrInvalid)
	}
	if _, err := url.ParseQuery(state); err != nil {
		return out, "", fmt.Errorf("%w: state must be a URL query string", ErrInvalid)
	}
	plain, hash, err := share.NewToken()
	if err != nil {
		return out, "", err
	}
	key, err := share.NewKey()
	if err != nil {
		return out, "", err
	}
	id, err := randomID("sh_")
	if err != nil {
		return out, "", err
	}
	now := time.Now()
	out = Share{ID: id, Label: label, Site: site, State: state, HideRevenue: hideRevenue, Created: now.UnixMilli()}
	if ttl > 0 {
		exp := now.Add(ttl).UnixMilli()
		out.Expires = &exp
	}
	_, err = db.Exec(`INSERT INTO shares(id, site_id, hash, pkey, label, state, hide_revenue, created, expires) VALUES(?,?,?,?,?,?,?,?,?)`,
		id, site, hash[:], key, label, state, hideRevenue, out.Created, out.Expires)
	if err != nil {
		return out, "", fmt.Errorf("create share: %w", err)
	}
	out.URL = "/share/" + plain
	return out, plain, nil
}

const shareCols = `id, site_id, label, state, hide_revenue, created, expires, last_used`

func scanShare(r interface{ Scan(...any) error }, extra ...any) (Share, error) {
	var s Share
	var exp, used sql.NullInt64
	dst := append([]any{&s.ID, &s.Site, &s.Label, &s.State, &s.HideRevenue, &s.Created, &exp, &used}, extra...)
	if err := r.Scan(dst...); err != nil {
		return s, err
	}
	if exp.Valid {
		s.Expires = &exp.Int64
	}
	if used.Valid {
		s.LastUsed = &used.Int64
	}
	return s, nil
}

// ListShares returns the links not revoked (expired ones included), newest first. Never nil.
func ListShares(db *sql.DB) ([]Share, error) {
	rows, err := db.Query(`SELECT ` + shareCols + ` FROM shares WHERE revoked IS NULL ORDER BY created DESC, id`)
	if err != nil {
		return nil, fmt.Errorf("list shares: %w", err)
	}
	defer rows.Close()
	out := []Share{}
	for rows.Next() {
		s, err := scanShare(rows)
		if err != nil {
			return nil, fmt.Errorf("list shares: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list shares: %w", err)
	}
	return out, nil
}

// RevokeShare revokes a link; its next request answers 410.
func RevokeShare(db *sql.DB, id string) error {
	return deleteOne(db, `UPDATE shares SET revoked=? WHERE id=? AND revoked IS NULL`, time.Now().UnixMilli(), id)
}

var shareTouch sync.Map // id → time.Time of the last last_used write

// LookupShare finds the link for plain at now. An expired or revoked link is
// ErrGone; an unknown one ErrNotFound. key is the link's pseudonym key.
func LookupShare(db *sql.DB, plain string, now time.Time) (Share, []byte, error) {
	if !strings.HasPrefix(plain, share.Prefix) || len(plain) != share.TokenLen {
		return Share{}, nil, ErrNotFound
	}
	hash := sha256.Sum256([]byte(plain))
	var key []byte
	var revoked sql.NullInt64
	s, err := scanShare(db.QueryRow(`SELECT `+shareCols+`, pkey, revoked FROM shares WHERE hash=?`, hash[:]), &key, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return s, nil, ErrNotFound
	}
	if err != nil {
		return s, nil, fmt.Errorf("lookup share: %w", err)
	}
	if revoked.Valid || (s.Expires != nil && now.UnixMilli() >= *s.Expires) {
		return s, nil, ErrGone
	}
	if prev, ok := shareTouch.Load(s.ID); !ok || now.Sub(prev.(time.Time)) >= lastUsedPeriod || now.Before(prev.(time.Time)) {
		shareTouch.Store(s.ID, now)
		_, _ = db.Exec(`UPDATE shares SET last_used=? WHERE id=?`, now.UnixMilli(), s.ID)
	}
	return s, key, nil
}
