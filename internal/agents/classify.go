package agents

import "net"

// Classify recognises an AI agent in one beacon request, strongest first:
//  1. a valid Web Bot Auth signature on this request (sig), verified for
//     in.Signed.Authority. A caller with several candidate authorities (the
//     verified proxy's X-Trail-Host, then r.Host) calls Classify per candidate;
//  2. a verified signed request for the same site+IP+UA relayed by the server
//     hook in the last 30 minutes (relay);
//  3. the client IP in the agent operator's published list (ip);
//  4. a UA token such as Claude-Agent (ua, "Claimed").
//
// When in.HostOK is set, the signed authority must be one of the site's hosts,
// so a signature captured on another host cannot be replayed.
//
// It never waits on the network: it uses what is cached now.
func (d *Directory) Classify(in Input) Result {
	hostOK := in.HostOK == nil || in.HostOK(hostOnly(in.Signed.Authority))
	if in.Signed.SignatureAgent != "" && hostOK {
		if a, err := Verify(in.Signed, in.Signed.Authority, d, d.o.Now()); err == nil {
			return Result{ID: a.ID, Via: ViaSig}
		}
	}
	if in.IP != "" && in.UA != "" {
		if id, ok := d.relay.get(in.Site, in.IP, in.UA); ok {
			return Result{ID: id, Via: ViaRelay}
		}
	}
	if in.IP != "" {
		for _, a := range Catalogue {
			if d.inAgentList(a, in.IP) {
				return Result{ID: a.ID, Via: ViaIP}
			}
		}
	}
	if a, ok := MatchUA(in.UA); ok {
		return Result{ID: a.ID, Via: ViaUA}
	}
	return Result{}
}

// hostOnly drops a port from an authority ("shop.example:443" → "shop.example").
func hostOnly(h string) string {
	if host, _, err := net.SplitHostPort(h); err == nil {
		return host
	}
	return h
}
