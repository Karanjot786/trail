/**
 * The generated proxy.ts (Next 16) / middleware.ts (Next 15).
 *
 * N-5 smoke result: a one-line `export { default } from 'trail-analytics/next/proxy'` FAILS
 * `next build` on Next 16.4 ("proxy.ts must export a function": Next's static analysis does not
 * follow re-exports). So init writes a 3-line wrapper, which builds on Next 15.5 and 16.4.
 */
export const MATCHER = "export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };";

export function nextHook(name: 'proxy' | 'middleware', ext: 'ts' | 'js'): string {
  const ts = ext === 'ts';
  const lines = [
    ...(ts ? ["import type { NextFetchEvent, NextRequest } from 'next/server';"] : []),
    "import trail from 'trail-analytics/next/proxy';",
    '',
    `// Reports AI crawlers to Trail and serves /t/t.js and /t/e first-party (signed, with your host's edge geo).`,
    `export ${name === 'proxy' ? 'default ' : ''}function ${name}(${ts ? 'req: NextRequest, event: NextFetchEvent' : 'req, event'}) {`,
    '  return trail(req, event);',
    '}',
    '',
    MATCHER,
    '',
  ];
  return lines.join('\n');
}

export const analyticsTag = (site: string, src = '/t/t.js', api = '/t/e') => `<Analytics site="${site}" src="${src}" api="${api}" />`;

export const withTrailSnippet = (file: string, exportName = 'proxy') => `Init could not edit ${file} safely, so it left the file alone. Wrap your handler yourself:

  import { withTrail } from 'trail-analytics/next/proxy';

  // keep exactly one ${exportName === 'default' ? 'default' : `named "${exportName}"`} export:
  ${exportName === 'default' ? 'export default withTrail(yourHandler);' : `export const ${exportName} = withTrail(yourHandler);`}

Keep (or add) a matcher that includes /t/t.js, /t/t.x.js, /t/t.p.js and /t/e.`;

export const matcherDynamicSnippet = (file: string) => `The matcher in ${file} is not a plain list, so init could not edit it. Add '/t/t.js', '/t/t.x.js', '/t/t.p.js' and '/t/e' to it yourself.`;

export const narrowMatcher = (file: string, list: string) =>
  `Your ${file} matcher only runs on ${list}. Trail added its script paths, but AI crawlers are only captured on matching pages. To capture them everywhere, add '/((?!_next/static|_next/image|.*\\.(?:css|png|jpg|svg|ico|woff2?)$).*)' to the matcher and keep your own logic behind a path check, e.g. if (!request.nextUrl.pathname.startsWith('/docs')) return NextResponse.next();`;

export const pagesSnippet = (site: string, at: string, src?: string, api?: string) => `The Pages Router has no root layout. Add the script to ${at}pages/_app:

  import { Analytics } from 'trail-analytics/react';
  // inside the returned JSX, next to <Component {...pageProps} />:
  ${analyticsTag(site, src, api)}`;

export const layoutSnippet = (site: string, file: string, src?: string, api?: string) => `Add the script inside the <body> of ${file} yourself:

  import { Analytics } from 'trail-analytics/next';
  // just before </body>:
  ${analyticsTag(site, src, api)}`;

export const astroSnippet = (site: string) => `Add the integration to your Astro config:

  import trail from 'trail-analytics/astro';
  export default defineConfig({ integrations: [trail({ site: "${site}" })] });`;

export const ORIGIN_WARNING =
  "Astro's node adapter reads every request as http://localhost unless `site` or `security.allowedDomains` is set in astro.config, so its origin check would reject the /t/e beacons with 403. Set `site: 'https://your-domain'`.";

export const STATIC_WARNING =
  "Static Astro sites never run middleware at request time: AI crawlers are not captured. Use server output or Trail's log import.";

export const GENERIC = `This framework is not supported by init yet. Report AI crawlers and serve /t/* from your server with trail-analytics/crawl:

  // Hono
  import { hono } from 'trail-analytics/crawl';
  app.use(hono());

  // Express (before any body parser)
  import { express } from 'trail-analytics/crawl';
  app.use(express());

  // Cloudflare Workers
  import { withTrail } from 'trail-analytics/crawl';
  export default { fetch: withTrail(handler) };

Then set TRAIL_URL, TRAIL_SITE and TRAIL_CRAWL_TOKEN in the server environment, and load the script with
<script defer src="/t/t.js" data-site="SITE_ID" data-api="/t/e"></script>`;

export const STATIC_EXPORT_WARNING =
  'Static export: no proxy runs, so AI crawlers are not captured and the script loads from your Trail server directly.';

export const UNKNOWN_NEXT_WARNING =
  'Could not tell the Next.js version; wrote middleware.ts (works on 15 and 16). On 16 you may rename it to proxy.ts.';
