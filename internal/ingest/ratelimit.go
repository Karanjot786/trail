package ingest

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"trail/internal/netx"
)

// maxLimiters bounds the per-IP rate limit map; /_t/e is unauthenticated.
const maxLimiters = 100_000

// limiter is a token bucket per client. Keys are an HMAC of the IP under a
// random per-process key, so the map never holds a raw (or brute-forceable) IP.
type limiter struct {
	rps   rate.Limit
	burst int
	now   func() time.Time
	key   [32]byte

	mu        sync.Mutex
	m         map[string]*rate.Limiter
	lastSweep time.Time
	max       int           // maxLimiters unless a test lowers it
	over      *rate.Limiter // shared bucket for new IPs while the map is full
}

func newLimiter(rps float64, burst int, now func() time.Time) *limiter {
	l := &limiter{rps: rate.Limit(rps), burst: burst, now: now, m: map[string]*rate.Limiter{}, max: maxLimiters}
	_, _ = rand.Read(l.key[:]) // never returns an error
	return l
}

// allow takes one token from ip's bucket.
func (l *limiter) allow(ip string) bool {
	m := hmac.New(sha256.New, l.key[:])
	m.Write([]byte(netx.Bucket(ip)))
	k := hex.EncodeToString(m.Sum(nil)[:12])

	l.mu.Lock()
	defer l.mu.Unlock()
	t := l.now()
	if t.Sub(l.lastSweep) >= sweepEvery {
		l.sweep(t)
	}
	b := l.m[k]
	if b == nil {
		if len(l.m) >= l.max {
			l.sweep(t)
		}
		if len(l.m) >= l.max {
			// Full of busy clients: every new IP shares one overflow bucket
			// (20x one IP's rate), so a flood of fresh IPs stays capped
			// instead of getting through unlimited.
			if l.over == nil {
				l.over = rate.NewLimiter(l.rps*20, l.burst*20)
			}
			return l.over.AllowN(t, 1)
		}
		b = rate.NewLimiter(l.rps, l.burst)
		l.m[k] = b
	}
	return b.AllowN(t, 1)
}

// sweep drops buckets that have refilled: forgetting them changes nothing.
func (l *limiter) sweep(t time.Time) {
	l.lastSweep = t
	for k, b := range l.m {
		if b.TokensAt(t) >= float64(l.burst) {
			delete(l.m, k)
		}
	}
}

func (l *limiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.m)
}

func (l *limiter) keys() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, 0, len(l.m))
	for k := range l.m {
		out = append(out, k)
	}
	return out
}
