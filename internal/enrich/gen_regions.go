//go:build ignore

// gen_regions reads CLDR common/subdivisions/en.xml and writes
// geodata/regions.tsv, one "CC-SUB<TAB>Name" line per subdivision.
//
//	go run gen_regions.go path/to/en.xml
package main

import (
	"bufio"
	"encoding/xml"
	"fmt"
	"os"
	"sort"
	"strings"
)

type doc struct {
	Subs []struct {
		Type string `xml:"type,attr"`
		Alt  string `xml:"alt,attr"`
		Name string `xml:",chardata"`
	} `xml:"localeDisplayNames>subdivisions>subdivision"`
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run gen_regions.go en.xml")
		os.Exit(2)
	}
	f, err := os.Open(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer f.Close()
	var d doc
	if err := xml.NewDecoder(f).Decode(&d); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	seen := map[string]string{}
	for _, s := range d.Subs {
		// CLDR marks some names with superscript footnote digits; drop them.
		name := strings.TrimSpace(strings.TrimRight(strings.TrimSpace(s.Name), "¹²³⁴⁵⁶⁷⁸⁹⁰"))
		if s.Alt != "" || len(s.Type) < 3 || name == "" {
			continue
		}
		key := strings.ToUpper(s.Type[:2]) + "-" + strings.ToUpper(s.Type[2:])
		if _, ok := seen[key]; !ok {
			seen[key] = name
		}
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out, err := os.Create("geodata/regions.tsv")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	w := bufio.NewWriter(out)
	for _, k := range keys {
		fmt.Fprintf(w, "%s\t%s\n", k, seen[k])
	}
	if err := w.Flush(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := out.Close(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
