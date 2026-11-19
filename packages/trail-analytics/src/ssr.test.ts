// @vitest-environment node
import { expect, it } from 'vitest';
import { identify, inject, pageview, reset, track } from './index';

it('is a no-op on the server', () => {
  expect(typeof window).toBe('undefined');
  expect(() => {
    inject({ site: 's' });
    track('x');
    identify('u');
    reset();
    pageview();
  }).not.toThrow();
});
