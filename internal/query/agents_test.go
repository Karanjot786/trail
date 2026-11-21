package query

import (
	"errors"
	"testing"

	"trail/internal/store"
)

// agentSession is n pageviews of one agent session starting at ts, with via on every event.
func agentSession(anon, agent, via string, ts int64, paths ...string) []store.Event {
	out := []store.Event{}
	for i, p := range paths {
		out = append(out, agentPV(anon, anon+"-s", p, agent, via, ts+int64(i)*minute))
	}
	return out
}

// agentFixture is 3 agents × verified/claimed: 6 sessions, 13 pageviews, one Signup.
func agentFixture() []store.Event {
	evs := []store.Event{}
	evs = append(evs, agentSession("c1", "claude-agent", "ip", t0, "/pricing", "/docs/installation")...)
	evs = append(evs, agentSession("c2", "claude-agent", "ua", t0+hour, "/pricing")...)
	evs = append(evs, agentSession("c3", "claude-agent", "ua", t0+2*hour, "/pricing", "/signup")...)
	evs = append(evs, agentSession("g1", "google-agent", "ip", t0-day, "/docs/installation", "/pricing", "/")...)
	evs = append(evs, agentSession("o1", "chatgpt-agent", "sig", t0+3*hour, "/pricing", "/signup")...)
	evs = append(evs, agentSession("o2", "chatgpt-agent", "relay", t0-2*day, "/docs/installation", "/pricing", "/")...)
	sg := agentPV("o1", "o1-s", "/signup", "chatgpt-agent", "sig", t0+3*hour+5*minute)
	sg.Type, sg.Name = "event", "Signup"
	// A session that starts claimed and is verified later counts as verified.
	up := agentPV("c2", "c2-s", "/pricing", "claude-agent", "sig", t0+hour+time30s)
	up.Type = "engage"
	return append(evs, sg, up, pv("H", "h1", "/pricing", t0))
}

const time30s = 30_000

func mustAgents(t *testing.T, p Params, evs ...store.Event) (AgentsResult, Goal) {
	t.Helper()
	db := fixture(t, evs...)
	g := mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	r, err := Agents(db, p)
	if err != nil {
		t.Fatal(err)
	}
	return r, g
}

func TestAgentsReport(t *testing.T) {
	r, g := mustAgents(t, thirtyDays(), agentFixture()...)
	if r.Sessions != 6 || r.Pageviews != 13 || r.VerifiedSessions != 5 || r.Conversions != 1 {
		t.Fatalf("sessions %d pageviews %d verified %d conversions %d", r.Sessions, r.Pageviews, r.VerifiedSessions, r.Conversions)
	}
	if r.Conv == nil || r.Conv.GoalID != g.ID {
		t.Fatalf("conv %+v", r.Conv)
	}
	v, c := 0, 0
	for _, pt := range r.Series {
		v += pt.Verified
		c += pt.Claimed
	}
	if v != 5 || c != 1 || len(r.Series) != 31 {
		t.Fatalf("series verified %d claimed %d buckets %d", v, c, len(r.Series))
	}
	if len(r.Agents) != 3 {
		t.Fatalf("agents %+v", r.Agents)
	}
	top := r.Agents[0]
	if top.Agent != "claude-agent" || top.Name != "Claude agent" || top.Provider != "Anthropic" || top.Sessions != 3 ||
		top.Verified != 2 || top.Pageviews != 5 {
		t.Fatalf("top agent %+v", top)
	}
	if r.Agents[1].Agent != "chatgpt-agent" || r.Agents[1].Provider != "OpenAI" || r.Agents[2].Agent != "google-agent" {
		t.Fatalf("order %+v", r.Agents)
	}
	if r.Latest[0].SessionID != "o1-s" || r.Latest[0].Via != "sig" || r.Latest[0].Goals != 1 || r.Latest[0].Entry != "/pricing" ||
		r.Latest[0].Name != "ChatGPT agent" || r.Latest[0].Pages != 2 || r.Latest[0].DurationMs != 5*minute {
		t.Fatalf("latest[0] %+v", r.Latest[0])
	}
	if len(r.Latest) != 6 || r.Latest[5].SessionID != "o2-s" || r.Latest[5].Via != "relay" {
		t.Fatalf("latest %+v", r.Latest)
	}
	if r.Pages[0].Path != "/pricing" || r.Pages[0].Pageviews != 6 || r.Pages[0].Sessions != 6 || r.Pages[0].TopAgent != "claude-agent" {
		t.Fatalf("pages %+v", r.Pages)
	}
}

func TestAgentsPrev(t *testing.T) {
	evs := append(agentFixture(), agentSession("old", "google-agent", "ua", t0-40*day, "/")...)
	r, _ := mustAgents(t, thirtyDays(), evs...)
	if r.PrevSessions == nil || *r.PrevSessions != 1 {
		t.Fatalf("prev %v", r.PrevSessions)
	}
	for _, a := range r.Agents {
		want := 0
		if a.Agent == "google-agent" {
			want = 1
		}
		if a.Prev == nil || *a.Prev != want {
			t.Fatalf("%s prev %v", a.Agent, a.Prev)
		}
	}
}

func TestAgentsEmptySite(t *testing.T) {
	r, _ := mustAgents(t, thirtyDays(), pv("H", "h1", "/", t0))
	if r.Sessions != 0 || r.Pageviews != 0 || r.VerifiedSessions != 0 || r.Conversions != 0 {
		t.Fatalf("%+v", r)
	}
	if r.Agents == nil || r.Pages == nil || r.Latest == nil || len(r.Agents)+len(r.Pages)+len(r.Latest) != 0 {
		t.Fatalf("lists %+v", r)
	}
	if r.PrevSessions == nil || *r.PrevSessions != 0 {
		t.Fatalf("prevSessions %v", r.PrevSessions)
	}
	for _, pt := range r.Series {
		if pt.Verified+pt.Claimed != 0 {
			t.Fatalf("series %+v", r.Series)
		}
	}
}

func TestAgentsNeedsSite(t *testing.T) {
	p := thirtyDays()
	p.Site = "all"
	if _, err := Agents(fixture(t), p); !errors.Is(err, ErrNeedSite) {
		t.Fatalf("err %v", err)
	}
}

func TestAgentsMatchStatsAgentSessions(t *testing.T) {
	db := fixture(t, agentFixture()...)
	p := thirtyDays()
	r, err := Agents(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if st := mustStats(t, db, p); st.AgentSessions != r.Sessions {
		t.Fatalf("stats %d agents %d", st.AgentSessions, r.Sessions)
	}
}
