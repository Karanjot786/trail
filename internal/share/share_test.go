package share

import (
	"crypto/sha256"
	"strings"
	"testing"
)

func TestNewToken(t *testing.T) {
	a, ha, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	b, _, _ := NewToken()
	if a == b || len(a) != TokenLen || !strings.HasPrefix(a, Prefix) || ha != sha256.Sum256([]byte(a)) {
		t.Fatalf("tokens %q %q", a, b)
	}
}

func TestPseudonymRoundTrip(t *testing.T) {
	k1, _ := NewKey()
	k2, _ := NewKey()
	o1, l1 := Pseudonym(k1, "user@example.com")
	o1b, l1b := Pseudonym(k1, "user@example.com")
	o2, l2 := Pseudonym(k2, "user@example.com")
	if o1 != o1b || l1 != l1b {
		t.Fatal("not stable within a share")
	}
	if o1 == o2 || strings.Contains(o1, "user") || !strings.HasPrefix(l1, "Visitor ") || len(l1) != len("Visitor K7QD") {
		t.Fatalf("pseudonyms %q %q / %q %q", o1, l1, o2, l2)
	}
	if p, err := Reveal(k1, o1); err != nil || p != "user@example.com" {
		t.Fatalf("reveal: %q %v", p, err)
	}
	for _, bad := range []string{o2, "", "!!", o1[:10], o1 + "A"} {
		if _, err := Reveal(k1, bad); err == nil {
			t.Errorf("reveal %q worked", bad)
		}
	}
}
