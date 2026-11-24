declare const __TRAIL_VERSION__: string;

/** The running package version, inlined by tsup/vitest `define` at build time. */
export const VERSION: string = typeof __TRAIL_VERSION__ === 'string' ? __TRAIL_VERSION__ : '0.0.0-dev';

export const installSpec = (): string => `trail-analytics@^${VERSION}`;

/** True when there is no range, or the range's major.minor is below `version`'s. workspace:, file:, link: ranges are left alone. */
export function needsInstall(range: string | undefined, version: string = VERSION): boolean {
  if (!range) return true;
  const m = /(\d+)\.(\d+)/.exec(range);
  if (!m) return false;
  const v = /(\d+)\.(\d+)/.exec(version);
  if (!v) return false;
  const [rM, rm, vM, vm] = [Number(m[1]), Number(m[2]), Number(v[1]), Number(v[2])];
  return rM < vM || (rM === vM && rm < vm);
}
