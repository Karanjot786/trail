// trail-analytics/astro/middleware (AI agents plan §0.8), ESM only. P0 placeholder: N-npm implements it.

/** Astro middleware: /t/* → forward; otherwise report AI crawlers with the real status. */
export const onRequest = (_ctx: unknown, _next: () => Promise<Response>): Promise<Response> => {
  throw new Error('not implemented');
};
