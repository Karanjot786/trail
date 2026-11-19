import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/blog/a', params: { slug: 'a' } as Record<string, string | string[]> | null }));
vi.mock('next/navigation.js', () => ({ usePathname: () => nav.pathname, useParams: () => nav.params }));

import { Analytics } from './index';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const w = window as any;
let root: ReturnType<typeof createRoot>;
let pageviews: Array<string | undefined>;
let origPush: typeof history.pushState;

// Stand-in for t.js: counts one pageview per pushState and reads data-route like the real tracker.
const loadFakeTracker = () => {
  const s = document.querySelector('script[data-site]') as HTMLScriptElement;
  const ps = history.pushState;
  history.pushState = function (...a: Parameters<History['pushState']>) {
    ps.apply(this, a);
    pageviews.push(s.dataset.route);
  };
  pageviews.push(s.dataset.route); // initial page()
  w.trail = { pageview: vi.fn(), track: vi.fn(), identify: vi.fn(), reset: vi.fn() };
};
const render = () => act(async () => root.render(<Analytics site="s" />));
const go = async (pathname: string, params: Record<string, string | string[]> | null) => {
  Object.assign(nav, { pathname, params });
  await render(); // React renders the new route before Next commits history.pushState
  history.pushState({}, '', pathname);
};

beforeEach(() => {
  document.head.innerHTML = '';
  delete w.trail;
  delete w.trailq;
  delete w.__trail;
  pageviews = [];
  origPush = history.pushState;
  nav.pathname = '/blog/a';
  nav.params = { slug: 'a' };
  root = createRoot(document.body.appendChild(document.createElement('div')));
});
afterEach(() => {
  act(() => root.unmount());
  history.pushState = origPush;
});

describe('next Analytics', () => {
  it('injects once with the computed route', async () => {
    await render();
    await render();
    const s = document.querySelectorAll('script[data-site]');
    expect(s).toHaveLength(1);
    expect((s[0] as HTMLScriptElement).dataset.route).toBe('/blog/[slug]');
  });

  it('records exactly one pageview per navigation, with the new route', async () => {
    await render();
    loadFakeTracker();
    await go('/blog/b', { slug: 'b' });
    await go('/about', {});
    await go('/docs/x/y', { path: ['x', 'y'] });
    expect(pageviews).toEqual(['/blog/[slug]', '/blog/[slug]', '/about', '/docs/[...path]']);
    expect(w.trail.pageview).not.toHaveBeenCalled();
  });

  it('never queues manual pageviews', async () => {
    await render();
    await go('/blog/b', { slug: 'b' });
    expect(w.trailq ?? []).toEqual([]);
  });

  it('uses the plain pathname when params are unavailable (pages router)', async () => {
    nav.pathname = '/about';
    nav.params = null;
    await render();
    expect((document.querySelector('script[data-site]') as HTMLScriptElement).dataset.route).toBe('/about');
  });
});
