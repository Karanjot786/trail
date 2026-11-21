package query

import (
	"testing"
	"time"

	"trail/internal/store"
)

func TestAISetupStates(t *testing.T) {
	db := fixture(t, agentSession("c1", "claude-agent", "ua", t0-25*hour, "/", "/pricing")...)
	now := time.UnixMilli(t0)
	r, err := AISetupFor(db, "s", now)
	if err != nil {
		t.Fatal(err)
	}
	if r.Crawls.State != "none" || r.Crawls.LastAt != nil || r.Crawls.Last24h != 0 || r.Lists == nil {
		t.Fatalf("none: %+v", r)
	}
	if r.Agents.LastAt == nil || *r.Agents.LastAt != t0-25*hour+minute || r.Agents.Last24h != 0 {
		t.Fatalf("agents: %+v", r.Agents)
	}
	// hit's last_ts is hour+1 minute: 24 h + 1 minute old is quiet, 24 h − 1 minute is receiving.
	hit(t, db, t0-24*hour-2*minute, "GPTBot", "/", 3)
	if r, _ = AISetupFor(db, "s", now); r.Crawls.State != "quiet" || r.Crawls.Last24h != 0 || *r.Crawls.LastAt != t0-24*hour-minute {
		t.Fatalf("quiet: %+v", r.Crawls)
	}
	hit(t, db, t0-24*hour, "GPTBot", "/x", 4)
	if r, _ = AISetupFor(db, "s", now); r.Crawls.State != "receiving" || r.Crawls.Last24h != 4 {
		t.Fatalf("receiving: %+v", r.Crawls)
	}
	// A session that started 24 h − 1 minute ago counts; one that started earlier does not.
	db2 := fixture(t, append(agentSession("a", "claude-agent", "ua", t0-24*hour+minute, "/", "/x"),
		agentSession("b", "google-agent", "ip", t0-24*hour-minute, "/", "/x", "/y")...)...)
	if r, _ = AISetupFor(db2, "s", now); r.Agents.Last24h != 1 {
		t.Fatalf("agent sessions in 24 h: %+v", r.Agents)
	}
}

func TestSiteStatusGeo(t *testing.T) {
	now := time.UnixMilli(t0)
	if g, err := GeoStatusFor(fixture(t), "s", now); err != nil || g != nil {
		t.Fatalf("no events: %+v %v", g, err)
	}
	evs := []store.Event{}
	for i := range 100 {
		e := pv("A", "a", "/", t0-int64(i)*minute)
		if i < 70 {
			e.GeoSrc = "vercel"
		}
		evs = append(evs, e)
	}
	evs = append(evs, pv("old", "o", "/", t0-25*hour))
	g, err := GeoStatusFor(fixture(t, evs...), "s", now)
	if err != nil || g == nil || g.Source != "vercel" || g.Share != 0.7 {
		t.Fatalf("got %+v %v", g, err)
	}
	for i := range 60 {
		evs[i].GeoSrc = ""
	}
	if g, _ = GeoStatusFor(fixture(t, evs...), "s", now); g.Source != "db" || g.Share != 0.9 {
		t.Fatalf("db: %+v", g)
	}
}
