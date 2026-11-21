package netx

import (
	_ "embed"
	"net/netip"
	"strings"
)

// Snapshots of https://www.cloudflare.com/ips-v4 and ips-v6.
// Refresh with `make cloudflare-ips` (scripts/update-cloudflare-ips.sh).
var (
	//go:embed cloudflare-v4.txt
	cloudflareV4 string
	//go:embed cloudflare-v6.txt
	cloudflareV6 string

	cloudflare = mustPrefixes(cloudflareV4 + "\n" + cloudflareV6)
)

func mustPrefixes(s string) []netip.Prefix {
	var out []netip.Prefix
	for line := range strings.Lines(s) {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, netip.MustParsePrefix(line))
	}
	return out
}

// IsCloudflare reports whether a is in Cloudflare's published edge ranges.
// It says nothing about configuration; to know whether a request's
// Cloudflare headers may be believed, use Client.ViaCloudflare.
func IsCloudflare(a netip.Addr) bool {
	a = a.WithZone("").Unmap()
	for _, p := range cloudflare {
		if p.Contains(a) {
			return true
		}
	}
	return false
}
