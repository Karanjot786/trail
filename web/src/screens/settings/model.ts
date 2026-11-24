// Pure helpers for Settings: share expiry wording, MCP client setups, token scope wording, the add-website form.
import type { TokenScope } from '../../api/types'
import { normalizeDomain, suggestId } from '../../lib/install'

export const SHARE_TTLS = [
  { value: '24h', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
] as const
export type ShareTtl = (typeof SHARE_TTLS)[number]['value']

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function expiresText(expires: number | null, now: number): string {
  if (expires == null) return 'never expires'
  const ms = expires - now
  if (ms <= 0) return 'expired'
  if (ms >= 86_400_000) return `expires in ${plural(Math.round(ms / 86_400_000), 'day')}`
  if (ms >= 3_600_000) return `expires in ${plural(Math.round(ms / 3_600_000), 'hour')}`
  return `expires in ${plural(Math.max(1, Math.round(ms / 60_000)), 'minute')}`
}

export type McpClient = 'desktop' | 'code' | 'cursor' | 'vscode' | 'codex'
export const MCP_CLIENTS: { key: McpClient; label: string }[] = [
  { key: 'desktop', label: 'Claude Desktop / claude.ai' },
  { key: 'code', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'vscode', label: 'VS Code' },
  { key: 'codex', label: 'Codex' },
]

export interface McpSetup {
  where: string
  filename?: string
  code: string
}

/** Paste-ready setup for one client. With a token it is filled in; without one, a placeholder stands in. */
export function mcpSetup(client: McpClient, url: string, token: string | null): McpSetup {
  const bearer = token ? `Bearer ${token}` : 'Bearer ${env:TRAIL_TOKEN}'
  const filled = token ? ' The token is filled in.' : ''
  switch (client) {
    case 'desktop':
      return {
        where: 'No terminal needed. In Claude, open Settings → Connectors → Add custom connector. Name it Trail and paste this URL. When Claude asks you to sign in, paste the token.',
        code: url,
      }
    case 'code':
      return {
        where: token ? 'Run this once in a terminal. The token is filled in.' : 'Run this once in a terminal. $TRAIL_TOKEN stands for your token: create one above and it is filled in for you.',
        code: `claude mcp add --transport http trail ${url} --header "Authorization: Bearer ${token ?? '$TRAIL_TOKEN'}"`,
      }
    case 'cursor':
      return {
        where: `Paste into .cursor/mcp.json in your project, or ~/.cursor/mcp.json for every project.${filled}`,
        filename: '.cursor/mcp.json',
        code: JSON.stringify({ mcpServers: { trail: { url, headers: { Authorization: bearer } } } }, null, 2),
      }
    case 'vscode':
      return {
        where: `Paste into .vscode/mcp.json, then start the server from the MCP view.${filled}`,
        filename: '.vscode/mcp.json',
        code: JSON.stringify({ servers: { trail: { type: 'http', url, headers: { Authorization: bearer } } } }, null, 2),
      }
    case 'codex':
      return {
        where: 'Paste into ~/.codex/config.toml. Codex reads the token from the TRAIL_TOKEN environment variable: run the export line in the terminal where you start Codex.',
        filename: '~/.codex/config.toml',
        code: `[mcp_servers.trail]\nurl = "${url}"\nbearer_token_env_var = "TRAIL_TOKEN"\n\n# in your shell:\nexport TRAIL_TOKEN=${token ?? 'trl_…'}`,
      }
  }
}

const SCOPE_DOES: Record<TokenScope, string> = {
  read: 'Reads stats',
  notes: 'Reads stats and writes notes',
  write: 'Reads and writes everything in the API',
  crawl: 'Sends crawler logs',
}
export const SCOPE_LABEL: Record<TokenScope, string> = { read: 'Read', notes: 'Read and notes', write: 'Write', crawl: 'Crawler logs' }

export function scopeText(scope: TokenScope, siteDomain: string | null): string {
  return `${SCOPE_DOES[scope]} for ${siteDomain ? `${siteDomain} only` : 'every site'}`
}

/** "Copy this view as an API call": the same numbers as Overview, as JSON. `query` is the view's query string. */
export function apiCall(origin: string, query: string): string {
  return `curl -H "Authorization: Bearer $TRAIL_TOKEN" \\\n  "${origin.replace(/\/+$/, '')}/api/v1/stats?${query}"`
}

export type SiteForm =
  | { ok: true; site: { id: string; domain: string; origins: string[] } }
  | { ok: false; field: 'id' | 'domain'; error: string }

// Mirrors the server's host check (internal/sites reHost): dotted labels, or localhost; IPv4 hosts match too.
const RE_HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

export function siteFromForm(id: string, domainInput: string): SiteForm {
  const domain = normalizeDomain(domainInput)
  if (domain.length > 253 || !RE_HOST.test(domain) || (domain !== 'localhost' && !domain.includes('.')))
    return { ok: false, field: 'domain', error: 'Enter a domain like example.com, without a path.' }
  const sid = id.trim() || suggestId(domain)
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(sid)) return { ok: false, field: 'id', error: 'Use lowercase letters, digits and dashes for the ID.' }
  return { ok: true, site: { id: sid, domain, origins: [] } }
}
