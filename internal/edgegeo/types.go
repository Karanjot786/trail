// Package edgegeo trusts client IP and location from a signed first-party proxy or from Cloudflare.
package edgegeo

// Result is what ingest uses for one request. Empty fields fall back to the database lookup.
type Result struct {
	IP                    string // client IP to use: X-Trail-IP from a signed proxy, else netx.ClientIP(r)
	Country, Region, City string // validated edge values, "" = unknown
	Source                string // "" (database) | "vercel" | "cloudflare" | "netlify"
	Proxied               bool   // the request came through a verified first-party proxy
	Host                  string // X-Trail-Host from a verified proxy (for agent signature @authority), else ""
}
