// Package store persists events to SQLite through a batched, non-blocking writer.
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite"
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
	Retry                                                      int // how many times the tracker resent this event
}

// Store owns the database and the in-memory write queue.
type Store struct {
	db      *sql.DB
	queue   chan Event
	kick    chan struct{}
	mu      sync.Mutex // serialises Flush and guards closed
	closed  bool
	dropped atomic.Int64
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
		db:    db,
		queue: make(chan Event, queueCap),
		kick:  make(chan struct{}, 1),
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
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM pragma_table_info('events') WHERE name = 'retry'`).Scan(&n); err != nil {
		return fmt.Errorf("inspect events: %w", err)
	}
	if n == 0 {
		if _, err := db.Exec(`ALTER TABLE events ADD COLUMN retry INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add retry column: %w", err)
		}
	}
	return nil
}

// DB exposes the underlying database for read queries.
func (s *Store) DB() *sql.DB { return s.db }

// Dropped reports how many events were discarded because the queue was full.
func (s *Store) Dropped() int64 { return s.dropped.Load() }

// Enqueue queues e for the next flush. It never blocks: a full queue drops the event.
func (s *Store) Enqueue(e Event) {
	select {
	case s.queue <- e:
	default:
		s.dropped.Add(1)
		return
	}
	if len(s.queue) >= batchSize {
		select {
		case s.kick <- struct{}{}:
		default:
		}
	}
}

// Start runs the background writer: it flushes every second, or as soon as
// 500 events are waiting, until ctx is cancelled.
func (s *Store) Start(ctx context.Context) {
	go func() {
		t := time.NewTicker(flushEvery)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			case <-s.kick:
			}
			if err := s.Flush(); err != nil {
				log.Printf("store: flush: %v", err)
			}
		}
	}()
}

// Flush writes every queued event in one transaction.
func (s *Store) Flush() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	n := len(s.queue)
	if n == 0 {
		return nil
	}
	batch := make([]Event, 0, n)
	for range n {
		batch = append(batch, <-s.queue)
	}
	return s.write(batch)
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
		country, region, city, device, browser, os, is_bot, env, retry)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer ins.Close()
	idm, err := tx.Prepare(`INSERT OR IGNORE INTO identity_map (site_id, anon_id, user_id, ts) VALUES (?,?,?,?)`)
	if err != nil {
		return fmt.Errorf("prepare identity: %w", err)
	}
	defer idm.Close()

	for _, e := range batch {
		if _, err := ins.Exec(e.SiteID, e.TS, e.Type, e.AnonID, e.SessionID, e.UserID,
			e.Host, e.Path, e.Route, e.UTMSource, e.UTMMedium, e.UTMCampaign, e.UTMTerm, e.UTMContent,
			e.RefHost, e.RefURL, e.Name, e.Props, e.EngagedMs, e.ScrollPct,
			e.Country, e.Region, e.City, e.Device, e.Browser, e.OS, e.IsBot, e.Env, e.Retry); err != nil {
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
	if err := s.db.Close(); err != nil {
		return err
	}
	return flushErr
}
