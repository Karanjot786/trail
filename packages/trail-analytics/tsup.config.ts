import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'react/index': 'src/react/index.tsx',
      'next/index': 'src/next/index.tsx',
      'next/proxy/index': 'src/next/proxy.ts',
      'astro/index': 'src/astro/index.ts',
      'astro/middleware': 'src/astro/middleware.ts',
      'crawl/index': 'src/crawl/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: false,
    minify: true,
    splitting: true,
    external: ['react', 'next', 'next/navigation.js', 'next/server', 'astro'],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  },
  {
    // The init CLI: ESM for Node, run by `npx trail-analytics`. clean stays off so it never wipes the entries above.
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    dts: false,
    clean: false,
    sourcemap: false,
    minify: false,
    banner: { js: '#!/usr/bin/env node' },
    define: { __TRAIL_VERSION__: JSON.stringify(pkg.version) },
    noExternal: ['@babel/parser'],
    outExtension: () => ({ js: '.js' }),
  },
]);
