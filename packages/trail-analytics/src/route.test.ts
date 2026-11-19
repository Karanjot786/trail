import { describe, expect, it } from 'vitest';
import { computeRoute } from './route';

describe('computeRoute', () => {
  it('returns the path without params', () => {
    expect(computeRoute('/about', {})).toBe('/about');
    expect(computeRoute('/about', null)).toBe('/about');
    expect(computeRoute(null, { a: 'b' })).toBeNull();
  });
  it('replaces a dynamic segment', () => {
    expect(computeRoute('/blog/hello', { slug: 'hello' })).toBe('/blog/[slug]');
  });
  it('replaces several segments', () => {
    expect(computeRoute('/u/42/post/7', { id: '42', pid: '7' })).toBe('/u/[id]/post/[pid]');
  });
  it('replaces catch-all segments', () => {
    expect(computeRoute('/docs/a/b/c', { path: ['a', 'b', 'c'] })).toBe('/docs/[...path]');
  });
  it('only matches whole segments', () => {
    expect(computeRoute('/a/ab', { x: 'a' })).toBe('/[x]/ab');
  });
  it('escapes regex characters in values', () => {
    expect(computeRoute('/f/a.b', { name: 'a.b' })).toBe('/f/[name]');
    expect(computeRoute('/f/axb', { name: 'a.b' })).toBe('/f/axb');
  });
});
