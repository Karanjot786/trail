package enrich

import (
	_ "embed" // the DB-IP Lite Country database ships inside the binary
	"fmt"
	"log"
	"net/netip"
	"time"

	"github.com/oschwald/maxminddb-golang/v2"
)

// embeddedCountry is DB-IP Lite Country (CC BY 4.0, https://db-ip.com),
// refreshed by scripts/update-geo.sh. OpenBytes reads it in place: the
// bytes live in the binary's read-only data, not on the heap.
//
//go:embed geodata/dbip-country-lite.mmdb
var embeddedCountry []byte

// Geo sources reported by Info.
const (
	SourceEmbedded = "embedded-country" // built-in DB-IP Lite Country
	SourceCustom   = "custom"           // TRAIL_GEO_DB
	SourceNone     = "none"             // embedded file unreadable; geo is off
)

// GeoInfo says which database answers lookups and the month it was built.
type GeoInfo struct {
	Source string `json:"source"`
	Build  string `json:"build"` // YYYY-MM from the mmdb build epoch, "" when none
}

// Geo resolves IPs to country/region/city. A nil reader is a no-op.
type Geo struct {
	db   *maxminddb.Reader
	info GeoInfo
}

// OpenGeo opens the City (or Country) mmdb at path, the TRAIL_GEO_DB
// override. An empty path uses the embedded DB-IP Lite Country file, which
// gives country only.
func OpenGeo(path string) (*Geo, error) {
	if path == "" {
		return openEmbedded(embeddedCountry), nil
	}
	db, err := maxminddb.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open geo db %s: %w", path, err)
	}
	return &Geo{db: db, info: GeoInfo{Source: SourceCustom, Build: buildMonth(db)}}, nil
}

// openEmbedded never fails: a bad embed logs and yields a no-op Geo, so the
// server still starts without locations.
func openEmbedded(data []byte) *Geo {
	db, err := maxminddb.OpenBytes(data)
	if err != nil {
		log.Printf("geo: embedded country database unreadable, locations are off: %v", err)
		return &Geo{info: GeoInfo{Source: SourceNone}}
	}
	return &Geo{db: db, info: GeoInfo{Source: SourceEmbedded, Build: buildMonth(db)}}
}

func buildMonth(db *maxminddb.Reader) string {
	return time.Unix(int64(db.Metadata.BuildEpoch), 0).UTC().Format("2006-01") //nolint:gosec // epoch fits int64
}

// Info reports the database in use.
func (g *Geo) Info() GeoInfo {
	if g == nil {
		return GeoInfo{Source: SourceNone}
	}
	return g.info
}

// cityRecord decodes City and Country databases alike: a Country database
// simply has no subdivisions or city.
type cityRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
	Subdivisions []struct {
		IsoCode string            `maxminddb:"iso_code"`
		Names   map[string]string `maxminddb:"names"`
	} `maxminddb:"subdivisions"`
	City struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"city"`
}

// Lookup returns the ISO-2 country, region and city for ip, or empty strings.
func (g *Geo) Lookup(ip string) (country, region, city string) {
	if g == nil || g.db == nil {
		return "", "", ""
	}
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return "", "", ""
	}
	var rec cityRecord
	if err := g.db.Lookup(addr.Unmap()).Decode(&rec); err != nil {
		return "", "", ""
	}
	if len(rec.Subdivisions) > 0 {
		sub := rec.Subdivisions[0]
		region = sub.Names["en"]
		if name, ok := RegionName(rec.Country.ISOCode, sub.IsoCode); ok {
			region = name
		}
	}
	return rec.Country.ISOCode, region, rec.City.Names["en"]
}

// Close releases the geo database.
func (g *Geo) Close() error {
	if g == nil || g.db == nil {
		return nil
	}
	return g.db.Close()
}
