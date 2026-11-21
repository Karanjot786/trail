// Package meta stores the dashboard's small metadata: notes, saved views, share links and API tokens.
package meta

// Metadata contract (plan §0.5/§0.6). Frozen after P0; B2 owns the rest of the package.

import "trail/internal/query"

// Token scopes, mirrored by TokenScope in web/src/api/types.ts.
const (
	ScopeRead  = "read"
	ScopeNotes = "notes"
	ScopeWrite = "write"
	ScopeCrawl = "crawl"
)

// Note is a chart annotation.
type Note struct {
	ID    int64  `json:"id"`
	Site  string `json:"site"`
	TS    int64  `json:"ts"`
	Label string `json:"label"`
	Kind  string `json:"kind"` // deploy | campaign | press | other
}

// SavedView is a named dashboard URL state; Site nil means all sites.
type SavedView struct {
	ID      int64   `json:"id"`
	Name    string  `json:"name"`
	Site    *string `json:"site"`
	State   string  `json:"state"`
	Created int64   `json:"created"`
}

// Share is a read-only share link. URL is set only in the create response.
type Share struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Site        string `json:"site"`
	State       string `json:"state"`
	HideRevenue bool   `json:"hideRevenue"`
	Created     int64  `json:"created"`
	Expires     *int64 `json:"expires"`
	LastUsed    *int64 `json:"lastUsed"`
	URL         string `json:"url,omitempty"`
}

// ShareMeta is the /api/share/{token}/meta payload.
type ShareMeta struct {
	Site        query.Site `json:"site"`
	State       string     `json:"state"`
	HideRevenue bool       `json:"hideRevenue"`
	Expires     *int64     `json:"expires"`
}

// APIToken is a bearer token as listed (never the secret).
type APIToken struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Prefix   string  `json:"prefix"`
	Scope    string  `json:"scope"`
	Site     *string `json:"site"`
	Created  int64   `json:"created"`
	LastUsed *int64  `json:"lastUsed"`
	FromEnv  bool    `json:"fromEnv"`
}

// NewToken is a just-created token; Token is shown once.
type NewToken struct {
	APIToken
	Token string `json:"token"`
}

// WhoAmI is the /api/v1/whoami payload.
type WhoAmI struct {
	Name  string  `json:"name"`
	Scope string  `json:"scope"`
	Site  *string `json:"site"`
}
