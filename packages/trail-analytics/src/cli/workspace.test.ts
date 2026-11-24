// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dirsToRoot, findWorkspace } from './workspace';

const FIX = resolve(__dirname, '../../test/fixtures');
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'trail-ws-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('findWorkspace', () => {
  it('pnpm workspace app resolves root, pnpm and version', () => {
    const d = tmp();
    cpSync(join(FIX, 'report-crivello'), d, { recursive: true });
    const ws = findWorkspace(join(d, 'apps/web'));
    expect(ws).toEqual({ root: d, pm: 'pnpm', pmVersion: '9.15.9', lockfile: join(d, 'pnpm-lock.yaml'), isWorkspace: true });
  });

  it('npm with no lockfile', () => {
    const d = tmp();
    mkdirSync(join(d, '.git'));
    writeFileSync(join(d, 'package.json'), '{}');
    expect(findWorkspace(d)).toEqual({ root: d, pm: 'npm', pmVersion: undefined, lockfile: undefined, isWorkspace: false });
  });

  it('stops at .git', () => {
    const d = tmp();
    writeFileSync(join(d, 'pnpm-lock.yaml'), '');
    const app = join(d, 'app');
    mkdirSync(join(app, '.git'), { recursive: true });
    writeFileSync(join(app, 'package.json'), '{}');
    const ws = findWorkspace(app);
    expect(ws.lockfile).toBeUndefined();
    expect(ws.pm).toBe('npm');
    expect(ws.root).toBe(app);
  });

  it('packageManager beats lockfile', () => {
    const d = tmp();
    mkdirSync(join(d, '.git'));
    writeFileSync(join(d, 'package.json'), '{"packageManager":"yarn@4.5.0+sha224.abc"}');
    writeFileSync(join(d, 'package-lock.json'), '{}');
    expect(findWorkspace(d)).toMatchObject({ pm: 'yarn', pmVersion: '4.5.0', lockfile: join(d, 'package-lock.json') });
  });

  it('a lockfile above the app marks a workspace even without a workspaces field', () => {
    const d = tmp();
    mkdirSync(join(d, '.git'));
    writeFileSync(join(d, 'bun.lock'), '');
    mkdirSync(join(d, 'apps/x'), { recursive: true });
    expect(findWorkspace(join(d, 'apps/x'))).toMatchObject({ root: d, pm: 'bun', isWorkspace: true });
  });

  it('npm workspaces field counts', () => {
    const d = tmp();
    mkdirSync(join(d, '.git'));
    writeFileSync(join(d, 'package.json'), '{"workspaces":["apps/*"]}');
    writeFileSync(join(d, 'package-lock.json'), '{}');
    mkdirSync(join(d, 'apps/x'), { recursive: true });
    expect(findWorkspace(join(d, 'apps/x'))).toMatchObject({ root: d, pm: 'npm', isWorkspace: true });
  });
});

describe('dirsToRoot', () => {
  it('lists cwd up to the root', () => {
    expect(dirsToRoot('/a/b/c', '/a')).toEqual(['/a/b/c', '/a/b', '/a']);
    expect(dirsToRoot('/a', '/a')).toEqual(['/a']);
  });
});
