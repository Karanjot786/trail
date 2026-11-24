package sites

import (
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"trail/internal/store"
)

func open(t *testing.T) (*Registry, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	r, err := Open(st.DB())
	if err != nil {
		t.Fatal(err)
	}
	return r, st
}

func TestAddGetList(t *testing.T) {
	r, st := open(t)
	s, err := r.Add(Site{ID: "blog", Domain: " Example.COM ", Origins: []string{"*.Vercel.app", "staging.example.org"}})
	if err != nil {
		t.Fatal(err)
	}
	if s.Domain != "example.com" || !slices.Equal(s.Origins, []string{"*.vercel.app", "staging.example.org"}) || s.Created == 0 {
		t.Fatalf("added %+v", s)
	}
	if _, err := r.Add(Site{ID: "a", Domain: "a.dev"}); err != nil {
		t.Fatal(err)
	}
	if got, ok := r.Get("blog"); !ok || got.Domain != "example.com" {
		t.Fatalf("get %+v %v", got, ok)
	}
	if l := r.List(); len(l) != 2 || l[0].ID != "a" || l[1].ID != "blog" {
		t.Fatalf("list %+v", l)
	}
	if _, err := r.Add(Site{ID: "blog", Domain: "other.com"}); !errors.Is(err, ErrExists) {
		t.Fatalf("duplicate: %v", err)
	}
	// A second registry on the same DB sees the rows.
	r2, err := Open(st.DB())
	if err != nil {
		t.Fatal(err)
	}
	if got, ok := r2.Get("blog"); !ok || !slices.Equal(got.Origins, s.Origins) {
		t.Fatalf("reload %+v %v", got, ok)
	}
}

func TestValidation(t *testing.T) {
	r, _ := open(t)
	many := make([]string, 21)
	for i := range many {
		many[i] = string(rune('a'+i)) + ".com"
	}
	for name, s := range map[string]Site{
		"empty id":              {ID: "", Domain: "a.com"},
		"upper id":              {ID: "Blog", Domain: "a.com"},
		"leading dash":          {ID: "-blog", Domain: "a.com"},
		"long id":               {ID: "a1234567890123456789012345678901234567890", Domain: "a.com"},
		"id with dot":           {ID: "a.b", Domain: "a.com"},
		"no domain":             {ID: "a", Domain: ""},
		"scheme":                {ID: "a", Domain: "https://a.com"},
		"path":                  {ID: "a", Domain: "a.com/x"},
		"port":                  {ID: "a", Domain: "a.com:8080"},
		"space":                 {ID: "a", Domain: "a b.com"},
		"bad origin":            {ID: "a", Domain: "a.com", Origins: []string{"https://b.com"}},
		"bare wildcard":         {ID: "a", Domain: "a.com", Origins: []string{"*"}},
		"tld wildcard":          {ID: "a", Domain: "a.com", Origins: []string{"*.com"}},
		"inner wildcard":        {ID: "a", Domain: "a.com", Origins: []string{"a.*.com"}},
		"21 origins":            {ID: "a", Domain: "a.com", Origins: many},
		"hyphen on registrable": {ID: "a", Domain: "a.com", Origins: []string{"*-shop.com"}},
		"hyphen no host":        {ID: "a", Domain: "a.com", Origins: []string{"*-"}},
		"star mid":              {ID: "a", Domain: "a.com", Origins: []string{"a*-b.vercel.app"}},
	} {
		if _, err := r.Add(s); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err %v, want ErrInvalid", name, err)
		}
	}
	for _, s := range []Site{
		{ID: "a", Domain: "localhost"},
		{ID: "b-2", Domain: "my-app.co.uk", Origins: []string{"*.vercel.app", "  ", "x.dev"}},
		{ID: "a123456789012345678901234567890123456789", Domain: "x.io"}, // 40 chars
	} {
		if _, err := r.Add(s); err != nil {
			t.Errorf("%+v: %v", s, err)
		}
	}
	if s, _ := r.Get("b-2"); len(s.Origins) != 2 {
		t.Errorf("blank origins kept: %q", s.Origins)
	}
}

