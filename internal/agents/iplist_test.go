package agents

import (
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParsePrefixJSON(t *testing.T) {
	f, err := os.Open("testdata/prefixes.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	s, err := ParsePrefixJSON(f)
	if err != nil {
		t.Fatal(err)
	}
	if s.Len() != 3 || s.Skipped != 1 {
		t.Fatalf("len %d skipped %d", s.Len(), s.Skipped)
	}
	for ip, want := range map[string]bool{"192.0.2.200": true, "2001:db8::1": true, "198.51.100.7": true, "198.51.100.8": false, "10.0.0.1": false} {
		if got := s.Contains(netip.MustParseAddr(ip)); got != want {
			t.Errorf("Contains(%s) = %v", ip, got)
		}
	}
	for _, bad := range []string{`{"prefixes":[]}`, `{}`, `not json`, `{"prefixes":[{"ipv4Prefix":"x"}]}`} {
		if _, err := ParsePrefixJSON(strings.NewReader(bad)); err == nil {
			t.Errorf("%s: no error", bad)
		}
	}
}

func TestParsePrefixJSONLiveCopies(t *testing.T) {
	files, _ := filepath.Glob("testdata/live/*.json")
	n := 0
	for _, name := range files {
		if strings.HasSuffix(name, "-keys.json") {
			continue
		}
		f, err := os.Open(name)
		if err != nil {
			t.Fatal(err)
		}
		s, err := ParsePrefixJSON(f)
		f.Close()
		if err != nil || s.Len() == 0 || s.Skipped != 0 {
			t.Errorf("%s: %d prefixes, %d skipped, %v", name, s.Len(), s.Skipped, err)
		}
		n++
	}
	if n == 0 {
		t.Skip("no live copies in testdata/live")
	}
}

func TestParseSAIL(t *testing.T) {
	f, err := os.Open("testdata/sail.toml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	m, err := ParseSAIL(f)
	if err != nil {
		t.Fatal(err)
	}
	agent, bot := m["Claude-Agent"], m["ClaudeBot"]
	if agent.Len() != 3 || bot.Len() != 1 {
		t.Fatalf("agent %d bot %d (%v)", agent.Len(), bot.Len(), m)
	}
	if !agent.Contains(netip.MustParseAddr("192.0.2.10")) || agent.Contains(netip.MustParseAddr("192.0.2.11")) ||
		!agent.Contains(netip.MustParseAddr("2001:db8:1::5")) || agent.Contains(netip.MustParseAddr("203.0.113.5")) {
		t.Error("agent set wrong")
	}
	for _, bad := range []string{"", "x = [", `[[services]]` + "\nname = \"A\"\nprefix_sets = [\"missing\"]\n"} {
		if _, err := ParseSAIL(strings.NewReader(bad)); err == nil {
			t.Errorf("%q: no error", bad)
		}
	}
}

func TestParseSAILLiveCopy(t *testing.T) {
	f, err := os.Open("testdata/live/anthropic-sail.txt")
	if err != nil {
		t.Skip("no live SAIL copy: ", err)
	}
	defer f.Close()
	m, err := ParseSAIL(f)
	if err != nil {
		t.Fatal(err)
	}
	if m["Claude-Agent"].Len() == 0 {
		t.Fatalf("no Claude-Agent prefixes: %v", m)
	}
}

func TestContains(t *testing.T) {
	s := newPrefixSet([]netip.Prefix{
		netip.MustParsePrefix("192.0.2.0/31"),
		netip.MustParsePrefix("2001:db8::/127"),
	})
	for ip, want := range map[string]bool{
		"192.0.2.0": true, "192.0.2.1": true, "192.0.2.2": false, "192.0.1.255": false,
		"::ffff:192.0.2.1": true, "2001:db8::1": true, "2001:db8::2": false,
	} {
		if got := s.Contains(netip.MustParseAddr(ip)); got != want {
			t.Errorf("Contains(%s) = %v", ip, got)
		}
	}
	if s.Contains(netip.Addr{}) {
		t.Error("zero addr matched")
	}
	var empty PrefixSet
	if empty.Contains(netip.MustParseAddr("192.0.2.0")) {
		t.Error("empty set matched")
	}
}
