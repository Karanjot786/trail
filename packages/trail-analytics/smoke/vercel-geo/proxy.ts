// N-0 spike: which geo/IP headers reach a Next 16 proxy on Vercel, and do X-Trail-* and
// Signature* survive the forward? /t/echo answers with what the proxy saw; everything
// else goes through the real trail-analytics proxy (TRAIL_URL points at the echo receiver).
import trail from 'trail-analytics/next/proxy';
import { edgeGeo } from 'trail-analytics/crawl';

const SEEN = ['x-vercel-ip-country', 'x-vercel-ip-country-region', 'x-vercel-ip-city', 'x-vercel-ip-latitude', 'x-vercel-ip-postal-code', 'x-real-ip', 'x-forwarded-for', 'cf-connecting-ip', 'x-vercel-id', 'host'];

export default async function proxy(req: Request, event: { waitUntil(p: Promise<unknown>): void }) {
  if (new URL(req.url).pathname === '/t/echo') {
    const h: Record<string, string | null> = {};
    for (const k of SEEN) h[k] = req.headers.get(k);
    return Response.json({ headers: h, edgeGeo: edgeGeo(req) ?? null, runtime: process.env.NEXT_RUNTIME ?? null });
  }
  return trail(req, event);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
