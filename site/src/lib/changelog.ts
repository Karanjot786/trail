// Single source for the changelog page and the RSS feed.
export const changes = [
  {
    id: 'ai-visibility',
    title: 'AI visibility',
    date: '2026-11-21',
    summary:
      'An AI visibility screen with a funnel, Crawlers and Agents tabs. AI browsing agents are recognised from the script’s own requests, marked Verified or Claimed, and left out of visitor numbers unless you count them. npx trail-analytics init adds crawler capture and a first-party /t/* proxy with signed edge location to Next.js and Astro.',
  },
  {
    id: 'v2',
    title: 'Trail v2',
    date: '2026-11-20',
    summary:
      'Per-need tracker builds (t.js, t.p.js, t.x.js), batched delivery with retry, privacy modes with consent, named clicks, goals, a token read API and MCP endpoint, a public demo, and this site.',
  },
  {
    id: 'v1',
    title: 'Trail v1',
    date: '2026-11-19',
    summary: 'First release: one Go binary with SQLite, an embedded dashboard, visitor journeys and a tracker under 2 KB gzipped.',
  },
];
