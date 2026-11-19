import { beforeEach, describe, expect, it } from 'vitest';
import { identify, inject, pageview, reset, track } from './index';

const w = window as any;
const scripts = () => document.querySelectorAll('script[data-site]');

beforeEach(() => {
  document.head.innerHTML = '';
  delete w.trail;
  delete w.trailq;
  delete w.__trail;
});

describe('inject', () => {
  it('adds one deferred script with data attributes', () => {
    inject({ site: 'mysite', api: '/a', env: 'prod', dev: true, route: '/x', vitals: true, rage: true });
    const s = scripts()[0] as HTMLScriptElement;
    expect(scripts()).toHaveLength(1);
    expect(s.getAttribute('src')).toBe('/_t/t.js');
    expect(s.defer).toBe(true);
    expect(s.dataset).toMatchObject({ site: 'mysite', api: '/a', env: 'prod', route: '/x' });
    expect(s.dataset.dev).toBe('');
    expect(s.dataset.vitals).toBe('');
    expect(s.dataset.rage).toBe('');
  });

  it('omits unset options and false flags', () => {
    inject({ site: 's', dev: false });
    const s = scripts()[0] as HTMLScriptElement;
    expect(s.dataset.dev).toBeUndefined();
    expect(s.dataset.api).toBeUndefined();
  });

  it('is idempotent', () => {
    inject({ site: 's' });
    inject({ site: 's' });
    inject({ site: 's', src: '/other.js' });
    expect(scripts()).toHaveLength(1);
  });

  it('does not inject when the tracker already loaded', () => {
    w.__trail = 1;
    inject({ site: 's' });
    expect(scripts()).toHaveLength(0);
  });
});

describe('queue before load', () => {
  it('queues calls in the shape t.js flushes', () => {
    inject({ site: 's' });
    track('signup', { plan: 'pro', n: 1, ok: true, x: null });
    identify('u1');
    pageview({ route: '/a/[id]' });
    pageview();
    reset();
    expect(typeof w.trail).toBe('function');
    expect(Array.from(w.trailq, (c: any) => Array.from(c))).toEqual([
      ['track', 'signup', { plan: 'pro', n: 1, ok: true, x: null }],
      ['identify', 'u1'],
      ['pageview', { route: '/a/[id]' }],
      ['pageview', undefined],
      ['reset'],
    ]);
  });

  it('queues even if inject has not run yet', () => {
    track('early');
    expect(Array.from(w.trailq[0])).toEqual(['track', 'early', undefined]);
  });

  it('calls the real API once the tracker replaced the stub', () => {
    const calls: unknown[][] = [];
    w.trail = {
      track: (...a: unknown[]) => calls.push(['track', ...a]),
      identify: (...a: unknown[]) => calls.push(['identify', ...a]),
      reset: (...a: unknown[]) => calls.push(['reset', ...a]),
      pageview: (...a: unknown[]) => calls.push(['pageview', ...a]),
    };
    track('e', { a: 1 });
    identify('u');
    reset();
    pageview({ route: '/r' });
    expect(calls).toEqual([['track', 'e', { a: 1 }], ['identify', 'u'], ['reset'], ['pageview', { route: '/r' }]]);
  });
});
