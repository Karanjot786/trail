import { needsInstall, VERSION } from './version';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from './detect';
import type { Change } from './diff';
import { insertImport, parse } from './ast';
import { wrapHook } from './hook';
import { editLayout, findRootLayouts, handScriptLines } from './layout';
import { readNextConfig } from './nextconfig';
import * as T from './templates';

export interface PlanFs {
  read(rel: string): string | null;
  isDir(rel: string): boolean;
  /** `git check-ignore -q rel` exited 0. */
  gitIgnored(rel: string): boolean;
  /** `git ls-files --error-unmatch -- rel` exited 0. */
  gitTracked(rel: string): boolean;
  /** Entry names of a directory, [] on error. */
  list(rel: string): string[];
}

export interface PlanOptions { url: string; site: string; token: string }

export interface Plan {
  changes: Change[];
  manual: string[];
  warnings: string[];
  install?: { cmd: string; args: string[]; cwd: string };
}

export function nodeFs(cwd: string, gitIgnored: (rel: string) => boolean, gitTracked: (rel: string) => boolean = () => false): PlanFs {
  return {
    read: (rel) => {
      try {
        return readFileSync(join(cwd, rel), 'utf8');
      } catch {
        return null;
      }
    },
    isDir: (rel) => {
      try {
        return statSync(join(cwd, rel)).isDirectory();
      } catch {
        return false;
      }
    },
    gitIgnored,
    gitTracked,
    list: (rel) => {
      try {
        return readdirSync(join(cwd, rel));
      } catch {
        return [];
      }
    },
  };
}

const eolOf = (s: string | null) => (s && /\r\n/.test(s) ? '\r\n' : '\n');
const firstExisting = (fs: PlanFs, names: string[]) => names.find((n) => fs.read(n) !== null);

interface TagPaths { src: string; api: string }

function planLayout(fs: PlanFs, p: Project, o: PlanOptions, out: Plan, tp: TagPaths) {
  const at = p.srcDir ? 'src/' : '';
  if (p.router !== 'app') {
    out.manual.push(T.pagesSnippet(o.site, at, tp.src, tp.api));
    return;
  }
  const appDir = `${at}app`;
  const files = findRootLayouts(fs, appDir);
  if (!files.length) {
    out.manual.push(`No root layout (a layout with <html>) found in ${appDir}/layout.* or ${appDir}/[*]/layout.*.\n\n${T.layoutSnippet(o.site, `${appDir}/layout`, tp.src, tp.api)}`);
    return;
  }
  for (const file of files) {
    const before = fs.read(file)!;
    const e = editLayout(before, file, { site: o.site, ...tp });
    if (e && 'manual' in e) out.manual.push(`${e.manual}\n\n${T.layoutSnippet(o.site, file, tp.src, tp.api)}`);
    else if (e) out.changes.push({ path: file, before, after: e.after });
    for (const n of handScriptLines(before, file)) out.warnings.push(`${file} also loads the Trail script by hand (line ${n}); remove it, the component replaces it.`);
  }
}

function planNext(fs: PlanFs, p: Project, o: PlanOptions, out: Plan) {
  const at = p.srcDir ? 'src/' : '';
  const cfg = readNextConfig(fs);
  const staticExport = cfg.output === 'export';
  const base = cfg.basePath ?? '';
  const tp: TagPaths = staticExport
    ? { src: `${o.url}/_t/t.js`, api: `${o.url}/_t/e` }
    : { src: `${base}/t/t.js`, api: `${base}/t/e${cfg.trailingSlash ? '/' : ''}` };
  if (staticExport) {
    out.warnings.push(T.STATIC_EXPORT_WARNING);
  } else if (p.hookFile) {
    const src = fs.read(p.hookFile) ?? '';
    const name = /(?:^|\/)middleware\.[a-z]+$/.test(p.hookFile) ? 'middleware' : 'proxy';
    const e = wrapHook(src, p.hookFile, name);
    if (e.kind === 'manual') {
      out.manual.push(`${e.reason}.\n\n${e.snippet}`);
    } else {
      if (e.after !== src) out.changes.push({ path: p.hookFile, before: src, after: e.after });
      if (e.matcher.status === 'dynamic') out.manual.push(T.matcherDynamicSnippet(p.hookFile));
      else if (e.matcher.status !== 'none' && e.matcher.narrow) out.manual.push(T.narrowMatcher(p.hookFile, (e.matcher.entries ?? []).join(', ')));
    }
  } else {
    const known = p.nextMajor !== undefined;
    const name: 'proxy' | 'middleware' = known && p.nextMajor! >= 16 ? 'proxy' : 'middleware';
    if (!known) out.warnings.push(T.UNKNOWN_NEXT_WARNING);
    out.changes.push({ path: `${at}${name}.${p.ext}`, before: null, after: T.nextHook(name, p.ext) });
  }
  planLayout(fs, p, o, out, tp);
  for (const d of ['app/t', 'src/app/t', 'pages/t', 'src/pages/t']) if (fs.isDir(d)) out.warnings.push(`${d} exists: requests to /t/t.js and /t/e are served by Trail; other /t/... paths still reach your routes.`);
}

