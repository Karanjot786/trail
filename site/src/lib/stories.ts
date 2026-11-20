// Visitor stories for the hero demo. Shared by the server-rendered poster and the client loop.
export type Step =
  | { k: 'src'; t: string }
  | { k: 'page'; t: string; time: string; scroll: string }
  | { k: 'event'; t: string }
  | { k: 'id'; t: string }
  | { k: 'left' };

export type Story = {
  anon: string;
  name: string;
  place: string;
  source: string;
  at: string;
  steps: Step[];
  // An earlier visit by the same person, shown below today's.
  prev: { day: string; wd: string; at: string; steps: Step[] };
};

export const stories: Story[] = [
  {
    anon: 'Visitor 8c1e',
    name: 'ana_k',
    place: 'Lisbon, PT',
    source: 'github.com',
    at: '14:02',
    steps: [
      { k: 'src', t: 'github.com' },
      { k: 'page', t: '/', time: '12s', scroll: '64%' },
      { k: 'page', t: '/pricing', time: '41s', scroll: '90%' },
      { k: 'page', t: '/docs/install', time: '1m 08s', scroll: '77%' },
      { k: 'event', t: 'Signup' },
      { k: 'id', t: 'identified' },
      { k: 'left' },
    ],
    prev: { day: 'Nov 17', wd: 'Mon', at: '09:41', steps: [{ k: 'src', t: 'google.com' }, { k: 'page', t: '/blog/self-hosting', time: '3m 02s', scroll: '96%' }, { k: 'left' }] },
  },
  {
    anon: 'Visitor 31d7',
    name: 'dev_rahul',
    place: 'Pune, IN',
    source: 'google.com',
    at: '14:06',
    steps: [
      { k: 'src', t: 'google.com' },
      { k: 'page', t: '/blog/sqlite-backups', time: '2m 14s', scroll: '100%' },
      { k: 'page', t: '/pricing', time: '19s', scroll: '58%' },
      { k: 'event', t: 'Start trial' },
      { k: 'id', t: 'identified' },
      { k: 'left' },
    ],
    prev: { day: 'Nov 12', wd: 'Wed', at: '21:15', steps: [{ k: 'src', t: 't.co' }, { k: 'page', t: '/', time: '27s', scroll: '55%' }, { k: 'left' }] },
  },
  {
    anon: 'Visitor e40b',
    name: 'mia.s',
    place: 'Austin, US',
    source: 'news.ycombinator.com',
    at: '14:11',
    steps: [
      { k: 'src', t: 'news.ycombinator.com' },
      { k: 'page', t: '/', time: '33s', scroll: '81%' },
      { k: 'page', t: '/docs', time: '1m 51s', scroll: '72%' },
      { k: 'event', t: 'Copy snippet' },
      { k: 'id', t: 'identified' },
      { k: 'left' },
    ],
    prev: { day: 'Nov 18', wd: 'Tue', at: '17:30', steps: [{ k: 'src', t: 'direct' }, { k: 'page', t: '/changelog', time: '48s', scroll: '88%' }, { k: 'left' }] },
  },
];

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  src: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  event: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  id: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>'),
  left: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function stepHTML(s: Step): string {
  if (s.k === 'page')
    return `<span class="chip c-page"><b>${esc(s.t)}</b><i>${s.time}</i><i>↓${s.scroll}</i></span>`;
  if (s.k === 'left') return `<span class="chip c-left">${icons.left}left</span>`;
  return `<span class="chip c-${s.k}">${icons[s.k]}${esc(s.t)}</span>`;
}

export const LINK = '<span class="link" aria-hidden="true"><i></i><i></i><i></i></span>';

export const journeyHTML = (steps: Step[]) => steps.map((s, i) => (i ? LINK : '') + stepHTML(s)).join('');
