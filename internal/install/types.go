// Package install checks that a site's tracker is installed and delivering events.
package install

// Install check contract (plan §0.5/§0.6). Frozen after P0; B2 owns the rest of the package.

// ReasonCode is a machine-readable reason for a check's status.
type ReasonCode string

// Reason codes, mirrored by ReasonCode in web/src/api/types.ts.
const (
	CodeOK                ReasonCode = "ok"
	CodeFetchFailed       ReasonCode = "fetch_failed"
	CodeScriptMissing     ReasonCode = "script_missing"
	CodeWrongSiteID       ReasonCode = "wrong_site_id"
	CodeWrongHost         ReasonCode = "wrong_host"
	CodeCSPBlocked        ReasonCode = "csp_blocked"
	CodeOriginNotAllowed  ReasonCode = "origin_not_allowed"
	CodeNoEvents          ReasonCode = "no_events"
	CodeEventsPreviewOnly ReasonCode = "events_preview_only"
	CodeBotFiltered       ReasonCode = "bot_filtered"
	CodeRetriesHigh       ReasonCode = "retries_high"
	CodeAPIMissing        ReasonCode = "api_missing"
)

// CheckItem is one line of the install checklist.
type CheckItem struct {
	ID     string     `json:"id"` // page | script | csp | origin | first_event | delivery
	Label  string     `json:"label"`
	Status string     `json:"status"` // pass | fail | warn | pending
	Code   ReasonCode `json:"code"`
	Detail string     `json:"detail"`
	Fix    string     `json:"fix"`
}

// InstallCheck is the /api/sites/{id}/check payload.
type InstallCheck struct {
	State       string      `json:"state"` // waiting | receiving | blocked
	CheckedAt   int64       `json:"checkedAt"`
	LastEventAt *int64      `json:"lastEventAt"`
	Checks      []CheckItem `json:"checks"`
}
