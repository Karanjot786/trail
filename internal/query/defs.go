package query

import "errors"

// Shared SQL fragments and errors for the v3 reports (plan §0.6). Frozen after P0.
// The fragments are compile-time constants; user input never becomes SQL text.

const (
	// purchaseWhere selects Purchase events (either capitalisation).
	purchaseWhere = "type='event' AND name<>'' AND name IN ('Purchase','purchase')"
	// amountMinorExpr is a purchase's amount (major units in props) in integer minor units.
	amountMinorExpr = "CAST(round(coalesce(json_extract(props,'$.amount'),0)*100) AS INTEGER)"
	// currencyExpr is a purchase's ISO 4217 currency, USD when missing.
	currencyExpr = "upper(coalesce(nullif(json_extract(props,'$.currency'),''),'USD'))"
)

var (
	// ErrNotImplemented is returned by the P0 stubs until their owner lands the query.
	ErrNotImplemented = errors.New("not implemented")
	// ErrNotFound is a generic 404 for funnels, goals and other ids.
	ErrNotFound = errors.New("not found")
	// ErrNeedSite is returned when site=all reaches a per-site report (400 "pick a site").
	ErrNeedSite = errors.New("pick a site")
)
