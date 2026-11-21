package meta

import (
	"crypto/sha256"
	"errors"
	"strings"
	"testing"
)

func TestTokensHashedAtRest(t *testing.T) {
	db := openDB(t)
	nt, err := CreateToken(db, "ci", ScopeRead, "s")
	if err != nil {
		t.Fatal(err)
	}
	var hash []byte
	var prefix string
	if err := db.QueryRow(`SELECT hash, prefix FROM api_tokens WHERE id=?`, nt.ID).Scan(&hash, &prefix); err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte(nt.Token))
	if string(hash) != string(want[:]) || prefix != nt.Token[:12] {
		t.Fatalf("stored hash/prefix wrong")
	}
	var n int
	_ = db.QueryRow(`SELECT count(*) FROM api_tokens WHERE hash=? OR prefix=? OR name=?`, nt.Token, nt.Token, nt.Token).Scan(&n)
	if n != 0 {
		t.Fatal("plaintext stored")
	}
	tok, ok := LookupToken(db, nt.Token)
	if !ok || tok.Scope != ScopeRead || tok.Site != "s" || tok.ID != nt.ID || tok.FromEnv {
		t.Fatalf("lookup: %+v %v", tok, ok)
	}
	for _, bad := range []string{"", nt.Token + "x", strings.ToUpper(nt.Token), "trl_" + strings.Repeat("a", 32)} {
		if _, ok := LookupToken(db, bad); ok {
			t.Errorf("%q accepted", bad)
		}
	}
	list, _ := ListTokens(db)
	if len(list) != 1 || list[0].LastUsed == nil {
		t.Fatalf("list/last used: %+v", list)
	}
	if err := RevokeToken(db, nt.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok := LookupToken(db, nt.Token); ok {
		t.Fatal("revoked token still works")
	}
	if err := RevokeToken(db, nt.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("revoke twice: %v", err)
	}
}

func TestTokenValidation(t *testing.T) {
	db := openDB(t)
	for _, c := range []struct{ name, scope, site string }{
		{"", ScopeRead, ""}, {"x", "admin", ""}, {"crawler", ScopeCrawl, ""},
	} {
		if _, err := CreateToken(db, c.name, c.scope, c.site); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: %v", c, err)
		}
	}
	if _, err := CreateToken(db, "dup", ScopeRead, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateToken(db, "dup", ScopeRead, ""); !errors.Is(err, ErrExists) {
		t.Errorf("duplicate name: %v", err)
	}
}
