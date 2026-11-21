import { env } from '../crawl/env';
import { isTrailPath, shouldReport } from '../crawl/filter';
import { forward } from '../crawl/forward';
import { report } from '../crawl/send';

/** The parts of NextRequest / NextFetchEvent this module uses (no runtime import of `next`). */
type NextRequestLike = Request;
interface NextFetchEventLike { waitUntil(p: Promise<unknown>): void }
type Handler = (req: NextRequestLike, event: NextFetchEventLike) => Response | undefined | null | void | Promise<Response | undefined | null | void>;

/** Exactly what `NextResponse.next()` returns: Next continues to the route when it sees this header. */
const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

const reportCrawler = (req: Request, event?: NextFetchEventLike) => {
  if (!isTrailPath(req) && shouldReport(req)) report(req, { status: 0, waitUntil: event?.waitUntil ? (p) => event.waitUntil(p) : undefined });
};

/**
 * Next.js `proxy.ts` (16+) or `middleware.ts` (15):
 * `export { default } from 'trail-analytics/next/proxy'`.
 * Serves `/t/t.js` and `/t/e` first-party (beacons signed with the edge's geo)
 * and reports AI crawler requests. Status is 0: the proxy runs before the route.
 */
export default async function proxy(req: NextRequestLike, event: NextFetchEventLike): Promise<Response> {
  if (isTrailPath(req) && env('TRAIL_URL')) return forward(req);
  reportCrawler(req, event);
  return next();
}

/** Wraps your own proxy/middleware. Trail paths are served only when your handler continues. */
export function withTrail<H extends Handler>(handler: H): (req: NextRequestLike, event: NextFetchEventLike) => Promise<Response | undefined | null | void> {
  return async (req, event) => {
    reportCrawler(req, event);
    const res = await handler(req, event);
    if (isTrailPath(req) && env('TRAIL_URL') && (!res || res.headers.get('x-middleware-next') === '1')) return forward(req);
    return res;
  };
}
