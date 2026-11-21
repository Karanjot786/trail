// trail-analytics/next/proxy (AI agents plan §0.8). P0 placeholder: N-npm implements it with next/server.
// It must stay free of Node APIs (Edge and Node runtimes).

type NextRequest = Request;
type NextFetchEvent = { waitUntil(p: Promise<unknown>): void };
type Handler = (req: NextRequest, event: NextFetchEvent) => Response | Promise<Response> | undefined | Promise<Response | undefined>;

/** /t/* → forward; otherwise report AI crawlers and continue. */
export default function proxy(_req: NextRequest, _event: NextFetchEvent): Promise<Response> {
  throw new Error('not implemented');
}

/** Wraps an existing proxy or middleware handler. */
export function withTrail<H extends Handler>(_handler: H): H {
  throw new Error('not implemented');
}
