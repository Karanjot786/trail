// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { wrapHook } from './hook';

const FIX = resolve(__dirname, '../../test/fixtures');
const fx = (p: string) => readFileSync(resolve(FIX, p), 'utf8');
const PATHS = "'/t/t.js', '/t/t.x.js', '/t/t.p.js', '/t/e'";

function wrapped(src: string, file: string, name: 'proxy' | 'middleware') {
  const r = wrapHook(src, file, name);
  if (r.kind === 'manual') throw new Error('manual: ' + r.reason);
  return r;
}

describe('wrapHook', () => {
  it('wraps the agent-skills default-exported middleware function', () => {
    const r = wrapped(fx('report-agent-skills/src/middleware.ts'), 'middleware.ts', 'middleware');
    expect(r.kind).toBe('wrapped');
    expect(r.after).toContain("import { withTrail } from 'trail-analytics/next/proxy';");
    expect(r.after).toContain('function middleware(request: NextRequest) {');
    expect(r.after).not.toContain('export default function');
    expect(r.after).toContain('export default withTrail(middleware);');
    expect(r.after).toContain(`'/((?!api|_next|.*\\\\..*).*)', ${PATHS}] };`);
    expect(r.matcher).toMatchObject({ status: 'added', narrow: false });
  });

  it('wraps the genzcareer named async proxy function', () => {
    const r = wrapped(fx('report-genzcareer/proxy.ts'), 'proxy.ts', 'proxy');
    expect(r.after).toContain('async function proxyHandler(request: NextRequest) {');
    expect(r.after).toContain('export const proxy = withTrail(proxyHandler);');
    expect(r.after).not.toContain('export async function');
    expect(r.after).toContain("'/t/t.js'");
  });

  it('flags the reelcn /docs matcher as narrow and still adds the Trail paths', () => {
    const r = wrapped(fx('report-reelcn/apps/www/proxy.ts'), 'proxy.ts', 'proxy');
    expect(r.matcher.narrow).toBe(true);
    expect(r.matcher.entries).toEqual(['/docs/:path*']);
    expect(r.after).toContain(`matcher: ['/docs/:path*', ${PATHS}]`);
    expect(r.after).toContain('function proxyHandler(request: NextRequest)');
  });

  it('wraps a next-intl one-liner default export call', () => {
    const src = "import createMiddleware from 'next-intl/middleware';\nimport { routing } from './i18n/routing';\n\nexport default createMiddleware(routing);\n\nexport const config = { matcher: ['/', '/(de|en)/:path*'] };\n";
    const r = wrapped(src, 'middleware.ts', 'middleware');
    expect(r.after).toContain('export default withTrail(createMiddleware(routing));');
    expect(r.after).toContain("import { withTrail } from 'trail-analytics/next/proxy';");
    expect(r.matcher.narrow).toBe(true);
  });

  it('wraps a multi-line Clerk middleware across lines', () => {
    const src = "import { clerkMiddleware } from '@clerk/nextjs/server';\n\nexport default clerkMiddleware(async (auth, req) => {\n  await auth.protect();\n});\n\nexport const config = { matcher: ['/((?!_next|.*\\\\..*).*)', '/(api|trpc)(.*)'] };\n";
    const r = wrapped(src, 'middleware.ts', 'middleware');
    expect(r.after).toContain('export default withTrail(clerkMiddleware(async (auth, req) => {\n  await auth.protect();\n}));');
    expect(r.matcher.narrow).toBe(false);
  });

  it('wraps an anonymous default function and a default arrow', () => {
    const a = wrapped("export default async function (req) { return; }\n", 'proxy.js', 'proxy');
    expect(a.after).toContain('async function trailUserProxy(req)');
    expect(a.after).toContain('export default withTrail(trailUserProxy);');
    const b = wrapped("export default (req) => undefined;\n", 'proxy.js', 'proxy');
    expect(b.after).toContain('export default withTrail((req) => undefined);');
  });

  it('wraps an exported const proxy', () => {
    const r = wrapped("export const middleware = (req) => undefined;\n", 'middleware.js', 'middleware');
    expect(r.after).toContain('export const middleware = withTrail((req) => undefined);');
  });

  it('is idempotent: a second run says already and keeps the text', () => {
    const first = wrapped(fx('report-genzcareer/proxy.ts'), 'proxy.ts', 'proxy');
    const second = wrapHook(first.after, 'proxy.ts', 'proxy');
    expect(second.kind).toBe('already');
    if (second.kind === 'already') expect(second.after).toBe(first.after);
    const mid = wrapped(fx('report-agent-skills/src/middleware.ts'), 'middleware.ts', 'middleware');
    const again = wrapHook(mid.after, 'middleware.ts', 'middleware');
    expect(again).toMatchObject({ kind: 'already', after: mid.after });
  });

  it('leaves the init-generated hook alone (its matcher already covers /t/*)', () => {
    const generated = "import trail from 'trail-analytics/next/proxy';\nexport default function proxy(req, event) { return trail(req, event); }\nexport const config = { matcher: ['/((?!_next/static|_next/image).*)'] };\n";
    expect(wrapHook(generated, 'proxy.js', 'proxy')).toMatchObject({ kind: 'already', after: generated, matcher: { status: 'present' } });
  });

  it('adds paths to an already-wrapped file whose matcher excludes them', () => {
    const src = "import { withTrail } from 'trail-analytics/next/proxy';\nexport default withTrail(() => {});\nexport const config = { matcher: ['/((?!.*\\\\..*).*)'] };\n";
    const r = wrapHook(src, 'proxy.ts', 'proxy');
    expect(r.kind).toBe('already');
    if (r.kind === 'already') expect(r.after).toContain("'/t/t.js', '/t/t.x.js', '/t/t.p.js'");
  });

  it('turns a string matcher into an array', () => {
    const r = wrapped("export default function proxy() {}\nexport const config = { matcher: '/docs/:p*' };\n", 'proxy.ts', 'proxy');
    expect(r.after).toContain(`matcher: ['/docs/:p*', ${PATHS}]`);
  });

  it('reports none when there is no config or matcher', () => {
    expect(wrapped('export default function proxy() {}\n', 'proxy.ts', 'proxy').matcher).toEqual({ status: 'none', narrow: false });
  });

  it('reports a non-literal matcher as dynamic and leaves it', () => {
    const src = "import { M } from './m';\nexport default function proxy() {}\nexport const config = { matcher: M };\n";
    const r = wrapped(src, 'proxy.ts', 'proxy');
    expect(r.matcher.status).toBe('dynamic');
    expect(r.after).toContain('matcher: M }');
  });

  it('goes manual for export lists, two exports and syntax errors', () => {
    expect(wrapHook('function a() {}\nexport { a as proxy };\n', 'proxy.ts', 'proxy')).toMatchObject({ kind: 'manual' });
    expect(wrapHook("export { default } from './x';\n", 'proxy.ts', 'proxy')).toMatchObject({ kind: 'manual' });
    expect(wrapHook('export default function a() {}\nexport function proxy() {}\n', 'proxy.ts', 'proxy')).toMatchObject({ kind: 'manual' });
    const bad = wrapHook('export default function (', 'proxy.ts', 'proxy');
    expect(bad.kind).toBe('manual');
    if (bad.kind === 'manual') expect(bad.snippet).toContain('withTrail');
    const self = wrapHook('export function proxy() { return proxy; }\n', 'proxy.ts', 'proxy');
    expect(self.kind).toBe('manual');
  });

  it('aliases withTrail when the name is taken', () => {
    const r = wrapped("import { withTrail } from './mine';\nexport default withTrail(() => {});\n", 'proxy.ts', 'proxy');
    expect(r.after).toContain("import { withTrail as trailWithTrail } from 'trail-analytics/next/proxy';");
    expect(r.after).toContain('export default trailWithTrail(withTrail(() => {}));');
  });

  it('keeps CRLF and no-semicolon style', () => {
    const r = wrapped("import a from 'a'\r\nexport default function proxy() {}\r\n", 'proxy.js', 'proxy');
    expect(r.after).toContain("import a from 'a'\r\nimport { withTrail } from 'trail-analytics/next/proxy'\r\nfunction proxy() {}");
    expect(r.after.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
