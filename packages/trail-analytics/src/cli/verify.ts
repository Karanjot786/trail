export interface Check { name: string; ok: boolean | 'warn'; detail: string }

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = { 'user-agent': CHROME, accept: 'text/html' };
const AI_BOTS = ['gptbot', 'claudebot', 'perplexitybot', 'google-extended'];

const FLIGHT = /"site":"([^"]+)","src":"([^"]+t(?:\.p)?\.js)"(?:,"api":"([^"]+)")?/;
const FLIGHT_ESC = /\\"site\\":\\"([^"\\]+)\\",\\"src\\":\\"([^"\\]+t(?:\.p)?\.js)\\"(?:,\\"api\\":\\"([^"\\]+)\\")?/;

const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined);

function findScript(html: string): { site?: string; src: string; api?: string; how: string } | undefined {
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(m[0], 'src');
    if (src && /t(?:\.p)?\.js(?:[?#]|$)/.test(src) && attr(m[0], 'data-site')) return { site: attr(m[0], 'data-site'), src, api: attr(m[0], 'data-api'), how: 'server-rendered tag' };
  }
  const f = FLIGHT.exec(html) ?? FLIGHT_ESC.exec(html);
  if (f) return { site: f[1], src: f[2], api: f[3], how: 'added in the browser by <Analytics> (not in view-source; that is expected)' };
  return undefined;
}

/** `/t/t.js` gives `/t/e`; `https://x/_t/t.p.js` gives `https://x/_t/e`. */
const apiFromSrc = (src: string) => src.replace(/[^/]*$/, 'e');

function robotsBlocking(txt: string): string[] {
  const hit = new Set<string>();
  let agents: string[] = [];
  let inRules = false;
  let group: { agents: string[]; disallowAll: boolean; noTrain: boolean }[] = [];
  let cur: (typeof group)[number] | undefined;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === 'user-agent') {
      if (inRules) agents = [];
      inRules = false;
      agents.push(v);
      cur = undefined;
      continue;
    }
    inRules = true;
    if (!cur) group.push((cur = { agents: [...agents], disallowAll: false, noTrain: false }));
    if (k === 'disallow' && v === '/') cur.disallowAll = true;
    if (k === 'content-signal' && /ai[-_]train\s*=\s*no/i.test(v)) cur.noTrain = true;
  }
  for (const g of group) {
    if (!g.disallowAll) continue;
    for (const a of g.agents) {
      if (AI_BOTS.includes(a.toLowerCase())) hit.add(a);
      else if (a === '*' && g.noTrain) hit.add('* (ai_train=no)');
    }
  }
  return [...hit];
}

/** Drives the real endpoints the way a browser does. Read-only apart from one `w:1` verify event. */
export async function verify(o: { url: string; site?: string; api?: string }, f: typeof fetch): Promise<Check[]> {
  const checks: Check[] = [];
  const push = (name: string, ok: boolean | 'warn', detail: string) => checks.push({ name, ok, detail });
  let page: Response;
  try {
    page = await f(o.url, { headers: HEADERS, redirect: 'follow' });
  } catch (e) {
    push('page', false, `cannot reach ${o.url}`);
    return checks;
  }
  const pageUrl = page.url || o.url;
  const server = (page.headers.get('server') ?? '').toLowerCase();
  if (page.headers.get('cf-mitigated') || ((page.status === 403 || page.status === 503) && server === 'cloudflare')) {
    push('page', false, 'Cloudflare bot protection blocked the check; allow it or run verify from a browser network');
    return checks;
  }
  if (!page.ok) {
    push('page', false, `${pageUrl} answered ${page.status}`);
    return checks;
  }
  push('page', true, `${page.status} ${pageUrl}`);
  const html = await page.text();

  const found = findScript(html);
  const site = o.site ?? found?.site;
  if (!found && !o.site) {
    push('script', false, 'no Trail script found in the page or its component payload; is <Analytics> in the root layout?');
    await robots(f, pageUrl, push);
    return checks;
  }
  const srcRaw = found?.src ?? '/t/t.js';
  const src = new URL(srcRaw, pageUrl).href;
  const api = new URL(o.api ?? found?.api ?? apiFromSrc(srcRaw), pageUrl).href;
  push('script', true, `${found ? found.how : 'from --site'}: site ${site}, src ${src}, api ${api}`);

  try {
    const r = await f(src, { headers: HEADERS });
    if (r.headers.get('x-trail-error') === 'no-url') push('tracker', false, 'TRAIL_URL is not set on the server (see init\'s environment steps)');
    else if (r.status !== 200) push('tracker', false, `${src} answered ${r.status}`);
    else if (!/javascript/i.test(r.headers.get('content-type') ?? '')) push('tracker', false, `${src} is not JavaScript (${r.headers.get('content-type') ?? 'no content type'})`);
    else push('tracker', true, `${src} served`);
  } catch {
    push('tracker', false, `cannot fetch ${src}`);
  }

  const origin = new URL(pageUrl).origin;
  const id = Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const body = JSON.stringify([{ s: site, t: 'event', n: 'trail_verify', a: `verify${id}`, u: pageUrl, env: 'verify', w: 1, m: 'f' }]);
  try {
    const r = await f(api, { method: 'POST', headers: { ...HEADERS, origin, referer: pageUrl, 'content-type': 'text/plain;charset=UTF-8' }, body });
    const h = (n: string) => r.headers.get(n);
    if (r.status === 204 || r.status === 202) {
      const via = h('x-trail-ip-via');
      const geo = h('x-trail-geo-src');
      const info = via || geo ? `ip via ${via ?? 'unknown'}, geo source ${geo ?? 'unknown'}` : 'no ip or geo headers (an older proxy, or a direct post)';
      if (h('x-trail-proxy-status') === 'invalid') push('event', false, 'the crawl token was rejected (revoked or for another site); visitors are recorded with your server\'s IP');
      else push('event', via === 'xff' || via === 'none' ? 'warn' : true, `accepted ${h('x-trail-accepted') ?? ''}`.trim() + `; ${info}`);
    } else if (r.status === 403) push('event', false, `origin ${new URL(pageUrl).host} is not allowed for site ${site} (Trail → Settings → Websites)`);
    else if (r.status === 400) push('event', false, `Trail rejected the event: ${(await r.text()).trim() || '400'}`);
    else if (r.status === 503 && h('x-trail-error') === 'unsigned') push('event', false, 'TRAIL_SITE or TRAIL_CRAWL_TOKEN missing on the server');
    else if (r.status === 502 || r.status === 504) push('event', false, "the site's proxy cannot reach Trail");
    else push('event', false, `${api} answered ${r.status}`);
  } catch {
    push('event', false, `cannot post to ${api}`);
  }
  await robots(f, pageUrl, push);
  return checks;
}

async function robots(f: typeof fetch, pageUrl: string, push: (n: string, ok: boolean | 'warn', d: string) => void) {
  try {
    const r = await f(new URL('/robots.txt', pageUrl).href, { headers: HEADERS });
    if (!r.ok) return push('robots', true, `no robots.txt (${r.status})`);
    const blocked = robotsBlocking(await r.text());
    if (blocked.length) push('robots', 'warn', `robots.txt disallows ${blocked.join(', ')}: AI crawlers will not read your pages`);
    else push('robots', true, 'robots.txt does not block AI crawlers');
  } catch {
    push('robots', true, 'robots.txt not reachable');
  }
}
