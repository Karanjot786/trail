import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'react/index': 'src/react/index.tsx', 'next/index': 'src/next/index.tsx' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: true,
  splitting: true,
  external: ['react', 'next', 'next/navigation.js'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
