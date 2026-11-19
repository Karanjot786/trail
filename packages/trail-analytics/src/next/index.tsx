'use client';
import { useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation.js';
import { computeRoute, inject, setRoute, type InjectProps } from '../index';

export type { InjectProps };

/**
 * Trail for the Next.js App Router. Add once to the root layout.
 *
 * t.js already records a pageview on every history.pushState/popstate that changes
 * the path, and reads data-route when it does. So this component never fires
 * pageview(): it only keeps data-route in sync with the route pattern, in render,
 * which runs before Next commits history.pushState. One navigation, one pageview.
 */
export function Analytics(props: Omit<InjectProps, 'route'>): null {
  const pathname = usePathname();
  const params = useParams();
  const route = computeRoute(pathname, params);
  if (typeof document !== 'undefined') setRoute(route); // no-op until the script exists
  useEffect(() => {
    inject({ ...props, route: route ?? undefined });
    // first mount only; later navigations are handled by setRoute above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
