// Seeded RNG and value noise, ported verbatim from the prototype (main.js lines 13–19).
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function makeNoise(seed) {
  const r = rng(seed), P = []; for (let i = 0; i < 512; i++) P.push(r());
  const h = (x, y) => P[((x * 73856093) ^ (y * 19349663)) & 511], sm = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi), a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  return (x, y) => n(x, y) * .55 + n(x * 2.1, y * 2.1) * .28 + n(x * 4.3, y * 4.3) * .17;
}
