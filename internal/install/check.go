package install

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"trail/internal/sites"
)

// retriesHigh is the share of retried events (last 24 h) above which delivery warns.
const retriesHigh = 0.05

var (
	scriptTag = regexp.MustCompile(`(?is)<script\b[^>]*>`)
	attrRe    = regexp.MustCompile(`(?is)([a-z][a-z0-9_:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`)
	trackerJS = regexp.MustCompile(`/_t/t(\.[a-z]+)?\.js(\?|$)`)
)

// Check runs the install checklist for site (plan §0.5 order: page, script,
// csp, origin, first_event, delivery). trailHost is this server's host (as the
// tracker's src must name it); fetch loads the site's home page.
func Check(ctx context.Context, db *sql.DB, reg *sites.Registry, site sites.Site, trailHost string, fetch Fetcher) (InstallCheck, error) {
	out := InstallCheck{CheckedAt: time.Now().UnixMilli(), Checks: make([]CheckItem, 0, 6)}
	page, err := fetch.Fetch(ctx, site.Domain)
	if err == nil && page.Status >= 400 {
		err = fmt.Errorf("https://%s/ answered %d", site.Domain, page.Status)
	}
	if err != nil {
		out.Checks = append(out.Checks,
			item("page", "Your home page loads", "fail", CodeFetchFailed, "Could not load https://"+site.Domain+"/: "+short(err.Error()),
				"Check that the site is public and serves HTTPS. If it is not live yet, send a test visit instead."),
			item("script", "The Trail script is on the page", "pending", CodeFetchFailed, "Needs the page to load first.", ""),
			item("csp", "Your security policy allows Trail", "pending", CodeFetchFailed, "Needs the page to load first.", ""))
	} else {
		out.Checks = append(out.Checks, item("page", "Your home page loads", "pass", CodeOK, fmt.Sprintf("https://%s/ answered %d.", site.Domain, page.Status), ""))
		out.Checks = append(out.Checks, scriptCheck(string(page.Body), site, trailHost), cspCheck(page.Header.Get("Content-Security-Policy"), site, trailHost))
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
			"Add the host (or *.example.com) under the site's allowed origins."))
	} else {
		out.Checks = append(out.Checks, item("origin", "Events come from an allowed address", "pass", CodeOK, "No events were refused for their origin.", ""))
	}

	first, last, err := firstEvent(db, site.ID)
	if err != nil {
		return out, err
	}
	out.LastEventAt = last
	out.Checks = append(out.Checks, first)

	del, err := delivery(db, site.ID, time.Now().Add(-24*time.Hour).UnixMilli())
	if err != nil {
		return out, err
	}
	out.Checks = append(out.Checks, del)

	out.State = "waiting"
	if last != nil {
		out.State = "receiving"
	}
	for _, c := range out.Checks {
		if c.Status == "fail" {
			out.State = "blocked"
		}
	}
	return out, nil
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

func attrs(tag string) map[string]string {
	m := map[string]string{}
	for _, a := range attrRe.FindAllStringSubmatch(tag, -1) {
		m[strings.ToLower(a[1])] = a[2] + a[3] + a[4]
	}
	return m
}

const scriptLabel = "The Trail script is on the page"

func scriptCheck(html string, site sites.Site, trailHost string) CheckItem {
	snippet := fmt.Sprintf(`<script defer src="https://%s/_t/t.js" data-site="%s"></script>`, trailHost, site.ID)
	var found []map[string]string
	for _, tag := range scriptTag.FindAllString(html, -1) {
		a := attrs(tag)
		if trackerJS.MatchString(a["src"]) {
			found = append(found, a)
		}
	}
	if len(found) == 0 {
		return item("script", scriptLabel, "fail", CodeScriptMissing, "No Trail script tag on the home page.",
			"Add this to the page's <head>: "+snippet)
	}
	a := found[0]
	if a["data-site"] != site.ID {
		return item("script", scriptLabel, "fail", CodeWrongSiteID,
			fmt.Sprintf("The script says data-site=%q, but this site's id is %q.", a["data-site"], site.ID),
			`Set data-site="`+site.ID+`".`)
	}
	if u, err := url.Parse(a["src"]); err == nil && u.Host != "" && !sameHost(u.Host, trailHost) {
		return item("script", scriptLabel, "fail", CodeWrongHost,
			fmt.Sprintf("The script loads from %s, not from this Trail (%s).", u.Host, trailHost), "Use: "+snippet)
	}
	return item("script", scriptLabel, "pass", CodeOK, "Found the Trail script with the right site id.", "")
}

func sameHost(a, b string) bool {
	strip := func(h string) string {
		if i := strings.LastIndexByte(h, ':'); i > 0 && !strings.HasSuffix(h, "]") {
			h = h[:i]
		}
		return strings.ToLower(h)
	}
	return strip(a) == strip(b)
}

const cspLabel = "Your security policy allows Trail"

// cspCheck reads the Content-Security-Policy header: script-src and
// connect-src (or default-src) must allow the Trail host.
func cspCheck(policy string, site sites.Site, trailHost string) CheckItem {
	if strings.TrimSpace(policy) == "" {
		return item("csp", cspLabel, "pass", CodeOK, "No Content-Security-Policy header.", "")
	}
	dirs := map[string][]string{}
	for d := range strings.SplitSeq(policy, ";") {
		f := strings.Fields(d)
		if len(f) > 0 {
			dirs[strings.ToLower(f[0])] = f[1:]
		}
	}
	var blocked []string
	for _, d := range []string{"script-src", "connect-src"} {
		srcs, ok := dirs[d]
		if !ok {
			srcs, ok = dirs["default-src"]
		}
		if ok && !cspAllows(srcs, site.Domain, trailHost) {
			blocked = append(blocked, d)
		}
	}
	if len(blocked) > 0 {
		return item("csp", cspLabel, "fail", CodeCSPBlocked,
			"Your Content-Security-Policy "+strings.Join(blocked, " and ")+" does not include "+trailHost+".",
			"Add https://"+trailHost+" to "+strings.Join(blocked, " and ")+".")
	}
	return item("csp", cspLabel, "pass", CodeOK, "The Content-Security-Policy allows "+trailHost+".", "")
}

func cspAllows(srcs []string, siteHost, trailHost string) bool {
	th := strings.ToLower(trailHost)
	for _, s := range srcs {
		s = strings.ToLower(strings.Trim(s, `"`))
		switch {
		case s == "*" || s == "https:":
			return true
		case s == "'self'" && sameHost(siteHost, th):
			return true
		}
		host := s
		if u, err := url.Parse(s); err == nil && u.Host != "" {
			if u.Scheme != "https" && u.Scheme != "" {
				continue
			}
			host = u.Host
		}
		host = strings.TrimSuffix(host, "/")
		if sameHost(host, th) {
			return true
		}
		if suffix, ok := strings.CutPrefix(host, "*."); ok && strings.HasSuffix(strings.Split(th, ":")[0], "."+suffix) {
			return true
		}
	}
	return false
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
