package edgegeo

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Keys returns the HMAC keys a first-party proxy of site may sign with: the
// stored SHA-256 of each live crawl token of that site with the given listed
// prefix (meta.ProxyKeys).
type Keys func(site, prefix string) [][]byte

const (
	maxSkew      = 300 // seconds either side of now
	maxProxyHdr  = 256
	maxIPHdr     = 64
	maxGeoHdr    = 1024
	maxHostHdr   = 255
	maxRegionLen = 8
	maxCityRunes = 64
	prefixLen    = 12 // meta's listed token prefix length
)

var sources = map[string]bool{"": true, "vercel": true, "cloudflare": true, "netlify": true}

// proxyHeader is a parsed X-Trail-Proxy value.
type proxyHeader struct {
	prefix string
	ts     string // decimal unix seconds, exactly as signed
	sig    []byte
}

// parseProxyHeader parses "v1;k=<12-char prefix>;t=<unix s>;s=<64 lower hex>".
// The form is strict: fixed order, no spaces, no extra fields, no leading
// zeros in t, so exactly one byte string verifies for one signature.
func parseProxyHeader(h string) (proxyHeader, bool) {
	var p proxyHeader
	if len(h) > maxProxyHdr {
		return p, false
	}
	parts := strings.Split(h, ";")
	if len(parts) != 4 || parts[0] != "v1" {
		return p, false
	}
	k, ok1 := strings.CutPrefix(parts[1], "k=")
	t, ok2 := strings.CutPrefix(parts[2], "t=")
	s, ok3 := strings.CutPrefix(parts[3], "s=")
	if !ok1 || !ok2 || !ok3 || len(k) != prefixLen || !tokenChars(k) || !digits(t) || len(s) != 2*sha256.Size {
		return p, false
	}
	if strings.ToLower(s) != s {
		return p, false
	}
	sig, err := hex.DecodeString(s)
	if err != nil {
		return p, false
	}
	return proxyHeader{prefix: k, ts: t, sig: sig}, true
}

func tokenChars(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_') {
			return false
		}
	}
	return true
}

// digits accepts 1 to 12 decimal digits with no leading zero.
func digits(s string) bool {
	if len(s) == 0 || len(s) > 12 || s[0] == '0' {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// message is the signed string of §0.12.
func message(site, ts, ip, geo, geoSrc, host string, body []byte) []byte {
	bh := sha256.Sum256(body)
	return []byte("v1\n" + site + "\n" + ts + "\n" + ip + "\n" + geo + "\n" + geoSrc + "\n" + host + "\n" + hex.EncodeToString(bh[:]))
}

// SignProxy builds the X-Trail-Proxy value a first-party proxy sends for one
// forward. Trail never calls it in production; it pins the format for tests
// and for anyone writing a proxy in another language.
func SignProxy(token, site string, t int64, ip, geo, geoSrc, host string, body []byte) string {
	key := sha256.Sum256([]byte(token))
	ts := strconv.FormatInt(t, 10)
	m := hmac.New(sha256.New, key[:])
	m.Write(message(site, ts, ip, geo, geoSrc, host, body))
	prefix := token
	if len(prefix) > prefixLen {
		prefix = prefix[:prefixLen]
	}
	return "v1;k=" + prefix + ";t=" + ts + ";s=" + hex.EncodeToString(m.Sum(nil))
}

// VerifyProxy checks a forward from a site's first-party proxy (§0.12): the
// X-Trail-Proxy HMAC must be valid under a live crawl token bound to site,
// within ±300 s of now, over the exact X-Trail-* values and body. On any
// failure it returns (Result{}, false) and the caller ignores every X-Trail-*
// header. Header values are never logged.
func VerifyProxy(r *http.Request, site string, body []byte, keys Keys, now time.Time) (Result, bool) {
	if keys == nil {
		return Result{}, false
	}
	p, ok := parseProxyHeader(r.Header.Get("X-Trail-Proxy"))
	if !ok {
		return Result{}, false
	}
	t, err := strconv.ParseInt(p.ts, 10, 64)
	if err != nil {
		return Result{}, false
	}
	if d := now.Unix() - t; d > maxSkew || d < -maxSkew {
		return Result{}, false
	}
	ipHdr, geo := r.Header.Get("X-Trail-IP"), r.Header.Get("X-Trail-Geo")
	src, host := r.Header.Get("X-Trail-Geo-Src"), r.Header.Get("X-Trail-Host")
	if len(ipHdr) > maxIPHdr || len(geo) > maxGeoHdr || len(host) > maxHostHdr || !sources[src] {
		return Result{}, false
	}
	ip, err := netip.ParseAddr(ipHdr)
	if err != nil {
		return Result{}, false
	}
	msg := message(site, p.ts, ipHdr, geo, src, host, body)
	verified := false
	for _, k := range keys(site, p.prefix) {
		m := hmac.New(sha256.New, k)
		m.Write(msg)
		if hmac.Equal(m.Sum(nil), p.sig) {
			verified = true
			break
		}
	}
	if !verified {
		return Result{}, false
	}
	res := Result{IP: ip.WithZone("").Unmap().String(), Proxied: true, Host: host}
	if src != "" {
		f := strings.SplitN(geo, "|", 3)
		for len(f) < 3 {
			f = append(f, "")
		}
		res.Country, res.Region, res.City = validGeo(f[0], f[1], f[2])
		if res.Country != "" {
			res.Source = src
		}
	}
	return res, true
}

// validGeo keeps only well-formed edge values. Without a valid country the
// region and city are dropped too: they would describe an unknown place.
func validGeo(country, region, city string) (string, string, string) {
	if !validCountry(country) {
		return "", "", ""
	}
	if !validRegion(region) {
		region = ""
	}
	if !validCity(city) {
		city = ""
	}
	return country, region, city
}

// validCountry accepts ISO 3166-1 alpha-2 codes, not the XX (unknown) and T1
// (Tor) placeholders.
func validCountry(c string) bool {
	return len(c) == 2 && c[0] >= 'A' && c[0] <= 'Z' && c[1] >= 'A' && c[1] <= 'Z' && c != "XX" && c != "T1"
}

func validRegion(s string) bool {
	if s == "" || len(s) > maxRegionLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

func validCity(s string) bool {
	if s == "" || !utf8.ValidString(s) || utf8.RuneCountInString(s) > maxCityRunes {
		return false
	}
	for _, r := range s {
		if !unicode.IsPrint(r) {
			return false
		}
	}
	return true
}
