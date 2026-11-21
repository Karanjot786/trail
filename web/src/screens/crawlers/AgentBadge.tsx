// How an AI agent was recognised (plan F-3): "Verified" for a signature, a relayed signature or a published
// IP list, "Claimed" for a user agent only. The tooltip says which; screen readers get the same words.
import type { AgentVia } from '../../api/types'
import { Badge } from '../../ui/small'
import { Tooltip } from '../../ui/tooltip'

/** Agent ids from the detection catalogue (plan §0.11) and their display names. */
export const AGENT_NAMES: Record<string, string> = {
  'claude-agent': 'Claude agent',
  'google-agent': 'Google-Agent',
  'chatgpt-agent': 'ChatGPT agent',
}
export const agentName = (id: string) => AGENT_NAMES[id] ?? id
/** Operators, for the "IP in {provider}'s published list" tooltip where the payload has no provider. */
const AGENT_PROVIDERS: Record<string, string> = { 'claude-agent': 'Anthropic', 'google-agent': 'Google', 'chatgpt-agent': 'OpenAI' }
export const agentProvider = (id: string): string | undefined => AGENT_PROVIDERS[id]

export const verified = (via: AgentVia) => via === 'sig' || via === 'relay' || via === 'ip'

export function viaTip(via: AgentVia, provider?: string): string {
  if (via === 'sig') return 'Signed request (Web Bot Auth)'
  if (via === 'relay') return 'Signed request seen by your server hook'
  if (via === 'ip') return `IP in ${provider || 'the operator'}’s published list`
  return 'User agent only; not verified'
}

export function AgentBadge({ via, provider }: { via: AgentVia; provider?: string }) {
  const tip = viaTip(via, provider)
  const ok = verified(via)
  return (
    <Tooltip content={tip}>
      <span className="agent-badge" data-via={via} data-tip={tip}>
        <Badge tone={ok ? 'good' : undefined}>{ok ? 'Verified' : 'Claimed'}</Badge>
        <span className="sr-only">: {tip}</span>
      </span>
    </Tooltip>
  )
}
