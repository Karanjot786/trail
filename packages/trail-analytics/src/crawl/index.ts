// trail-analytics/crawl (AI agents plan §0.8): report AI crawlers and serve /t/* first-party, on any runtime.
export type { CrawlLine, TrailCrawlOptions, WaitUntil } from './types';
export { AGENT_TOKENS, CRAWLER_TOKENS } from './ua.gen';
export { shouldReport, toLine } from './filter';
export { report } from './send';
export { edgeGeo, forward, proxySignature } from './forward';
export type { EdgeGeo } from './forward';
export { express, hono, withTrail } from './adapters';
