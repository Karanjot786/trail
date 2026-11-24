import { isTrailPath, shouldReport } from './filter';
import { forward } from './forward';
import { report } from './send';
import type { TrailCrawlOptions } from './types';

type Env = Record<string, unknown>;
interface Ctx { waitUntil(p: Promise<unknown>): void }

/**
 * Cloudflare Workers style: `export default { fetch: withTrail(handler) }`.
 * Serves `/t/t.js` and `/t/e`, and reports AI crawlers with the real status.
 */
export function withTrail<F extends (req: Request, ...a: any[]) => Response | Promise<Response>>(handler: F, opts: TrailCrawlOptions = {}): F {
  return (async (req: Request, ...rest: any[]) => {
    const e = rest[0] && typeof rest[0] === 'object' ? (rest[0] as Env) : undefined;
    const ctx = rest[1] as Ctx | undefined;
    if (isTrailPath(req)) return forward(req, { ...opts, env: e });
    const res = await handler(req, ...rest);
    if (shouldReport(req)) report(req, { ...opts, env: e, status: res.status, waitUntil: ctx?.waitUntil ? (p) => ctx.waitUntil(p) : undefined });
    return res;
  }) as F;
}

/** Hono middleware: `app.use(hono())`. */
export function hono(opts: TrailCrawlOptions = {}) {
  return async (c: any, next: () => Promise<void>): Promise<Response | void> => {
    const req: Request = c.req.raw;
    const e: Env | undefined = c.env && typeof c.env === 'object' ? c.env : undefined;
    if (isTrailPath(req)) return forward(req, { ...opts, env: e });
    await next();
    if (!shouldReport(req)) return;
    let waitUntil: ((p: Promise<unknown>) => void) | undefined;
    try {
      const ec = c.executionCtx;
      if (ec?.waitUntil) waitUntil = (p) => ec.waitUntil(p);
    } catch {
      /* Node has no execution context */
    }
    report(req, { ...opts, env: e, status: c.res?.status ?? 0, waitUntil });
  };
}

function toRequest(req: any, body?: Uint8Array): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  const host = headers.get('host') ?? 'localhost';
  const proto = req.protocol ?? (req.socket?.encrypted ? 'https' : 'http');
  return new Request(`${proto}://${host}${req.originalUrl ?? req.url ?? '/'}`, { method: req.method, headers, body: body as BodyInit | undefined });
}

const readBody = (req: any): Promise<Uint8Array> =>
  new Promise((ok, fail) => {
    if (typeof req.body === 'string') return ok(new TextEncoder().encode(req.body));
    if (req.body instanceof Uint8Array) return ok(req.body);
    const chunks: Uint8Array[] = [];
    req.on('data', (c: Uint8Array) => chunks.push(c));
    req.on('end', () => {
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) (out.set(c, o), (o += c.length));
      ok(out);
    });
    req.on('error', fail);
  });

/** Express/Connect middleware: `app.use(express())`. Put it before any body parser. */
export function express(opts: TrailCrawlOptions = {}) {
  return (req: any, res: any, next: (err?: unknown) => void): void => {
    let r: Request;
    try {
      r = toRequest(req);
    } catch {
      return next();
    }
    if (isTrailPath(r)) {
      (async () => {
        const body = req.method === 'POST' ? await readBody(req) : undefined;
        const out = await forward(toRequest(req, body), { ...opts, ip: req.ip ?? req.socket?.remoteAddress });
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(new Uint8Array(await out.arrayBuffer()));
      })().catch(next);
      return;
    }
    if (shouldReport(r)) res.on('finish', () => report(r, { ...opts, status: res.statusCode }));
    next();
  };
}
