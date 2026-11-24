import { installSpec, needsInstall, VERSION } from './version';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from './detect';
import type { Change } from './diff';
import * as T from './templates';

export interface PlanFs {
  read(rel: string): string | null;
  isDir(rel: string): boolean;
  /** `git check-ignore -q rel` exited 0. */
  gitIgnored(rel: string): boolean;
}

export interface PlanOptions { url: string; site: string; token: string }

export interface Plan {
  changes: Change[];
  manual: string[];
  warnings: string[];
  install?: { cmd: string; args: string[] };
}

export function nodeFs(cwd: string, gitIgnored: (rel: string) => boolean): PlanFs {
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
  };
}

const eolOf = (s: string | null) => (s && /\r\n/.test(s) ? '\r\n' : '\n');
const firstExisting = (fs: PlanFs, names: string[]) => names.find((n) => fs.read(n) !== null);

/** Inserts `line` after the last top-level import statement (or at the top). */
function addImport(src: string, line: string, eol: string): string {
  const re = /^import[\s\S]*?(?:from\s*)?['"][^'"]+['"];?[ \t]*$/gm;
  let end = -1;
  for (let m; (m = re.exec(src)); ) end = m.index + m[0].length;
  if (end < 0) return line + eol + src;
  const semi = /;[ \t]*$/.test(src.slice(0, end)) ? '' : '';
  return src.slice(0, end) + eol + line + semi + src.slice(end);
}

const usesSemi = (src: string) => {
  const m = src.match(/^import .*$/m);
  return m ? /;\s*$/.test(m[0]) : true;
};

function planLayout(fs: PlanFs, p: Project, o: PlanOptions, out: Plan) {
  const at = p.srcDir ? 'src/' : '';
  if (p.router !== 'app') {
    out.manual.push(T.pagesSnippet(o.site, at));
    return;
  }
  const file = firstExisting(fs, ['tsx', 'jsx', 'ts', 'js'].map((e) => `${at}app/layout.${e}`));
  if (!file) {
    out.manual.push(T.layoutSnippet(o.site, `${at}app/layout`));
    return;
  }
  const before = fs.read(file)!;
  const eol = eolOf(before);
  const hasImport = /from\s*['"]trail-analytics\/next['"]/.test(before);
  const tag = /<Analytics\b[^>]*\/>/.exec(before);
  if (hasImport && tag) {
    if (/\bsrc=/.test(tag[0]) && /\bapi=/.test(tag[0])) return;
    let t = tag[0].replace(/\s*\/>$/, '');
    if (!/\bsrc=/.test(t)) t += ' src="/t/t.js"';
    if (!/\bapi=/.test(t)) t += ' api="/t/e"';
    out.changes.push({ path: file, before, after: before.replace(tag[0], t + ' />') });
    return;
  }
  const bodies = before.split('</body>').length - 1;
  if (bodies !== 1) {
    out.manual.push(T.layoutSnippet(o.site, file));
    return;
  }
  let after = hasImport ? before : addImport(before, `import { Analytics } from 'trail-analytics/next'${usesSemi(before) ? ';' : ''}`, eol);
  const i = after.indexOf('</body>');
  const lineStart = after.lastIndexOf('\n', i - 1) + 1;
  const indent = after.slice(lineStart, i);
  const tagText = T.analyticsTag(o.site);
  after = /^[ \t]*$/.test(indent)
    ? after.slice(0, lineStart) + indent + '  ' + tagText + eol + after.slice(lineStart)
    : after.slice(0, i) + tagText + after.slice(i);
  out.changes.push({ path: file, before, after });
}

function planNext(fs: PlanFs, p: Project, o: PlanOptions, out: Plan) {
  const at = p.srcDir ? 'src/' : '';
  if (p.hookFile) {
    const src = fs.read(p.hookFile) ?? '';
    if (!src.includes('trail-analytics')) out.manual.push(T.withTrailSnippet(p.hookFile));
  } else {
    const name: 'proxy' | 'middleware' = (p.nextMajor ?? 16) >= 16 ? 'proxy' : 'middleware';
    out.changes.push({ path: `${at}${name}.${p.ext}`, before: null, after: T.nextHook(name, p.ext) });
  }
  planLayout(fs, p, o, out);
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
  after = addImport(after, `import trail from 'trail-analytics/astro'${usesSemi(before) ? ';' : ''}`, eol);
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

function planEnv(fs: PlanFs, p: Project, o: PlanOptions, out: Plan) {
  const file = p.framework === 'next' ? '.env.local' : '.env';
  const before = fs.read(file);
  const eol = eolOf(before);
  const have = new Set((before ?? '').split(/\r?\n/).map((l) => /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(l)?.[1]).filter(Boolean));
  const add = ([['TRAIL_URL', o.url], ['TRAIL_SITE', o.site], ['TRAIL_CRAWL_TOKEN', o.token]] as const).filter(([k]) => !have.has(k)).map(([k, v]) => `${k}=${v}`);
  if (add.length) {
    const base = before ?? '';
    const sep = base === '' || base.endsWith('\n') ? '' : eol;
    out.changes.push({ path: file, before, after: base + sep + add.join(eol) + eol });
  }
  const gi = fs.read('.gitignore');
  if (!fs.gitIgnored(file) && !ignoredByText(gi, file)) {
    const ge = eolOf(gi);
    const base = gi ?? '';
    out.changes.push({ path: '.gitignore', before: gi, after: base + (base === '' || base.endsWith('\n') ? '' : ge) + file + ge });
  }
}

const INSTALL: Record<Project['pm'], string[]> = { pnpm: ['add'], npm: ['i'], yarn: ['add'], bun: ['add'] };

/** Everything init would do, without touching the disk. */
export function plan(p: Project, o: PlanOptions, fs: PlanFs): Plan {
  const out: Plan = { changes: [], manual: [], warnings: [] };
  if (p.framework === 'unknown') {
    out.manual.push(T.GENERIC);
    return out;
  }
  if (p.framework === 'next') planNext(fs, p, o, out);
  else planAstro(fs, p, o, out);
  planEnv(fs, p, o, out);
  if (needsInstall(p.trailDep, VERSION)) out.install = { cmd: p.pm, args: [...INSTALL[p.pm], installSpec()] };
  return out;
}
