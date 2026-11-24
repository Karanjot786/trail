// The crawl contract shared with Trail (AI agents plan §0.7, §0.8). Frozen after P0.

/** One NDJSON line for POST /api/v1/crawls. Only ts, ua, path and status are required; status 0 = unknown. */
export interface CrawlLine {
  ts: number;
  ua: string;
  path: string;
  status: number;
  ip?: string;
  host?: string;
  sa?: string;
  si?: string;
  sig?: string;
}

/** Defaults: env TRAIL_URL, TRAIL_SITE, TRAIL_CRAWL_TOKEN. */
export interface TrailCrawlOptions {
  url?: string;
  site?: string;
  token?: string;
  /** Header that carries the client IP on your host (env TRAIL_IP_HEADER), e.g. cloudfront-viewer-address. */
  ipHeader?: string;
}

export type WaitUntil = (p: Promise<unknown>) => void;
