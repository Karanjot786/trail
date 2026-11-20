package ingest

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

const ip, ua = "203.0.113.77", "Mozilla/5.0 test"

// clock is a settable time source for Private.
type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }
func newClock(tz *time.Location, h, m int) *clock {
	return &clock{time.Date(2026, 11, 20, h, m, 0, 0, tz)}
}

func TestPrivateSameDaySameVisitor(t *testing.T) {
	c := newClock(time.UTC, 9, 0)
	p := NewPrivate(time.UTC, c.now)
	a1, s1 := p.Identify("s1", ip, ua)
	c.add(10 * time.Minute)
	a2, s2 := p.Identify("s1", ip, ua)
	if a1 != a2 || s1 != s2 {
		t.Errorf("got (%s,%s) then (%s,%s), want same visitor and session", a1, s1, a2, s2)
	}
	c.add(5 * time.Hour) // idle: new session, same visitor
	a3, s3 := p.Identify("s1", ip, ua)
	if a3 != a1 || s3 == s1 {
		t.Errorf("after idle: anon %s (want %s), session %s (want new)", a3, a1, s3)
	}
	if a4, _ := p.Identify("s1", ip, "other UA"); a4 == a1 {
		t.Error("different UA must be a different visitor")
	}
}

func TestPrivateDifferentSiteDifferentVisitor(t *testing.T) {
	p := NewPrivate(time.UTC, newClock(time.UTC, 9, 0).now)
	a1, _ := p.Identify("s1", ip, ua)
	a2, _ := p.Identify("s2", ip, ua)
	if a1 == a2 {
		t.Errorf("same anon %s across sites", a1)
	}
}

func TestPrivateNextDayNewVisitor(t *testing.T) {
	tz := time.FixedZone("IST", 5*3600+1800)
	c := newClock(tz, 22, 0)
	p := NewPrivate(tz, c.now)
	a1, _ := p.Identify("s1", ip, ua)
	c.add(3 * time.Hour) // 01:00 next day in tz, 2 h idle
	a2, _ := p.Identify("s1", ip, ua)
	if a1 == a2 {
		t.Errorf("anon %s carried across days", a1)
	}
}

func TestPrivateMidnightStraddleKeepsSession(t *testing.T) {
	tz := time.FixedZone("IST", 5*3600+1800)
	c := newClock(tz, 23, 59)
	p := NewPrivate(tz, c.now)
	a1, s1 := p.Identify("s1", ip, ua)
	c.add(2 * time.Minute) // 00:01 next day
	a2, s2 := p.Identify("s1", ip, ua)
	if a1 != a2 || s1 != s2 {
		t.Errorf("got (%s,%s) then (%s,%s), want the same visit", a1, s1, a2, s2)
	}
	// A visitor first seen after midnight gets today's salt.
	b1, _ := p.Identify("s1", "198.51.100.1", ua)
	c.add(24 * time.Hour)
	b2, _ := p.Identify("s1", "198.51.100.1", ua)
	if b1 == b2 {
		t.Error("salt did not rotate")
	}
}

func TestPrivateSession30MinIdle(t *testing.T) {
	c := newClock(time.UTC, 9, 0)
	p := NewPrivate(time.UTC, c.now)
	_, s1 := p.Identify("s1", ip, ua)
	c.add(29 * time.Minute)
	_, s2 := p.Identify("s1", ip, ua)
	c.add(31 * time.Minute)
	_, s3 := p.Identify("s1", ip, ua)
	if s1 != s2 {
		t.Errorf("29 min idle split the session: %s, %s", s1, s2)
	}
	if s3 == s2 {
		t.Errorf("31 min idle kept the session %s", s3)
	}
}

func TestPrivateSessionMax24h(t *testing.T) {
	c := newClock(time.UTC, 0, 1)
	p := NewPrivate(time.UTC, c.now)
	_, first := p.Identify("s1", ip, ua)
	var last string
	for range 24 * 4 { // active every 15 min for a day
		c.add(15 * time.Minute)
		_, last = p.Identify("s1", ip, ua)
	}
	if last == first {
		t.Error("session lasted over 24 h")
	}
}

func TestPrivateSaltNotDerivableFromIP(t *testing.T) {
	now := newClock(time.UTC, 9, 0).now
	a, s := NewPrivate(time.UTC, now).Identify("s1", ip, ua)
	if !strings.HasPrefix(a, "p_") || len(a) != 24 {
		t.Errorf("anon %q: want p_ prefix and length 24", a)
	}
	if !reID.MatchString(a) || !reID.MatchString(s) {
		t.Errorf("anon %q / session %q not in the id charset", a, s)
	}
	if strings.Contains(a, ip) || strings.Contains(s, ip) {
		t.Errorf("anon %q / session %q contains the IP", a, s)
	}
	// The salt is random per instance, so the same inputs give a different anon.
	if b, _ := NewPrivate(time.UTC, now).Identify("s1", ip, ua); a == b {
		t.Errorf("two instances derived the same anon %s", a)
	}
}

func TestPrivateSweepsIdleSessions(t *testing.T) {
	c := newClock(time.UTC, 9, 0)
	p := NewPrivate(time.UTC, c.now)
	p.Identify("s1", ip, ua)
	c.add(time.Hour)
	p.Identify("s1", "198.51.100.1", ua)
	if n := len(p.sess); n != 1 {
		t.Errorf("%d sessions after sweep, want 1", n)
	}
}

func TestPrivateSessionMapCapped(t *testing.T) {
	c := newClock(time.UTC, 9, 0)
	p := NewPrivate(time.UTC, c.now)
	p.max = 1000
	for i := 0; i < p.max+50; i++ {
		_, sid := p.Identify("s1", ip, fmt.Sprintf("ua-%d", i))
		if sid == "" {
			t.Fatalf("empty session id at %d", i)
		}
	}
	if len(p.sess) > p.max {
		t.Fatalf("sess size %d > cap %d", len(p.sess), p.max)
	}
	// overflow visitors get a stable fallback session within the 30-min bucket
	_, a := p.Identify("s1", ip, "overflow-ua")
	_, b := p.Identify("s1", ip, "overflow-ua")
	if a == "" || a != b {
		t.Errorf("fallback session not stable: %q vs %q", a, b)
	}
	// after expiry and a minute-spaced sweep, space frees up
	c.add(sessIdle + 2*time.Minute)
	p.Identify("s1", ip, "fresh-ua")
	if len(p.sess) > 1 {
		t.Errorf("sweep did not free expired entries: %d left", len(p.sess))
	}
}
