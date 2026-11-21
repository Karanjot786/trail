package crawlers

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"trail/internal/store"
)

func TestLookupCatalogue(t *testing.T) {
	for _, c := range []struct{ ua, bot, provider, category string }{
		{"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", "GPTBot", "OpenAI", Training},
		{"Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", "ChatGPT-User", "OpenAI", Fetch},
		{"OAI-SearchBot/1.0", "OAI-SearchBot", "OpenAI", Indexing},
		{"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ClaudeBot", "Anthropic", Training},
		{"Claude-User/1.0", "Claude-User", "Anthropic", Fetch},
		{"Claude-SearchBot/1.0", "Claude-SearchBot", "Anthropic", Indexing},
		{"PerplexityBot/1.0", "PerplexityBot", "Perplexity", Indexing},
		{"Perplexity-User/1.0", "Perplexity-User", "Perplexity", Fetch},
		{"Mozilla/5.0 (Macintosh) Applebot/0.1", "Applebot", "Apple", General},
		{"Amazonbot/0.1", "Amazonbot", "Amazon", General},
		{"Bytespider", "Bytespider", "ByteDance", Training},
		{"CCBot/2.0 (https://commoncrawl.org/faq/)", "CCBot", "Common Crawl", Training},
		{"meta-externalagent/1.1", "Meta-ExternalAgent", "Meta", Training},
		{"meta-externalfetcher/1.1", "Meta-ExternalFetcher", "Meta", Fetch},
		{"DuckAssistBot/1.0", "DuckAssistBot", "DuckDuckGo", Fetch},
		{"MistralAI-User/1.0", "MistralAI-User", "Mistral", Fetch},
		{"cohere-ai", "cohere-ai", "Cohere", Training},
		{"GoogleOther", "GoogleOther", "Google", General},
		{"YouBot", "YouBot", "You.com", Indexing},
	} {
		bot, provider, category, ok := Lookup(c.ua)
		if !ok || bot != c.bot || provider != c.provider || category != c.category {
			t.Errorf("%q → %s %s %s %v", c.ua, bot, provider, category, ok)
		}
		if p, cat := Info(c.bot); p != c.provider || cat != c.category {
			t.Errorf("Info(%s) = %s %s", c.bot, p, cat)
		}
	}
	for _, ua := range []string{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", "", "Googlebot/2.1"} {
		if _, _, _, ok := Lookup(ua); ok {
			t.Errorf("%q matched", ua)
		}
	}
}

func TestParseCombined(t *testing.T) {
	line := `203.0.113.9 - - [20/Nov/2026:10:05:00 +0530] "GET /docs/intro?x=1 HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"`
	r, ok := ParseCombined(line)
	if !ok || r.Path != "/docs/intro?x=1" || r.Status != 200 || !strings.Contains(r.UA, "GPTBot") || r.TS != 1795149300000 {
		t.Fatalf("%+v %v", r, ok)
	}
	quotes := `198.51.100.1 - - [20/Nov/2026:04:35:00 +0000] "GET / HTTP/1.1" 404 0 "https://x.dev/\"q\"" "ClaudeBot \"quoted\" \x22hex\x22"`
	r, ok = ParseCombined(quotes)
	if !ok || r.UA != `ClaudeBot "quoted" "hex"` || r.Status != 404 {
		t.Fatalf("quotes: %+v %v", r, ok)
	}
	for _, bad := range []string{"", "garbage", `1.2.3.4 - - [nope] "GET / HTTP/1.1" 200 1 "-" "x"`, `1.2.3.4 - - [20/Nov/2026:04:35:00 +0000] "GET / HTTP/1.1" abc 1 "-" "x"`, `1.2.3.4 - - [20/Nov/2026:04:35:00 +0000] "GET / HTTP/1.1" 200 1 "-" "unterminated`} {
		if _, ok := ParseCombined(bad); ok {
			t.Errorf("%q parsed", bad)
		}
	}
}

func TestParseCaddyJSON(t *testing.T) {
	line := `{"level":"info","ts":1795149300.123,"logger":"http.log.access","request":{"remote_ip":"1.2.3.4","method":"GET","host":"x.dev","uri":"/a?b=1","headers":{"User-Agent":["PerplexityBot/1.0"]}},"status":301}`
	r, ok := ParseCaddyJSON([]byte(line))
	if !ok || r.TS != 1795149300123 || r.Path != "/a?b=1" || r.Status != 301 || r.UA != "PerplexityBot/1.0" {
		t.Fatalf("%+v %v", r, ok)
	}
	r, ok = ParseCaddyJSON([]byte(`{"ts":"2026-11-20T04:35:00Z","request":{"uri":"/","headers":{"user-agent":["CCBot"]}},"status":200}`))
	if !ok || r.TS != 1795149300000 || r.UA != "CCBot" {
		t.Fatalf("rfc3339: %+v %v", r, ok)
	}
	for _, bad := range []string{"", "{", `{"ts":1,"request":{},"status":200}`, `{"ts":true,"request":{"uri":"/"},"status":200}`} {
		if _, ok := ParseCaddyJSON([]byte(bad)); ok {
			t.Errorf("%q parsed", bad)
		}
	}
}

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "c.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st.DB()
}

