import { readFileSync } from 'node:fs';
import { env } from '../crawl/env';

/** `astro dev` does not put .env values in process.env, where the middleware reads them. Load the TRAIL_ ones. */
export function loadDevEnv(root: string | URL | undefined): void {
  const pe = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  if (!pe) return;
  for (const f of ['.env.development.local', '.env.local', '.env.development', '.env']) {
    let text = '';
    try {
      text = readFileSync(new URL(f, root ?? `file://${process.cwd()}/`), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?(TRAIL_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !pe[m[1]]) pe[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

/** The parts of Astro's integration API this module uses (no runtime import of `astro`). */
export interface AstroIntegration {
  name: string;
  hooks: {
    'astro:config:setup'?: (o: {
      config: { output?: string; root?: URL; site?: string; adapter?: { name?: string }; security?: { checkOrigin?: boolean; allowedDomains?: unknown[] } };
      updateConfig?: (c: Record<string, unknown>) => unknown;
      command?: 'dev' | 'build' | 'preview' | 'sync';
      addMiddleware: (m: { entrypoint: string; order: 'pre' | 'post' }) => void;
      injectScript: (stage: 'head-inline', code: string) => void;
      logger: { warn(msg: string): void; info?(msg: string): void };
    }) => void;
  };
}

export const ORIGIN_WARNING =
  "Astro's node adapter reads every request as http://localhost unless `site` or `security.allowedDomains` is set, so its origin check rejects the /t/e beacons with 403. Set `site` in astro.config.";

/**
 * Astro's origin check compares a POST's Origin with the request URL, and the node adapter trusts
 * the Host header only for `security.allowedDomains`. Trust the site's own declared `site` host so
 * same-origin beacons to /t/e pass; without one, say what to set.
 */
function trustSite(config: { site?: string; adapter?: { name?: string }; security?: { checkOrigin?: boolean; allowedDomains?: unknown[] } }, updateConfig: ((c: Record<string, unknown>) => unknown) | undefined, logger: { warn(m: string): void }) {
  if (config.security?.checkOrigin === false || (config.security?.allowedDomains?.length ?? 0) > 0) return;
  if (config.site && updateConfig) {
    try {
      const u = new URL(config.site);
      updateConfig({ security: { allowedDomains: [{ protocol: u.protocol.slice(0, -1), hostname: u.hostname, ...(u.port ? { port: u.port } : {}) }] } });
      return;
    } catch {
      /* fall through to the warning */
    }
  }
  if (config.adapter?.name === '@astrojs/node') logger.warn(ORIGIN_WARNING);
}

export const STATIC_WARNING =
  "Static Astro sites never run middleware at request time: AI crawlers are not captured. Use server output or Trail's log import.";

/**
 * Trail for Astro: `integrations: [trail({ site: "ID" })]`.
 * Server output: adds request-time crawler reporting and serves the tracker first-party at /t/t.js.
 * Static output: loads the tracker straight from TRAIL_URL.
 */
export default function trail(opts: { site?: string; url?: string } = {}): AstroIntegration {
  return {
    name: 'trail-analytics',
    hooks: {
      'astro:config:setup': ({ config, command, addMiddleware, injectScript, logger, updateConfig }) => {
        if (command === 'dev') loadDevEnv(config.root);
        const site = opts.site ?? env('TRAIL_SITE') ?? '';
        const url = (opts.url ?? env('TRAIL_URL') ?? '').replace(/\/+$/, '');
        const isStatic = (config.output ?? 'static') === 'static';
        let src = '/t/t.js';
        let api = '/t/e';
        if (isStatic) {
          logger.warn(STATIC_WARNING);
          if (!url) logger.warn('Set TRAIL_URL (or trail({ url })) for the Trail script on a static site; crawler capture also needs server output.');
          src = `${url}/_t/t.js`;
          api = `${url}/_t/e`;
        } else {
          addMiddleware({ entrypoint: 'trail-analytics/astro/middleware', order: 'pre' });
          trustSite(config, updateConfig, logger);
        }
        injectScript(
          'head-inline',
          `(function(){if(document.querySelector('script[data-trail]'))return;var s=document.createElement('script');s.defer=true;s.src=${JSON.stringify(src)};s.setAttribute('data-trail','');s.dataset.site=${JSON.stringify(site)};s.dataset.api=${JSON.stringify(api)};document.head.appendChild(s)})();`,
        );
      },
    },
  };
}
