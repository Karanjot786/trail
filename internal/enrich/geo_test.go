package enrich

import (
	"bytes"
	"log"
	"regexp"
	"strings"
	"testing"
)

var reBuild = regexp.MustCompile(`^\d{4}-\d{2}$`)

// With no TRAIL_GEO_DB, the embedded DB-IP Lite Country file answers.
func TestGeoEmbeddedCountry(t *testing.T) {
	g, err := OpenGeo("")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = g.Close() })
	for ip, want := range map[string]string{"8.8.8.8": "US", "49.36.0.1": "IN", "::ffff:49.36.0.1": "IN"} {
		country, region, city := g.Lookup(ip)
		if country != want || region != "" || city != "" {
			t.Errorf("Lookup(%s) = %q/%q/%q, want %s with no region or city", ip, country, region, city, want)
		}
	}
	if c, _, _ := g.Lookup("192.0.2.1"); c != "" {
		t.Errorf("documentation range resolved to %q", c)
	}
	info := g.Info()
	if info.Source != SourceEmbedded || !reBuild.MatchString(info.Build) {
		t.Errorf("Info() = %+v, want source %q and a YYYY-MM build", info, SourceEmbedded)
	}
}

// testdata/city-test.mmdb is a City-shaped fixture written with
// github.com/maxmind/mmdbwriter: 8.8.8.0/24 is US/California/Mountain View
// and 49.36.0.0/16 is IN/Maharashtra/Mumbai; nothing else resolves.
//
// A user-supplied City DB replaces the embedded one, so region and city work.
func TestGeoCustomOverridesEmbedded(t *testing.T) {
	g, err := OpenGeo("testdata/city-test.mmdb")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = g.Close() })
	country, region, city := g.Lookup("49.36.0.1")
	if country != "IN" || region != "Maharashtra" || city != "Mumbai" {
		t.Errorf("Lookup = %q/%q/%q, want IN/Maharashtra/Mumbai", country, region, city)
	}
	// 1.1.1.1 is in the embedded DB but not in the fixture: proves the embed is not consulted.
	if c, _, _ := g.Lookup("1.1.1.1"); c != "" {
		t.Errorf("custom DB fell through to the embedded one: %q", c)
	}
	if info := g.Info(); info.Source != SourceCustom || !reBuild.MatchString(info.Build) {
		t.Errorf("Info() = %+v, want source %q", info, SourceCustom)
	}
}

func TestGeoCustomMissingFileFails(t *testing.T) {
	if _, err := OpenGeo("testdata/does-not-exist.mmdb"); err == nil {
		t.Fatal("want an error for a missing TRAIL_GEO_DB file")
	}
}

// A corrupt embed must not stop the server: geo turns into a logged no-op.
func TestGeoBadEmbedIsNoop(t *testing.T) {
	var buf bytes.Buffer
	prev := log.Writer()
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(prev) })

	g := openEmbedded([]byte("not an mmdb"))
	if c, r, ci := g.Lookup("8.8.8.8"); c != "" || r != "" || ci != "" {
		t.Errorf("Lookup = %q/%q/%q, want empty", c, r, ci)
	}
	if info := g.Info(); info.Source != SourceNone || info.Build != "" {
		t.Errorf("Info() = %+v, want source %q", info, SourceNone)
	}
	if err := g.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
	if !strings.Contains(buf.String(), "geo:") {
		t.Errorf("no log line, got %q", buf.String())
	}
}
