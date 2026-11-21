// Shared by build.mjs and check.mjs. Zero dependencies.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_PATH = join(ROOT, 'tokens', 'tokens.json');
export const THEMES = ['dark', 'light', 'blue-ground'];

export function load() {
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
}

const isToken = n => n && typeof n === 'object' && '$value' in n;

export function get(tree, path) {
  const node = path.split('.').reduce((n, k) => (n == null ? undefined : n[k]), tree);
  if (!isToken(node)) throw new Error(`Unknown token reference {${path}}`);
  return node;
}

// Resolve aliases ({a.b.c}) anywhere inside a value, recursively, with cycle detection.
export function resolve(tree, value, seen = []) {
  if (typeof value === 'string') {
    const m = value.match(/^\{([^}]+)\}$/);
    if (m) {
      if (seen.includes(m[1])) throw new Error(`Alias cycle: ${[...seen, m[1]].join(' -> ')}`);
      return resolve(tree, get(tree, m[1]).$value, [...seen, m[1]]);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => resolve(tree, v, seen));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(tree, v, seen)]));
  return value;
}

// Depth-first walk over tokens: yields [pathParts, token].
export function* walk(node, path = []) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (isToken(v)) yield [[...path, k], v];
    else if (v && typeof v === 'object') yield* walk(v, [...path, k]);
  }
}

export function themeTokens(tree, theme) {
  const out = {};
  for (const [path, tok] of walk(tree.theme[theme])) out[path.join('.')] = { ...tok, value: resolve(tree, tok.$value) };
  return out;
}

/* ---------- colour maths (WCAG 2.x relative luminance) ---------- */
export function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}
export const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export function over(top, base) {
  const t = parseHex(top), b = parseHex(base);
  if (b.a < 1) throw new Error(`Base ${base} must be opaque`);
  return toHex({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a) });
}
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export function luminance(hex) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export function oklchL(hex) {
  const { r, g, b } = parseHex(hex);
  const [R, G, B] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/* ---------- contrast pairs (shared by check.mjs and the preview) ---------- */
export const MIN = { text: 4.5, graphic: 3, distinct: 1.5 };
export function measure(tree) {
  const pairs = tree.$extensions['trail.checks'];
  const rows = [];
  let skipped = 0;
  for (const theme of THEMES) {
    const t = themeTokens(tree, theme);
    const color = k => t[k]?.value;
    for (const kind of ['text', 'graphic', 'distinct']) {
      for (const [f, b, base = 'surface'] of pairs[kind]) {
        if (!color(f) || !color(b)) { skipped++; continue; }
        let bg = color(b), note = '';
        if (parseHex(bg).a < 1) { bg = over(bg, color(base)); note = ` over ${base}`; }
        let fg = color(f);
        if (parseHex(fg).a < 1) fg = over(fg, bg);
        const ratio = contrast(fg, bg);
        rows.push({ theme, kind, fg: f, bg: `${b}${note}`, fgValue: color(f), bgValue: color(b), pair: `${f} on ${b}${note}`, ratio, min: MIN[kind], ok: ratio >= MIN[kind] });
      }
    }
  }
  return { rows, skipped };
}
