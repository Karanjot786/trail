// Package agents recognises AI browsing agents and verifies AI crawlers.
package agents

// Via says how an agent was recognised, weakest first.
type Via string

const (
	ViaNone  Via = ""
	ViaUA    Via = "ua"    // a user-agent token only: "Claimed"
	ViaIP    Via = "ip"    // the client IP is in the operator's published list
	ViaRelay Via = "relay" // a verified signed request for the same site+IP+UA came through the server hook
	ViaSig   Via = "sig"   // this request carried a valid Web Bot Auth signature
)

// Verified reports whether v is ip, relay or sig.
func (v Via) Verified() bool {
	return v == ViaIP || v == ViaRelay || v == ViaSig
}

// Result is a classification. ID "" means not an agent.
type Result struct {
	ID  string
	Via Via
}

// Signed is the signature material of one request.
type Signed struct{ Authority, SignatureAgent, SignatureInput, Signature string }

// Input is what ingest knows about one beacon request.
type Input struct {
	Site, UA, IP string
	Signed       Signed
	HostOK       func(host string) bool // sites.Allowed for this site; nil = only Signed.Authority is tried
}

// ListStatus is one fetched list or key directory, for the setup card.
type ListStatus struct {
	Name, Kind string // Kind: "ip" | "keys"
	FetchedAt  int64  // unix ms, 0 = never
	Entries    int
	OK         bool
}
