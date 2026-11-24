// Single source for the changelog page and the RSS feed.
export const changes = [
  {
    id: 'unreleased',
    title: 'Unreleased',
    date: '2026-11-24',
    summary:
      'Bug-fix pass. Everyone signed in is signed out once, the server no longer sets the _t_id cookie, the tracker sends each event’s age so delayed events keep their real time, and trail-analytics 0.3.0 adds a verify command.',
  },
  {
    id: 'ai-visibility',
    title: 'AI visibility',
    date: '2026-11-21',
    summary:
      'An AI visibility screen with a funnel, Crawlers and Agents tabs. AI browsing agents are recognised from the script’s own requests, marked Verified or Claimed, and left out of visitor numbers unless you count them. npx trail-analytics init adds crawler capture and a first-party /t/* proxy with signed edge location to Next.js and Astro.',
  },
  {
    id: 'dashboard-v3',
    title: 'Dashboard v3',
    date: '2026-11-21',
    summary:
      'A new dashboard with a sidebar: Overview with what changed, Live with a globe, Acquisition, Activity, Conversions (goals and funnels), Revenue from Purchase events, and Settings with API tokens, share links and AI assistants. The whole state lives in the URL, old links redirect, and the MCP endpoint grows to 25 tools. The trail-analytics npm package is 0.2.0.',
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
