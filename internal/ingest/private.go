package ingest

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"sync"
	"time"
)

const (
	sessIdle    = 30 * time.Minute
	sessMax     = 24 * time.Hour
	sweepEvery  = time.Minute
	maxSessions = 200_000 // /_t/e is unauthenticated: bound memory
	dayLayout   = "2006-01-02"
)

// Private derives cookieless identities for private-mode visitors.
//
// A visitor is hash(site|ip|ua) keyed by a random salt that changes every day
// at midnight in tz. Salts and sessions live only in memory: a restart forgets
// them, and neither the salt nor the IP is ever logged or stored.
type Private struct {
	tz  *time.Location
	now func() time.Time

	mu        sync.Mutex
	salts     map[string]*[32]byte // day (YYYY-MM-DD in tz) -> salt; today and yesterday only
	sess      map[string]*session  // anon -> current session
	lastSweep time.Time
	max       int // session cap; maxSessions unless a test lowers it
}

type session struct {
	id          string
	start, last time.Time
}

// NewPrivate returns a Private whose days roll over at midnight in tz.
func NewPrivate(tz *time.Location, now func() time.Time) *Private {
	return &Private{tz: tz, now: now, salts: map[string]*[32]byte{}, sess: map[string]*session{}, max: maxSessions}
}

// Identify returns the private-mode anon id ("p_" + 22 hex chars) and the
// server-side session id for a request.
func (p *Private) Identify(site, ip, ua string) (anon, sessionID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	t := p.now()
	local := t.In(p.tz)
	today, yday := local.Format(dayLayout), local.AddDate(0, 0, -1).Format(dayLayout)
	for k := range p.salts {
		if k != today && k != yday {
			delete(p.salts, k)
		}
	}

	// Keep a visit that started before midnight on yesterday's salt while its
	// session is still live; everyone else gets today's.
	if s := p.salts[yday]; s != nil {
		if a := anonID(s, site, ip, ua); p.live(p.sess[a], t) {
			anon = a
		}
	}
	if anon == "" {
		s := p.salts[today]
		if s == nil {
			s = new([32]byte)
			_, _ = rand.Read(s[:]) // never returns an error
			p.salts[today] = s
		}
		anon = anonID(s, site, ip, ua)
	}

	p.sweep(t)
	cur := p.sess[anon]
	if !p.live(cur, t) {
		if cur == nil && len(p.sess) >= p.max {
			// Full of live sessions: keep the event with a stable fallback id.
			return anon, fallbackSession(anon, t)
		}
		cur = &session{id: randomID(), start: t}
		p.sess[anon] = cur
	}
	cur.last = t
	return anon, cur.id
}

// sweep drops expired sessions at most once per sweepEvery.
func (p *Private) sweep(t time.Time) {
	if t.Sub(p.lastSweep) >= sweepEvery {
		p.sweepNow(t)
	}
}

func (p *Private) sweepNow(t time.Time) {
	p.lastSweep = t
	for k, s := range p.sess {
		if !p.live(s, t) {
			delete(p.sess, k)
		}
	}
}

// fallbackSession is a session id derived from the anon id and a 30-minute bucket.
func fallbackSession(anon string, t time.Time) string {
	sum := sha256.Sum256([]byte(anon + "|" + strconv.FormatInt(t.Unix()/int64(sessIdle/time.Second), 10)))
	return hex.EncodeToString(sum[:8])
}

func (p *Private) live(s *session, t time.Time) bool {
	return s != nil && t.Sub(s.last) <= sessIdle && t.Sub(s.start) < sessMax
}

func anonID(salt *[32]byte, site, ip, ua string) string {
	m := hmac.New(sha256.New, salt[:])
	m.Write([]byte(site + "|" + ip + "|" + ua))
	return "p_" + hex.EncodeToString(m.Sum(nil))[:22]
}

func randomID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
