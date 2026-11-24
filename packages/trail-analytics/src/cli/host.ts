import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Workspace } from './workspace';

export type Host = 'cloudflare' | 'vercel' | 'netlify' | 'aws' | 'unknown';

/** The hosting platform, from config files and dependencies. First match wins. */
export function detectHost(cwd: string, ws: Workspace, deps: Record<string, string>): Host {
  const dirs = cwd === ws.root ? [cwd] : [cwd, ws.root];
  const has = (...names: string[]) => dirs.some((d) => names.some((n) => existsSync(join(d, n))));
  if (has('wrangler.toml', 'wrangler.json', 'wrangler.jsonc') || deps['@opennextjs/cloudflare']) return 'cloudflare';
  if (has('.vercel/project.json', 'vercel.json')) return 'vercel';
  if (has('netlify.toml') || deps['@netlify/plugin-nextjs']) return 'netlify';
  if (has('sst.config.ts', 'serverless.yml', 'amplify.yml', 'open-next.config.ts') || deps.sst || deps['@opennextjs/aws']) return 'aws';
  return 'unknown';
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Exact commands that set the three variables on the host. The token is read from the env file, never printed. */
export function envSteps(host: Host, o: { url: string; site: string; envFile: string }): string {
  const tok = `"$(grep '^TRAIL_CRAWL_TOKEN=' ${o.envFile} | cut -d= -f2-)"`;
  switch (host) {
    case 'vercel':
      return [
        `printf %s ${q(o.url)} | npx vercel env add TRAIL_URL --environment production,preview --no-sensitive`,
        `printf %s ${q(o.site)} | npx vercel env add TRAIL_SITE --environment production,preview --no-sensitive`,
        `printf %s ${tok} | npx vercel env add TRAIL_CRAWL_TOKEN --environment production,preview --sensitive`,
        '(needs Vercel CLI 64.6.0 or later)',
        'Redeploy: env changes apply to new deployments only.',
      ].join('\n');
    case 'cloudflare':
      return [
        `printf %s ${q(o.url)} | npx wrangler secret put TRAIL_URL`,
        `printf %s ${q(o.site)} | npx wrangler secret put TRAIL_SITE`,
        `printf %s ${tok} | npx wrangler secret put TRAIL_CRAWL_TOKEN`,
        'For local preview put the same lines in .dev.vars (gitignored).',
      ].join('\n');
    case 'netlify':
      return [`npx netlify env:set TRAIL_URL ${q(o.url)}`, `npx netlify env:set TRAIL_SITE ${q(o.site)}`, `npx netlify env:set TRAIL_CRAWL_TOKEN ${tok}`].join('\n');
    default: {
      const base = `Set these in the runtime environment of the server that runs your proxy (Lambda env, SSM parameters your deploy reads, Docker env), then redeploy: TRAIL_URL=${o.url} TRAIL_SITE=${o.site} TRAIL_CRAWL_TOKEN=<value in ${o.envFile}>.`;
      return host === 'aws' ? `${base}\nIf verify shows a CloudFront address as your IP, set TRAIL_IP_HEADER=cloudfront-viewer-address and add that header to your CloudFront origin request policy.` : base;
    }
  }
}

/** Two requests: the tracker file is served, and the crawl token is accepted for the site (writes nothing). */
export async function checkTrail(url: string, site: string, token: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; lines: string[] }> {
  const base = url.replace(/\/+$/, '');
  const fail = (m: string) => ({ ok: false, lines: [m] });
  try {
    const js = await fetchImpl(`${base}/_t/t.js`);
    if (js.status !== 200) return fail(`${base}/_t/t.js answered ${js.status}; is --url the Trail server?`);
    const r = await fetchImpl(`${base}/api/v1/crawls?site=${encodeURIComponent(site)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-ndjson' },
      body: '',
    });
    if (r.status === 202 || r.status === 200) return { ok: true, lines: [`Trail at ${base} accepts the crawl token for site ${site}.`] };
    if (r.status === 401) return fail('token rejected by Trail (401): check the crawl token.');
    if (r.status === 403) return fail(`Trail refused the token (403): ${(await r.text()).trim() || 'forbidden'}`);
    if (r.status === 400) return fail(`unknown site "${site}" on ${base} (400): use the site id from Trail.`);
    return fail(`Trail answered ${r.status} to the token check.`);
  } catch {
    return fail(`cannot reach ${base}`);
  }
}
