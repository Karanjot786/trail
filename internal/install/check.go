package install

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"trail/internal/sites"
)

// retriesHigh is the share of retried events (last 24 h) above which delivery warns.
const retriesHigh = 0.05

// Check runs the install checklist for site (plan §0.5 order: page, script,
// csp, origin, first_event, delivery). trailHost is this server's host (as the
// tracker's src must name it); fetch loads the site's home page.
func Check(ctx context.Context, db *sql.DB, reg *sites.Registry, site sites.Site, trailHost string, fetch Fetcher) (InstallCheck, error) {
	out := InstallCheck{CheckedAt: time.Now().UnixMilli(), Checks: make([]CheckItem, 0, 8)}
	first, last, err := firstEvent(db, site.ID)
	if err != nil {
		return out, err
	}
	out.LastEventAt = last
	// The robots.txt read runs beside the page fetch so both share one 5 s budget.
	robots := make(chan CheckItem, 1)
	go func() { robots <- robotsCheck(ctx, fetch, site.Domain) }()
	page, err := fetch.Fetch(ctx, site.Domain)
	vendor, walled := "", false
	if err == nil {
		vendor, walled = botWall(page)
	}
	if walled {
		out.Checks = append(out.Checks,
			item("page", "Your home page loads", "warn", CodeBotProtection,
				fmt.Sprintf("%s bot protection answered %d instead of the page, so the script and security-policy checks could not run.", vendor, page.Status),
				fmt.Sprintf("This does not block real visitors. To run these checks, allow the user agent \"TrailInstallCheck\" in your %s firewall, or confirm with a test visit.", vendor)),
			item("script", "The Trail script is on the page", "pending", CodeBotProtection, "Needs the page to load first.", ""),
			item("csp", "Your security policy allows Trail", "pending", CodeBotProtection, "Needs the page to load first.", ""))
	} else if err == nil && page.Status >= 400 {
		err = fmt.Errorf("https://%s/ answered %d", site.Domain, page.Status)
	}
	switch {
	case walled:
	case err != nil:
		out.Checks = append(out.Checks,
			item("page", "Your home page loads", "fail", CodeFetchFailed, "Could not load https://"+site.Domain+"/: "+short(err.Error()),
				"Check that the site is public and serves HTTPS. If it is not live yet, send a test visit instead."),
			item("script", "The Trail script is on the page", "pending", CodeFetchFailed, "Needs the page to load first.", ""),
			item("csp", "Your security policy allows Trail", "pending", CodeFetchFailed, "Needs the page to load first.", ""))
	default:
		tag := findTracker(string(page.Body))
		out.Checks = append(out.Checks, item("page", "Your home page loads", "pass", CodeOK, fmt.Sprintf("https://%s/ answered %d.", site.Domain, page.Status), ""))
		out.Checks = append(out.Checks, scriptCheck(tag, site, trailHost, last != nil), cspCheck(page.Header.Values("Content-Security-Policy"), tag, site, trailHost))
	}

	if n := reg.Rejected24h(site.ID); n > 0 {
		var from string
		if h := reg.LastRejectedHost(site.ID); h != "" {
			from = fmt.Sprintf("a host this site does not allow (latest: %s)", h)
		} else {
			from = "a request with no Origin or Referer (a server or script, not a browser)"
		}
		out.Checks = append(out.Checks, item("origin", "Events come from an allowed address", "fail", CodeOriginNotAllowed,
			fmt.Sprintf("%d events in the last 24 hours came from %s.", n, from),
			originFix(reg.LastRejectedHost(site.ID))))
	} else {
		out.Checks = append(out.Checks, item("origin", "Events come from an allowed address", "pass", CodeOK, "No events were refused for their origin.", ""))
	}

	out.Checks = append(out.Checks, first)

	del, err := delivery(db, site.ID, time.Now().Add(-24*time.Hour).UnixMilli())
	if err != nil {
		return out, err
	}
	out.Checks = append(out.Checks, del, <-robots, proxyCheck(reg.BadProxy24h(site.ID)))

	out.State, out.Checks = finalize(out.Checks, last)
	return out, nil
}

// finalize decides the overall state once all checks are in. A site that has
// received a non-bot event is "receiving" and its failures become warnings;
// otherwise any failure means "blocked", else "waiting".
func finalize(checks []CheckItem, lastEventAt *int64) (string, []CheckItem) {
	if lastEventAt != nil {
		for i := range checks {
			if checks[i].Status == "fail" {
				checks[i].Status = "warn"
			}
		}
		return "receiving", checks
	}
	for _, c := range checks {
		if c.Status == "fail" {
			return "blocked", checks
		}
	}
	return "waiting", checks
}

