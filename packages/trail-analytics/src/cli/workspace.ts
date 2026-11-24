import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type PM = 'pnpm' | 'npm' | 'yarn' | 'bun';
export interface Workspace { root: string; pm: PM; pmVersion?: string; lockfile?: string; isWorkspace: boolean }

const LOCKS: [string, PM][] = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']];

const readJson = (p: string): any => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
};

/** `pnpm@9.15.9+sha512.abc` gives { pm: 'pnpm', version: '9.15.9' }. */
function parsePackageManager(v: unknown): { pm: PM; version?: string } | undefined {
  const m = /^(pnpm|npm|yarn|bun)(?:@([^+\s]+))?/.exec(typeof v === 'string' ? v : '');
  return m ? { pm: m[1] as PM, version: m[2] } : undefined;
}

/**
 * Walks up from `cwd` (stopping at the first directory with a .git entry, or the filesystem root) to find the
 * workspace root, the lockfile and the package manager the repo really uses.
 */
export function findWorkspace(cwd: string): Workspace {
  const dirs: string[] = [];
  for (let d = cwd; ; d = dirname(d)) {
    dirs.push(d);
    if (existsSync(join(d, '.git')) || dirname(d) === d) break;
  }
  const lockIn = (d: string) => LOCKS.find(([f]) => existsSync(join(d, f)));
  const wsDir = dirs.find((d) => existsSync(join(d, 'pnpm-workspace.yaml')) || Boolean(readJson(join(d, 'package.json'))?.workspaces));
  const lockDir = (wsDir && lockIn(wsDir) ? wsDir : undefined) ?? dirs.find((d) => lockIn(d));
  const root = wsDir ?? lockDir ?? cwd;
  const lock = lockDir ? lockIn(lockDir) : undefined;
  const declared = parsePackageManager(readJson(join(cwd, 'package.json'))?.packageManager) ?? parsePackageManager(readJson(join(root, 'package.json'))?.packageManager);
  return {
    root,
    pm: declared?.pm ?? lock?.[1] ?? 'npm',
    pmVersion: declared?.version,
    lockfile: lock && lockDir ? join(lockDir, lock[0]) : undefined,
    isWorkspace: Boolean(wsDir) || (lockDir !== undefined && lockDir !== cwd),
  };
}

/** The directories from `cwd` up to the workspace root, nearest first. */
export function dirsToRoot(cwd: string, root: string): string[] {
  const out = [cwd];
  for (let d = cwd; d !== root && dirname(d) !== d; ) {
    d = dirname(d);
    out.push(d);
  }
  return out;
}
