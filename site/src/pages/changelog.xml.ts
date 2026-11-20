import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { changes } from '../lib/changelog';

export const GET: APIRoute = (ctx) =>
  rss({
    title: 'Trail changelog',
    description: 'What changed in each Trail release.',
    site: ctx.site!,
    items: changes.map((c) => ({ title: c.title, pubDate: new Date(c.date), description: c.summary, link: `/docs/changelog/#${c.id}` })),
  });
