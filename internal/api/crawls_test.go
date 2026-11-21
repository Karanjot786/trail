package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/agents"
	"trail/internal/auth"
	"trail/internal/sites"
	"trail/internal/store"
)

func postCrawl(h http.Handler, tok auth.Token, query, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/crawls"+query, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/x-ndjson")
	r = r.WithContext(auth.WithToken(r.Context(), tok))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestCrawlsEndpointLimits(t *testing.T) {
	h := setup(t)
	crawl := auth.Token{ID: "t", Name: "edge", Scope: "crawl", Site: "s"}
	line := `{"ts":1795149300000,"ua":"GPTBot/1.2","path":"/a","status":200}` + "\n"
	w := postCrawl(h, crawl, "", line+`{"ts":1795149300000,"ua":"Chrome","path":"/","status":200}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `{"accepted":2,"kept":1}`) {
		t.Fatalf("ok post: %d %s", w.Code, w.Body)
	}
	if w := postCrawl(h, crawl, "", strings.Repeat("x", maxCrawlBody+1)); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("1 MiB + 1: %d", w.Code)
	}
	if w := postCrawl(h, crawl, "", strings.Repeat("{}\n", maxCrawlLines+1)); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("too many lines: %d", w.Code)
	}
	gone := auth.Token{ID: "g", Name: "old", Scope: "crawl", Site: "deleted"}
	if w := postCrawl(h, gone, "", line); w.Code != http.StatusForbidden {
		t.Errorf("unknown site token: %d", w.Code)
	}
	if w := postCrawl(h, crawl, "?site=b", line); w.Code != http.StatusForbidden {
		t.Errorf("other site: %d", w.Code)
	}
	if w := postCrawl(h, crawl, "", `{"ts":1,"ua":"x","path":"/","status":200,"extra":1}`); w.Code != http.StatusBadRequest {
		t.Errorf("unknown field: %d", w.Code)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/crawls?site=s", strings.NewReader(line))
	r.Header.Set("Content-Type", "text/plain")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusUnsupportedMediaType {
		t.Errorf("text/plain: %d", w.Code)
	}
}

// relayRecorder records RelaySigned calls and verifies GPTBot from 192.0.2.1.
type relayRecorder struct {
	relays []string
}

func (f *relayRecorder) Status() []agents.ListStatus { return []agents.ListStatus{} }

func (f *relayRecorder) VerifyCrawler(bot, ip string) bool { return bot == "GPTBot" && ip == "192.0.2.1" }

func (f *relayRecorder) RelaySigned(site, ip, ua string, s agents.Signed, hostOK func(string) bool) agents.Result {
	f.relays = append(f.relays, fmt.Sprintf("%s|%s|%s|%s|%v|%v", site, ip, s.Authority, s.SignatureAgent, hostOK(s.Authority), hostOK("evil.example")))
	if s.SignatureAgent == `"https://chatgpt.com"` && hostOK(s.Authority) {
		return agents.Result{ID: "chatgpt-agent", Via: agents.ViaSig}
	}
	return agents.Result{}
}

func setupAgents(t *testing.T) (http.Handler, *relayRecorder, *sql.DB) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	reg, err := sites.Open(st.DB())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reg.Add(sites.Site{ID: "s", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	fa := &relayRecorder{}
	return New(st.DB(), reg, time.UTC, WithAgents(fa)), fa, st.DB()
}

var crawlTok = auth.Token{ID: "t", Name: "edge", Scope: "crawl", Site: "s"}

func TestPostCrawlsV2Fields(t *testing.T) {
	h, _, db := setupAgents(t)
	line := `{"ts":1795149300000,"ua":"GPTBot/1.2","path":"/a","status":0,"ip":"192.0.2.1","host":"example.com","sa":"","si":"","sig":""}`
	if w := postCrawl(h, crawlTok, "", line); w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `"kept":1`) {
		t.Fatalf("v2 line: %d %s", w.Code, w.Body)
	}
	var verified, status int
	if err := db.QueryRow(`SELECT verified, status FROM crawl_hits`).Scan(&verified, &status); err != nil || verified != 1 || status != 0 {
		t.Errorf("verified %d status %d %v", verified, status, err)
	}
	long := `{"ts":1795149300000,"ua":"GPTBot/1.2","path":"/a","status":200,"sig":"` + strings.Repeat("a", 5<<10) + `"}`
	w := postCrawl(h, crawlTok, "", line+"\n"+long)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "line 2: field too long") {
		t.Errorf("5 KB sig: %d %s", w.Code, w.Body)
	}
}

func TestPostCrawlsRelaysSigned(t *testing.T) {
	h, fa, db := setupAgents(t)
	signed := `{"ts":1795149300000,"ua":"Mozilla/5.0 Chrome/131","path":"/p","status":0,"ip":"203.0.113.9","host":"shop.example.com:443","sa":"\"https://chatgpt.com\"","si":"sig1=()","sig":"sig1=:AA==:"}`
	crawl := `{"ts":1795149300000,"ua":"GPTBot/1.2","path":"/a","status":200}`
	w := postCrawl(h, crawlTok, "", signed+"\n"+crawl)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `{"accepted":2,"kept":1}`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if len(fa.relays) != 1 || fa.relays[0] != `s|203.0.113.9|shop.example.com:443|"https://chatgpt.com"|true|false` {
		t.Errorf("relays %q", fa.relays)
	}
	var n int
	_ = db.QueryRow(`SELECT count(*) FROM crawl_hits WHERE path='/p'`).Scan(&n)
	if n != 0 {
		t.Error("a relayed agent navigation was stored as a crawl hit")
	}
}

func TestPostCrawlsOldLineStillValid(t *testing.T) {
	h, fa, _ := setupAgents(t)
	body := `{"ts":1795149300000,"ua":"GPTBot/1.2","path":"/a","status":200}` + "\n" + `{"ts":1795149300000,"ua":"Chrome","path":"/","status":200}`
	w := postCrawl(h, crawlTok, "", body)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `{"accepted":2,"kept":1}`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if len(fa.relays) != 0 {
		t.Errorf("unsigned lines relayed: %v", fa.relays)
	}
}
