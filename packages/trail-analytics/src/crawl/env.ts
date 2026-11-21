import type { TrailCrawlOptions } from './types';

type Env = Record<string, unknown> | undefined;

/** Reads `k` from a runtime binding (Workers, Astro locals) first, then process.env when it exists. */
export function env(k: string, src?: Env): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const v = src?.[k] ?? g.process?.env?.[k];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export interface Resolved { url?: string; site?: string; token?: string }

export function resolve(o: TrailCrawlOptions = {}, src?: Env): Resolved {
  const url = o.url ?? env('TRAIL_URL', src);
  return { url: url?.replace(/\/+$/, ''), site: o.site ?? env('TRAIL_SITE', src), token: o.token ?? env('TRAIL_CRAWL_TOKEN', src) };
}