func TestIngestAggregatesPerHour(t *testing.T) {
	db := openDB(t)
	h := int64(1795633200000) // an hour boundary
	recs := []Record{
		{TS: h + 1000, UA: "GPTBot/1.2", Path: "/a?utm=1", Status: 200},
		{TS: h + 2000, UA: "GPTBot/1.2", Path: "/a#frag", Status: 204},
		{TS: h + 3000, UA: "GPTBot/1.2", Path: "/a", Status: 404},
		{TS: h + 3_600_000, UA: "GPTBot/1.2", Path: "/a", Status: 200},
		{TS: h + 5000, UA: "Chrome", Path: "/a", Status: 200},
		{TS: h + 6000, UA: "ClaudeBot", Path: "/" + strings.Repeat("é", 400), Status: 200},
		{TS: h + 7000, UA: "ClaudeBot", Path: "https://x.dev/abs?q", Status: 200},
		{TS: h + 8000, UA: "ClaudeBot", Path: "/x", Status: 999},
	}
	kept, err := Ingest(db, "s", recs, nil)
	if err != nil || kept != 6 {
		t.Fatalf("kept %d %v", kept, err)
	}
	type row struct {
		hour      int64
		bot, path string
		status, n int
		last      int64
	}
	var rows []row
	rs, _ := db.Query(`SELECT hour, bot, path, status, n, last_ts FROM crawl_hits ORDER BY hour, bot, path, status`)
	for rs.Next() {
		var r row
		_ = rs.Scan(&r.hour, &r.bot, &r.path, &r.status, &r.n, &r.last)
		rows = append(rows, r)
	}
	rs.Close()
	if len(rows) != 5 {
		t.Fatalf("rows %+v", rows)
	}
	if r := rows[2]; r.bot != "GPTBot" || r.path != "/a" || r.status != 2 || r.n != 2 || r.last != h+2000 || r.hour != h {
		t.Errorf("aggregated row %+v", r)
	}
	if r := rows[1]; len(r.path) > maxPath || !strings.HasPrefix(r.path, "/é") {
		t.Errorf("long path %d bytes", len(r.path))
	}
	if r := rows[0]; r.path != "/abs" {
		t.Errorf("absolute target %+v", r)
	}
	// A second batch adds to the same keys.
	if _, err := Ingest(db, "s", recs[:1], nil); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRow(`SELECT n FROM crawl_hits WHERE bot='GPTBot' AND hour=? AND status=2`, h).Scan(&n)
	if n != 3 {
		t.Errorf("upsert n=%d", n)
	}
}

