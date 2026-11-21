package meta

import (
	"crypto/sha256"
	"errors"
	"testing"
	"time"
)

func TestSharesLifecycle(t *testing.T) {
	db := openDB(t)
	s, plain, err := CreateShare(db, "s", " Board ", "range=30d&f=country:IN", true, 24*time.Hour)
	if err != nil || s.URL != "/share/"+plain || s.Expires == nil || s.Label != "Board" {
		t.Fatalf("create: %+v %v", s, err)
	}
	var stored []byte
	_ = db.QueryRow(`SELECT hash FROM shares WHERE id=?`, s.ID).Scan(&stored)
	if h := sha256.Sum256([]byte(plain)); string(stored) != string(h[:]) {
		t.Fatal("hash not stored")
	}
	got, key, err := LookupShare(db, plain, time.Now())
	if err != nil || len(key) != 32 || got.ID != s.ID || !got.HideRevenue || got.State != "range=30d&f=country:IN" {
		t.Fatalf("lookup: %+v %v", got, err)
	}
	if _, _, err := LookupShare(db, plain, time.Now().Add(25*time.Hour)); !errors.Is(err, ErrGone) {
		t.Errorf("expired: %v", err)
	}
	if _, _, err := LookupShare(db, plain[:len(plain)-1]+"A", time.Now()); !errors.Is(err, ErrNotFound) {
		t.Errorf("wrong token: %v", err)
	}
	list, _ := ListShares(db)
	if len(list) != 1 || list[0].URL != "" || list[0].LastUsed == nil {
		t.Fatalf("list: %+v", list)
	}
	if err := RevokeShare(db, s.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := LookupShare(db, plain, time.Now()); !errors.Is(err, ErrGone) {
		t.Errorf("revoked: %v", err)
	}
	if _, _, err := CreateShare(db, "s", "", "", false, time.Hour); !errors.Is(err, ErrInvalid) {
		t.Errorf("1h ttl: %v", err)
	}
	if never, _, err := CreateShare(db, "s", "", "", false, 0); err != nil || never.Expires != nil {
		t.Errorf("never: %+v %v", never, err)
	}
}
