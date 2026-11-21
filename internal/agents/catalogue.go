package agents

import "strings"

// Agent is one AI browsing agent Trail recognises.
type Agent struct {
	ID, Name, Provider string
	UATokens           []string // matched case-insensitively as substrings of the User-Agent
	IPList             string   // name of the operator's published IP list ("" = none)
	SignatureAgent     string   // Web Bot Auth Signature-Agent origin ("" = none)
}

// Catalogue is every agent Trail recognises, in match order (§0.11 of the plan).
var Catalogue = []Agent{
	{ID: "claude-agent", Name: "Claude agent", Provider: "Anthropic", UATokens: []string{"Claude-Agent"}, IPList: "anthropic-sail"},
	{
		ID: "google-agent", Name: "Google-Agent", Provider: "Google",
		UATokens: []string{"Google-Agent", "GoogleAgent-Mariner"},
		IPList:   "google-agents", SignatureAgent: "https://agent.bot.goog",
	},
	{ID: "chatgpt-agent", Name: "ChatGPT agent", Provider: "OpenAI", SignatureAgent: "https://chatgpt.com"},
}

// Lookup returns the agent with id.
func Lookup(id string) (Agent, bool) {
	for _, a := range Catalogue {
		if a.ID == id {
			return a, true
		}
	}
	return Agent{}, false
}

// MatchUA returns the first agent whose UA token appears in ua (case-insensitive).
func MatchUA(ua string) (Agent, bool) {
	if ua == "" {
		return Agent{}, false
	}
	ua = strings.ToLower(ua)
	for _, a := range Catalogue {
		for _, tok := range a.UATokens {
			if strings.Contains(ua, strings.ToLower(tok)) {
				return a, true
			}
		}
	}
	return Agent{}, false
}

// BySignatureAgent returns the agent whose Signature-Agent origin is exactly
// origin, ignoring one trailing "/". Only allowlisted origins match, so a
// signature naming any other origin is never fetched or trusted.
func BySignatureAgent(origin string) (Agent, bool) {
	origin = strings.TrimSuffix(origin, "/")
	if origin == "" {
		return Agent{}, false
	}
	for _, a := range Catalogue {
		if a.SignatureAgent != "" && a.SignatureAgent == origin {
			return a, true
		}
	}
	return Agent{}, false
}

// uaTokens lists every agent UA token in catalogue order (the npm UA golden).
func uaTokens() []string {
	out := []string{}
	for _, a := range Catalogue {
		out = append(out, a.UATokens...)
	}
	return out
}
