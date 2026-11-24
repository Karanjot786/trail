package ingest

import (
	"sync"
	"time"
)

// sampler prints the first line for a key at once, then at most one line per
// key per window, with the number of lines it held back. Keys are fixed
// reason strings, so the map stays small however hostile the traffic.
type sampler struct {
	mu    sync.Mutex
	every time.Duration
	now   func() time.Time
	logf  func(string, ...any)
	seen  map[string]*logState
}

type logState struct {
	last time.Time
	n    int
}

func newSampler(every time.Duration, now func() time.Time, logf func(string, ...any)) *sampler {
	return &sampler{every: every, now: now, logf: logf, seen: map[string]*logState{}}
}

func (s *sampler) Log(key, format string, args ...any) {
	s.mu.Lock()
	t := s.now()
	st, ok := s.seen[key]
	if !ok {
		s.seen[key] = &logState{last: t}
		s.mu.Unlock()
		s.logf(format, args...)
		return
	}
	if t.Sub(st.last) < s.every {
		st.n++
		s.mu.Unlock()
		return
	}
	n := st.n
	st.last, st.n = t, 0
	s.mu.Unlock()
	if n > 0 {
		format += " (%d more since last)"
		args = append(args, n)
	}
	s.logf(format, args...)
}

// short bounds a client-supplied value (a site id or host) for a log line.
func short(s string) string {
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}
