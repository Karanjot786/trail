// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'http://127.0.0.1:3303',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [],
});
