package edgegeo

import (
	"net/http"
	"time"

	"trail/internal/netx"
)

// Resolver decides, once per request, which client IP and which location to
// trust. The zero value trusts no proxy forward and uses netx.Default().
type Resolver struct {
	Keys Keys             // proxy keys by site and prefix; nil: proxy forwards are never trusted
	Now  func() time.Time // nil: time.Now
	Net  *netx.Resolver   // TRAIL_TRUSTED_PROXIES; nil: netx.Default()
}

// Resolve returns, in order of trust:
//  1. a verified first-party proxy forward (VerifyProxy);
//  2. when netx says the client address came from a trusted Cloudflare edge,
//     that address plus CF-IPCountry, CF-Region-Code and CF-IPCity;
//  3. otherwise just netx's client IP, and the database answers for geo.
//
// Forged values from any other sender are ignored entirely.
func (rv Resolver) Resolve(r *http.Request, site string, body []byte) Result {
	if r.Header.Get("X-Trail-Proxy") != "" {
		now := time.Now
		if rv.Now != nil {
			now = rv.Now
		}
		if res, ok := VerifyProxy(r, site, body, rv.Keys, now()); ok {
			return res
		}
	}
	nr := rv.Net
	if nr == nil {
		nr = netx.Default()
	}
	c := nr.Resolve(r)
	res := Result{IP: c.Raw}
	if c.ViaCloudflare {
		res.Country, res.Region, res.City = validGeo(r.Header.Get("CF-IPCountry"),
			r.Header.Get("CF-Region-Code"), r.Header.Get("CF-IPCity"))
		if res.Country != "" {
			res.Source = "cloudflare"
		}
	}
	return res
}
