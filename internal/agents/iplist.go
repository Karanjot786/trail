package agents

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"slices"
	"strings"
)

// PrefixSet is an immutable, sorted set of IP prefixes.
type PrefixSet struct {
	p       []netip.Prefix
	Skipped int // malformed entries the parser left out
}

func newPrefixSet(p []netip.Prefix) PrefixSet {
	p = slices.Clone(p)
	slices.SortFunc(p, func(a, b netip.Prefix) int {
		if c := a.Addr().Compare(b.Addr()); c != 0 {
			return c
		}
		return a.Bits() - b.Bits()
	})
	return PrefixSet{p: slices.Compact(p)}
}

// Len is the number of prefixes in s.
func (s PrefixSet) Len() int { return len(s.p) }

// Contains reports whether a is in one of the prefixes. IPv4-mapped IPv6
// addresses are unmapped first.
func (s PrefixSet) Contains(a netip.Addr) bool {
	if !a.IsValid() {
		return false
	}
	a = a.Unmap()
	for _, p := range s.p {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// parsePrefix accepts a CIDR prefix or a bare address (a /32 or /128).
func parsePrefix(s string) (netip.Prefix, bool) {
	s = strings.TrimSpace(s)
	if strings.Contains(s, "/") {
		p, err := netip.ParsePrefix(s)
		if err != nil {
			return netip.Prefix{}, false
		}
		if p.Addr().Is4In6() {
			return netip.Prefix{}, false
		}
		return p.Masked(), true
	}
	a, err := netip.ParseAddr(s)
	if err != nil || a.Zone() != "" {
		return netip.Prefix{}, false
	}
	a = a.Unmap()
	return netip.PrefixFrom(a, a.BitLen()), true
}

// ParsePrefixJSON parses the {"prefixes":[{"ipv4Prefix"|"ipv6Prefix": …}]}
// format that OpenAI, Google and Perplexity publish. Malformed prefixes are
// skipped and counted; a document with no valid prefix is an error.
func ParsePrefixJSON(r io.Reader) (PrefixSet, error) {
	var doc struct {
		Prefixes []struct {
			V4 string `json:"ipv4Prefix"`
			V6 string `json:"ipv6Prefix"`
		} `json:"prefixes"`
	}
	if err := json.NewDecoder(r).Decode(&doc); err != nil {
		return PrefixSet{}, fmt.Errorf("prefix list: %w", err)
	}
	ps := make([]netip.Prefix, 0, len(doc.Prefixes))
	skipped := 0
	for _, e := range doc.Prefixes {
		s := e.V4
		if s == "" {
			s = e.V6
		}
		p, ok := parsePrefix(s)
		if !ok {
			skipped++
			continue
		}
		ps = append(ps, p)
	}
	if len(ps) == 0 {
		return PrefixSet{}, errors.New("prefix list: no valid prefixes")
	}
	set := newPrefixSet(ps)
	set.Skipped = skipped
	return set, nil
}

// maxSAILLine caps one logical SAIL line (a multi-line array counts as one).
const maxSAILLine = 1 << 20

// ParseSAIL parses a SAIL document (draft-kelley-webbotauth-sail, TOML) and
// returns each service's prefixes, keyed by the service name the document
// uses (for example "Claude-Agent"). It reads only the TOML subset SAIL uses:
// key = value lines, [[prefix_sets]] and [[services]] tables, strings,
// scalars and arrays of strings that may span lines, and # comments.
func ParseSAIL(r io.Reader) (map[string]PrefixSet, error) {
	type table map[string]any
	var sets, services []table
	var cur table
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64<<10), maxSAILLine)
	var pending strings.Builder
	for sc.Scan() {
		line := stripComment(sc.Text())
		if pending.Len() > 0 {
			pending.WriteString(" ")
			pending.WriteString(line)
			if pending.Len() > maxSAILLine {
				return nil, errors.New("sail: line too long")
			}
			if !balanced(pending.String()) {
				continue
			}
			line = pending.String()
			pending.Reset()
		}
		line = strings.TrimSpace(line)
		switch {
		case line == "":
			continue
		case line == "[[prefix_sets]]":
			cur = table{}
			sets = append(sets, cur)
			continue
		case line == "[[services]]":
			cur = table{}
			services = append(services, cur)
			continue
		case strings.HasPrefix(line, "["):
			cur = nil // a table SAIL does not define: ignore its keys
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("sail: bad line %q", truncate(line, 40))
		}
		if !balanced(val) {
			pending.WriteString(line)
			continue
		}
		v, err := sailValue(strings.TrimSpace(val))
		if err != nil {
			return nil, err
		}
		if cur != nil {
			cur[strings.TrimSpace(key)] = v
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("sail: %w", err)
	}
	if pending.Len() > 0 {
		return nil, errors.New("sail: unterminated array")
	}
	byName := map[string][]netip.Prefix{}
	for _, s := range sets {
		name, _ := s["name"].(string)
		ps := []netip.Prefix{}
		for _, k := range []string{"ipv4_prefixes", "ipv6_prefixes"} {
			list, _ := s[k].([]string)
			for _, e := range list {
				if p, ok := parsePrefix(e); ok {
					ps = append(ps, p)
				}
			}
		}
		byName[name] = append(byName[name], ps...)
	}
	out := map[string]PrefixSet{}
	for _, s := range services {
		name, _ := s["name"].(string)
		refs, _ := s["prefix_sets"].([]string)
		ps := []netip.Prefix{}
		for _, ref := range refs {
			ps = append(ps, byName[ref]...)
		}
		if name == "" || len(ps) == 0 {
			continue
		}
		out[name] = newPrefixSet(append(out[name].p, ps...))
	}
	if len(out) == 0 {
		return nil, errors.New("sail: no service with prefixes")
	}
	return out, nil
}

// stripComment drops a # comment that is not inside a string.
func stripComment(s string) string {
	in := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\\':
			if in {
				i++
			}
		case '"':
			in = !in
		case '#':
			if !in {
				return s[:i]
			}
		}
	}
	return s
}

