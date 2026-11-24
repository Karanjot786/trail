package auth

import (
	"strconv"
	"testing"
	"time"
)

func TestLimiterBounded(t *testing.T) {
	var l loginLimiter
	now := time.Unix(1_800_000_000, 0)
	for i := 0; i <= maxClients; i++ {
		l.fail("k"+strconv.Itoa(i), now.Add(time.Duration(i)*time.Millisecond))
	}
	if len(l.fails) > maxClients {
		t.Fatalf("%d clients tracked", len(l.fails))
	}
}

func TestClientKey(t *testing.T) {
	for in, want := range map[string]string{
		"203.0.113.9":      "203.0.113.9",
		"::ffff:192.0.2.1": "192.0.2.1",
		"2001:db8::1":      "2001:db8::/64",
		"garbage":          "garbage",
	} {
		if got := clientKey(in); got != want {
			t.Errorf("clientKey(%q) = %q, want %q", in, got, want)
		}
	}
}
