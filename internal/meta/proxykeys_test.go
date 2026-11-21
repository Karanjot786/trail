package meta

import (
	"crypto/sha256"
	"testing"
)

func TestProxyKeysSiteBound(t *testing.T) {
	db := openDB(t)
	a, err := CreateToken(db, "proxy a", ScopeCrawl, "a")
	if err != nil {
		t.Fatal(err)
	}
	keys, err := ProxyKeys(db, "a", a.Prefix)
	if err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte(a.Token))
	if len(keys) != 1 || string(keys[0]) != string(want[:]) {
		t.Fatalf("site a: got %d keys, want the token's hash", len(keys))
	}
	if keys, err := ProxyKeys(db, "b", a.Prefix); err != nil || len(keys) != 0 {
		t.Fatalf("site b: got %d keys (%v), want none", len(keys), err)
	}
}

func TestProxyKeysCrawlScopeOnly(t *testing.T) {
	db := openDB(t)
	for _, scope := range []string{ScopeRead, ScopeNotes, ScopeWrite} {
		tok, err := CreateToken(db, "t "+scope, scope, "a")
		if err != nil {
			t.Fatal(err)
		}
		if keys, _ := ProxyKeys(db, "a", tok.Prefix); len(keys) != 0 {
			t.Errorf("%s token accepted as a proxy key", scope)
		}
	}
}

func TestProxyKeysRevoked(t *testing.T) {
	db := openDB(t)
	a, err := CreateToken(db, "proxy a", ScopeCrawl, "a")
	if err != nil {
		t.Fatal(err)
	}
	if err := RevokeToken(db, a.ID); err != nil {
		t.Fatal(err)
	}
	if keys, err := ProxyKeys(db, "a", a.Prefix); err != nil || len(keys) != 0 {
		t.Fatalf("revoked: got %d keys (%v), want none", len(keys), err)
	}
}

func TestProxyKeysBadPrefix(t *testing.T) {
	db := openDB(t)
	if _, err := CreateToken(db, "proxy a", ScopeCrawl, "a"); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"", "trl_", "%", "trl_%"} {
		if keys, _ := ProxyKeys(db, "a", p); len(keys) != 0 {
			t.Errorf("prefix %q matched %d keys", p, len(keys))
		}
	}
}
