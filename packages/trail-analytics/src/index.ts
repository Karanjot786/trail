export type Props = Record<string, string | number | boolean | null>;

export interface InjectProps {
  /** Site id, must match an entry in TRAIL_SITES on the server. */
  site: string;
  /** Tracker URL. Default `/_t/t.js`. */
  src?: string;
  /** Event endpoint (data-api). Default `/_t/e`. */
  api?: string;
  env?: string;
  /** Track on localhost too (data-dev). */
  dev?: boolean;
  /** Route template for the initial pageview, e.g. `/blog/[slug]`. */
  route?: string;
  /** Opt in to Core Web Vitals (needs the full tracker build). */
  vitals?: boolean;
  /** Opt in to rage-click detection (needs the full tracker build). */
  rage?: boolean;
}

type Method = 'track' | 'identify' | 'reset' | 'pageview';
type Queued = ((...a: unknown[]) => void) & { q?: unknown };

const MARK = 'data-trail-sdk';

const win = (): any => (typeof window === 'undefined' || typeof document === 'undefined' ? undefined : window);

// Same contract as t.ts: window.trail is a function while loading and collects
// ['track', name, props] style entries into window.trailq.
function stub(w: any) {
  if (w.trail) return;
  const q: unknown[][] = (w.trailq = w.trailq || []);
  w.trail = ((...a: unknown[]) => void q.push(a)) as Queued;
}

function call(m: Method, ...a: unknown[]) {
  const w = win();
  if (!w) return;
  stub(w);
  const t = w.trail;
  if (typeof t === 'function') t(m, ...a);
  else t[m]?.(...a);
}

/** Update the route template read by the tracker for its next pageview. Internal, used by the Next helper. */
export function setRoute(route: string | null | undefined) {
  const s = win()?.document.querySelector(`script[${MARK}]`) as HTMLScriptElement | null;
  if (!s) return;
  if (route) s.dataset.route = route;
  else delete s.dataset.route;
}

/** Install the queue stub and add the tracker script once. No-op on the server. */
export function inject(o: InjectProps): void {
  const w = win();
  if (!w) return;
  stub(w);
  if (w.__trail || w.document.querySelector(`script[${MARK}]`)) return;
  const s: HTMLScriptElement = w.document.createElement('script');
  s.defer = true;
  s.src = o.src || '/_t/t.js';
  s.setAttribute(MARK, '');
  s.dataset.site = o.site;
  if (o.api) s.dataset.api = o.api;
  if (o.env) s.dataset.env = o.env;
  if (o.route) s.dataset.route = o.route;
  if (o.dev) s.dataset.dev = '';
  if (o.vitals) s.dataset.vitals = '';
  if (o.rage) s.dataset.rage = '';
  w.document.head.appendChild(s);
}

/** Custom event with flat props. */
export const track = (name: string, props?: Props): void => call('track', name, props);
/** Call on login. A different user id on the same device rotates the anonymous id. */
export const identify = (userId: string): void => call('identify', userId);
/** Call on logout. */
export const reset = (): void => call('reset');
/** Manual pageview, optional route template. */
export const pageview = (opts?: { route?: string }): void => call('pageview', opts);

export { computeRoute } from './route';
