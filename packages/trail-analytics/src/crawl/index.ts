// trail-analytics/crawl (AI agents plan §0.8). P0 placeholder: N-npm implements every function.
import type { CrawlLine, TrailCrawlOptions, WaitUntil } from './types';

export type { CrawlLine, TrailCrawlOptions, WaitUntil } from './types';
export { AGENT_TOKENS, CRAWLER_TOKENS } from './ua.gen';

/** Edge location read on the host platform, forwarded to Trail by the signed /t/* proxy (§0.12). */
export interface EdgeGeo {
  country?: string;
  region?: string;
  city?: string;
  source: 'vercel' | 'cloudflare' | 'netlify';
}

const todo = (): never => {
  throw new Error('not implemented');
};

/** True when the request comes from an AI crawler or agent and the path is worth reporting. */
export function shouldReport(_req: Request): boolean {
  return todo();
}

/** The crawl line for a request. */
export function toLine(_req: Request, _status?: number): CrawlLine {
  return todo();
}

/** Sends one crawl line to Trail. Never throws; callers never await it. */
export function report(_req: Request, _opts?: TrailCrawlOptions & { status?: number; waitUntil?: WaitUntil }): void {
  todo();
}

/** Hono middleware. */
export function hono(_opts?: TrailCrawlOptions): (c: any, next: () => Promise<void>) => Promise<unknown> {
  return todo();
}

/** Express middleware. */
export function express(_opts?: TrailCrawlOptions): (req: any, res: any, next: () => void) => void {
  return todo();
}

/** Wraps a Workers-style fetch handler. */
export function withTrail<F extends (req: Request, ...a: any[]) => Response | Promise<Response>>(_handler: F, _opts?: TrailCrawlOptions): F {
  return todo();
}

/** The /t/* handler: /t/t.js passthrough and signed /t/e beacon forward. */
export function forward(_req: Request, _opts?: TrailCrawlOptions & { geo?: EdgeGeo }): Promise<Response> {
  return todo();
}

/** Reads edge geo: req.cf, then Vercel headers, then Netlify. */
export function edgeGeo(_req: Request): EdgeGeo | undefined {
  return todo();
}
