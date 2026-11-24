// Package store persists events to SQLite through a batched, non-blocking writer.
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	sqlite "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

//go:embed schema.sql
var schema string

const (
	queueCap   = 10000
	batchSize  = 500
	flushEvery = time.Second
)

// Event is one tracked event. Props is a JSON object string.
type Event struct {
	SiteID, Type, AnonID, SessionID, UserID, Host, Path, Route string
	UTMSource, UTMMedium, UTMCampaign, UTMTerm, UTMContent     string
	RefHost, RefURL, Name, Props, Country, Region, City        string
	Device, Browser, OS, Env                                   string
	TS                                                         int64
	EngagedMs, ScrollPct                                       int
	IsBot                                                      bool
	Retry                                                      int    // how many times the tracker resent this event
	Agent                                                      string // AI agent id ("" = not an agent); IsBot is set too
	AgentVia                                                   string // how the agent was recognised: "" | ua | ip | relay | sig
	GeoSrc                                                     string // which source answered geo: "" (database) | vercel | cloudflare | netlify
}

// Store owns the database and the in-memory write queue.
type Store struct {
	db                                  *sql.DB
	path                                string
	queue                               chan Event
	kick                                chan struct{}
	mu                                  sync.Mutex // serialises Flush and guards closed
	qmu                                 sync.Mutex // serialises producers so a batch is admitted whole
	closed                              bool
	dropped                             atomic.Int64
	failed                              atomic.Int64
	pending                             []Event       // drained from the queue, not yet committed; guarded by mu
	pendCap                             int           // most events pending may hold (queueCap; tests lower it)
	every                               time.Duration // the timer flush interval (flushEvery; tests raise it)
	foldReady, foldFinished, foldWarned bool          // history fold state; only the writer goroutine touches them
	noFold                              atomic.Bool   // true: engage events are stored as rows (tests write unfolded history)
}

// Open opens (or creates) the database at path, enabling WAL and a 5 s busy timeout.
func Open(path string) (*Store, error) {
	dsn := "file:" + url.PathEscape(path) + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{
		db:      db,
		path:    path,
		queue:   make(chan Event, queueCap),
		kick:    make(chan struct{}, 1),
		every:   flushEvery,
		pendCap: queueCap,
	}, nil
}

// migrate adds columns that databases created by older versions lack, and drops indexes that
// newer ones make redundant.
func migrate(db *sql.DB) error {
	// events_site_session_ts(site_id, session_id, ts) serves every lookup the older
	// events_site_session(site_id, session_id) did (perf gate in internal/query/perf_test.go).
	if _, err := db.Exec(`DROP INDEX IF EXISTS events_site_session`); err != nil {
		return fmt.Errorf("drop events_site_session: %w", err)
	}
	cols := []struct{ name, def string }{
		{"retry", "retry INTEGER NOT NULL DEFAULT 0"},
		{"agent", "agent TEXT NOT NULL DEFAULT ''"},
		{"agent_via", "agent_via TEXT NOT NULL DEFAULT ''"},
		{"geo_src", "geo_src TEXT NOT NULL DEFAULT ''"},
	}
	for _, c := range cols {
		ok, err := hasColumn(db, "events", c.name)
		if err != nil {
			return err
		}
		if ok {
			continue
		}
		if _, err := db.Exec(`ALTER TABLE events ADD COLUMN ` + c.def); err != nil {
			return fmt.Errorf("add %s column: %w", c.name, err)
		}
	}
	// After the ALTERs: on old databases schema.sql runs before the agent column exists.
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS events_site_agent_ts ON events(site_id, ts) WHERE agent<>''`); err != nil {
		return fmt.Errorf("create events_site_agent_ts: %w", err)
	}
	if err := migrateCrawlHits(db); err != nil {
		return err
	}
	return migrateVersioned(db)
}

// migrateVersioned runs the numbered steps above PRAGMA user_version. Each step is idempotent.
func migrateVersioned(db *sql.DB) error {
	var v int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&v); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}
	if v < 1 {
		// Constant default: SQLite rewrites no rows, so this is instant on any size of database.
		ok, err := hasColumn(db, "events", "dwell_ms")
		if err != nil {
			return err
		}
		if !ok {
			if _, err := db.Exec(`ALTER TABLE events ADD COLUMN dwell_ms INTEGER NOT NULL DEFAULT 0`); err != nil {
				return fmt.Errorf("add dwell_ms column: %w", err)
			}
		}
		if _, err := db.Exec(fmt.Sprintf(`PRAGMA user_version=%d`, 1)); err != nil {
			return fmt.Errorf("set user_version: %w", err)
		}
	}
	if v < 2 {
		// New names, not reused ones, so a downgraded binary recreates its own full indexes. Create
		// before drop. Runs at Open, before ingest listens, so the index build blocks no writer.
		for _, q := range []string{
			`CREATE INDEX IF NOT EXISTS events_site_name_ts ON events(site_id, type, name, ts) WHERE name<>''`,
			`DROP INDEX IF EXISTS events_site_type_name_ts`,
			`DROP INDEX IF EXISTS events_site_user_ts`,
			`PRAGMA user_version=2`,
		} {
			if _, err := db.Exec(q); err != nil {
				return fmt.Errorf("migrate to v2: %w", err)
			}
		}
	}
	return nil
}

// hasColumn reports whether table has the named column.
func hasColumn(db *sql.DB, table, name string) (bool, error) {
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM pragma_table_info(?) WHERE name = ?`, table, name).Scan(&n); err != nil {
		return false, fmt.Errorf("inspect %s: %w", table, err)
	}
	return n > 0, nil
}

