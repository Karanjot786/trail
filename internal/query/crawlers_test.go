package query

import (
	"database/sql"
	"testing"
	"time"
)

func hit(t *testing.T, db *sql.DB, hourMs int64, bot, path string, n int) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO crawl_hits(site_id, hour, bot, path, status, n, last_ts) VALUES('s',?,?,?,200,?,?)`,
		hourMs, bot, path, n, hourMs+minute); err != nil {
		t.Fatal(err)
	}
}

func withCrawlerInfo(t *testing.T) {
	t.Helper()
	old := CrawlerInfo
	CrawlerInfo = func(bot string) (string, string) {
		switch bot {
		case "GPTBot":
			return "OpenAI", "training"
		case "OAI-SearchBot":
			return "OpenAI", "indexing"
		case "ChatGPT-User":
			return "OpenAI", "fetch"
		case "ClaudeBot":
			return "Anthropic", "training"
		}
		return "", ""
	}
	t.Cleanup(func() { CrawlerInfo = old })
}

func TestCrawlersNotConfigured(t *testing.T) {
	db := fixture(t, pv("A", "a1", "/", t0))
	c, err := Crawlers(db, thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	if c.Configured || c.Total != 0 || c.PrevTotal != nil || len(c.Providers) != 0 || len(c.Pages) != 0 || c.Providers == nil || c.Pages == nil {
		t.Fatalf("got %+v", c)
	}
	if len(c.Categories) != 4 || len(c.Series) != 31 {
		t.Fatalf("categories %d series %d", len(c.Categories), len(c.Series))
	}
	n, ok, err := CrawlTotal(db, "s", 0, t0)
	if err != nil || ok || n != 0 {
		t.Fatalf("total %d %v %v", n, ok, err)
	}
}

func TestCrawlersByCategoryAndProvider(t *testing.T) {
	withCrawlerInfo(t)
	db := fixture(t)
	hit(t, db, t0, "GPTBot", "/docs", 10)
	hit(t, db, t0, "GPTBot", "/", 2)
	hit(t, db, t0+hour, "OAI-SearchBot", "/docs", 3)
	hit(t, db, t0, "ClaudeBot", "/", 5)
	hit(t, db, t0, "WeirdBot", "/x", 1)
	hit(t, db, t0-35*day, "GPTBot", "/docs", 4) // previous window
	c, err := Crawlers(db, thirtyDays())
	if err != nil {
		t.Fatal(err)
	}
	if !c.Configured || c.Total != 21 || c.PrevTotal == nil || *c.PrevTotal != 4 {
		t.Fatalf("totals %+v", c)
	}
	want := map[string]int{"training": 17, "indexing": 3, "fetch": 0, "general": 1}
	for _, cat := range c.Categories {
		if cat.Requests != want[cat.Key] || cat.Prev == nil {
			t.Fatalf("categories %+v", c.Categories)
		}
	}
	if c.Providers[0].Provider != "OpenAI" || len(c.Providers[0].Crawlers) != 2 || c.Providers[0].Crawlers[0].Name != "GPTBot" ||
		*c.Providers[0].Crawlers[0].Prev != 4 || c.Providers[2].Provider != "WeirdBot" {
		t.Fatalf("providers %+v", c.Providers)
	}
	if c.Pages[0].Path != "/docs" || c.Pages[0].Requests != 13 || c.Pages[0].Crawler != "GPTBot" || c.Pages[0].Provider != "OpenAI" ||
		c.Pages[0].LastSeen != t0+hour+minute {
		t.Fatalf("pages %+v", c.Pages)
	}
	var series int
	for _, pt := range c.Series {
		series += pt.Training + pt.Indexing + pt.Fetch + pt.General
	}
	if series != 21 {
		t.Fatalf("series sum %d", series)
	}
}

func TestCrawlTotalMatchesReport(t *testing.T) {
	db := fixture(t)
	hit(t, db, t0, "GPTBot", "/", 7)
	hit(t, db, t0-3*day, "ClaudeBot", "/", 4)
	hit(t, db, t0-90*day, "ClaudeBot", "/", 100)
	p := thirtyDays()
	c, err := Crawlers(db, p)
	if err != nil {
		t.Fatal(err)
	}
	n, ok, err := CrawlTotal(db, "s", p.From, p.To)
	if err != nil || !ok || n != c.Total || n != 11 {
		t.Fatalf("total %d report %d ok %v err %v", n, c.Total, ok, err)
	}
}

func TestCrawlersSingleDayWidens(t *testing.T) {
	db := fixture(t)
	hit(t, db, t0-5*day, "GPTBot", "/", 3)
	from := time.Date(2026, 11, 19, 0, 0, 0, 0, ist).UnixMilli()
	p := b3Win(from, from+day-1, from-day, from-1)
	p.Win.Bucket = "hour"
	c, err := Crawlers(db, p)
	if err != nil {
		t.Fatal(err)
	}
	wantFrom := time.Date(2026, 11, 13, 0, 0, 0, 0, ist).UnixMilli()
	if c.Window.From != wantFrom || c.Window.To != from+day-1 || c.Window.Bucket != "day" || len(c.Series) != 7 {
		t.Fatalf("window %+v series %d", c.Window, len(c.Series))
	}
	if c.Total != 3 || c.Window.PrevFrom == nil || *c.Window.PrevTo != wantFrom-1 {
		t.Fatalf("total %d window %+v", c.Total, c.Window)
	}
}
