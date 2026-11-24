import { isTrailPath, shouldReport } from '../crawl/filter';
import { forward } from '../crawl/forward';
import { report } from '../crawl/send';

/** The parts of NextRequest / NextFetchEvent this module uses (no runtime import of `next`). */
type NextRequestLike = Request;
interface NextFetchEventLike { waitUntil(p: Promise<unknown>): void }

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
export default async function proxy(req: NextRequestLike, event?: NextFetchEventLike): Promise<Response> {
  if (isTrailPath(req)) return forward(req);
  reportCrawler(req, event);
  return next();
}

/**
 * Wraps your own proxy/middleware and keeps its type (NextRequest, optional event, sync or async).
 * Trail paths are served first and your handler never sees them: `/t/*` only proxies Trail.
 * Note: for a Trail path the returned value is a `Promise<Response>` whatever `R` is; Next awaits any return value.
 */
export function withTrail<Req extends Request, Ev extends NextFetchEventLike = NextFetchEventLike, R = unknown>(
  handler: (req: Req, event: Ev) => R,
): (req: Req, event?: Ev) => R {
  return (req, event) => {
    if (isTrailPath(req)) return forward(req) as unknown as R;
    reportCrawler(req, event);
    return handler(req, event as Ev);
  };
}