// migrateCrawlHits rebuilds a crawl_hits table that predates the verified key column.
func migrateCrawlHits(db *sql.DB) error {
	ok, err := hasColumn(db, "crawl_hits", "verified")
	if err != nil || ok {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin crawl_hits rebuild: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op after Commit
	stmts := []string{
		`CREATE TABLE crawl_hits_v2(site_id TEXT NOT NULL, hour INTEGER NOT NULL, bot TEXT NOT NULL, path TEXT NOT NULL,
			status INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL, last_ts INTEGER NOT NULL,
			PRIMARY KEY(site_id, hour, bot, path, status, verified)) WITHOUT ROWID`,
		`INSERT INTO crawl_hits_v2(site_id, hour, bot, path, status, verified, n, last_ts)
			SELECT site_id, hour, bot, path, status, 0, n, last_ts FROM crawl_hits`,
		`DROP TABLE crawl_hits`,
		`ALTER TABLE crawl_hits_v2 RENAME TO crawl_hits`,
	}
	for _, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return fmt.Errorf("rebuild crawl_hits: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit crawl_hits rebuild: %w", err)
	}
	return nil
}

// DB exposes the underlying database for read queries.
func (s *Store) DB() *sql.DB { return s.db }

// Dropped reports how many events were discarded because the queue was full.
func (s *Store) Dropped() int64 { return s.dropped.Load() }

// Enqueue queues e for the next flush. It never blocks: a full queue refuses
// the event and reports false.
func (s *Store) Enqueue(e Event) bool { return s.EnqueueBatch([]Event{e}) }

// EnqueueBatch queues all of evs or none. It never blocks. On refusal it counts
// len(evs) as dropped and returns false, so the caller can tell the client to retry
// without a half-stored batch being duplicated.
func (s *Store) EnqueueBatch(evs []Event) bool {
	s.qmu.Lock()
	// Only Flush receives from the queue, so free space can only grow while qmu is held.
	if cap(s.queue)-len(s.queue) < len(evs) {
		s.qmu.Unlock()
		s.dropped.Add(int64(len(evs)))
		return false
	}
	for _, e := range evs {
		s.queue <- e
	}
	full := len(s.queue) >= batchSize
	s.qmu.Unlock()
	if full {
		select {
		case s.kick <- struct{}{}:
		default:
		}
	}
	return true
}

// Pending reports how many events wait for a write retry.
func (s *Store) Pending() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.pending)
}

// Failed reports events dropped because SQLite rejected the row itself.
func (s *Store) Failed() int64 { return s.failed.Load() }

// retryable is false only for data errors, which a retry can never fix. Anything else
// (busy, locked, disk full, I/O, unknown) keeps the data: losing it silently is worse.
func retryable(err error) bool {
	var se *sqlite.Error
	if !errors.As(err, &se) {
		return true
	}
	switch se.Code() & 0xff {
	case sqlite3.SQLITE_CONSTRAINT, sqlite3.SQLITE_MISMATCH, sqlite3.SQLITE_TOOBIG, sqlite3.SQLITE_RANGE:
		return false
	}
	return true
}

// nextBackoff is 1 s after the first failure, doubling up to 30 s.
func nextBackoff(d time.Duration) time.Duration {
	if d <= 0 {
		return time.Second
	}
	return min(d*2, 30*time.Second)
}

