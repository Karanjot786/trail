package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/meta"
	"trail/internal/share"
	"trail/internal/sites"
	"trail/internal/store"
)

// shareFixture serves site s with two people: alice (identified, IN, bought
// something) and anon B (US), plus site o.
type shareFixture struct {
	db    *sql.DB
	h     http.Handler
	clock *time.Time
}

func newShareFixture(t *testing.T) *shareFixture {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "sh.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	now := time.Now()
	ts := now.Add(-time.Hour).UnixMilli()
	for _, e := range []store.Event{
		{SiteID: "s", Type: "pageview", AnonID: "anonA", SessionID: "sa", Path: "/", Country: "IN", TS: ts, Env: "production"},
		{SiteID: "s", Type: "identify", AnonID: "anonA", SessionID: "sa", UserID: "alice@example.com", TS: ts + 1, Env: "production"},
		{SiteID: "s", Type: "event", Name: "Purchase", Props: `{"amount":49,"currency":"USD"}`, AnonID: "anonA", SessionID: "sa", Path: "/", Country: "IN", TS: ts + 2, Env: "production"},
		{SiteID: "s", Type: "pageview", AnonID: "anonB", SessionID: "sb", Path: "/pricing", Country: "US", TS: ts + 3, Env: "production"},
		{SiteID: "o", Type: "pageview", AnonID: "anonO", SessionID: "so", Path: "/other", Country: "US", TS: ts, Env: "production"},
	} {
		st.Enqueue(e)
	}
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	reg, _ := sites.Open(st.DB())
	for id, d := range map[string]string{"s": "example.com", "o": "other.com"} {
		if _, err := reg.Add(sites.Site{ID: id, Domain: d}); err != nil {
			t.Fatal(err)
		}
	}
	f := &shareFixture{db: st.DB(), clock: &now}
	ist, _ := time.LoadLocation("Asia/Kolkata")
	f.h = ShareHandler(st.DB(), reg, ist, WithClock(func() time.Time { return *f.clock }))
	return f
}

func (f *shareFixture) share(t *testing.T, state string, hideRevenue bool, ttl time.Duration) (meta.Share, string) {
	t.Helper()
	sh, plain, err := meta.CreateShare(f.db, "s", "test", state, hideRevenue, ttl)
	if err != nil {
		t.Fatal(err)
	}
	return sh, plain
}

func (f *shareFixture) get(token, route string) *httptest.ResponseRecorder {
	return get(f.h, "/api/share/"+token+"/"+route)
}

func TestShareExpiredIs410(t *testing.T) {
	f := newShareFixture(t)
	_, tok := f.share(t, "", false, 24*time.Hour)
	if w := f.get(tok, "stats?range=7d"); w.Code != 200 {
		t.Fatalf("fresh: %d %s", w.Code, w.Body)
	}
	*f.clock = f.clock.Add(25 * time.Hour)
	w := f.get(tok, "stats?range=7d")
	if w.Code != http.StatusGone || !strings.Contains(w.Body.String(), "expired or was revoked") {
		t.Fatalf("expired: %d %s", w.Code, w.Body)
	}
	if w := f.get(tok, "meta"); w.Code != http.StatusGone {
		t.Fatalf("expired meta: %d", w.Code)
	}
}

func TestShareRevokedIs410(t *testing.T) {
	f := newShareFixture(t)
	sh, tok := f.share(t, "", false, 0)
	if err := meta.RevokeShare(f.db, sh.ID); err != nil {
		t.Fatal(err)
	}
	if w := f.get(tok, "stats"); w.Code != http.StatusGone {
		t.Fatalf("revoked: %d", w.Code)
	}
	if w := f.get("shr_"+strings.Repeat("A", 43), "stats"); w.Code != http.StatusNotFound {
		t.Fatalf("unknown token: %d", w.Code)
	}
}

func TestShareForcesSiteAndFilters(t *testing.T) {
	f := newShareFixture(t)
	_, tok := f.share(t, "range=7d&f=country:IN", false, 0)
	w := f.get(tok, "breakdown?dim=path&range=7d&site=o&f=country:US")
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if body := w.Body.String(); !strings.Contains(body, `"key":"/"`) || strings.Contains(body, "/pricing") || strings.Contains(body, "/other") {
		t.Fatalf("filters not forced: %s", body)
	}
	var m meta.ShareMeta
	w = f.get(tok, "meta")
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil || m.Site.ID != "s" || m.State != "range=7d&f=country:IN" {
		t.Fatalf("meta: %s", w.Body)
	}
}

