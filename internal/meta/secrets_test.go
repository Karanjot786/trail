package meta

import (
	"bytes"
	"crypto/sha256"
	"path/filepath"
	"testing"

	"trail/internal/store"
)

func TestSessionSecretPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "s.db")
	open := func() []byte {
		st, err := store.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer st.Close()
		a, err := SessionSecret(st.DB())
		if err != nil {
			t.Fatal(err)
		}
		b, err := SessionSecret(st.DB())
		if err != nil || !bytes.Equal(a, b) {
			t.Fatalf("second call differs: %v", err)
		}
		return a
	}
	first := open()
	if len(first) != 32 || bytes.Equal(first, make([]byte, 32)) {
		t.Fatalf("secret %x", first)
	}
	if again := open(); !bytes.Equal(first, again) {
		t.Fatal("secret changed across reopen")
	}
	if other := func() []byte {
		st, err := store.Open(filepath.Join(t.TempDir(), "o.db"))
		if err != nil {
			t.Fatal(err)
		}
		defer st.Close()
		s, _ := SessionSecret(st.DB())
		return s
	}(); bytes.Equal(first, other) {
		t.Fatal("two databases share a secret")
	}
}

func TestGeneratedPasswordShownOnce(t *testing.T) {
	db := openDB(t)
	hash, plain, err := GeneratedPassword(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) != passwordLen || hash != sha256.Sum256([]byte(plain)) {
		t.Fatalf("plain %q does not match hash", plain)
	}
	var n int
	_ = db.QueryRow(`SELECT count(*) FROM settings WHERE value=?`, plain).Scan(&n)
	if n != 0 {
		t.Fatal("plaintext password stored")
	}
	h2, p2, err := GeneratedPassword(db)
	if err != nil || p2 != "" || h2 != hash {
		t.Fatalf("second call: %q %v, same hash %v", p2, err, h2 == hash)
	}
	h3, p3, err := ResetPassword(db)
	if err != nil || p3 == plain || h3 == hash || h3 != sha256.Sum256([]byte(p3)) {
		t.Fatalf("reset: %q %v", p3, err)
	}
	if h4, p4, _ := GeneratedPassword(db); h4 != h3 || p4 != "" {
		t.Fatal("reset not persisted")
	}
}
