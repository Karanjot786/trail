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

export function spawn(cmd: string, args: string[], opts: { cwd: string; shell: false }): Promise<number> {
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
