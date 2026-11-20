import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import { SITE_URL, GITHUB_URL } from './src/config.ts';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'always' },
  vite: { server: { fs: { allow: ['..'] } } },
  integrations: [
    starlight({
      title: 'Trail docs',
      description: 'Install, configure and run Trail, self-hosted web analytics that shows the whole visitor journey.',
      logo: { src: './src/assets/mark.svg', alt: 'Trail' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB_URL }],
      customCss: ['@fontsource-variable/geist', '@fontsource-variable/geist-mono', './src/styles/docs.css'],
      editLink: { baseUrl: GITHUB_URL + '/edit/main/site/' },
      lastUpdated: false,
      components: { PageTitle: './src/components/DocsTitle.astro' },
      plugins: [starlightLlmsTxt({ projectName: 'Trail', description: 'Self-hosted web analytics: a tracker under 2 KB, one Go binary, SQLite, private until the visitor says yes.' })],
      sidebar: [
        { label: 'Getting started', items: ['docs/quickstart'] },
        { label: 'Install', items: [{ autogenerate: { directory: 'docs/install' } }] },
        { label: 'Add to a site', items: [{ autogenerate: { directory: 'docs/add' } }] },
        { label: 'Tracking', items: [{ autogenerate: { directory: 'docs/tracking' } }] },
        { label: 'Dashboard', items: [{ autogenerate: { directory: 'docs/dashboard' } }] },
        { label: 'API', items: [{ autogenerate: { directory: 'docs/api' } }] },
        { label: 'Operations', items: [{ autogenerate: { directory: 'docs/operations' } }] },
        { label: 'Changelog', link: '/docs/changelog/' },
      ],
    }),
  ],
});
