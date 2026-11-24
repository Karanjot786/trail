import { AGENT_TOKENS, CRAWLER_TOKENS } from './ua.gen';
import { clientAddr } from './ip';
import type { CrawlLine } from './types';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UA = new RegExp([...CRAWLER_TOKENS, ...AGENT_TOKENS].map(esc).join('|'), 'i');
const KEEP = /^\/(robots\.txt|llms(-full)?\.txt|sitemap[^/]*\.xml)$/i;
const ASSET_DIR = /^\/(_next\/static\/|_next\/image|_astro\/|_t\/)/;
const ASSET_EXT = /\.(m?js|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|zip)$/i;
const CAP = 4096;

const path = (req: Request) => new URL(req.url).pathname;
const cap = (v: string | null) => (v == null || v === '' ? undefined : v.slice(0, CAP));

/** True for a known AI crawler or agent UA, or any request carrying `signature-agent`, minus static assets. */
export function shouldReport(req: Request): boolean {
  if (!UA.test(req.headers.get('user-agent') ?? '') && !req.headers.has('signature-agent')) return false;
  const p = path(req);
  if (KEEP.test(p)) return true;
  if ((req.method === 'GET' || req.method === 'HEAD') && (ASSET_DIR.test(p) || ASSET_EXT.test(p))) return false;
  return true;
}

/** The trusted client IP (see clientAddr). */
export function clientIp(req: Request): string {
  return clientAddr(req).ip;
}

/** One NDJSON crawl line (§0.7). `status` 0 = unknown. Query strings are never sent. */
export function toLine(req: Request, status = 0): CrawlLine {
  const h = req.headers;
  const line: CrawlLine = { ts: Date.now(), ua: (h.get('user-agent') ?? '').slice(0, CAP), path: path(req), status };
  const ip = clientIp(req);
  const extra = { ip: ip || undefined, host: cap(h.get('host') ?? new URL(req.url).host), sa: cap(h.get('signature-agent')), si: cap(h.get('signature-input')), sig: cap(h.get('signature')) };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) (line as unknown as Record<string, string>)[k] = v;
  return line;
}

const TRAIL_PATH = /^\/t\/(t(?:\.x|\.p)?\.js|e)\/?$/;

/** The Trail file a request asks for, or null. Path is req.nextUrl?.pathname (basePath and locale stripped) when present, else the URL pathname. A trailing slash is ignored. */
export function trailPath(req: Request): 't.js' | 't.x.js' | 't.p.js' | 'e' | null {
  const nu = (req as { nextUrl?: { pathname?: unknown } }).nextUrl;
  const p = typeof nu?.pathname === 'string' ? nu.pathname : path(req);
  const m = TRAIL_PATH.exec(p);
  return m ? (m[1] as 't.js' | 't.x.js' | 't.p.js' | 'e') : null;
}

/** `/t/t.js`, `/t/t.x.js`, `/t/t.p.js` and `/t/e`: the first-party Trail paths every runtime forwards. */
export const isTrailPath = (req: Request): boolean => trailPath(req) !== null;
