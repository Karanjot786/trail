// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { editLayout, findRootLayouts, handScriptLines } from './layout';
import type { PlanFs } from './plan';

const TAG = { site: 'shop', src: '/t/t.js', api: '/t/e' };
const VERCEL = `import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
`;

function after(src: string, file = 'app/layout.tsx') {
  const r = editLayout(src, file, TAG);
  if (!r || 'manual' in r) throw new Error('expected an edit, got ' + JSON.stringify(r));
  return r;
}

describe('editLayout', () => {
  it('aliases next to Vercel Analytics', () => {
    const r = after(VERCEL);
    expect(r.local).toBe('TrailAnalytics');
    expect(r.after).toContain("import { Analytics as TrailAnalytics } from 'trail-analytics/next';");
    expect(r.after).toContain('<TrailAnalytics site="shop" src="/t/t.js" api="/t/e" />');
    expect(r.after).toContain("import { Analytics } from '@vercel/analytics/next';");
    expect(r.after).toContain('        <Analytics />\n        <TrailAnalytics');
  });

  it('aliases next to a local Analytics component (genzcareer)', () => {
    const src = VERCEL.replace('@vercel/analytics/next', '@/components/analytics');
    const r = after(src);
    expect(r.after).toContain("import { Analytics } from '@/components/analytics';");
    expect(r.after).toContain('<TrailAnalytics site="shop"');
  });

  it('aliases next to a locally declared Analytics function', () => {
    const src = `export function Analytics() { return null; }\nexport default function L({ children }) { return (<html><body>{children}</body></html>); }\n`;
    const r = after(src, 'app/layout.jsx');
    expect(r.local).toBe('TrailAnalytics');
    expect(r.after).toContain("import { Analytics as TrailAnalytics } from 'trail-analytics/next';");
    expect(r.after).toContain('{children}<TrailAnalytics site="shop" src="/t/t.js" api="/t/e" /></body>');
  });

  it('rerun updates site in the Trail tag, not the Vercel tag', () => {
    const first = after(VERCEL).after;
    const r = editLayout(first, 'app/layout.tsx', { ...TAG, site: 'other', src: '/docs/t/t.js' }) as { after: string };
    expect(r.after).toContain('<TrailAnalytics site="other" src="/docs/t/t.js" api="/t/e" />');
    expect(r.after).toContain('        <Analytics />\n');
    expect(r.after.match(/trail-analytics\/next/g)).toHaveLength(1);
  });

  it('rerun is a no-op', () => {
    expect(editLayout(after(VERCEL).after, 'app/layout.tsx', TAG)).toBeNull();
    const plain = after(VERCEL.replace(/.*vercel.*\n/, '').replace('<Analytics />', '{null}')).after;
    expect(editLayout(plain, 'app/layout.tsx', TAG)).toBeNull();
  });

  it('keeps other attributes and adds only missing ones', () => {
    const src = `import { Analytics } from 'trail-analytics/next';\nexport default function L() { return (<html><body><Analytics site="shop" dev /></body></html>); }\n`;
    expect((editLayout(src, 'app/layout.jsx', TAG) as { after: string }).after).toContain('<Analytics site="shop" dev src="/t/t.js" api="/t/e" />');
  });

  it('ignores </body> inside comments', () => {
    const r = after(VERCEL + '\n// </body>\n');
    expect(r.after).toContain('<TrailAnalytics');
  });

  it('two body elements is manual and says how many', () => {
    const src = `export default function L() { return (<html><body>a</body><body>b</body></html>); }\n`;
    expect(editLayout(src, 'app/layout.jsx', TAG)).toEqual({ manual: 'Found 2 <body> elements in app/layout.jsx; add <Analytics …/> inside the one that wraps your pages.' });
    expect(editLayout('export default function L() { return <html />; }\n', 'app/layout.jsx', TAG)).toMatchObject({ manual: expect.stringContaining('Found 0 <body>') });
  });

  it('is manual on a syntax error', () => {
    expect(editLayout('export default function (', 'app/layout.tsx', TAG)).toMatchObject({ manual: expect.stringContaining('could not be parsed') });
  });

  it('puts the import after a use client directive when there are no imports', () => {
    const src = `'use client';\nexport default function L() { return (<html><body>x</body></html>); }\n`;
    const out = after(src, 'app/layout.jsx').after;
    expect(out.indexOf("'use client'")).toBeLessThan(out.indexOf('import { Analytics }'));
  });
});

describe('handScriptLines', () => {
  it('warns about a hand-added _t/t.js script', () => {
    const src = `export default function L() {\n  return (<html><body>\n<script defer src="https://t.example/_t/t.js" data-site="x" />\n</body></html>);\n}\n`;
    expect(handScriptLines(src, 'app/layout.tsx')).toEqual([3]);
    expect(handScriptLines(src.replace('<script', '<Script').replace('https://t.example/_t', '/t'), 'app/layout.tsx')).toEqual([3]);
    expect(handScriptLines(VERCEL, 'app/layout.tsx')).toEqual([]);
  });
});

describe('findRootLayouts', () => {
  const files: Record<string, string> = {
    'src/app/layout.tsx': 'export default function L({children}){return children}',
    'src/app/[locale]/layout.tsx': VERCEL,
    'src/app/(shop)/layout.tsx': VERCEL,
    'src/app/(shop)/cart/layout.tsx': VERCEL,
    'src/app/[locale]/(g)/layout.jsx': VERCEL,
    'src/app/blog/layout.tsx': VERCEL,
  };
  const fs: PlanFs = {
    read: (r) => files[r] ?? null,
    isDir: (r) => Object.keys(files).some((f) => f.startsWith(r + '/')),
    list: (r) => [...new Set(Object.keys(files).filter((f) => f.startsWith(r + '/')).map((f) => f.slice(r.length + 1).split('/')[0]))],
    gitIgnored: () => false,
    gitTracked: () => false,
  };
  it('finds [locale] and route-group layouts with <html>, skipping html-less and plain subfolders', () => {
    expect(findRootLayouts(fs, 'src/app')).toEqual(['src/app/(shop)/layout.tsx', 'src/app/[locale]/layout.tsx', 'src/app/[locale]/(g)/layout.jsx']);
  });
});
