package install

import (
	"net/url"
	"slices"
	"strings"

	"trail/internal/sites"
)

const cspLabel = "Your security policy allows Trail"

// cspTarget is a source the page must be allowed to load or call: a named
// host, or the page's own origin.
type cspTarget struct {
	host string // empty means the page itself
}

func (t cspTarget) String() string {
	if t.host == "" {
		return "'self'"
	}
	return "https://" + t.host
}

func resolveTarget(raw string) cspTarget {
	if u, err := url.Parse(raw); err == nil && u.Host != "" {
		return cspTarget{host: strings.ToLower(u.Host)}
	}
	return cspTarget{}
}

// cspCheck reads every enforced Content-Security-Policy (all of them apply,
// W3C CSP3). The tracker's script and its events must each be allowed by
// script-src-elem / script-src / default-src and connect-src / default-src.
func cspCheck(policies []string, t trackerTag, site sites.Site, trailHost string) CheckItem {
	var parsed []map[string][]string
	for _, h := range policies {
		for p := range strings.SplitSeq(h, ",") {
			dirs := map[string][]string{}
			for d := range strings.SplitSeq(p, ";") {
				f := strings.Fields(d)
				if len(f) == 0 {
					continue
				}
				name := strings.ToLower(f[0])
				if _, dup := dirs[name]; !dup { // the first occurrence wins
					dirs[name] = f[1:]
				}
			}
			if len(dirs) > 0 {
				parsed = append(parsed, dirs)
			}
		}
	}
	if len(parsed) == 0 {
		return item("csp", cspLabel, "pass", CodeOK, "No Content-Security-Policy header.", "")
	}

	trail := cspTarget{host: strings.ToLower(trailHost)}
	page := cspTarget{}
	var scriptT, connectT []cspTarget // any one allowed is enough
	switch {
	case t.Via == "":
		scriptT, connectT = []cspTarget{trail, page}, []cspTarget{trail, page}
	default:
		src := resolveTarget(t.Src)
		scriptT = []cspTarget{src}
		switch {
		case t.API != "":
			connectT = []cspTarget{resolveTarget(t.API)}
		case src.host != "" && sameHost(src.host, trailHost):
			connectT = []cspTarget{trail}
		default:
			connectT = []cspTarget{page}
		}
	}
	dynamicOK := t.Via != "tag" || t.Nonce != ""

	var blocked, fixes []string
	add := func(name string, targets []cspTarget) {
		if !slices.Contains(blocked, name) {
			blocked = append(blocked, name)
		}
		for _, tg := range targets {
			if f := tg.String(); !slices.Contains(fixes, f) {
				fixes = append(fixes, f)
			}
			if t.Via == "" {
				break // unknown install: suggest the first-party-neutral Trail host only
			}
		}
	}
	for _, dirs := range parsed {
		name, srcs, ok := pick(dirs, "script-src-elem", "script-src", "default-src")
		if ok && !cspAllowsAny(srcs, scriptT, site.Domain, true, dynamicOK) {
			add(name, scriptT)
		}
		name, srcs, ok = pick(dirs, "connect-src", "default-src")
		if ok && !cspAllowsAny(srcs, connectT, site.Domain, false, true) {
			add(name, connectT)
		}
	}
	if len(blocked) > 0 {
		return item("csp", cspLabel, "fail", CodeCSPBlocked,
			"Your Content-Security-Policy "+strings.Join(blocked, " and ")+" does not allow Trail ("+strings.Join(fixes, " or ")+").",
			"Add "+strings.Join(fixes, " or ")+" to "+strings.Join(blocked, " and ")+".")
	}
	return item("csp", cspLabel, "pass", CodeOK, "The Content-Security-Policy allows Trail.", "")
}

func pick(dirs map[string][]string, names ...string) (string, []string, bool) {
	for _, n := range names {
		if v, ok := dirs[n]; ok {
			return n, v, true
		}
	}
	return "", nil, false
}

// cspAllowsAny reports whether the source list allows at least one target.
// With 'strict-dynamic' (script lists only) host sources are ignored and a
// script is allowed only when a trusted script injects it (dynamicOK).
func cspAllowsAny(srcs []string, targets []cspTarget, siteHost string, script, dynamicOK bool) bool {
	if script && slices.ContainsFunc(srcs, func(s string) bool { return strings.EqualFold(s, "'strict-dynamic'") }) {
		return dynamicOK
	}
	for _, tg := range targets {
		if cspAllows(srcs, tg, siteHost) {
			return true
		}
	}
	return false
}

func cspAllows(srcs []string, tg cspTarget, siteHost string) bool {
	th := tg.host
	for _, s := range srcs {
		s = strings.ToLower(strings.Trim(s, `"`))
		switch {
		case s == "*" || s == "https:":
			return true
		case s == "'self'" && (th == "" || sameSite(strings.Split(th, ":")[0], siteHost)):
			return true
		case s == "'none'" || strings.HasPrefix(s, "'"):
			continue
		}
		host := s
		if strings.Contains(s, "://") {
			u, err := url.Parse(s)
			if err != nil || u.Host == "" || u.Scheme != "https" {
				continue
			}
			host = u.Host
		}
		host, _, _ = strings.Cut(host, "/")
		if th == "" {
			if sameSite(strings.Split(host, ":")[0], siteHost) {
				return true
			}
			continue
		}
		if sameHost(host, th) {
			return true
		}
		if suffix, ok := strings.CutPrefix(host, "*."); ok && strings.HasSuffix(strings.Split(th, ":")[0], "."+suffix) {
			return true
		}
	}
	return false
}
