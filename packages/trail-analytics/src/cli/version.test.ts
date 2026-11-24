// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { needsInstall, VERSION, installSpec } from './version';

describe('version', () => {
  it('needsInstall compares with the running version', () => {
    expect(needsInstall('^0.2.0', '0.3.0')).toBe(true);
    expect(needsInstall('^0.3.0', '0.3.0')).toBe(false);
    expect(needsInstall('workspace:*', '0.3.0')).toBe(false);
    expect(needsInstall('file:../x', '0.3.0')).toBe(false);
    expect(needsInstall('link:../x', '0.3.0')).toBe(false);
    expect(needsInstall(undefined, '0.3.0')).toBe(true);
    expect(needsInstall('^1.0.0', '0.3.0')).toBe(false);
  });
  it('installSpec derives from the package version', () => {
    expect(installSpec()).toBe(`trail-analytics@^${VERSION}`);
    expect(VERSION).toBe('0.3.0');
  });
});
