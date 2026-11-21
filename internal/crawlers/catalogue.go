// Package crawlers recognises AI crawlers in server access logs and stores
// their requests, aggregated per hour x bot x path x status class.
package crawlers

import "strings"

// Crawl categories, mirrored by CrawlCategory in web/src/api/types.ts.
const (
	Training = "training"
	Indexing = "indexing"
	Fetch    = "fetch"
	General  = "general"
)

type bot struct {
	name, provider, category string
	lower                    string // lower-case name, the UA substring matched
}

// catalogue lists the crawlers kept. Robots-only tokens (Google-Extended,
// Applebot-Extended) are left out: they never appear in access logs.
var catalogue = func() []bot {
	list := []bot{
		{name: "GPTBot", provider: "OpenAI", category: Training},
		{name: "ChatGPT-User", provider: "OpenAI", category: Fetch},
		{name: "OAI-SearchBot", provider: "OpenAI", category: Indexing},
		{name: "ClaudeBot", provider: "Anthropic", category: Training},
		{name: "Claude-User", provider: "Anthropic", category: Fetch},
		{name: "Claude-SearchBot", provider: "Anthropic", category: Indexing},
		{name: "PerplexityBot", provider: "Perplexity", category: Indexing},
		{name: "Perplexity-User", provider: "Perplexity", category: Fetch},
		{name: "Applebot", provider: "Apple", category: General},
		{name: "Amazonbot", provider: "Amazon", category: General},
		{name: "Bytespider", provider: "ByteDance", category: Training},
		{name: "CCBot", provider: "Common Crawl", category: Training},
		{name: "Meta-ExternalAgent", provider: "Meta", category: Training},
		{name: "Meta-ExternalFetcher", provider: "Meta", category: Fetch},
		{name: "DuckAssistBot", provider: "DuckDuckGo", category: Fetch},
		{name: "MistralAI-User", provider: "Mistral", category: Fetch},
		{name: "cohere-ai", provider: "Cohere", category: Training},
		{name: "GoogleOther", provider: "Google", category: General},
		{name: "YouBot", provider: "You.com", category: Indexing},
	}
	for i := range list {
		list[i].lower = strings.ToLower(list[i].name)
	}
	return list
}()

// Lookup matches a user agent against the catalogue (case-insensitive substring).
func Lookup(ua string) (name, provider, category string, ok bool) {
	ua = strings.ToLower(ua)
	for _, b := range catalogue {
		if strings.Contains(ua, b.lower) {
			return b.name, b.provider, b.category, true
		}
	}
	return "", "", "", false
}

// Info returns a stored bot name's provider and category ("", "" when unknown).
// cmd/trail hands it to the crawler report.
func Info(name string) (provider, category string) {
	for _, b := range catalogue {
		if b.name == name {
			return b.provider, b.category
		}
	}
	return "", ""
}