func TestUpdate(t *testing.T) {
	r, _ := open(t)
	orig, _ := r.Add(Site{ID: "s", Domain: "example.com"})
	s, err := r.Update(Site{ID: "s", Domain: "new.com", Origins: []string{"*.vercel.app"}})
	if err != nil {
		t.Fatal(err)
	}
	if s.Domain != "new.com" || s.Created != orig.Created || !r.Allowed("s", "x.vercel.app") {
		t.Fatalf("updated %+v", s)
	}
	if _, err := r.Update(Site{ID: "nope", Domain: "a.com"}); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing: %v", err)
	}
	if _, err := r.Update(Site{ID: "s", Domain: "bad/"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("invalid: %v", err)
	}
}

func TestAllowed(t *testing.T) {
	r, _ := open(t)
	if _, err := r.Add(Site{ID: "s", Domain: "example.com", Origins: []string{"*.vercel.app", "partner.io"}}); err != nil {
		t.Fatal(err)
	}
	for host, want := range map[string]bool{
		"example.com":             true,
		"EXAMPLE.com.":            true,
		"www.example.com":         true,
		"a.b.example.com":         true,
		"my-app-git-x.vercel.app": true,
		"vercel.app":              false, // *.x means subdomains only
		"partner.io":              true,
		"sub.partner.io":          false, // exact entries are exact
		"evil-example.com":        false,
		"example.com.evil.com":    false,
		"notexample.com":          false,
		"localhost":               true,
		"127.0.0.1":               true,
		"::1":                     true,
		"[::1]":                   true,
		"":                        false,
	} {
		if got := r.Allowed("s", host); got != want {
			t.Errorf("Allowed(%q) = %v, want %v", host, got, want)
		}
	}
	if r.Allowed("unknown", "example.com") {
		t.Error("unknown site allowed")
	}
}

