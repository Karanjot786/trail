package query

import (
	"net/url"
	"testing"
)

// The shared vector: web/src/api/transport.test.ts asserts the same string from fixtureKey().
func TestFixtureKeyMatchesTS(t *testing.T) {
	p := url.Values{}
	p.Add("site", "demo")
	p.Add("tz", "X")
	p.Add("range", "c:2026-11-01~2026-11-05")
	p.Add("f", "path:/a*b é")
	p.Add("f", "country:IN")
	p.Add("q", "a+b&c")
	want := "/stats?f=country%3AIN&f=path%3A%2Fa*b+%C3%A9&q=a%2Bb%26c&range=c%3A2026-11-01%7E2026-11-05&site=demo"
	if got := FixtureKey("/stats", p); got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
	if got := FixtureKey("/sites", url.Values{}); got != "/sites?" {
		t.Fatalf("empty = %q", got)
	}
}
