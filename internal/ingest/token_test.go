package ingest

import (
	"bytes"
	"net/http"
	"strings"
	"testing"
	"time"
)

var tkey = bytes.Repeat([]byte{7}, 32)

func tvisit(now time.Time) visit {
	return visit{Anon: "p_0123456789abcdef012345", Session: "0123456789abcdef", Issued: now}
}

func TestVisitTokenRoundTrip(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	a, ok := sealVisit(tkey, "s1", tvisit(now))
	b, _ := sealVisit(tkey, "s1", tvisit(now))
	if !ok || len(a) != 68 || a == b {
		t.Fatalf("seal ok=%v len=%d same=%v", ok, len(a), a == b)
	}
	v, ok := openVisit(tkey, "s1", a, now)
	if !ok || v.Anon != tvisit(now).Anon || v.Session != tvisit(now).Session || !v.Issued.Equal(now) {
		t.Fatalf("open = %+v %v", v, ok)
	}
	if _, ok := sealVisit(tkey, "s1", visit{Anon: "p_zz", Session: "0123456789abcdef", Issued: now}); ok {
		t.Error("non-hex anon must not seal")
	}
}

func TestVisitTokenRejectsForgedStaleAndCrossSite(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	good, _ := sealVisit(tkey, "s1", tvisit(now))
	old, _ := sealVisit(tkey, "s1", tvisit(now.Add(-25*time.Hour)))
	fut, _ := sealVisit(tkey, "s1", tvisit(now.Add(2*time.Minute)))
	flip := []byte(good)
	if flip[30] == 'A' {
		flip[30] = 'B'
	} else {
		flip[30] = 'A'
	}
	cases := map[string]struct{ site, tok string }{
		"flipped": {"s1", string(flip)}, "cross-site": {"s2", good}, "stale": {"s1", old},
		"future": {"s1", fut}, "truncated": {"s1", good[:40]}, "non-base64": {"s1", "!!" + good[2:]},
	}
	for n, c := range cases {
		if _, ok := openVisit(tkey, c.site, c.tok, now); ok {
			t.Errorf("%s: opened", n)
		}
	}
}

func TestResumeAfterRestart(t *testing.T) {
	c := newClock(time.UTC, 9, 0)
	p := NewPrivate(time.UTC, c.now)
	v := tvisit(c.now().Add(-10 * time.Minute))
	if _, s := p.Resume(v); s != v.Session {
		t.Errorf("10 min old token: session %s, want %s", s, v.Session)
	}
	p = NewPrivate(time.UTC, c.now)
	v = tvisit(c.now().Add(-40 * time.Minute))
	a, s := p.Resume(v)
	if a != v.Anon || s == v.Session || s == "" {
		t.Errorf("40 min old token: (%s,%s), want same anon and new session", a, s)
	}
}

const privPV = `{"s":"s1","t":"pageview","m":"p","u":"https://example.com/a"}`

func privEngage(k string) string {
	return `{"s":"s1","t":"engage","m":"p","e":4000,"u":"https://example.com/a","k":"` + k + `"}`
}

func hdrIP(ip string) map[string]string {
	return map[string]string{"Origin": "https://example.com", "X-Forwarded-For": ip}
}

func TestPrivateEngageFromNewIPKeepsIdentity(t *testing.T) {
	st, h := setup(t)
	w := postFrom(h, privPV, hdrIP("203.0.113.1"))
	k := w.Header().Get("X-Trail-K")
	if k == "" {
		t.Fatal("no X-Trail-K")
	}
	postFrom(h, privEngage(k), hdrIP("198.51.100.9"))
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	var n, d int
	if err := st.DB().QueryRow(`SELECT count(*), count(DISTINCT anon_id||session_id) FROM events`).Scan(&n, &d); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("%d rows, want the engage folded into 1", n)
	}
	if d != 1 {
		t.Errorf("%d rows, %d identities, want 1", n, d)
	}
}

func TestPrivateEngageWithoutTokenUnchanged(t *testing.T) {
	st, h := setup(t)
	postFrom(h, privPV, hdrIP("203.0.113.1"))
	postFrom(h, privEngage(""), hdrIP("198.51.100.9"))
	_ = st.Flush()
	var d int
	_ = st.DB().QueryRow(`SELECT count(DISTINCT anon_id) FROM events`).Scan(&d)
	if d != 2 {
		t.Errorf("%d anons, want 2", d)
	}
}

func TestTokenOnlyForPrivate(t *testing.T) {
	_, h := setup(t)
	if k := post(h, pageview).Header().Get("X-Trail-K"); k != "" {
		t.Errorf("full mode got X-Trail-K %q", k)
	}
}

func TestExposeHeader(t *testing.T) {
	_, h := setup(t)
	for _, body := range []string{pageview, "nope"} {
		w := post(h, body)
		if !strings.Contains(w.Header().Get("Access-Control-Expose-Headers"), "X-Trail-K") {
			t.Errorf("status %d: no expose header", w.Code)
		}
	}
}

func TestBadTokenNotRejected(t *testing.T) {
	_, h := setup(t)
	for _, k := range []string{strings.Repeat("a", 500), "not valid!"} {
		w := post(h, privEngage(k))
		if w.Code != http.StatusNoContent || w.Header().Get("X-Trail-Accepted") != "1" {
			t.Errorf("k %.10q: %d accepted=%q", k, w.Code, w.Header().Get("X-Trail-Accepted"))
		}
	}
}

// A token resealed on every request must not carry one private id across the
// daily salt rotation.
func TestTokenFromBeforeRotationIsNotResumed(t *testing.T) {
	c := newClock(time.UTC, 23, 50)
	st, h := newHandler(t, map[string]string{"s1": "example.com"}, WithPrivate(NewPrivate(time.UTC, c.now)))
	k1 := postFrom(h, privPV, hdrIP("203.0.113.1")).Header().Get("X-Trail-K")
	c.add(5 * time.Minute) // still the same day: resealed, same anon
	k2 := postFrom(h, privEngage(k1), hdrIP("198.51.100.9")).Header().Get("X-Trail-K")
	c.add(10 * time.Minute) // past midnight
	k3 := postFrom(h, privEngage(k2), hdrIP("198.51.100.9")).Header().Get("X-Trail-K")
	key := st.EngageKey()
	v1, ok1 := openVisit(key, "s1", k1, c.now())
	v2, ok2 := openVisit(key, "s1", k2, c.now())
	v3, ok3 := openVisit(key, "s1", k3, c.now())
	if !ok1 || !ok2 || !ok3 {
		t.Fatalf("tokens did not open: %v %v %v", ok1, ok2, ok3)
	}
	if v1.Anon != v2.Anon {
		t.Errorf("same-day resume changed the anon")
	}
	if v3.Anon == v2.Anon {
		t.Errorf("anon survived the salt rotation via the token: %s", v3.Anon)
	}
}
