// Package sites is the registry of tracked sites: which ids ingest accepts and
// which browser origins may send events for each.
package sites

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"
)

// MaxOrigins caps a site's extra allowed origins.
const MaxOrigins = 20

var (
	ErrInvalid  = errors.New("invalid site")
	ErrExists   = errors.New("site already exists")
	ErrNotFound = errors.New("site not found")

	reID   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)
	reHost = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$`)
)

// Site is one tracked site. Origins are hosts (or *.suffix patterns) allowed
// besides Domain and its subdomains. Created is unix ms.
type Site struct {
	ID      string   `json:"id"`
	Domain  string   `json:"domain"`
	Origins []string `json:"origins"`
	Created int64    `json:"created"`
}

// Registry caches the sites table. Reads take a read lock; every write goes
// to the database first and then reloads the cache.
type Registry struct {
	db  *sql.DB
	now func() time.Time

	mu    sync.RWMutex
	sites map[string]Site

	rmu sync.Mutex
	rej map[string]*[24]bucket // site -> hourly rejected-origin counts, ring by hour
}

type bucket struct {
	hour int64
	n    int
}

// Open loads the registry from db, which must have the store schema applied.
func Open(db *sql.DB) (*Registry, error) {
	r := &Registry{db: db, now: time.Now, rej: map[string]*[24]bucket{}}
	return r, r.load()
}

func (r *Registry) load() error {
	rows, err := r.db.Query(`SELECT id, domain, origins, created FROM sites`)
	if err != nil {
		return fmt.Errorf("load sites: %w", err)
	}
	defer rows.Close()
	m := map[string]Site{}
	for rows.Next() {
		var s Site
		var origins string
		if err := rows.Scan(&s.ID, &s.Domain, &origins, &s.Created); err != nil {
			return fmt.Errorf("scan site: %w", err)
		}
		s.Origins = splitOrigins(origins)
		m[s.ID] = s
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("load sites: %w", err)
	}
	r.mu.Lock()
	r.sites = m
	r.mu.Unlock()
	return nil
}

func splitOrigins(s string) []string {
	out := []string{}
	for o := range strings.SplitSeq(s, ",") {
		if o != "" {
			out = append(out, o)
		}
	}
	return out
}

// Get returns the site with id.
func (r *Registry) Get(id string) (Site, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.sites[id]
	return s, ok
}

// List returns every site, sorted by id.
func (r *Registry) List() []Site {
	r.mu.RLock()
	out := make([]Site, 0, len(r.sites))
	for _, s := range r.sites {
		out = append(out, s)
	}
	r.mu.RUnlock()
	slices.SortFunc(out, func(a, b Site) int { return strings.Compare(a.ID, b.ID) })
	return out
}

// Add validates and inserts s, setting Created. A taken id is ErrExists.
func (r *Registry) Add(s Site) (Site, error) {
	s, err := normalize(s)
	if err != nil {
		return s, err
	}
	s.Created = r.now().UnixMilli()
	res, err := r.db.Exec(`INSERT OR IGNORE INTO sites(id, domain, origins, created) VALUES(?,?,?,?)`,
		s.ID, s.Domain, strings.Join(s.Origins, ","), s.Created)
	if err != nil {
		return s, fmt.Errorf("add site: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return s, ErrExists
	}
	return s, r.load()
}

// Update replaces the domain and origins of the site with s.ID.
func (r *Registry) Update(s Site) (Site, error) {
	s, err := normalize(s)
	if err != nil {
		return s, err
	}
	res, err := r.db.Exec(`UPDATE sites SET domain=?, origins=? WHERE id=?`, s.Domain, strings.Join(s.Origins, ","), s.ID)
	if err != nil {
		return s, fmt.Errorf("update site: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return s, ErrNotFound
	}
	if err := r.load(); err != nil {
		return s, err
	}
	s, _ = r.Get(s.ID)
	return s, nil
}

// purgeTables hold per-site rows deleted by Remove with purge.
var purgeTables = []string{"events", "goals", "identity_map", "funnels", "notes", "shares", "api_tokens", "views", "crawl_hits"}

// Remove deletes the site so ingest stops accepting it. With purge, its
// events, goals, identities, funnels, notes, share links, site-bound API
// tokens, saved views and crawler hits go too, in the same transaction.
func (r *Registry) Remove(id string, purge bool) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("remove site: %w", err)
	}
	defer func() { _ = tx.Rollback() }() // no-op after Commit
	res, err := tx.Exec(`DELETE FROM sites WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("remove site: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if purge {
		for _, table := range purgeTables {
			// security: table names are the fixed list above, never input.
			if _, err := tx.Exec(`DELETE FROM `+table+` WHERE site_id=?`, id); err != nil {
				return fmt.Errorf("purge %s: %w", table, err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("remove site: %w", err)
	}
	r.rmu.Lock()
	delete(r.rej, id)
	r.rmu.Unlock()
	return r.load()
}

// Allowed reports whether a browser on host may send events for site id:
// the site's domain or any subdomain, an entry in its origins, or a local
// dev host. host is a bare hostname (no scheme or port).
func (r *Registry) Allowed(id, host string) bool {
	s, ok := r.Get(id)
	if !ok {
		return false
	}
	host = strings.TrimSuffix(strings.ToLower(strings.Trim(host, "[]")), ".")
	switch host {
	case "":
		return false
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	if host == s.Domain || strings.HasSuffix(host, "."+s.Domain) {
		return true
	}
	for _, o := range s.Origins {
		if suffix, ok := strings.CutPrefix(o, "*"); ok {
			if strings.HasSuffix(host, suffix) { // suffix keeps its leading "."
				return true
			}
		} else if host == o {
			return true
		}
	}
	return false
}

// Reject counts one event refused for coming from an origin not allowed for
// site id. Unknown ids are not counted, so memory stays bounded by real sites.
func (r *Registry) Reject(id string) {
	if _, ok := r.Get(id); !ok {
		return
	}
	h := r.now().Unix() / 3600
	r.rmu.Lock()
	defer r.rmu.Unlock()
	ring := r.rej[id]
	if ring == nil {
		ring = new([24]bucket)
		r.rej[id] = ring
	}
	b := &ring[h%24]
	if b.hour != h {
		*b = bucket{hour: h}
	}
	b.n++
}

// Rejected24h is how many events Reject counted for id in about the last day
// (this hour and the 23 before it). It resets on restart.
func (r *Registry) Rejected24h(id string) int {
	h := r.now().Unix() / 3600
	r.rmu.Lock()
	defer r.rmu.Unlock()
	n := 0
	if ring := r.rej[id]; ring != nil {
		for _, b := range ring {
			if h-b.hour < 24 {
				n += b.n
			}
		}
	}
	return n
}

func normalize(s Site) (Site, error) {
	s.ID = strings.TrimSpace(s.ID)
	s.Domain = strings.ToLower(strings.TrimSpace(s.Domain))
	if !reID.MatchString(s.ID) {
		return s, fmt.Errorf("%w: id must be 1-40 chars of a-z, 0-9 and -, starting with a letter or digit", ErrInvalid)
	}
	if !isHost(s.Domain) {
		return s, fmt.Errorf("%w: domain must be a bare hostname like example.com (no scheme, path or port)", ErrInvalid)
	}
	origins := []string{}
	for _, o := range s.Origins {
		o = strings.ToLower(strings.TrimSpace(o))
		if o == "" || slices.Contains(origins, o) {
			continue
		}
		host, wild := strings.CutPrefix(o, "*.")
		if !isHost(host) || (wild && !strings.Contains(host, ".")) {
			return s, fmt.Errorf("%w: origin %q must be a hostname or *.example.com", ErrInvalid, o)
		}
		origins = append(origins, o)
	}
	if len(origins) > MaxOrigins {
		return s, fmt.Errorf("%w: at most %d origins", ErrInvalid, MaxOrigins)
	}
	s.Origins = origins
	return s, nil
}

func isHost(h string) bool { return len(h) <= 253 && reHost.MatchString(h) }
