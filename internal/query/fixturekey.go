package query

import (
	"net/url"
	"sort"
	"strings"
)

// FixtureKey is the Go twin of web/src/api/transport.ts fixtureKey() (plan §0.13). Frozen after P0.
// It drops tz, sorts params by key then value, and encodes them exactly as the browser's URLSearchParams
// does (WHATWG form encoding: space is '+', only A-Z a-z 0-9 * - . _ stay literal, so '~' becomes %7E).
// Keys are compared bytewise; the recorded params are ASCII, where that equals the browser's order.
func FixtureKey(path string, params url.Values) string {
	type kv struct{ k, v string }
	var all []kv
	for k, vs := range params {
		if k == "tz" {
			continue
		}
		for _, v := range vs {
			all = append(all, kv{k, v})
		}
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].k != all[j].k {
			return all[i].k < all[j].k
		}
		return all[i].v < all[j].v
	})
	var b strings.Builder
	b.WriteString(path)
	b.WriteByte('?')
	for i, e := range all {
		if i > 0 {
			b.WriteByte('&')
		}
		formEncode(&b, e.k)
		b.WriteByte('=')
		formEncode(&b, e.v)
	}
	return b.String()
}

func formEncode(b *strings.Builder, s string) {
	const hex = "0123456789ABCDEF"
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '*', c == '-', c == '.', c == '_':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&15])
		}
	}
}
