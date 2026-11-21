package query

import (
	"strconv"
	"strings"
)

// sourceRule names a referrer. Host matches the bare referrer host or any subdomain of it;
// a Host ending in "." matches any host that starts with it (google.co.in, google.de, …).
// UTM, when set, also matches a direct visit with that utm_source.
type sourceRule struct {
	Host, UTM, Name, Channel string
}

// sourceRules is the compile-time list behind sourceNameExpr, channelExpr and aiSourceExpr.
// AI rules come first so gemini.google.com is not read as Google search.
var sourceRules = []sourceRule{
	{Host: "chatgpt.com", UTM: "chatgpt.com", Name: "ChatGPT", Channel: "AI"},
	{Host: "chat.openai.com", Name: "ChatGPT", Channel: "AI"},
	{Host: "perplexity.ai", Name: "Perplexity", Channel: "AI"},
	{Host: "claude.ai", Name: "Claude", Channel: "AI"},
	{Host: "gemini.google.com", Name: "Gemini", Channel: "AI"},
	{Host: "copilot.microsoft.com", Name: "Copilot", Channel: "AI"},
	{Host: "chat.deepseek.com", Name: "DeepSeek", Channel: "AI"},
	{Host: "grok.com", Name: "Grok", Channel: "AI"},
	{Host: "meta.ai", Name: "Meta AI", Channel: "AI"},
	{Host: "chat.mistral.ai", Name: "Le Chat", Channel: "AI"},
	{Host: "you.com", Name: "You.com", Channel: "AI"},
	{Host: "phind.com", Name: "Phind", Channel: "AI"},

	{Host: "google.", Name: "Google", Channel: "Organic search"},
	{Host: "bing.com", Name: "Bing", Channel: "Organic search"},
	{Host: "duckduckgo.com", Name: "DuckDuckGo", Channel: "Organic search"},
	{Host: "search.brave.com", Name: "Brave Search", Channel: "Organic search"},
	{Host: "yandex.", Name: "Yandex", Channel: "Organic search"},
	{Host: "baidu.com", Name: "Baidu", Channel: "Organic search"},
	{Host: "ecosia.org", Name: "Ecosia", Channel: "Organic search"},
	{Host: "kagi.com", Name: "Kagi", Channel: "Organic search"},

	{Host: "t.co", Name: "X", Channel: "Social"},
	{Host: "x.com", Name: "X", Channel: "Social"},
	{Host: "twitter.com", Name: "X", Channel: "Social"},
	{Host: "news.ycombinator.com", Name: "Hacker News", Channel: "Social"},
	{Host: "reddit.com", Name: "Reddit", Channel: "Social"},
	{Host: "linkedin.com", Name: "LinkedIn", Channel: "Social"},
	{Host: "lnkd.in", Name: "LinkedIn", Channel: "Social"},
	{Host: "facebook.com", Name: "Facebook", Channel: "Social"},
	{Host: "instagram.com", Name: "Instagram", Channel: "Social"},
	{Host: "youtube.com", Name: "YouTube", Channel: "Social"},
	{Host: "bsky.app", Name: "Bluesky", Channel: "Social"},
	{Host: "threads.net", Name: "Threads", Channel: "Social"},

	{Host: "github.com", Name: "GitHub", Channel: "Referral"},
}

// Generated once from sourceRules (constants only, quotes doubled): never from user input.
// They read the columns referrer_host, utm_source, utm_medium and utm_campaign of one event,
// which for source purposes is a session's landing pageview.
var (
	sourceNameExpr = buildSourceName()
	channelExpr    = buildChannel()
	aiSourceExpr   = buildAISource()
)

func sqlStr(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// ruleMatch is the SQL condition for one rule.
func ruleMatch(r sourceRule) string {
	var c string
	if strings.HasSuffix(r.Host, ".") {
		c = "(substr(referrer_host,1," + strconv.Itoa(len(r.Host)) + ")=" + sqlStr(r.Host) +
			" OR instr(referrer_host," + sqlStr("."+r.Host) + ")>0)"
	} else {
		c = "(referrer_host=" + sqlStr(r.Host) + " OR substr(referrer_host,-" + strconv.Itoa(len(r.Host)+1) + ")=" + sqlStr("."+r.Host) + ")"
	}
	if r.UTM != "" {
		c = "(" + c + " OR (referrer_host='' AND utm_source=" + sqlStr(r.UTM) + "))"
	}
	return c
}

func buildSourceName() string {
	var b strings.Builder
	b.WriteString("(CASE")
	for _, r := range sourceRules {
		b.WriteString(" WHEN " + ruleMatch(r) + " THEN " + sqlStr(r.Name))
	}
	b.WriteString(" WHEN referrer_host!='' THEN referrer_host WHEN utm_source!='' THEN utm_source ELSE 'Direct' END)")
	return b.String()
}

func buildChannel() string {
	var b strings.Builder
	b.WriteString("(CASE")
	for _, r := range sourceRules {
		if r.Channel == "AI" {
			b.WriteString(" WHEN " + ruleMatch(r) + " THEN 'AI'")
		}
	}
	b.WriteString(" WHEN lower(utm_medium) IN ('email','newsletter') THEN 'Email'")
	b.WriteString(" WHEN lower(utm_medium) IN ('cpc','ppc') OR substr(lower(utm_medium),1,4)='paid' THEN 'Paid'")
	for _, ch := range []string{"Organic search", "Social", "Referral"} {
		for _, r := range sourceRules {
			if r.Channel == ch {
				b.WriteString(" WHEN " + ruleMatch(r) + " THEN " + sqlStr(ch))
			}
		}
	}
	b.WriteString(" WHEN utm_source!='' OR utm_medium!='' OR utm_campaign!='' THEN 'Campaign'")
	b.WriteString(" WHEN referrer_host!='' THEN 'Referral' ELSE 'Direct' END)")
	return b.String()
}

func buildAISource() string {
	var b strings.Builder
	b.WriteString("(CASE")
	for _, r := range sourceRules {
		if r.Channel == "AI" {
			b.WriteString(" WHEN " + ruleMatch(r) + " THEN " + sqlStr(r.Name))
		}
	}
	b.WriteString(" ELSE '' END)")
	return b.String()
}
