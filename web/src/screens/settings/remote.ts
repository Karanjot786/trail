// The two Settings calls that do not fit the shared client: creating a share link with its lifetime (the server
// takes `ttl`), and testing a token by calling /api/v1/whoami with it, the way an assistant would.
import { HttpError, Unauthorized } from '../../api/client'
import type { Share, WhoAmI } from '../../api/types'
import { getTransport } from '../../api/transport'
import type { ShareTtl } from './model'

export async function createShare(s: { site: string; label: string; state: string; hideRevenue: boolean; ttl: ShareTtl }): Promise<Share> {
  const res = await getTransport().send('POST', '/shares', s)
  if (res.status >= 200 && res.status < 300) return res.body as Share
  if (res.status === 401) throw new Unauthorized()
  const msg = typeof res.body === 'string' && res.body.trim() ? res.body.trim() : `Could not create the link (${res.status})`
  throw new HttpError(res.status, msg)
}

export type TokenTest = { ok: true; who: WhoAmI; ms: number } | { ok: false; status: number }

export async function testToken(token: string): Promise<TokenTest> {
  const t0 = performance.now()
  try {
    const res = await fetch('/api/v1/whoami', { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store' })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, who: (await res.json()) as WhoAmI, ms: Math.round(performance.now() - t0) }
  } catch {
    return { ok: false, status: 0 }
  }
}
