package seed

import (
	"testing"

	"trail/internal/crawlers"
)

// Pinned from the seed before AI agents were added (60 days, 1,800 persons, PCG(1, 2)): the
// count and a checksum of every non-agent event per site, type and is_bot, and each bot's
// crawl requests. Agents and verified flags come from separate streams, so none of these move.
var (
	pinnedEvents = []struct {
		key      string
		n, check int64
	}{
		{"demo|engage|0", 5414, 2703917802}, {"demo|engage|1", 291, 151871728}, {"demo|error|0", 224, 111351918},
		{"demo|event|0", 603, 307563172}, {"demo|identify|0", 260, 125102498}, {"demo|outbound|0", 299, 146096854},
		{"demo|pageview|0", 5415, 2692770932}, {"demo|pageview|1", 291, 148783207}, {"docs|engage|0", 5669, 2862851497},
		{"docs|engage|1", 305, 155173540}, {"docs|error|0", 227, 119495789}, {"docs|event|0", 631, 318752956},
		{"docs|identify|0", 300, 149460045}, {"docs|outbound|0", 341, 172100704}, {"docs|pageview|0", 5672, 2848161844},
		{"docs|pageview|1", 305, 156774359},
	}
	pinnedCrawls = map[string]int64{
		"Amazonbot": 866, "Applebot": 704, "Bytespider": 1112, "CCBot": 637, "ChatGPT-User": 1362, "Claude-SearchBot": 388,
		"Claude-User": 516, "ClaudeBot": 1526, "DuckAssistBot": 248, "GPTBot": 2023, "Google-Extended": 875,
		"Meta-ExternalAgent": 779, "MistralAI-User": 163, "OAI-SearchBot": 1111, "Perplexity-User": 562, "PerplexityBot": 948,
	}
)

func TestSeedHumanDataUnchanged(t *testing.T) {
	db := seeded(t, twoSites, 60, 1800)
	rows, err := db.Query(`SELECT site_id||'|'||type||'|'||is_bot, count(*), sum(ts % 1000003) FROM events
WHERE agent='' GROUP BY 1 ORDER BY 1`)
	if err != nil {
		t.Fatal(err)
	}
	i := 0
	for rows.Next() {
		var k string
		var n, check int64
		if err := rows.Scan(&k, &n, &check); err != nil {
			t.Fatal(err)
		}
		if i >= len(pinnedEvents) || pinnedEvents[i].key != k || pinnedEvents[i].n != n || pinnedEvents[i].check != check {
			t.Errorf("row %d: %s %d %d", i, k, n, check)
		}
		i++
	}
	_ = rows.Close()
	if i != len(pinnedEvents) {
		t.Errorf("%d groups, want %d", i, len(pinnedEvents))
	}
	for bot, want := range pinnedCrawls {
		if got := q(t, db, "SELECT sum(n) FROM crawl_hits WHERE bot=?", bot); int64(got) != want {
			t.Errorf("%s: %v crawl requests, want %d", bot, got, want)
		}
	}
}