// originFix tells the owner which origin to add. Vercel preview hosts end in
// -<team>.vercel.app, so a refused one yields an exact suggestion.
func originFix(lastHost string) string {
	if first, ok := strings.CutSuffix(strings.ToLower(lastHost), ".vercel.app"); ok && !strings.Contains(first, ".") {
		if i := strings.LastIndexByte(first, '-'); i >= 0 && i < len(first)-1 {
			return "Add *-" + first[i+1:] + ".vercel.app under the site's allowed origins (Vercel preview URLs end in -<team>.vercel.app)."
		}
	}
	return "Add the host (or *.example.com or *-team.vercel.app) under the site's allowed origins."
}

func item(id, label, status string, code ReasonCode, detail, fix string) CheckItem {
	return CheckItem{ID: id, Label: label, Status: status, Code: code, Detail: detail, Fix: fix}
}

func short(s string) string {
	if len(s) > 160 {
		return s[:160] + "…"
	}
	return s
}

// firstEvent reports whether production events have arrived, and why not.
func firstEvent(db *sql.DB, site string) (CheckItem, *int64, error) {
	const label = "The first visit arrived"
	var prod, other, bots int
	var last sql.NullInt64
	err := db.QueryRow(`SELECT
		coalesce(sum(is_bot=0 AND env IN ('production','')),0),
		coalesce(sum(is_bot=0 AND env NOT IN ('production','')),0),
		coalesce(sum(is_bot=1),0),
		max(CASE WHEN is_bot=0 THEN ts END)
		FROM events WHERE site_id=?`, site).Scan(&prod, &other, &bots, &last)
	if err != nil {
		return CheckItem{}, nil, fmt.Errorf("install check: %w", err)
	}
	var lastPtr *int64
	if last.Valid {
		lastPtr = &last.Int64
	}
	switch {
	case prod > 0:
		return item("first_event", label, "pass", CodeOK, fmt.Sprintf("%d events received.", prod), ""), lastPtr, nil
	case other > 0:
		return item("first_event", label, "warn", CodeEventsPreviewOnly,
			"Events arrived, but only from preview or development builds.",
			"Production visits count once the site runs on its real domain."), lastPtr, nil
	case bots > 0:
		return item("first_event", label, "warn", CodeBotFiltered,
			"Only bot requests arrived; Trail leaves bots out.", "Open the site in a normal browser."), lastPtr, nil
	}
	return item("first_event", label, "pending", CodeNoEvents, "No events yet.", "Open your site in a new tab to send a test visit."), nil, nil
}

func delivery(db *sql.DB, site string, since int64) (CheckItem, error) {
	const label = "Events are delivered reliably"
	var n, retried int
	if err := db.QueryRow(`SELECT count(*), coalesce(sum(retry>=1),0) FROM events WHERE site_id=? AND ts>=?`, site, since).
		Scan(&n, &retried); err != nil {
		return CheckItem{}, fmt.Errorf("install check: %w", err)
	}
	if n > 0 && float64(retried)/float64(n) > retriesHigh {
		return item("delivery", label, "warn", CodeRetriesHigh,
			fmt.Sprintf("%d of %d events in the last 24 hours needed a retry.", retried, n),
			"Check for an ad blocker rule, a slow proxy or a timeout in front of Trail."), nil
	}
	if n == 0 {
		return item("delivery", label, "pending", CodeOK, "Nothing delivered in the last 24 hours.", ""), nil
	}
	return item("delivery", label, "pass", CodeOK, fmt.Sprintf("%d events in the last 24 hours.", n), ""), nil
}

// botWall recognises a bot-protection challenge or block in place of the page.
// Cloudflare sets cf-mitigated: challenge on every challenge; Vercel's firewall
// sets x-vercel-mitigated.
func botWall(p Page) (vendor string, ok bool) {
	if p.Status != 403 && p.Status != 429 && p.Status != 503 {
		return "", false
	}
	if strings.EqualFold(p.Header.Get("Cf-Mitigated"), "challenge") {
		return "Cloudflare", true
	}
	if v := strings.ToLower(p.Header.Get("X-Vercel-Mitigated")); v == "challenge" || v == "deny" {
		return "Vercel", true
	}
	if (p.Status == 403 || p.Status == 503) && strings.EqualFold(p.Header.Get("Server"), "cloudflare") {
		return "Cloudflare", true
	}
	return "", false
}

// proxyCheck warns when a first-party proxy sent signatures this server could
// not verify; those requests are counted as the proxy's own address.
func proxyCheck(badSig int) CheckItem {
	const label = "Proxied events are signed"
	if badSig == 0 {
		return item("proxy", label, "pass", CodeOK, "No forwarded request had a signature this server rejected.", "")
	}
	return item("proxy", label, "warn", CodeProxyBadSignature,
		fmt.Sprintf("%d forwarded requests in the last 24 hours had a signature this server could not verify. Every visitor behind them looks like your proxy.", badSig),
		"Set TRAIL_SITE and TRAIL_CRAWL_TOKEN on your host to a token that exists under Settings → Tokens, then redeploy.")
}
