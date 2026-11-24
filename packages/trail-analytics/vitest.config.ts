import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __TRAIL_VERSION__: JSON.stringify(pkg.version) },
  test: { environment: 'jsdom', globals: true, exclude: [...configDefaults.exclude, 'test/fixtures/**'] },
});
