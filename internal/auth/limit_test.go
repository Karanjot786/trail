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
