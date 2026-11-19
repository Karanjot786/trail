// Turns a concrete pathname into its route pattern, e.g. /blog/hello -> /blog/[slug].
// Same algorithm as @vercel/analytics: single values first, then catch-all arrays.
export function computeRoute(
  pathname: string | null,
  params: Record<string, string | string[]> | null,
): string | null {
  if (!pathname || !params) return pathname;
  try {
    let result = pathname;
    const entries = Object.entries(params);
    for (const [key, value] of entries) {
      if (!Array.isArray(value)) result = result.replace(segment(value), `/[${key}]`);
    }
    for (const [key, value] of entries) {
      if (Array.isArray(value)) result = result.replace(segment(value.join('/')), `/[...${key}]`);
    }
    return result;
  } catch {
    return pathname;
  }
}

const segment = (v: string) => new RegExp(`/${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[/?#]|$)`);
