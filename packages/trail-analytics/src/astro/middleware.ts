import { isTrailPath, shouldReport } from '../crawl/filter';
import { forward } from '../crawl/forward';
import { report } from '../crawl/send';

interface Ctx {
  request: Request;
  locals?: { runtime?: { env?: Record<string, unknown>; cf?: Record<string, unknown>; ctx?: { waitUntil?(p: Promise<unknown>): void } } };
}

/** Added by the `trail()` integration in server output. */
export const onRequest = async (ctx: Ctx, next: () => Promise<Response>): Promise<Response> => {
  const rt = ctx.locals?.runtime;
  const e = rt?.env;
  const req = ctx.request;
  if (isTrailPath(req)) {
    const cf = rt?.cf;
    const r = cf && !(req as { cf?: unknown }).cf ? Object.assign(req, { cf }) : req;
    return forward(r, { env: e });
  }
  const res = await next();
  try {
    if (shouldReport(req)) {
      const wu = rt?.ctx?.waitUntil;
      report(req, { env: e, status: res.status, waitUntil: wu ? (p) => wu.call(rt!.ctx, p) : undefined });
    }
  } catch {
    /* never break the page */
  }
  return res;
};
