package store

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"os"
)

// schemaVersion is the PRAGMA user_version this binary migrates to.
const schemaVersion = 1

type execer interface {
	Exec(string, ...any) (sql.Result, error)
}

// setting reads one settings value.
func setting(db *sql.DB, key string) (string, bool, error) {
	var v []byte
	err := db.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("setting %s: %w", key, err)
	}
	return string(v), true, nil
}

func setSetting(q execer, key, value string) error {
	if _, err := q.Exec(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`, key, []byte(value)); err != nil {
		return fmt.Errorf("set %s: %w", key, err)
	}
	return nil
}

// backup copies the database to <dbPath>.pre-fold with VACUUM INTO, a read transaction, so
// ingest keeps writing. The copy is written to <dst>.tmp and renamed, so the final name only
// ever holds a complete copy; an existing one is kept and returned untouched.
func backup(db *sql.DB, dbPath string) (string, error) {
	dst := dbPath + ".pre-fold"
	if _, err := os.Stat(dst); err == nil {
		return dst, nil
	}
	tmp := dst + ".tmp"
	_ = os.Remove(tmp) // left by an interrupted run
	if _, err := db.Exec(`VACUUM INTO ?`, tmp); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("backup to %s: %w", dst, err)
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("backup to %s: %w", dst, err)
	}
	return dst, nil
}

// EngageKey is the 32-byte key that seals visit tokens, created once per database.
func (s *Store) EngageKey() []byte {
	fresh := make([]byte, 32)
	if _, err := rand.Read(fresh); err != nil {
		return nil
	}
	if _, err := s.db.Exec(`INSERT OR IGNORE INTO settings(key, value) VALUES('engage_key', ?)`, fresh); err != nil {
		return nil
	}
	var k []byte
	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key='engage_key'`).Scan(&k); err != nil || len(k) != 32 {
		return nil
	}
	return k
}

// foldTargetSQL picks the pageview an engage belongs to: the latest one of its session and
// path at or before it. It runs through events_site_session_ts.
const foldTargetSQL = `SELECT id FROM events WHERE site_id=? AND session_id=? AND type='pageview' AND path=? AND ts<=?
	ORDER BY ts DESC, id DESC LIMIT 1`

const foldUpdateSQL = `UPDATE events SET engaged_ms=max(engaged_ms,?), scroll_pct=max(scroll_pct,?), dwell_ms=max(dwell_ms, ?-ts)
	WHERE id=(` + foldTargetSQL + `)`

// foldEngage merges e into its pageview row and reports whether one absorbed it. An engage with
// no session, or no matching pageview, is left for the caller to store as a row.
func foldEngage(upd *sql.Stmt, e Event) (bool, error) {
	// An agent's engage can upgrade how the session was verified, which only its own row carries.
	if e.SessionID == "" || e.Agent != "" {
		return false, nil
	}
	res, err := upd.Exec(e.EngagedMs, e.ScrollPct, e.TS, e.SiteID, e.SessionID, e.Path, e.TS)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// SetFold turns folding engage events into their pageview on (the default) or off.
func (s *Store) SetFold(on bool) { s.noFold.Store(!on) }