function planAstro(fs: PlanFs, p: Project, o: PlanOptions, out: Plan) {
  if (p.astroOutput === 'static') out.warnings.push(T.STATIC_WARNING);
  for (const d of ['src/pages/t']) if (fs.isDir(d)) out.warnings.push(`${d} exists: requests to /t/t.js and /t/e are served by Trail; other /t/... paths still reach your pages.`);
  const file = firstExisting(fs, ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts']);
  const before = file ? fs.read(file)! : null;
  if (!file || before == null) {
    out.manual.push(T.astroSnippet(o.site));
    return;
  }
  if (p.astroOutput === 'server' && /@astrojs\/node/.test(before) && !/\bsite\s*:/.test(before) && !/allowedDomains/.test(before)) out.warnings.push(T.ORIGIN_WARNING);
  if (/['"]trail-analytics\/astro['"]/.test(before)) return;
  const eol = eolOf(before);
  const call = `trail({ site: ${JSON.stringify(o.site)} })`;
  let after: string;
  const integ = /integrations\s*:\s*\[/.exec(before);
  const def = /defineConfig\(\s*\{/.exec(before);
  if (integ) {
    const at = integ.index + integ[0].length;
    const empty = /^\s*\]/.test(before.slice(at));
    after = before.slice(0, at) + call + (empty ? '' : ', ') + before.slice(at).replace(empty ? /^\s*/ : /^/, '');
  } else if (def) {
    const at = def.index + def[0].length;
    const rest = before.slice(at);
    after = /^\s*\}/.test(rest)
      ? before.slice(0, at) + ` integrations: [${call}] ` + rest.replace(/^\s*/, '')
      : before.slice(0, at) + `${eol}  integrations: [${call}],` + rest;
  } else {
    out.manual.push(T.astroSnippet(o.site));
    return;
  }
  const ast = parse(before, file);
  if (!ast) {
    out.manual.push(T.astroSnippet(o.site));
    return;
  }
  after = insertImport(after, ast, "import trail from 'trail-analytics/astro'");
  out.changes.push({ path: file, before, after });
}

/** Lines of a .gitignore that would ignore `name` (simple glob, no negation). */
function ignoredByText(gitignore: string | null, name: string): boolean {
  if (!gitignore) return false;
  return gitignore.split(/\r?\n/).some((raw) => {
    const l = raw.trim().replace(/^\//, '');
    if (!l || l.startsWith('#') || l.startsWith('!')) return false;
    const re = new RegExp('^' + l.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return re.test(name);
  });
}

export const envFileFor = (p: Pick<Project, 'framework'>) => (p.framework === 'next' ? '.env.local' : '.env');

const ENV_LINE = /^(\s*(?:export\s+)?)([A-Z0-9_]+)(\s*=\s*)(.*?)(\s*)$/;
const unquote = (v: string) => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

/** The value of `key` in a dotenv text, quotes removed, or undefined. */
export function readEnvValue(text: string | null, key: string): string | undefined {
  for (const l of (text ?? '').split(/\r?\n/)) {
    const m = ENV_LINE.exec(l);
    if (m && m[2] === key) return unquote(m[4]);
  }
  return undefined;
}

const WRANGLER = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];

function planEnv(fs: PlanFs, p: Project, o: PlanOptions, out: Plan) {
  const file = envFileFor(p);
  const before = fs.read(file);
  const eol = eolOf(before);
  const wanted = [['TRAIL_URL', o.url], ['TRAIL_SITE', o.site], ['TRAIL_CRAWL_TOKEN', o.token]] as const;
  const tracked = before !== null && fs.gitTracked(file);
  if (tracked) {
    out.manual.push(`${file} is tracked by git, so init will not write the token into it. Run: git rm --cached ${file} && echo ${file} >> .gitignore, then rerun init. Or set the three variables only in your host (see below).`);
  } else {
    const lines = (before ?? '').split(/\r?\n/);
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const m = ENV_LINE.exec(lines[i]);
      const want = m && wanted.find(([k]) => k === m[2]);
      if (!m || !want) continue;
      seen.add(m[2]);
      if (unquote(m[4]) !== want[1]) lines[i] = `${m[1]}${m[2]}${m[3]}${want[1]}${m[5]}`;
    }
    const add = wanted.filter(([k]) => !seen.has(k)).map(([k, v]) => `${k}=${v}`);
    let after = lines.join(eol);
    if (add.length) after += (after === '' || after.endsWith('\n') ? '' : eol) + add.join(eol) + eol;
    if (after !== (before ?? '') || before === null) out.changes.push({ path: file, before, after });
  }
  const names = tracked ? [] : [file];
  if (WRANGLER.some((w) => fs.read(w) !== null)) names.push('.dev.vars');
  const gi = fs.read('.gitignore');
  const ge = eolOf(gi);
  const todo = names.filter((n) => !fs.gitIgnored(n) && !ignoredByText(gi, n));
  if (todo.length) {
    const base = gi ?? '';
    out.changes.push({ path: '.gitignore', before: gi, after: base + (base === '' || base.endsWith('\n') ? '' : ge) + todo.join(ge) + ge });
  }
}

const SECTIONS = ['dependencies', 'devDependencies'] as const;

/** package.json with trail-analytics set to ^VERSION, keeping indentation, EOL and the trailing newline; null when nothing changes. */
function withTrailDep(raw: string): string | null {
  let pkg: any;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!pkg || typeof pkg !== 'object') return null;
  const where = SECTIONS.find((k) => pkg[k] && typeof pkg[k] === 'object' && 'trail-analytics' in pkg[k]);
  if (where) pkg[where]['trail-analytics'] = `^${VERSION}`;
  else {
    const deps: Record<string, string> = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
    const keys = Object.keys(deps);
    const sorted = keys.every((k, i) => i === 0 || keys[i - 1] <= k);
    deps['trail-analytics'] = `^${VERSION}`;
    pkg.dependencies = sorted ? Object.fromEntries(Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : deps;
  }
  const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? '  ';
  const eol = eolOf(raw);
  const out = JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + (/\n$/.test(raw) ? eol : '');
  return out === raw ? null : out;
}

function planInstall(fs: PlanFs, p: Project, out: Plan) {
  if (!needsInstall(p.trailDep, VERSION)) return;
  const raw = fs.read('package.json');
  const after = raw === null ? null : withTrailDep(raw);
  if (raw !== null && after !== null) out.changes.push({ path: 'package.json', before: raw, after });
  if (p.ws.lockfile) out.install = { cmd: p.ws.pm, args: ['install'], cwd: p.ws.root };
  else out.warnings.push('No lockfile found, so init did not install (that would create one). Run your usual install.');
}

/** Everything init would do, without touching the disk. */
export function plan(p: Project, o: PlanOptions, fs: PlanFs): Plan {
  const out: Plan = { changes: [], manual: [], warnings: [] };
  if (p.framework === 'unknown') {
    out.manual.push(T.genericSnippet(o.url, o.site));
    return out;
  }
  if (p.framework === 'next') planNext(fs, p, o, out);
  else planAstro(fs, p, o, out);
  planEnv(fs, p, o, out);
  planInstall(fs, p, out);
  return out;
}