func TestSeedAgents(t *testing.T) {
	db := seeded(t, twoSites, 60, 1800)
	agentSess := q(t, db, "SELECT count(DISTINCT session_id) FROM events WHERE site_id='demo' AND agent<>''")
	humanSess := q(t, db, "SELECT count(DISTINCT session_id) FROM events WHERE site_id='demo' AND is_bot=0")
	if share := agentSess / humanSess; share < 0.02 || share > 0.04 {
		t.Errorf("agent sessions %v are %.3f of %v human sessions", agentSess, share, humanSess)
	}
	if n := q(t, db, "SELECT count(*) FROM events WHERE site_id='docs' AND agent<>''"); n != 0 {
		t.Errorf("docs has %v agent events; AI data is for crawler sites only", n)
	}
	if n := q(t, db, "SELECT count(DISTINCT agent) FROM events WHERE agent<>''"); n != 3 {
		t.Errorf("%v agents, want 3", n)
	}
	if n := q(t, db, "SELECT count(*) FROM events WHERE agent<>'' AND (is_bot=0 OR agent_via NOT IN ('ua','ip','relay','sig'))"); n != 0 {
		t.Errorf("%v agent events without is_bot or a known via", n)
	}
	verified := q(t, db, `SELECT avg(v) FROM (SELECT max(agent_via IN ('ip','relay','sig')) AS v FROM events
  WHERE agent<>'' GROUP BY session_id)`)
	if verified < 0.7 {
		t.Errorf("verified share %v, want >= 0.7", verified)
	}
	if n := q(t, db, "SELECT count(DISTINCT session_id) FROM events WHERE agent<>'' AND type='event' AND name='Signup'"); n < 1 {
		t.Error("no agent session hits the first goal (Signup)")
	}
	landing := q(t, db, `SELECT avg(path IN ('/pricing','/docs/installation')) FROM
  (SELECT session_id, min(ts), path FROM events WHERE agent<>'' AND type='pageview' GROUP BY session_id)`)
	if landing < 0.5 {
		t.Errorf("agent landings on /pricing or /docs/installation: %v, want most", landing)
	}
	day := float64(dayMs)
	if n := q(t, db, "SELECT count(*) FROM events WHERE agent<>'' AND ts>?", float64(seedNow.UnixMilli())-day); n == 0 {
		t.Error("no agent session in the last 24 h (the setup card shows the agents line)")
	}
	if n := q(t, db, "SELECT count(*) FROM events WHERE agent<>'' AND ts>?", seedNow.UnixMilli()-5*60_000); n != 0 {
		t.Error("agent events in the live window")
	}
}

func TestSeedCrawlVerified(t *testing.T) {
	db := seeded(t, twoSites, 60, 1800)
	for _, bot := range []string{"GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User"} {
		share := q(t, db, "SELECT 1.0*sum(CASE WHEN verified=1 THEN n ELSE 0 END)/sum(n) FROM crawl_hits WHERE bot=?", bot)
		if share < 0.8 || share > 0.9 {
			t.Errorf("%s verified share %v, want 0.8..0.9", bot, share)
		}
	}
	if n := q(t, db, "SELECT count(*) FROM crawl_hits WHERE verified=1 AND bot NOT IN ('GPTBot','OAI-SearchBot','ChatGPT-User','OAI-AdsBot','PerplexityBot','Perplexity-User')"); n != 0 {
		t.Errorf("%v verified rows for bots without a list", n)
	}
	if n := q(t, db, "SELECT count(*) FROM crawl_hits WHERE site_id='demo' AND last_ts>?", seedNow.UnixMilli()-dayMs); n == 0 {
		t.Error("no crawl hit in the last 24 h (the setup card shows Receiving)")
	}
	// Fetch-category paths overlap the top AI-referral landing pages.
	fetch := map[string]bool{}
	rows, err := db.Query("SELECT DISTINCT bot, path FROM crawl_hits WHERE site_id='demo'")
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var bot, path string
		if err := rows.Scan(&bot, &path); err != nil {
			t.Fatal(err)
		}
		if _, cat := crawlers.Info(bot); cat == "fetch" {
			fetch[path] = true
		}
	}
	_ = rows.Close()
	rows, err = db.Query(`SELECT path FROM events WHERE site_id='demo' AND type='pageview' AND is_bot=0 AND referrer_host IN
  ('chatgpt.com','perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com') GROUP BY path ORDER BY count(*) DESC LIMIT 10`)
	if err != nil {
		t.Fatal(err)
	}
	shared := 0
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			t.Fatal(err)
		}
		if fetch[path] {
			shared++
		}
	}
	_ = rows.Close()
	if shared < 5 {
		t.Errorf("%d of the top AI landing pages are fetched, want >= 5", shared)
	}
}