func TestSharePseudonymStableAndUnlinkable(t *testing.T) {
	f := newShareFixture(t)
	_, tok1 := f.share(t, "", false, 0)
	_, tok2 := f.share(t, "", false, 0)
	raw := []string{"anonA", "anonB", "alice@example.com"}
	label := func(tok string) string {
		w := f.get(tok, "visitors?range=7d")
		var rows []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil || len(rows) != 2 {
			t.Fatalf("visitors: %d %s", w.Code, w.Body)
		}
		return rows[0]["label"].(string) + "|" + rows[0]["person"].(string)
	}
	a1, a1again, a2 := label(tok1), label(tok1), label(tok2)
	if a1 != a1again || a1 == a2 || !strings.HasPrefix(a1, "Visitor ") {
		t.Fatalf("labels %q %q %q", a1, a1again, a2)
	}
	routes := []string{"stats", "series?metric=visitors", "breakdown?dim=path", "visitors", "sessions", "live", "changes",
		"heatmap", "campaigns", "ai-referrals", "events", "goals", "goals/report", "funnels", "revenue", "crawlers", "notes", "meta", "sites"}
	for _, r := range routes {
		sep := "?"
		if strings.Contains(r, "?") {
			sep = "&"
		}
		w := f.get(tok1, r+sep+"range=7d")
		for _, id := range raw {
			if strings.Contains(w.Body.String(), id) {
				t.Errorf("%s leaks %q: %s", r, id, w.Body)
			}
		}
	}
}

func TestShareJourneyAcceptsOpaqueId(t *testing.T) {
	f := newShareFixture(t)
	sh, tok := f.share(t, "", false, 0)
	_, key, err := meta.LookupShare(f.db, tok, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	_ = sh
	opaque, _ := share.Pseudonym(key, "alice@example.com")
	w := f.get(tok, "journey?person="+opaque)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"steps"`) {
		t.Fatalf("journey: %d %s", w.Code, w.Body)
	}
	if strings.Contains(w.Body.String(), "alice@example.com") {
		t.Fatalf("journey leaks the user id: %s", w.Body)
	}
	if w := f.get(tok, "journey?person=alice@example.com"); w.Code != http.StatusNotFound {
		t.Errorf("raw id accepted: %d", w.Code)
	}
	_, tok2 := f.share(t, "", false, 0)
	if w := f.get(tok2, "journey?person="+opaque); w.Code != http.StatusNotFound {
		t.Errorf("another link's id accepted: %d", w.Code)
	}
}

func TestShareHideRevenue(t *testing.T) {
	f := newShareFixture(t)
	_, tok := f.share(t, "", true, 0)
	for _, r := range []string{"revenue", "revenue/breakdown?dim=source", "series?metric=revenue"} {
		if w := f.get(tok, r); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", r, w.Code)
		}
	}
	w := f.get(tok, "stats?range=7d")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"revenueMinor":0`) {
		t.Errorf("stats: %d %s", w.Code, w.Body)
	}
	w = f.get(tok, "meta")
	if !strings.Contains(w.Body.String(), `"revenue":false`) || !strings.Contains(w.Body.String(), `"hideRevenue":true`) {
		t.Errorf("meta: %s", w.Body)
	}
	_, open := f.share(t, "", false, 0)
	if w := f.get(open, "stats?range=7d"); !strings.Contains(w.Body.String(), `"revenueMinor":4900`) {
		t.Logf("revenue sum not in stats yet (B1/B3): %s", w.Body)
	}
}

func TestShareNoWrites(t *testing.T) {
	f := newShareFixture(t)
	_, tok := f.share(t, "", false, 0)
	for _, m := range []string{http.MethodPost, http.MethodDelete, http.MethodPatch, http.MethodPut} {
		w := send(f.h, m, "/api/share/"+tok+"/goals", `{"site":"s","name":"x","kind":"page","match":"/"}`)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: %d", m, w.Code)
		}
	}
	for _, r := range []string{"tokens", "shares", "views", "sites/s/export", "config", "../tokens"} {
		if w := f.get(tok, r); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", r, w.Code)
		}
	}
	if w := f.get(tok, "stats"); w.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Error("no Referrer-Policy")
	}
}

func TestShareRateLimit429(t *testing.T) {
	f := newShareFixture(t)
	_, tok := f.share(t, "", false, 0)
	for i := range shareRateLimit {
		if w := f.get(tok, "goals"); w.Code != 200 {
			t.Fatalf("request %d: %d", i, w.Code)
		}
	}
	if w := f.get(tok, "goals"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("over the limit: %d", w.Code)
	}
	_, other := f.share(t, "", false, 0)
	if w := f.get(other, "goals"); w.Code != 200 {
		t.Fatalf("another link shares the bucket: %d", w.Code)
	}
}