func TestImportSinceAutoNoDoubleCount(t *testing.T) {
	db := openDB(t)
	log := strings.Join([]string{
		`1.1.1.1 - - [20/Nov/2026:04:00:00 +0000] "GET /a HTTP/1.1" 200 1 "-" "GPTBot"`,
		`1.1.1.1 - - [20/Nov/2026:04:01:00 +0000] "GET /b HTTP/1.1" 200 1 "-" "Mozilla Chrome"`,
		`1.1.1.1 - - [20/Nov/2026:04:02:00 +0000] "GET /c HTTP/1.1" 200 1 "-" "ClaudeBot"`,
		`not a log line`,
	}, "\n")
	run := func() (int, int) {
		since, err := LastTS(db, "s")
		if err != nil {
			t.Fatal(err)
		}
		lines, kept, err := Scan(strings.NewReader(log), "combined", since, 1, func(r []Record) error {
			_, err := Ingest(db, "s", r, nil)
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
		return lines, kept
	}
	if lines, kept := run(); lines != 4 || kept != 2 {
		t.Fatalf("first import: %d lines %d kept", lines, kept)
	}
	if _, kept := run(); kept != 0 {
		t.Fatalf("re-import kept %d", kept)
	}
	var total int
	_ = db.QueryRow(`SELECT sum(n) FROM crawl_hits`).Scan(&total)
	if total != 2 {
		t.Fatalf("total %d after re-import", total)
	}
	if _, _, err := Scan(strings.NewReader(""), "apache2", 0, 1, nil); err == nil {
		t.Error("bad format accepted")
	}
}

func TestCrawlerAdditions(t *testing.T) {
	for _, c := range []struct{ ua, bot, provider, category string }{
		{"Mozilla/5.0 (compatible; OAI-AdsBot/1.0; +https://openai.com/adsbot)", "OAI-AdsBot", "OpenAI", General},
		{"anthropic-ai", "anthropic-ai", "Anthropic", Training},
		{"Gemini-Deep-Research", "Gemini-Deep-Research", "Google", Fetch},
		{"Amzn-SearchBot/1.0", "Amzn-SearchBot", "Amazon", Indexing},
		{"Amzn-User/1.0", "Amzn-User", "Amazon", Fetch},
		{"meta-webindexer/1.1", "meta-webindexer", "Meta", Indexing},
		{"MistralAI-Index/1.0", "MistralAI-Index", "Mistral", Indexing},
		{"DeepSeekBot/1.0", "DeepSeekBot", "DeepSeek", Training},
		{"Kimi-User/1.0", "Kimi-User", "Moonshot", Fetch},
		{"Bravebot/1.0", "Bravebot", "Brave", Indexing},
	} {
		bot, provider, category, ok := Lookup(c.ua)
		if !ok || bot != c.bot || provider != c.provider || category != c.category {
			t.Errorf("%q → %s %s %s %v", c.ua, bot, provider, category, ok)
		}
	}
	names := Names()
	if len(names) != 29 || names[0] != "GPTBot" || names[19] != "OAI-AdsBot" || names[28] != "Bravebot" {
		t.Errorf("Names() = %v", names)
	}
	// Agent tokens are not crawlers.
	for _, ua := range []string{"Claude-Agent/1.0", "compatible; Google-Agent", "GoogleAgent-Mariner/1.0", "Googlebot/2.1", "bingbot/2.0"} {
		if bot, _, _, ok := Lookup(ua); ok {
			t.Errorf("%q matched %s", ua, bot)
		}
	}
}

func TestParseCombinedIP(t *testing.T) {
	for line, want := range map[string]string{
		`203.0.113.9 - - [20/Nov/2026:10:05:00 +0530] "GET / HTTP/1.1" 200 1 "-" "GPTBot"`:  "203.0.113.9",
		`2001:db8::1 - - [20/Nov/2026:10:05:00 +0530] "GET / HTTP/1.1" 200 1 "-" "GPTBot"`:  "2001:db8::1",
		`host.example - - [20/Nov/2026:10:05:00 +0530] "GET / HTTP/1.1" 200 1 "-" "GPTBot"`: "",
		` 203.0.113.9 - - [20/Nov/2026:10:05:00 +0530] "GET / HTTP/1.1" 200 1 "-" "GPTBot"`: "203.0.113.9",
	} {
		r, ok := ParseCombined(line)
		if !ok || r.IP != want {
			t.Errorf("%q → %q %v, want %q", line, r.IP, ok, want)
		}
	}
}

func TestParseCaddyIP(t *testing.T) {
	both := `{"ts":1795149300,"request":{"remote_ip":"10.0.0.1","client_ip":"203.0.113.9","uri":"/","headers":{"User-Agent":["GPTBot"]}},"status":200}`
	remote := `{"ts":1795149300,"request":{"remote_ip":"203.0.113.7","uri":"/","headers":{"User-Agent":["GPTBot"]}},"status":200}`
	bad := `{"ts":1795149300,"request":{"remote_ip":"nope","uri":"/","headers":{"User-Agent":["GPTBot"]}},"status":200}`
	for line, want := range map[string]string{both: "203.0.113.9", remote: "203.0.113.7", bad: ""} {
		r, ok := ParseCaddyJSON([]byte(line))
		if !ok || r.IP != want {
			t.Errorf("%s → %q %v", line, r.IP, ok)
		}
	}
}

func TestIngestStatusZero(t *testing.T) {
	db := openDB(t)
	h := int64(1795633200000)
	kept, err := Ingest(db, "s", []Record{
		{TS: h, UA: "GPTBot", Path: "/a", Status: 0},
		{TS: h, UA: "GPTBot", Path: "/a", Status: 99}, // not a status
		{TS: h, UA: "GPTBot", Path: "/a", Status: 600},
	}, nil)
	if err != nil || kept != 1 {
		t.Fatalf("kept %d %v", kept, err)
	}
	var status, n int
	if err := db.QueryRow(`SELECT status, n FROM crawl_hits`).Scan(&status, &n); err != nil || status != 0 || n != 1 {
		t.Errorf("status %d n %d %v", status, n, err)
	}
}

func TestIngestVerifiedSplit(t *testing.T) {
	db := openDB(t)
	h := int64(1795633200000)
	var asked []string
	verify := func(bot, ip string) bool {
		asked = append(asked, bot+"@"+ip)
		return ip == "192.0.2.1"
	}
	kept, err := Ingest(db, "s", []Record{
		{TS: h + 1, UA: "GPTBot", Path: "/a", Status: 200, IP: "192.0.2.1"},
		{TS: h + 2, UA: "GPTBot", Path: "/a", Status: 200, IP: "198.51.100.1"},
		{TS: h + 3, UA: "GPTBot", Path: "/a", Status: 200},
		{TS: h + 4, UA: "GPTBot", Path: "/a", Status: 200, IP: "192.0.2.1"},
	}, verify)
	if err != nil || kept != 4 {
		t.Fatalf("kept %d %v", kept, err)
	}
	if len(asked) != 3 {
		t.Errorf("verify called for %v (never without an IP)", asked)
	}
	got := map[int]int{}
	rs, err := db.Query(`SELECT verified, n FROM crawl_hits WHERE bot='GPTBot' AND path='/a' AND status=2`)
	if err != nil {
		t.Fatal(err)
	}
	for rs.Next() {
		var v, n int
		_ = rs.Scan(&v, &n)
		got[v] = n
	}
	rs.Close()
	if len(got) != 2 || got[1] != 2 || got[0] != 2 {
		t.Errorf("rows by verified %v", got)
	}
}
