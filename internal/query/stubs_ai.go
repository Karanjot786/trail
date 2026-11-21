package query

import (
	"database/sql"
	"time"
)

// AIVisibility is the AI visibility funnel (GET /api/ai-visibility). P0 stub: B-api implements it.
func AIVisibility(db *sql.DB, p Params) (AIVisibilityResult, error) {
	return AIVisibilityResult{}, ErrNotImplemented
}

// Agents is the AI agents report (GET /api/agents). P0 stub: B-api implements it.
func Agents(db *sql.DB, p Params) (AgentsResult, error) {
	return AgentsResult{}, ErrNotImplemented
}

// AISetupFor is the setup status behind the Unlock AI crawlers card (GET /api/ai-setup). P0 stub: B-api implements it.
func AISetupFor(db *sql.DB, site string, now time.Time) (AISetup, error) {
	return AISetup{}, ErrNotImplemented
}
