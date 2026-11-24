package install

import (
	"context"
	"fmt"
	"strings"

	"trail/internal/crawlers"
)

const robotsLabel = "AI crawlers may read your site"

// robotsBlocked returns the bots that robots.txt does not let fetch "/".
// RFC 9309: a bot obeys the group naming it (case-insensitive), else the "*"
// group; "/" is blocked by Disallow: / unless Allow: / is also present.
func robotsBlocked(txt string, bots []string) []string {
	type rules struct{ disallow, allow bool }
	groups := map[string]*rules{}
	var cur []string
	inRules := false
	for line := range strings.SplitSeq(txt, "\n") {
		if i := strings.IndexByte(line, '#'); i >= 0 {
			line = line[:i]
		}
		k, v, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !ok {
			continue
		}
		k, v = strings.ToLower(strings.TrimSpace(k)), strings.TrimSpace(v)
		switch k {
		case "user-agent":
			if inRules {
				cur, inRules = nil, false
			}
			cur = append(cur, strings.ToLower(v))
		case "disallow", "allow":
			inRules = true
			for _, a := range cur {
				g := groups[a]
				if g == nil {
					g = &rules{}
					groups[a] = g
				}
				if k == "disallow" && v == "/" {
					g.disallow = true
				}
				if k == "allow" && v == "/" {
					g.allow = true
				}
			}
		}
	}
	var out []string
	for _, b := range bots {
		g, ok := groups[strings.ToLower(b)]
		if !ok {
			g = groups["*"]
		}
		if g != nil && g.disallow && !g.allow {
			out = append(out, b)
		}
	}
	return out
}

// robotsCheck warns when robots.txt turns AI crawlers away. It never fails:
// a missing file, an error or a fetcher without path support all read as "no rules".
func robotsCheck(ctx context.Context, f Fetcher, host string) CheckItem {
	ok := item("robots", robotsLabel, "pass", CodeOK, "No robots.txt rules for AI crawlers found.", "")
	pf, can := f.(PathFetcher)
	if !can {
		return ok
	}
	p, err := pf.FetchPath(ctx, host, "/robots.txt")
	if err != nil || p.Status != 200 {
		return ok
	}
	blocked := robotsBlocked(string(p.Body), crawlers.Names())
	if len(blocked) == 0 {
		return ok
	}
	shown := blocked
	more := ""
	if len(shown) > 3 {
		shown, more = shown[:3], ", …"
	}
	return item("robots", robotsLabel, "warn", CodeRobotsBlocksAI,
		fmt.Sprintf("robots.txt disallows %d AI crawlers (%s%s). Crawler tracking will show little for them.", len(blocked), strings.Join(shown, ", "), more),
		`If you use Cloudflare, check Security → Bots → "Manage your robots.txt" (managed robots.txt adds these rules). Otherwise edit robots.txt.`)
}
