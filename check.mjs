#!/usr/bin/env node
// Validates tokens/tokens.json. Exits non-zero on any failure.
//   node check.mjs           measure and report
//   node check.mjs --write   also store the measured ratios in each token's $extensions["trail.contrast"]
//   node check.mjs --verbose print every pair, not only the failures
import { writeFileSync } from 'node:fs';
import { load, resolve, walk, themeTokens, oklchL, measure, THEMES, TOKENS_PATH } from './lib/tokens.mjs';

const args = new Set(process.argv.slice(2));
const tree = load();
const failures = [];
const fail = msg => failures.push(msg);

/* 1. Every alias resolves (throws on unknown or cyclic references). */
let aliases = 0;
for (const [path, tok] of walk(tree)) {
  try { resolve(tree, tok.$value); aliases++; } catch (e) { fail(`${path.join('.')}: ${e.message}`); }
}

/* 2. Colour primitives are named by OKLCH lightness x100 (gray.18 has L = 0.18 +- 0.5). */
const named = ['gray', 'ink', 'blue', 'yellow', 'amber', 'green', 'red', 'orange', 'violet'];
for (const ramp of named) {
  for (const [step, tok] of Object.entries(tree.primitive.color[ramp])) {
    if (step.startsWith('$')) continue;
    const L = Math.round(oklchL(tok.$value) * 100);
    if (String(L) !== step) fail(`primitive.color.${ramp}.${step} is ${tok.$value}, whose OKLCH lightness is ${L}: rename it ${ramp}.${L}`);
  }
}

/* 3. Every colour primitive has a job: something references it. */
const text = JSON.stringify(tree);
for (const [path] of walk(tree.primitive.color, ['primitive', 'color'])) {
  if (!text.includes(`{${path.join('.')}}`)) fail(`${path.join('.')} is not referenced by any token (every step needs a job)`);
}

/* 4. Dark and light define the same roles; blue-ground defines a subset. */
const keys = t => new Set(Object.keys(themeTokens(tree, t)));
const [kd, kl, kb] = THEMES.map(keys);
for (const k of kd) if (!kl.has(k)) fail(`theme.light is missing ${k}`);
for (const k of kl) if (!kd.has(k)) fail(`theme.dark is missing ${k}`);
for (const k of kb) if (!kd.has(k)) fail(`theme.blue-ground defines ${k}, which dark does not`);

/* 5. Contrast. */
const { rows: measuredRows, skipped } = measure(tree);
const measured = {};
const rows = [];
for (const r of measuredRows) {
  rows.push({ theme: r.theme, kind: r.kind, pair: r.pair, ratio: r.ratio.toFixed(2), min: r.min, ok: r.ok });
  if (!r.ok) fail(`[${r.theme}] ${r.kind}: ${r.fg} (${r.fgValue}) on ${r.bg} (${r.bgValue}) is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`);
  ((measured[r.theme] ??= {})[r.fg] ??= {})[r.bg] = Math.round(r.ratio * 100) / 100;
}
const count = rows.length;

/* Report. */
const byTheme = THEMES.map(th => {
  const r = rows.filter(x => x.theme === th);
  const worst = k => r.filter(x => x.kind === k).reduce((m, x) => (+x.ratio < +m.ratio ? x : m), { ratio: 99 });
  return { theme: th, pairs: r.length, failed: r.filter(x => !x.ok).length, 'worst text': `${worst('text').ratio} (${worst('text').pair ?? '-'})`, 'worst graphic': `${worst('graphic').ratio} (${worst('graphic').pair ?? '-'})` };
});
console.log(`Trail tokens check: ${aliases} tokens resolved, ${count} contrast pairs measured (${skipped} not applicable to a theme).\n`);
console.table(byTheme);
if (args.has('--verbose')) console.table(rows);

if (args.has('--write')) {
  for (const [theme, fgs] of Object.entries(measured)) {
    for (const [fg, ratios] of Object.entries(fgs)) {
      const tok = tree.theme[theme][fg];
      tok.$extensions = { ...(tok.$extensions || {}), 'trail.contrast': ratios };
    }
  }
  writeFileSync(TOKENS_PATH, JSON.stringify(tree, null, 2) + '\n');
  console.log('\nWrote measured ratios to $extensions["trail.contrast"] in tokens/tokens.json.');
} else {
  /* 6. The stored ratios are the measured ones (a colour changed without `--write` is stale documentation). */
  for (const [theme, fgs] of Object.entries(measured)) {
    for (const [fg, ratios] of Object.entries(fgs)) {
      const stored = tree.theme[theme][fg].$extensions?.['trail.contrast'];
      if (JSON.stringify(stored) !== JSON.stringify(ratios)) fail(`[${theme}] ${fg}: $extensions["trail.contrast"] is stale; run node check.mjs --write`);
    }
  }
}

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nPASS: every text pair >= 4.5:1, every graphic >= 3:1, heat low end >= 1.5:1, names and references consistent.');
