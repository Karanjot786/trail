import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Change } from './diff';

export function writeChanges(cwd: string, changes: Change[]): void {
  for (const c of changes) {
    const p = join(cwd, c.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c.after);
  }
}

/** .cmd shims (npm.cmd, pnpm.cmd) need a shell on Windows since the 2024 Node security release. The args are fixed strings, never user input. */
export function spawnOptions(platform: NodeJS.Platform): { shell: boolean } {
  return { shell: platform === 'win32' };
}

/** The globally installed version of a package manager, or undefined. */
export function globalPmVersion(pm: string): string | undefined {
  try {
    const r = spawnSync(pm, ['--version'], { encoding: 'utf8', timeout: 10_000, ...spawnOptions(process.platform) });
    return r.status === 0 ? r.stdout.trim().split(/\s+/)[0] || undefined : undefined;
  } catch {
    return undefined;
  }
}

export function spawn(cmd: string, args: string[], opts: { cwd: string; shell: boolean }): Promise<number> {
  return new Promise((ok) => {
    const child = nodeSpawn(cmd, args, { ...opts, stdio: 'inherit' });
    child.on('error', () => ok(127));
    child.on('close', (code) => ok(code ?? 1));
  });
}

export function gitIgnored(cwd: string): (rel: string) => boolean {
  return (rel) => {
    try {
      return spawnSync('git', ['check-ignore', '-q', rel], { cwd, stdio: 'ignore', shell: false }).status === 0;
    } catch {
      return false;
    }
  };
}

/** `git ls-files --error-unmatch -- rel` exits 0: the file is tracked. */
export function gitTracked(cwd: string): (rel: string) => boolean {
  return (rel) => {
    try {
      return spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd, stdio: 'ignore', shell: false }).status === 0;
    } catch {
      return false;
    }
  };
}
