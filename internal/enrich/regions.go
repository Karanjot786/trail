package enrich

import (
	_ "embed" // the CLDR subdivision names ship inside the binary
	"strings"
	"sync"
)

// regions.tsv holds one "CC-SUB<TAB>Name" line per subdivision, generated
// from Unicode CLDR (Unicode-3.0) by gen_regions.go.
//
//go:generate go run gen_regions.go
//go:embed geodata/regions.tsv
var regionsTSV string

var regionMap = sync.OnceValue(func() map[string]string {
	m := make(map[string]string, 5500)
	for _, line := range strings.Split(regionsTSV, "\n") {
		if k, v, ok := strings.Cut(line, "\t"); ok {
			m[k] = v
		}
	}
	return m
})

// RegionName maps a subdivision code ("MH" or "IN-MH") in country to its
// English CLDR name, so edge codes and database names are stored alike.
// Matching ignores case.
func RegionName(country, code string) (string, bool) {
	country, code = strings.ToUpper(strings.TrimSpace(country)), strings.ToUpper(strings.TrimSpace(code))
	if country == "" || code == "" {
		return "", false
	}
	if !strings.Contains(code, "-") {
		code = country + "-" + code
	} else if !strings.HasPrefix(code, country+"-") {
		return "", false
	}
	name, ok := regionMap()[code]
	return name, ok
}
