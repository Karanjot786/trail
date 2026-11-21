package api

import "trail/internal/agents"

// AgentHooks is what the API needs from the agent directory: list status for the setup card,
// crawler IP verification and the signed-agent relay for crawl lines.
type AgentHooks interface {
	Status() []agents.ListStatus
	VerifyCrawler(bot, ip string) bool
	RelaySigned(site, ip, ua string, s agents.Signed, hostOK func(string) bool) agents.Result
}

// noAgents is the default: no lists, nothing verified, nothing relayed.
type noAgents struct{}

func (noAgents) Status() []agents.ListStatus { return []agents.ListStatus{} }

func (noAgents) VerifyCrawler(string, string) bool { return false }

func (noAgents) RelaySigned(string, string, string, agents.Signed, func(string) bool) agents.Result {
	return agents.Result{}
}

// WithAgents sets the agent directory (cmd/trail wires it; the demo and tests keep the no-op).
func WithAgents(h AgentHooks) Option { return func(s *server) { s.agents = h } }
