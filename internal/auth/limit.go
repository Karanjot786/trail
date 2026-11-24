package auth

import (
	"sync"
	"time"
)

const (
	clientFails  = 5                // failures from one client inside failWindow that lock it
	failWindow   = 15 * time.Minute // observation window and lock length
	globalSlowAt = 20               // failures from anyone inside failWindow that slow every login
	slowDelay    = time.Second
	maxClients   = 10_000 // bound on tracked clients
)

// loginLimiter throttles failed logins. A client with clientFails failures in
// failWindow is locked out. Many failures overall (an attacker rotating
// addresses) only slow every login down; they never lock the owner out.
type loginLimiter struct {
	mu     sync.Mutex
	check  sync.Mutex // serialises password checks
	fails  map[string][]time.Time
	global []time.Time
}

// prune drops entries older than failWindow. Caller holds mu.
func prune(ts []time.Time, now time.Time) []time.Time {
	i := 0
	for i < len(ts) && now.Sub(ts[i]) >= failWindow {
		i++
	}
	return ts[i:]
}

// locked reports whether key is locked and, if so, how long until it is not.
func (l *loginLimiter) locked(key string, now time.Time) (retry time.Duration, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	ts := prune(l.fails[key], now)
	if len(ts) < clientFails {
		return 0, true
	}
	return ts[0].Add(failWindow).Sub(now), false
}

// fail records a failed login for key.
func (l *loginLimiter) fail(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.fails == nil {
		l.fails = map[string][]time.Time{}
	}
	if _, known := l.fails[key]; !known && len(l.fails) >= maxClients {
		l.evict(now)
	}
	l.fails[key] = append(prune(l.fails[key], now), now)
	l.global = append(prune(l.global, now), now)
}

// evict makes room: expired keys first, then the key with the oldest last
// failure. Caller holds mu.
func (l *loginLimiter) evict(now time.Time) {
	var oldest string
	var oldestAt time.Time
	for k, ts := range l.fails {
		ts = prune(ts, now)
		if len(ts) == 0 {
			delete(l.fails, k)
			continue
		}
		if last := ts[len(ts)-1]; oldest == "" || last.Before(oldestAt) {
			oldest, oldestAt = k, last
		}
	}
	if len(l.fails) >= maxClients {
		delete(l.fails, oldest)
	}
}

// delay is how long a failed login waits before answering.
func (l *loginLimiter) delay(now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(prune(l.global, now)) >= globalSlowAt {
		return slowDelay
	}
	return failDelay
}