// balanced reports whether every [ outside a string has its ].
func balanced(s string) bool {
	depth, in := 0, false
	for i := 0; i < len(s); i++ {
		switch c := s[i]; {
		case c == '\\' && in:
			i++
		case c == '"':
			in = !in
		case c == '[' && !in:
			depth++
		case c == ']' && !in:
			depth--
		}
	}
	return depth <= 0
}

// sailValue parses a string, an array of strings, or any other scalar (kept as its text).
func sailValue(v string) (any, error) {
	switch {
	case strings.HasPrefix(v, `"`):
		var s string
		if err := json.Unmarshal([]byte(v), &s); err != nil {
			return nil, fmt.Errorf("sail: bad string %q", truncate(v, 40))
		}
		return s, nil
	case strings.HasPrefix(v, "["):
		if !strings.HasSuffix(v, "]") {
			return nil, fmt.Errorf("sail: bad array %q", truncate(v, 40))
		}
		inner := strings.TrimSpace(v[1 : len(v)-1])
		out := []string{}
		for inner != "" {
			if !strings.HasPrefix(inner, `"`) {
				return nil, fmt.Errorf("sail: array of non-strings %q", truncate(v, 40))
			}
			end := closingQuote(inner)
			if end < 0 {
				return nil, fmt.Errorf("sail: bad array %q", truncate(v, 40))
			}
			var s string
			if err := json.Unmarshal([]byte(inner[:end+1]), &s); err != nil {
				return nil, fmt.Errorf("sail: bad string in array %q", truncate(v, 40))
			}
			out = append(out, s)
			inner = strings.TrimSpace(inner[end+1:])
			inner = strings.TrimSpace(strings.TrimPrefix(inner, ","))
		}
		return out, nil
	default:
		return v, nil
	}
}

// closingQuote returns the index of the quote that closes the string starting at s[0].
func closingQuote(s string) int {
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			i++
		case '"':
			return i
		}
	}
	return -1
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
