package query

import (
	"database/sql"
	"testing"
	"time"
)

// hitV inserts n crawler requests in one hour, verified or not.
func hitV(t *testing.T, db *sql.DB, hourMs int64, bot, path string, n int, verified bool) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, verified, n, last_ts) VALUES('s',?,?,?,2,?,?,?)`,
		hourMs, bot, path, verified, n, hourMs+minute); err != nil {
		t.Fatal(err)
	}
}

// aiFixture is AI referral visits (two from ChatGPT, one from Claude; A converts) plus a person
// from search, with crawls of /docs and /pricing.
func aiFixture(t *testing.T) *sql.DB {
	t.Helper()
	sg := custom("A", "a1", "Signup", t0+2*minute)
	db := fixture(t,
		landing("A", "a1", "/docs", "chatgpt.com", t0), sg,
		landing("B", "b1", "/pricing", "chatgpt.com", t0+hour),
		landing("B", "b2", "/", "www.google.com", t0+2*hour),
		landing("C", "c1", "/docs", "claude.ai", t0+3*hour),
		landing("D", "d1", "/", "www.google.com", t0),
	)
	withCrawlerInfo(t)
	hitV(t, db, t0, "GPTBot", "/docs", 30, true)
	hitV(t, db, t0, "GPTBot", "/docs", 10, false)
	hitV(t, db, t0, "ChatGPT-User", "/docs", 6, true)
	hitV(t, db, t0, "ClaudeBot", "/pricing", 7, false)
	return db
}

func steps(r AIVisibilityResult) map[string]AIFunnelStep {
	m := map[string]AIFunnelStep{}
	for _, s := range r.Steps {
		m[s.Key] = s
	}
	return m
}

func val(p *int) int {
	if p == nil {
		return -1
	}
	return *p
}

func TestAIVisibilityMatchesReports(t *testing.T) {
	db := aiFixture(t)
	mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	p := thirtyDays()
	r, err := AIVisibility(db, p)
	if err != nil {
		t.Fatal(err)
	}
	s := steps(r)
	c, err := Crawlers(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if val(s["crawled"].Value)+val(s["fetched"].Value) != c.Total || val(s["fetched"].Value) != 6 {
		t.Fatalf("crawled %v fetched %v total %d", val(s["crawled"].Value), val(s["fetched"].Value), c.Total)
	}
	refs, err := AIReferrals(db, p)
	if err != nil {
		t.Fatal(err)
	}
	sessions, numer := 0, 0.0
	for _, a := range refs {
		sessions += a.Sessions
		numer += *a.ConvRate * float64(a.Visitors)
	}
	if val(s["visited"].Value) != sessions || sessions != 3 {
		t.Fatalf("visited %d, AIReferrals sessions %d", val(s["visited"].Value), sessions)
	}
	if val(s["converted"].Value) != int(numer+0.5) || numer < 0.5 {
		t.Fatalf("converted %d, AIReferrals numerator %v", val(s["converted"].Value), numer)
	}
	if s["cited"].Value != nil || s["cited"].Status != "no_source" || s["visited"].Unit != "sessions" || s["converted"].Unit != "people" {
		t.Fatalf("steps %+v", r.Steps)
	}
	var crawled, fetched, visited, converted int
	for _, pr := range r.Providers {
		crawled += pr.Crawled
		fetched += pr.Fetched
		visited += pr.Visited
		converted += val(pr.Converted)
	}
	if crawled != val(s["crawled"].Value) || fetched != val(s["fetched"].Value) || visited != sessions || converted != 1 {
		t.Fatalf("providers %+v", r.Providers)
	}
	if r.Providers[0].Provider != "OpenAI" || r.Providers[0].Visited != 2 || r.Providers[0].Fetched != 6 {
		t.Fatalf("top provider %+v", r.Providers[0])
	}
	if r.Conv == nil || r.Conv.Name != "Signup" {
		t.Fatalf("conv %+v", r.Conv)
	}
}

func TestAIVisibilityNotSetUp(t *testing.T) {
	db := fixture(t, landing("A", "a1", "/docs", "chatgpt.com", t0))
	r, err := AIVisibility(db, thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	s := steps(r)
	for _, k := range []string{"crawled", "fetched"} {
		if s[k].Status != "not_set_up" || s[k].Value != nil || s[k].Prev != nil {
			t.Fatalf("%s %+v", k, s[k])
		}
	}
	if val(s["visited"].Value) != 1 || s["visited"].Status != "ok" {
		t.Fatalf("visited %+v", s["visited"])
	}
	if r.VerifiedShare != nil {
		t.Fatalf("verifiedShare %v", *r.VerifiedShare)
	}
}

func TestAIVisibilityNoGoal(t *testing.T) {
	r, err := AIVisibility(aiFixture(t), thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	s := steps(r)
	if s["converted"].Status != "no_goal" || s["converted"].Value != nil || r.Conv != nil {
		t.Fatalf("converted %+v conv %+v", s["converted"], r.Conv)
	}
	for _, pr := range r.Providers {
		if pr.Converted != nil {
			t.Fatalf("provider %+v", pr)
		}
	}
	for _, pg := range r.Pages {
		if pg.Conversions != nil {
			t.Fatalf("page %+v", pg)
		}
	}
}

func TestAIVisibilityWidensSingleDay(t *testing.T) {
	db := aiFixture(t)
	hitV(t, db, t0-5*day, "GPTBot", "/", 3, false)
	from := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	p := b3Win(from, from+day-1, from-day, from-1)
	p.Win.Bucket = "hour"
	r, err := AIVisibility(db, p)
	if err != nil {
		t.Fatal(err)
	}
	wantFrom := time.Date(2026, 11, 13, 0, 0, 0, 0, ist).UnixMilli()
	if r.Window.From != wantFrom || r.Window.Bucket != "day" {
		t.Fatalf("window %+v", r.Window)
	}
	s := steps(r)
	if val(s["crawled"].Value) != 50 || val(s["visited"].Value) != 3 {
		t.Fatalf("crawled %d visited %d", val(s["crawled"].Value), val(s["visited"].Value))
	}
}

func TestAIVisibilityWidensVisits(t *testing.T) {
	db := fixture(t, landing("E", "e1", "/docs", "perplexity.ai", t0-3*day), landing("F", "f1", "/", "claude.ai", t0))
	from := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	p := b3Win(from, from+day-1, from-day, from-1)
	p.Win.Bucket = "hour"
	r, err := AIVisibility(db, p)
	if err != nil {
		t.Fatal(err)
	}
	if v := val(steps(r)["visited"].Value); v != 2 {
		t.Fatalf("visited %d, want both visits of the widened week", v)
	}
}

func TestAIVisibilityVerifiedShare(t *testing.T) {
	r, err := AIVisibility(aiFixture(t), thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	// GPTBot 30 verified + 10 not, ChatGPT-User 6 verified; ClaudeBot publishes no list.
	if r.VerifiedShare == nil || *r.VerifiedShare != 36.0/46.0 {
		t.Fatalf("verifiedShare %v", r.VerifiedShare)
	}
}

func TestAIVisibilityPagesJoin(t *testing.T) {
	db := fixture(t, landing("A", "a1", "/guide", "chatgpt.com", t0), custom("A", "a1", "Signup", t0+minute))
	withCrawlerInfo(t)
	mustGoal(t, db, Goal{Name: "Signup", Kind: "event", Match: "Signup"})
	hitV(t, db, t0, "GPTBot", "/guide", 40, false)
	hitV(t, db, t0, "ChatGPT-User", "/guide", 6, false)
	hitV(t, db, t0, "GPTBot", "/other", 2, false)
	r, err := AIVisibility(db, thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	pg := r.Pages[0]
	if pg.Path != "/guide" || pg.Crawled != 40 || pg.Fetched != 6 || pg.Visits != 1 || val(pg.Conversions) != 1 ||
		pg.LastCrawled == nil || *pg.LastCrawled != t0+minute {
		t.Fatalf("page %+v", pg)
	}
	if len(r.Pages) != 2 || r.Pages[1].Path != "/other" || r.Pages[1].Visits != 0 || val(r.Pages[1].Conversions) != 0 {
		t.Fatalf("pages %+v", r.Pages)
	}
}
