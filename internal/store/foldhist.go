package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
)

const (
	foldChunk       = 5000      // rowids scanned per transaction
	compactMaxBytes = 256 << 20 // the writer vacuums by itself up to this file size
)

var freeBytesFn = freeBytes // tests stub the free-space probe

func dbSize(db *sql.DB) (int64, error) {
	var n int64
	err := db.QueryRow(`SELECT page_count*page_size FROM pragma_page_count, pragma_page_size`).Scan(&n)
	return n, err
}

func atoi(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

// foldBegin prepares the history fold and reports whether chunks may run. It sets the end mark
// (rows above it were written after the last fold, e.g. by an older binary) and, on the very
// first run, takes the pre-fold backup. With no room for the backup it logs once and waits.
func (s *Store) foldBegin() bool {
	if s.foldReady {
		return true
	}
	done, isDone, err := setting(s.db, "fold_done")
	if err != nil {
		log.Printf("store: fold: %v", err)
		return false
	}
	_, started, err := setting(s.db, "fold_cursor")
	if err != nil {
		log.Printf("store: fold: %v", err)
		return false
	}
	if !started && os.Getenv("TRAIL_FOLD_NO_BACKUP") != "1" {
		if _, err := os.Stat(s.path + ".pre-fold"); err != nil {
			size, serr := dbSize(s.db)
			free, known := freeBytesFn(filepath.Dir(s.path))
			if serr != nil || !known || float64(free) < 1.2*float64(size) {
				if !s.foldWarned {
					s.foldWarned = true
					log.Printf("store: history fold paused: need %d MB free for the backup at %s.pre-fold; free space or set TRAIL_FOLD_NO_BACKUP=1", size*12/10>>20+1, s.path)
				}
				return false
			}
			// The copy takes minutes on a big database: run it off the writer goroutine so
			// Flush keeps going. Chunks wait (return false) until the file exists.
			if s.backingUp.CompareAndSwap(false, true) {
				s.bwg.Add(1)
				go func() {
					defer s.bwg.Done()
					defer s.backingUp.Store(false)
					if _, err := backupFn(s.db, s.path); err != nil {
						log.Printf("store: history fold paused: %v", err)
					}
				}()
			}
			return false
		}
	}
	var maxID sql.NullInt64
	if err := s.db.QueryRow(`SELECT max(id) FROM events`).Scan(&maxID); err != nil {
		log.Printf("store: fold: %v", err)
		return false
	}
	tx, err := s.db.Begin()
	if err != nil {
		return false
	}
	defer func() { _ = tx.Rollback() }()
	switch {
	case isDone && maxID.Int64 > atoi(done):
		// Rows written since the last fold: fold that range only.
		if _, err = tx.Exec(`DELETE FROM settings WHERE key='fold_done'`); err == nil {
			err = setSetting(tx, "fold_cursor", done)
		}
		if err == nil {
			err = setSetting(tx, "fold_end", fmt.Sprint(maxID.Int64))
		}
	case isDone:
		s.foldFinished = true
	case !started:
		err = setSetting(tx, "fold_cursor", "0")
		if err == nil {
			err = setSetting(tx, "fold_end", fmt.Sprint(maxID.Int64))
		}
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		log.Printf("store: fold: %v", err)
		return false
	}
	s.foldReady = true
	return !s.foldFinished
}

// foldStep folds one rowid range of engage rows into their pageviews. One transaction also
// advances the cursor, so a crash resumes where it stopped, and max() makes a repeat a no-op.
// Engage rows with no pageview stay. It returns true once the end mark is reached.
func (s *Store) foldStep(chunk int64) (bool, error) {
	cur, started, err := setting(s.db, "fold_cursor")
	if err != nil {
		return false, err
	}
	endS, _, err := setting(s.db, "fold_end")
	if err != nil {
		return false, err
	}
	if _, isDone, _ := setting(s.db, "fold_done"); isDone || !started {
		return isDone, nil
	}
	lo, end := atoi(cur), atoi(endS)
	hi := min(lo+chunk, end)
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	steps := []struct {
		q    string
		args []any
	}{
		{`DROP TABLE IF EXISTS temp.m`, nil},
		{`CREATE TEMP TABLE m AS SELECT g.id AS gid, (SELECT p.id FROM events p WHERE p.site_id=g.site_id AND p.session_id=g.session_id
			AND p.type='pageview' AND p.path=g.path AND p.ts<=g.ts ORDER BY p.ts DESC, p.id DESC LIMIT 1) AS pid,
			g.engaged_ms AS em, g.scroll_pct AS sc, g.ts AS gts
			FROM events g WHERE g.id>? AND g.id<=? AND g.type='engage' AND g.session_id<>'' AND g.agent=''`, []any{lo, hi}},
		{`UPDATE events SET engaged_ms=max(engaged_ms, x.em), scroll_pct=max(scroll_pct, x.sc), dwell_ms=max(dwell_ms, x.gts-events.ts)
			FROM (SELECT pid, max(em) AS em, max(sc) AS sc, max(gts) AS gts FROM m WHERE pid IS NOT NULL GROUP BY pid) x WHERE events.id=x.pid`, nil},
		{`DELETE FROM events WHERE id IN (SELECT gid FROM m WHERE pid IS NOT NULL)`, nil},
		{`DROP TABLE temp.m`, nil},
	}
	for _, st := range steps {
		if _, err := tx.Exec(st.q, st.args...); err != nil {
			return false, fmt.Errorf("fold chunk: %w", err)
		}
	}
	if err := setSetting(tx, "fold_cursor", fmt.Sprint(hi)); err != nil {
		return false, err
	}
	finished := hi >= end
	if finished {
		if err := setSetting(tx, "fold_done", fmt.Sprint(end)); err != nil {
			return false, err
		}
	}
	return finished, tx.Commit()
}

// foldTick is one unit of background work: a fold chunk, then, once the history is folded, a
// single VACUUM to give the freed pages back (small files only).
func (s *Store) foldTick() {
	s.mu.Lock()
	closed := s.closed
	s.mu.Unlock()
	if closed || s.foldFinished || !s.foldBegin() {
		return
	}
	s.mu.Lock()
	done, err := s.foldStep(foldChunk)
	s.mu.Unlock()
	if err != nil {
		log.Printf("store: fold: %v", err)
		return
	}
	if !done {
		return
	}
	s.foldFinished = true
	log.Printf("store: history fold done")
	if _, ok, _ := setting(s.db, "fold_compacted"); ok {
		return
	}
	size, err := dbSize(s.db)
	if err != nil {
		return
	}
	if size > compactMaxBytes {
		log.Printf(`store: run "trail compact" in a quiet hour to return space to disk (needs %d MB free)`, size>>20+1)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	if _, err := s.db.Exec(`VACUUM`); err != nil {
		log.Printf("store: compact: %v", err)
		return
	}
	_ = setSetting(s.db, "fold_compacted", "1")
}

// Compact runs VACUUM on the database at path, returning freed pages to the disk. It needs as
// much free space as the file holds.
func Compact(path string) error {
	s, err := Open(path)
	if err != nil {
		return err
	}
	defer s.Close()
	size, err := dbSize(s.db)
	if err != nil {
		return err
	}
	if free, ok := freeBytesFn(filepath.Dir(path)); ok && free < uint64(size) {
		return fmt.Errorf("compact needs %d MB free next to %s", size>>20+1, path)
	}
	if _, err := s.db.Exec(`VACUUM`); err != nil {
		return fmt.Errorf("compact: %w", err)
	}
	return setSetting(s.db, "fold_compacted", "1")
}

// Unfold turns folded pageviews back into pageview plus engage row pairs, the shape older
// binaries read, and returns how many engage rows it inserted. The pageview's engagement
// columns are reset, so a second run finds nothing to do.
func Unfold(db *sql.DB) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()
	res, err := tx.Exec(`INSERT INTO events (site_id, ts, type, anon_id, session_id, user_id, host, path, route,
			utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer_host, referrer_url, name, props,
			engaged_ms, scroll_pct, country, region, city, device, browser, os, is_bot, env, retry, agent, agent_via, geo_src)
		SELECT site_id, ts+dwell_ms, 'engage', anon_id, session_id, user_id, host, path, route,
			utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer_host, referrer_url, '', '',
			engaged_ms, scroll_pct, country, region, city, device, browser, os, is_bot, env, 0, agent, agent_via, geo_src
		FROM events p WHERE type='pageview' AND (engaged_ms>0 OR dwell_ms>0) AND NOT EXISTS (
			SELECT 1 FROM events g WHERE g.site_id=p.site_id AND g.session_id=p.session_id AND g.type='engage'
			AND g.path=p.path AND g.ts=p.ts+p.dwell_ms)`)
	if err != nil {
		return 0, fmt.Errorf("unfold: %w", err)
	}
	n, _ := res.RowsAffected()
	if _, err := tx.Exec(`UPDATE events SET dwell_ms=0, engaged_ms=0, scroll_pct=0 WHERE type='pageview' AND (engaged_ms>0 OR dwell_ms>0 OR scroll_pct>0)`); err != nil {
		return 0, fmt.Errorf("unfold: %w", err)
	}
	return int(n), tx.Commit()
}