// Start runs the background writer: it flushes every second, or as soon as
// 500 events are waiting, until ctx is cancelled. After a failed write it backs
// off (1 s doubling to 30 s) and keeps the batch for retry.
func (s *Store) Start(ctx context.Context) {
	go func() {
		t := time.NewTicker(s.every)
		defer t.Stop()
		var backoff time.Duration
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			case <-s.kick:
			}
			err := s.Flush()
			if err == nil {
				if backoff > 0 {
					log.Printf("store: write recovered")
					backoff = 0
				}
				s.foldTick()
				continue
			}
			if backoff == 0 {
				log.Printf("store: flush failed, keeping %d events for retry: %v", s.Pending(), err)
			}
			backoff = nextBackoff(backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
		}
	}()
}

// Flush writes the queued events, plus any batch a failed write left pending, in one
// transaction. A retryable failure keeps the batch pending and returns the error. A
// data error falls back to one transaction per event and drops only the rows SQLite rejects.
func (s *Store) Flush() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	for n := len(s.queue); n > 0 && len(s.pending) < s.pendCap; n-- {
		s.pending = append(s.pending, <-s.queue)
	}
	if len(s.pending) == 0 {
		return nil
	}
	err := s.write(s.pending)
	if err == nil {
		s.pending = nil
		return nil
	}
	if retryable(err) {
		return err
	}
	return s.salvage()
}

// salvage writes pending events one by one after a data error.
func (s *Store) salvage() error {
	var keep []Event
	var keepErr error
	var dropped int
	var lastBad error
	for _, e := range s.pending {
		err := s.write([]Event{e})
		switch {
		case err == nil:
		case retryable(err):
			keep, keepErr = append(keep, e), err
		default:
			dropped++
			lastBad = err
		}
	}
	s.pending = keep
	if dropped > 0 {
		s.failed.Add(int64(dropped))
		log.Printf("store: dropped %d unwritable events: %v", dropped, lastBad)
	}
	return keepErr
}

func (s *Store) write(batch []Event) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op after Commit

	ins, err := tx.Prepare(`INSERT INTO events (site_id, ts, type, anon_id, session_id, user_id,
		host, path, route, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
		referrer_host, referrer_url, name, props, engaged_ms, scroll_pct,
		country, region, city, device, browser, os, is_bot, env, retry, agent, agent_via, geo_src)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer ins.Close()
	idm, err := tx.Prepare(`INSERT OR IGNORE INTO identity_map (site_id, anon_id, user_id, ts) VALUES (?,?,?,?)`)
	if err != nil {
		return fmt.Errorf("prepare identity: %w", err)
	}
	defer idm.Close()
	var fold *sql.Stmt
	if !s.noFold.Load() {
		if fold, err = tx.Prepare(foldUpdateSQL); err != nil {
			return fmt.Errorf("prepare fold: %w", err)
		}
		defer fold.Close()
	}

	for _, e := range batch {
		if fold != nil && e.Type == "engage" {
			if ok, err := foldEngage(fold, e); err != nil {
				return fmt.Errorf("fold engage: %w", err)
			} else if ok {
				continue
			}
		}
		if _, err := ins.Exec(e.SiteID, e.TS, e.Type, e.AnonID, e.SessionID, e.UserID,
			e.Host, e.Path, e.Route, e.UTMSource, e.UTMMedium, e.UTMCampaign, e.UTMTerm, e.UTMContent,
			e.RefHost, e.RefURL, e.Name, e.Props, e.EngagedMs, e.ScrollPct,
			e.Country, e.Region, e.City, e.Device, e.Browser, e.OS, e.IsBot, e.Env, e.Retry, e.Agent, e.AgentVia, e.GeoSrc); err != nil {
			return fmt.Errorf("insert event: %w", err)
		}
		if e.Type == "identify" && e.UserID != "" && e.AnonID != "" {
			if _, err := idm.Exec(e.SiteID, e.AnonID, e.UserID, e.TS); err != nil {
				return fmt.Errorf("insert identity: %w", err)
			}
		}
	}
	return tx.Commit()
}

// Close flushes pending events and closes the database.
func (s *Store) Close() error {
	flushErr := s.Flush()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return flushErr
	}
	s.closed = true
	if n := len(s.pending); n > 0 {
		log.Printf("store: %d events lost at shutdown: %v", n, flushErr)
	}
	if err := s.db.Close(); err != nil {
		return err
	}
	return flushErr
}
