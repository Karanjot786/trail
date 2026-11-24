import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Project {
  cwd: string;
  framework: 'next' | 'astro' | 'unknown';
  nextMajor?: number;
  router?: 'app' | 'pages';
  srcDir: boolean;
  ext: 'ts' | 'js';
  astroOutput?: 'static' | 'server';
  pm: 'pnpm' | 'npm' | 'yarn' | 'bun';
  /** An existing proxy/middleware file (relative path). */
  hookFile?: string;
  /** The trail-analytics range in package.json, if any. */
  trailDep?: string;
}

const readJson = (p: string): any => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
};
const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const major = (v: unknown) => {
  const m = /(\d+)/.exec(typeof v === 'string' ? v : '');
  return m ? Number(m[1]) : undefined;
};

/** The locked Next.js major from package-lock.json, pnpm-lock.yaml or yarn.lock in `dir`. */
export function lockedNextMajor(dir: string): number | undefined {
  const read = (f: string) => {
    try {
      return readFileSync(join(dir, f), 'utf8');
    } catch {
      return undefined;
    }
  };
  const pl = read('package-lock.json');
  if (pl) {
    try {
      const m = major(JSON.parse(pl)?.packages?.['node_modules/next']?.version);
      if (m) return m;
    } catch {
      /* fall through */
    }
  }
  const pn = read('pnpm-lock.yaml');
  if (pn) {
    const m = /^\s+next@(\d+)\./m.exec(pn) ?? /next@(\d+)\./.exec(pn);
    if (m) return Number(m[1]);
  }
  const yl = read('yarn.lock');
  if (yl) {
    const m = /^"?next@[^\n]*:\r?\n\s+version:? "?(\d+)/m.exec(yl);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function detect(cwd: string): Project {
  const pkg = readJson(join(cwd, 'package.json')) ?? {};
  const deps = { ...pkg.devDependencies, ...pkg.dependencies } as Record<string, string>;
  const pm: Project['pm'] = existsSync(join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : existsSync(join(cwd, 'yarn.lock'))
      ? 'yarn'
      : existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))
        ? 'bun'
        : 'npm';
  const ext: Project['ext'] = existsSync(join(cwd, 'tsconfig.json')) ? 'ts' : 'js';
  const base = { cwd, pm, ext, trailDep: deps['trail-analytics'] };

  if (deps.next) {
    const nextMajor = major(readJson(join(cwd, 'node_modules/next/package.json'))?.version) ?? lockedNextMajor(cwd) ?? major(deps.next);
    const rootApp = isDir(join(cwd, 'app')) || isDir(join(cwd, 'pages'));
    const srcDir = !rootApp && (isDir(join(cwd, 'src/app')) || isDir(join(cwd, 'src/pages')));
    const at = srcDir ? 'src/' : '';
    const router = isDir(join(cwd, at + 'app')) ? 'app' : isDir(join(cwd, at + 'pages')) ? 'pages' : undefined;
    let hookFile: string | undefined;
    for (const n of ['proxy', 'middleware']) for (const e of ['ts', 'js', 'mjs', 'tsx', 'jsx']) if (!hookFile && existsSync(join(cwd, `${at}${n}.${e}`))) hookFile = `${at}${n}.${e}`;
    return { ...base, framework: 'next', nextMajor, router, srcDir, hookFile };
  }
  if (deps.astro) {
    const cfg = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts'].find((f) => existsSync(join(cwd, f)));
    const text = cfg ? readFileSync(join(cwd, cfg), 'utf8') : '';
    const astroOutput = /output\s*:\s*['"`]server['"`]/.test(text) ? 'server' : 'static';
    return { ...base, framework: 'astro', srcDir: true, astroOutput };
  }
  return { ...base, framework: 'unknown', srcDir: false };
}
