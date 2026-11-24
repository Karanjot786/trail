package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"trail/internal/sites"
	"trail/internal/store"
)

// testServer is setupReg's store behind a *server, so tests can call params directly.
func testServer(t *testing.T, opts ...Option) *server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "p.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	reg, err := sites.Open(st.DB())
	if err != nil {
		t.Fatal(err)
	}
	for id, d := range map[string]string{"s": "example.com", "b": "b.com"} {
		if _, err := reg.Add(sites.Site{ID: id, Domain: d}); err != nil {
			t.Fatal(err)
		}
	}
	ist, _ := time.LoadLocation("Asia/Kolkata")
	return newServer(st.DB(), reg, ist, opts...)
}

func req(url string) *http.Request { return httptest.NewRequest(http.MethodGet, url, nil) }

func TestParamsRangeKeyResolves(t *testing.T) {
	s := testServer(t)
	p, err := s.params(req("/api/stats?site=s&range=7d&tz=America/New_York"))
	if err != nil {
		t.Fatal(err)
	}
	if p.Win.TZ != "America/New_York" || p.TZ.String() != "America/New_York" {
		t.Fatalf("tz = %q / %v", p.Win.TZ, p.TZ)
	}
	if p.From != p.Win.From || p.To != p.Win.To || p.From >= p.To {
		t.Fatalf("from/to %d..%d, win %d..%d", p.From, p.To, p.Win.From, p.Win.To)
	}
	if p.Limit != 100 || p.Offset != 0 {
		t.Fatalf("paging defaults %d/%d", p.Limit, p.Offset)
	}
}

func TestParamsBadTZFallsBack(t *testing.T) {
	s := testServer(t)
	for _, tz := range []string{"Mars/Base", "../../etc/passwd", strings.Repeat("A", 65), ""} {
		p, err := s.params(req("/api/stats?site=s&range=7d&tz=" + tz))
		if err != nil {
			t.Fatalf("%q: %v", tz, err)
		}
		if p.TZ.String() != "Asia/Kolkata" {
			t.Errorf("%q: tz %v, want the server default", tz, p.TZ)
		}
	}
}

func TestParamsLegacyFromTo(t *testing.T) {
	s := testServer(t)
	now := time.Now().UnixMilli()
	from, to := now-3*86400000, now
	p, err := s.params(req(fmt.Sprintf("/api/stats?site=s&from=%d&to=%d", from, to)))
	if err != nil {
		t.Fatal(err)
	}
	if p.From != from || p.To != to {
		t.Fatalf("from/to %d..%d, want %d..%d", p.From, p.To, from, to)
	}
	if !strings.HasPrefix(p.Win.Key, "c:") {
		t.Errorf("window key %q, want c:…", p.Win.Key)
	}
	if p.Win.Bucket != "day" || p.Win.PrevTo == nil || *p.Win.PrevTo != from-1 {
		t.Errorf("bucket %q prevTo %v, want day and %d", p.Win.Bucket, p.Win.PrevTo, from-1)
	}
}

func TestParamsLegacy24hHourly(t *testing.T) {
	s := testServer(t)
	now := time.Now().UnixMilli()
	p, err := s.params(req(fmt.Sprintf("/api/stats?site=s&from=%d", now-24*3600_000)))
	if err != nil {
		t.Fatal(err)
	}
	if p.Win.Bucket != "hour" || p.Win.Basis.Short != "prev. 24 hours" {
		t.Errorf("bucket %q basis %q", p.Win.Bucket, p.Win.Basis.Short)
	}
}

func TestParamsUnknownDim400(t *testing.T) {
	h := setup(t)
	for _, u := range []string{"/api/stats?site=s&f=password:x", "/api/stats?site=s&f=country:IN&f=country:US"} {
		if w := get(h, u); w.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", u, w.Code)
		}
	}
	p, err := testServer(t).params(req("/api/stats?site=s&f=utm_term:x&f=channel:AI&f=hour:9"))
	if err != nil || len(p.Filters) != 3 {
		t.Errorf("v3 dims refused: %v %v", p.Filters, err)
	}
}

func TestParamsSiteAllOnlyWhereAllowed(t *testing.T) {
	h := setup(t)
	w := get(h, "/api/sessions?site=all")
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "pick a site") {
		t.Fatalf("sessions site=all: %d %s", w.Code, w.Body)
	}
	s := testServer(t)
	if _, err := s.paramsFor(req("/api/stats?site=all"), true); err != nil {
		t.Fatalf("stats site=all: %v", err)
	}
}

func TestParamsLimitClamped(t *testing.T) {
	s := testServer(t)
	for in, want := range map[string]int{"5000": 1000, "0": 1, "-3": 1, "junk": 100, "": 100, "250": 250} {
		p, err := s.params(req("/api/visitors?site=s&limit=" + in))
		if err != nil {
			t.Fatal(err)
		}
		if p.Limit != want {
			t.Errorf("limit=%s → %d, want %d", in, p.Limit, want)
		}
	}
	p, _ := s.params(req("/api/visitors?site=s&offset=-4"))
	if p.Offset != 0 {
		t.Errorf("negative offset kept: %d", p.Offset)
	}
}

func TestParamsClockAndConv(t *testing.T) {
	pinned := time.Date(2026, 11, 20, 10, 5, 0, 0, time.UTC)
	s := testServer(t, WithClock(func() time.Time { return pinned }))
	p, err := s.params(req("/api/stats?site=s&conv=7&sort=-visitors"))
	if err != nil {
		t.Fatal(err)
	}
	if !p.Now.Equal(pinned) || p.Conv != 7 || p.Sort != "-visitors" {
		t.Fatalf("now %v conv %d sort %q", p.Now, p.Conv, p.Sort)
	}
	if _, err := s.params(req("/api/stats?site=s&sort=x%3Bdrop")); err == nil {
		t.Error("bad sort accepted")
	}
}

func TestParamsActor(t *testing.T) {
	s := testServer(t)
	for q, want := range map[string]string{"": "", "&actor=": "", "&actor=human": "human", "&actor=all": "all"} {
		p, err := s.params(req("/api/stats?site=s&range=7d" + q))
		if err != nil || p.Actor != want {
			t.Fatalf("%q: actor %q err %v", q, p.Actor, err)
		}
	}
	h := s.routes()
	for _, bad := range []string{"bot", "agent", "ALL"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req("/api/stats?site=s&range=7d&actor="+bad))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "bad actor") {
			t.Fatalf("actor=%s: %d %s", bad, w.Code, w.Body.String())
		}
	}
}
