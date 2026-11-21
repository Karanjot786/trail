import { resolve } from './env';
import { toLine } from './filter';
import type { TrailCrawlOptions, WaitUntil } from './types';

let warned = false;

export type ReportOptions = TrailCrawlOptions & { status?: number; waitUntil?: WaitUntil; env?: Record<string, unknown> };

/** Sends one crawl line to Trail. Never throws, never needs awaiting. */
export function report(req: Request, opts: ReportOptions = {}): void {
  try {
    const { url, site, token } = resolve(opts, opts.env);
    if (!url || !token) {
      if (!warned) {
        warned = true;
        console.warn('trail-analytics: TRAIL_URL or TRAIL_CRAWL_TOKEN is not set; AI crawler requests are not reported.');
      }
      return;
    }
    const init: RequestInit = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-ndjson' },
      body: JSON.stringify(toLine(req, opts.status ?? 0)) + '\n',
    };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(3000);
    if (!opts.waitUntil) init.keepalive = true;
    const p = fetch(`${url}/api/v1/crawls${site ? `?site=${encodeURIComponent(site)}` : ''}`, init).then(
      () => undefined,
      () => undefined,
    );
    opts.waitUntil?.(p);
  } catch {
    /* reporting must never break the site */
  }
}