func TestRemovePurge(t *testing.T) {
	r, st := open(t)
	for _, id := range []string{"keep", "gone", "soft"} {
		if _, err := r.Add(Site{ID: id, Domain: id + ".com"}); err != nil {
			t.Fatal(err)
		}
		st.Enqueue(store.Event{SiteID: id, Type: "identify", AnonID: "a", UserID: "u", TS: 1})
		st.Enqueue(store.Event{SiteID: id, Type: "pageview", AnonID: "a", TS: 2})
		if _, err := st.DB().Exec(`INSERT INTO goals(site_id,name,kind,match,created) VALUES(?,?,?,?,?)`, id, "g", "page", "/", 1); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.Flush(); err != nil {
		t.Fatal(err)
	}
	if err := r.Remove("gone", true); err != nil {
		t.Fatal(err)
	}
	if err := r.Remove("soft", false); err != nil {
		t.Fatal(err)
	}
	if err := r.Remove("gone", false); !errors.Is(err, ErrNotFound) {
		t.Errorf("remove twice: %v", err)
	}
	if _, ok := r.Get("gone"); ok {
		t.Error("gone still listed")
	}
	count := func(table, id string) int {
		var n int
		if err := st.DB().QueryRow(`SELECT count(*) FROM `+table+` WHERE site_id=?`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	for _, table := range []string{"events", "goals", "identity_map"} {
		if n := count(table, "gone"); n != 0 {
			t.Errorf("%s: %d rows left for purged site", table, n)
		}
		if count(table, "keep") == 0 || count(table, "soft") == 0 {
			t.Errorf("%s: other sites' rows were deleted", table)
		}
	}
}

func TestRejectedCounter(t *testing.T) {
	r, _ := open(t)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	r.now = func() time.Time { return now }
	if _, err := r.Add(Site{ID: "s", Domain: "a.com"}); err != nil {
		t.Fatal(err)
	}
	r.Reject("s")
	r.Reject("s")
	r.Reject("unknown") // not tracked: the map stays bounded by real sites
	now = now.Add(23 * time.Hour)
	r.Reject("s")
	if n := r.Rejected24h("s"); n != 3 {
		t.Fatalf("rejected = %d, want 3", n)
	}
	now = now.Add(2 * time.Hour) // first two are now older than 24h
	if n := r.Rejected24h("s"); n != 1 {
		t.Fatalf("rejected after a day = %d, want 1", n)
	}
	if n := r.Rejected24h("unknown"); n != 0 {
		t.Fatalf("unknown = %d", n)
	}
}

func TestPurgeCascades(t *testing.T) {
	r, st := open(t)
	db := st.DB()
	for _, id := range []string{"keep", "gone"} {
		if _, err := r.Add(Site{ID: id, Domain: id + ".com"}); err != nil {
			t.Fatal(err)
		}
		for _, q := range []string{
			`INSERT INTO funnels(site_id,name,window_ms,steps,created) VALUES(?,'f',1,'[]',1)`,
			`INSERT INTO notes(site_id,ts,label,created) VALUES(?,1,'n',1)`,
			`INSERT INTO shares(id,site_id,hash,pkey,state,created) VALUES(?||'-sh',?,randomblob(32),randomblob(32),'',1)`,
			`INSERT INTO api_tokens(id,name,prefix,hash,scope,site_id,created) VALUES(?||'-t',?||'-t','p',randomblob(32),'read',?,1)`,
			`INSERT INTO views(name,site_id,state,created) VALUES('v',?,'',1)`,
			`INSERT INTO crawl_hits(site_id,hour,bot,path,status,n,last_ts) VALUES(?,1,'GPTBot','/',2,1,1)`,
		} {
			args := []any{id}
			for range strings.Count(q, "?") - 1 {
				args = append(args, id)
			}
			if _, err := db.Exec(q, args...); err != nil {
				t.Fatalf("%s: %v", q, err)
			}
		}
	}
	if err := r.Remove("gone", true); err != nil {
		t.Fatal(err)
	}
	for _, table := range purgeTables {
		var gone, kept int
		_ = db.QueryRow(`SELECT count(*) FROM ` + table + ` WHERE site_id='gone'`).Scan(&gone)
		_ = db.QueryRow(`SELECT count(*) FROM ` + table + ` WHERE site_id='keep'`).Scan(&kept)
		if gone != 0 {
			t.Errorf("%s: %d rows left", table, gone)
		}
		if kept == 0 && table != "events" && table != "goals" && table != "identity_map" {
			t.Errorf("%s: other site's rows deleted", table)
		}
	}
}

func TestRejectFromRemembersHost(t *testing.T) {
	r, _ := open(t)
	if _, err := r.Add(Site{ID: "s", Domain: "a.com"}); err != nil {
		t.Fatal(err)
	}
	r.RejectFrom("s", "preview.other.app")
	if r.Rejected24h("s") != 1 || r.LastRejectedHost("s") != "preview.other.app" {
		t.Fatalf("count %d host %q", r.Rejected24h("s"), r.LastRejectedHost("s"))
	}
	r.RejectFrom("unknown", "x.com")
	if r.LastRejectedHost("unknown") != "" {
		t.Fatal("unknown site should not be tracked")
	}
}

func TestHyphenWildcardOrigins(t *testing.T) {
	r, _ := open(t)
	s, err := r.Add(Site{ID: "s", Domain: "example.com", Origins: []string{"*-Acme.vercel.app", "*--docs.netlify.app"}})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(s.Origins, []string{"*-acme.vercel.app", "*--docs.netlify.app"}) {
		t.Fatalf("origins %q", s.Origins)
	}
	for host, want := range map[string]bool{
		"myapp-git-feat-x-acme.vercel.app":    true,
		"myapp-a1b2c3d4e-acme.vercel.app":     true,
		"deploy-preview-12--docs.netlify.app": true,
		"acme.vercel.app":                     false,
		"myapp-evil.vercel.app":               false,
		"x.myapp-acme.vercel.app.evil.com":    false,
	} {
		if got := r.Allowed("s", host); got != want {
			t.Errorf("Allowed(%q) = %v, want %v", host, got, want)
		}
	}
}
