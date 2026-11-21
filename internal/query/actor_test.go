package query

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"trail/internal/store"
)

// agentPV is an AI agent pageview: is_bot=1 with the agent id, as ingest stores it.
func agentPV(anon, sess, path, agent, via string, ts int64) store.Event {
	e := pv(anon, sess, path, ts)
	e.IsBot, e.Agent, e.AgentVia = true, agent, via
	e.Device, e.Browser, e.Country = "desktop", "Chrome", "US"
	return e
}

// humanSite is a small fixed site: three people, a plain bot and a goal.
func humanSite() []store.Event {
	bot := pv("BOT", "b1", "/", t0)
	bot.IsBot = true
	return []store.Event{
		pv("A", "a1", "/", t0), pv("A", "a1", "/docs", t0+minute), engage("A", "a1", t0+2*minute, 15000),
		pv("B", "b1x", "/pricing", t0+5*minute), custom("B", "b1x", "Signup", t0+6*minute),
		pv("C", "c1", "/", t0+10*minute), bot,
	}
}

// agentEvents is 40 agent events in 4 sessions (10 pageviews each).
func agentEvents() []store.Event {
	out := []store.Event{}
	for s, agent := range []string{"claude-agent", "claude-agent", "google-agent", "chatgpt-agent"} {
		anon := "AG" + string(rune('0'+s))
		for i := range 10 {
			out = append(out, agentPV(anon, anon+"s", "/pricing", agent, "ua", t0+int64(s)*minute+int64(i)*1000))
		}
	}
	return out
}

// storeFixture is fixture that also returns the store, so a test can add events later.
func storeFixture(t *testing.T, evs ...store.Event) (*sql.DB, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "q.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	insert(t, st, evs)
	return st.DB(), st
}

func insert(t *testing.T, st *store.Store, evs []store.Event) {
	t.Helper()
	for _, e := range evs {
		if e.SiteID == "" {
			e.SiteID = "s"
		}
		if e.Env == "" {
			e.Env = "production"
		}
		st.Enqueue(e)
	}
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
}

func asJSON(t *testing.T, v any, err error) string {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func humanReports(t *testing.T, db *sql.DB, p Params) map[string]string {
	t.Helper()
	st, err := Stats(db, p)
	st.AgentSessions = 0 // counted whatever actor says; checked on its own
	out := map[string]string{"stats": asJSON(t, st, err)}
	se, err := Series(db, p, "visitors", false)
	out["series"] = asJSON(t, se, err)
	br, err := Breakdown(db, p, "path", "", 100)
	out["breakdown"] = asJSON(t, br, err)
	ss, _, err := Sessions(db, p, "")
	out["sessions"] = asJSON(t, ss, err)
	vs, _, err := Visitors(db, p, "")
	out["visitors"] = asJSON(t, vs, err)
	return out
}

func TestHumanTotalsUnchangedByAgents(t *testing.T) {
	db, st := storeFixture(t, humanSite()...)
	mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	p := around()
	before := humanReports(t, db, p)
	insert(t, st, agentEvents())
	for _, actor := range []string{"", ActorHuman} {
		p.Actor = actor
		after := humanReports(t, db, p)
		for k, v := range before {
			if after[k] != v {
				t.Errorf("actor %q: %s changed with agents\nbefore %s\nafter  %s", actor, k, v, after[k])
			}
		}
	}
}

func TestActorAllAddsAgentSessions(t *testing.T) {
	db := fixture(t, append(humanSite(), agentEvents()...)...)
	human := mustStats(t, db, around())
	all := around()
	all.Actor = ActorAll
	both := mustStats(t, db, all)
	if human.AgentSessions != 4 || both.AgentSessions != 4 {
		t.Fatalf("agentSessions human %d all %d, want 4", human.AgentSessions, both.AgentSessions)
	}
	if d := both.Sessions - human.Sessions; d != human.AgentSessions {
		t.Fatalf("all−human sessions = %d, want %d (the plain bot stays out)", d, human.AgentSessions)
	}
	if both.Pageviews-human.Pageviews != 40 {
		t.Fatalf("pageviews %d vs %d", both.Pageviews, human.Pageviews)
	}
	ss, _, err := Sessions(db, all, "")
	if err != nil {
		t.Fatal(err)
	}
	agents := 0
	for _, s := range ss {
		if s.Agent != "" {
			agents++
		}
	}
	if agents != 4 {
		t.Fatalf("sessions with an agent = %d", agents)
	}
}

func TestAgentSessionsIgnoreFiltersKeepEnv(t *testing.T) {
	evs := agentEvents()
	db := fixture(t, evs...)
	p := around()
	p.Filters = map[string]string{"country": "IN"}
	p.Env = "production"
	if n, err := agentSessions(db, p); err != nil || n != 4 {
		t.Fatalf("got %d %v", n, err)
	}
	p.Env = "preview"
	if n, _ := agentSessions(db, p); n != 0 {
		t.Fatalf("preview got %d", n)
	}
}

func TestJourneyIncludesAgentSessions(t *testing.T) {
	db := fixture(t, append(humanSite(), agentEvents()...)...)
	j, err := Journey(db, "s", "AG0", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(j) != 1 || len(j[0].Steps) != 10 || j[0].Agent != "claude-agent" || j[0].Via != "ua" || j[0].Verified {
		t.Fatalf("got %+v", j)
	}
	h, err := Journey(db, "s", "A", nil)
	if err != nil || len(h) != 1 || h[0].Agent != "" || h[0].Via != "" || h[0].Verified {
		t.Fatalf("human journey %+v %v", h, err)
	}
	b, err := Journey(db, "s", "BOT", nil)
	if err != nil || len(b) != 0 {
		t.Fatalf("plain bot journey %+v %v", b, err)
	}
}

// A session's via is the strongest way any of its events was recognised.
func TestJourneyAgentViaIsBestInSession(t *testing.T) {
	db := fixture(t, agentPV("V", "v1", "/", "claude-agent", "ua", t0), agentPV("V", "v1", "/docs", "claude-agent", "ip", t0+1000),
		agentPV("V", "v1", "/pricing", "claude-agent", "ua", t0+2000), agentPV("V", "v2", "/", "chatgpt-agent", "sig", t0+hour))
	j, err := Journey(db, "s", "V", nil)
	if err != nil || len(j) != 2 {
		t.Fatalf("got %+v %v", j, err)
	}
	if j[0].Via != "ip" || !j[0].Verified || j[1].Via != "sig" || !j[1].Verified {
		t.Fatalf("via %q %v, %q %v", j[0].Via, j[0].Verified, j[1].Via, j[1].Verified)
	}
}

func TestLiveIgnoresActor(t *testing.T) {
	now := time.UnixMilli(t0 + 2*minute)
	db := fixture(t, append(humanSite(), agentEvents()...)...)
	p := around()
	p.Now = now
	lv, err := Live(db, p)
	human := asJSON(t, lv, err)
	p.Actor = ActorAll
	lv, err = Live(db, p)
	all := asJSON(t, lv, err)
	if human != all {
		t.Fatalf("live changed with actor=all\n%s\n%s", human, all)
	}
}
