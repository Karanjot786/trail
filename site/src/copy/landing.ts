// Landing copy, one export per section. Transcribed from the approved prototype
// (docs/design/prototype-blue-ground: index.html, main.js SAY/VIS/ROWS/NOTE) with the plan's deltas applied.
// Strings may hold inline <code> and <b>; components render them with set:html (authored content, not user input).
// Client scripts import only their own section's export, so the other strings stay out of the JS.
// No imports here: the docs theme and client bundles import this file, and src/config.ts reads process.env.
// Measured numbers (tracker sizes, bench timings) are NOT here: they come from src/lib/numbers.ts at build time.

type Html = string

// Facts the build cannot measure in CI. Each has its source.
export const facts = {
  binaryMB: '14 MB', // `trail` binary, 14,270,498 B (owner, 2026-11-20)
  serverRamMB: '30 MB', // about 30 MB resident while running (owner); the label says "about"
  mcpTools: 7, // internal/mcp tool list: list_sites ... goal_report
  cookiesBeforeConsent: 0, // default mode writes nothing until trail.consent(true)
  requestsPerPageview: 2, // tracker/bench/last.json results['t.js'].requests.median
} as const

export const meta = {
  title: 'Trail: follow every visitor from first click to signup',
  description:
    "Self-hosted web analytics that shows each visitor's whole journey. Private until they say yes. One binary on your server. MIT licensed.",
}

export const hero = {
  h1: 'Follow every visitor from first click to signup.',
  lede: "The smallest tracker that still shows each visitor's whole path. Private until they say yes. One binary on your server.",
  ctaPrimary: 'Try the live demo', // href is DEMO_URL
  ctaSecondary: { text: 'Self-host in 2 minutes', href: '#self-host' },
  // `size` cells take their value from numbers.ts `sizes`; the cell is dropped when the size is missing.
  nums: [
    { dt: 'private tracker, gzipped', size: 'private' },
    { dt: 'one server binary', dd: facts.binaryMB },
    { dt: 'cookies before consent', dd: String(facts.cookiesBeforeConsent) },
  ] as { dt: string; dd?: string; size?: 'private' | 'full' }[],
  legend: {
    title: 'The route above is real',
    sub: 'user_986, first visit, Nov 2',
    keys: ['footsteps: engaged time', 'waypoint: page, time, scroll', 'goal reached: Signup'],
  },
}

export const how = {
  h2: 'Three steps from script tag to signup.',
  lede: 'Paste one line. Watch the first visitor arrive. Name the moment that matters.',
  steps: [
    { wp: 'Install', h3: 'One script tag, checked live.', p: 'Paste the snippet. The Install panel turns green when the first event lands.' },
    { wp: 'Track', h3: 'Events arrive as they happen.', p: 'Pages, read time, outbound clicks and identify, in the order the visitor made them.' },
    { wp: 'Understand', h3: 'Mark what matters.', p: 'A goal is a page or an event. Trail counts who reached it and their share of everyone.' },
  ] as { wp: 'Install' | 'Track' | 'Understand'; h3: string; p: string }[],
  install: {
    bar: ['Settings', 'example.com', 'mysite'],
    waiting: 'Waiting for the first event…',
    ok: 'Receiving data · last event 4s ago', // final state; flow.ts counts "just now", 1s … 4s
    okNow: 'Receiving data · last event just now',
    tabs: ['Script tag', 'npm', 'Next.js'],
    file: 'index.html',
    snippet: '<script defer src="https://stats.example.com/_t/t.js" data-site="mysite" data-api="https://stats.example.com/_t/e"></script>',
  },
  feed: [
    { time: '23:50:04', kind: 'src', text: 'google.com' },
    { time: '23:51:10', kind: 'page', text: '/docs/components', t: '1m40s' },
    { time: '23:52:51', kind: 'out', text: 'github.com' },
    { time: '23:53:30', kind: 'id', text: 'identified user_986' },
    { time: '23:53:31', kind: 'ev', text: 'Signup' },
    { time: '23:54:02', kind: 'left', text: 'left' },
  ] as { time: string; kind: 'src' | 'page' | 'out' | 'id' | 'ev' | 'left'; text: string; t?: string }[],
  feedBar: { online: '1', site: 'mysite' },
  goalsHead: { tab: 'Goals', cols: ['Visitors', 'Rate'], reached: 'Goal reached', add: 'Add goal' },
  goals: [
    { name: 'Signup', visitors: 353, rate: 39.5, w: '100%' },
    { name: 'Pricing page', visitors: 284, rate: 31.8, w: '80%' },
    { name: 'Copy Code', visitors: 78, rate: 8.7, w: '22%' },
    { name: 'Docs feedback', visitors: 31, rate: 3.5, w: '9%' },
  ],
}

export const journey = {
  h2: 'One visitor. Four visits. One signup.',
  lede: 'Every visit on one sheet: where they came from, each page in order, how long they read and when they signed up.',
  sheetTitle: 'Sheet 1. user_986',
  legend: [
    ['Visits', '4 over 3 days'],
    ['Source', 'google.com, each time'],
    ['Longest read', '/docs/installation, 1m58s'],
    ['Goal', 'Signup, on visit 1'],
  ] as [string, string][],
  keys: ['footsteps: engaged time', 'waypoint: one page', 'goal reached'],
  top: { back: 'Visitors', badge: 'identified', meta: '4 visits over 3 days' },
  note: "Recreated in HTML from the dashboard's Visitors tab.",
}

// Bento panel contents (the mock journey rows, live list, origins …) stay in Bento.astro's markup.
export const bento = {
  h2: 'Everything you need to read a visit. Nothing that follows people around the web.',
  cards: [
    { id: 'hero', lbl: 'Journeys', h3: 'Every visit, one path.', p: 'Each page in order, with read time and scroll depth. <code>identify</code> joins the visits into one person.' },
    { id: 'live', lbl: 'Live visitors', h3: 'Who is here right now.', p: 'Anyone active in the last five minutes.' },
    { id: 'goals', lbl: 'Goals', h3: 'Count what matters.', p: 'A page or an event, with its rate against last period.' },
    { id: 'nc', lbl: 'Named clicks', h3: 'Name a click in HTML.', p: 'Add <code>data-trail</code> to any element. No JavaScript.', note: 'Works after consent or in full mode.' },
    { id: 'origin', lbl: 'Origin check', h3: 'Only your sites can send.', p: 'Events from any other origin get a 403.' },
    { id: 'dh', lbl: 'Delivery health', h3: 'Know your events arrive.', p: 'Failed sends retry up to five times.' },
  ] as { id: 'hero' | 'live' | 'goals' | 'nc' | 'origin' | 'dh'; lbl: string; h3: string; p: Html; note?: string }[],
}

type Mode = 'consent' | 'private' | 'full'
type RowKey = 'consent' | 'consentYes' | 'private' | 'full'
export const privacy = {
  h2: 'Three modes. You choose what the browser keeps.',
  lede: "Pick a mode. On the left, what Trail writes in the visitor's browser. On the right, what you can see.",
  modes: {
    consent: { tab: 'Private until consent', say: 'Nothing is stored in the browser until you call <code>trail.consent(true)</code>. Until then, visits are counted but not joined.', attr: 'no data-mode' },
    private: { tab: 'Private', say: 'Nothing is ever stored in the browser. One day of visits is joined by a daily key that rotates at midnight.', attr: 'data-mode="private"' },
    full: { tab: 'Full', say: 'A first-party <code>_t_id</code> cookie and localStorage entry join every visit. <code>identify</code> joins devices too.', attr: 'data-mode="full"' },
  } as Record<Mode, { tab: string; say: Html; attr: string }>,
  defaultBadge: 'default',
  // [day, time, device icon, path]
  visits: [
    ['Nov 2', '23:50', 'laptop', '/docs/components'],
    ['Nov 12', '11:30', 'phone', '/docs/installation'],
    ['Nov 19', '20:21', 'laptop', '/docs/components/data-story'],
  ] as [string, string, 'laptop' | 'phone', string][],
  // [who, sub, joined to the previous visit?]
  rows: {
    consent: [['Anonymous', 'not followed'], ['Anonymous', 'not followed'], ['Anonymous', 'not followed']],
    consentYes: [['Anonymous', 'not followed'], ['Visitor 8f3c', 'consent given', true], ['Visitor 8f3c', 'same visitor', true]],
    private: [['Visitor 3f2a', 'new id that day'], ['Visitor 9c1d', 'new id that day'], ['Visitor 71be', 'new id that day']],
    full: [['user_986', 'identified', true], ['user_986', 'same person', true], ['user_986', 'same person', true]],
  } as Record<RowKey, [string, string, boolean?][]>,
  notes: {
    consent: 'Three visits, three strangers. Accept analytics on the left to see what changes.',
    consentYes: 'Joined from consent onwards. The visit before it stays anonymous.',
    private: 'Each day starts a new visitor, so a journey ends at midnight.',
    full: 'One journey across visits and devices.',
  } as Record<RowKey, string>,
  browser: {
    caption: "In the visitor's browser",
    url: 'example.com/docs',
    ask: 'Can we remember you between visits?',
    accept: 'Accept analytics',
    given: 'Called <code>trail.consent(true)</code>',
    reset: 'Reset',
    tabs: ['Elements', 'Console', 'Network', 'Application'],
    storage: ['Storage', 'Local storage', 'Cookies', 'https://example.com'],
    cookieCols: ['Name', 'Value', 'Expires'],
    lsCols: ['Key', 'Value'],
    id: ['_t_id', '8f3c1e…a21d', '1 year'],
    noCookies: 'No cookies',
    noItems: 'No items',
  },
  dash: { caption: 'In your dashboard', title: 'Visitors', sub: 'The same person, three visits' },
  foot: [
    '<code>trail.consent(false)</code> wipes the ids and stops sending.',
    'Do Not Track and GPC mean nothing is sent.',
    'Raw IPs never touch the disk.',
  ] as Html[],
}

export const numbers = {
  h2: 'Measured, not promised.',
  // Timings come from tracker/bench/last.json. Without that file the page shows sizes only and uses ledeNoBench.
  ledeTemplate: 'Sizes are gzip level 9. Timings are the median of {runs} runs in headless Chromium, minus the same page with no tracker.',
  ledeNoBench: 'Sizes are gzip level 9.',
  labels: {
    private: 'private tracker, <code>t.p.js</code>',
    full: 'standard tracker, <code>t.js</code>',
    script: 'script time at load, <code>t.js</code>',
    heap: 'memory added to the page',
    requests: 'requests per pageview',
    binary: 'server binary, dashboard included',
    ram: 'server memory in use, about',
    cookies: 'cookies before consent',
  },
  foot: 'Every tracker file must stay at or under 2,048 B. CI fails the build otherwise.',
  footLink: { text: 'Read how we measure', href: '/docs/tracking/cost' },
}

export const selfhost = {
  h2: 'Your server, one file of data.',
  lede: 'A static Go binary with the dashboard inside. SQLite runs in the same process, so there is nothing else to install.',
  termTitle: 'server: ~',
  skip: 'Skip',
  // One HTML string per terminal line (.tl). Lines 0, 1 and 3 are typed.
  term: [
    '<span class="pr">$</span> docker run -d -p 8080:8080 -v trail-data:/data \\',
    '    -e TRAIL_PASSWORD=… -e TRAIL_SITES=mysite=example.com trail',
    '3f9c2a1e8b7d41c6a0e5d2b9', // rendered with .dim
    '<span class="pr">$</span> docker logs 3f9c',
    '<span class="dim">2026/11/20 09:14:02</span> <span class="hi">trail listening on :8080</span> <span class="dim">(sites: 1, api tokens: 0)</span>',
    '<span class="pr">$</span> <span class="caret"></span>',
  ] as Html[],
  upcard: { url: 'localhost:8080', site: 'mysite', up: 'Up', kpis: [['Visitors', '0'], ['Page views', '0']], waiting: 'Waiting for the first event…' },
  deployLabel: 'Deploy with',
  deployTabs: { docker: 'Docker', fly: 'Fly', bin: 'Binary' },
  deploy: {
    docker: `docker build -t trail .
docker run -d -p 8080:8080 -v trail-data:/data \\
  -e TRAIL_PASSWORD=change-me \\
  -e TRAIL_SITES=mysite=example.com \\
  trail`,
    fly: `cp fly.toml.example fly.toml   # set app
fly launch --no-deploy --copy-config
fly volumes create trail_data --size 1
fly secrets set TRAIL_PASSWORD=change-me \\
  TRAIL_SITES=mysite=example.com
fly deploy`,
    bin: `make build   # tracker, dashboard, ./trail
TRAIL_PASSWORD=change-me \\
TRAIL_SITES=mysite=example.com \\
./trail`,
  },
  shnums: [
    { dt: 'binary, dashboard inside', dd: facts.binaryMB },
    { dt: 'memory while running, about', dd: facts.serverRamMB },
    { dt: 'other services to run', dd: '0' },
  ],
  finder: {
    title: 'data',
    cols: ['Name', 'Size', 'Kind'],
    rows: [
      { name: 'trail.db', size: '48.2 MB', kind: 'SQLite database' },
      { name: 'trail.db-wal', size: '4.1 MB', kind: 'Write-ahead log', dim: true },
      { name: 'trail.db-shm', size: '32 KB', kind: 'Shared memory', dim: true },
    ] as { name: string; size: string; kind: string; dim?: true }[],
    status: '3 items, 52.3 MB',
    note: "The -wal and -shm files are SQLite's working files while Trail runs.",
  },
  db: {
    h3: 'Your data is one file.',
    p: 'Every event, goal and site lives in <code>trail.db</code>. Back it up with <code>.backup</code> while Trail runs. Stop Trail and copy it to move servers.',
    backupTitle: 'backup',
    backup: 'sqlite3 trail.db ".backup backup.db"',
  },
}

export const mcp = {
  h2: 'Ask your AI where signups come from.',
  lede: 'Trail serves MCP at <code>/mcp</code>. Add it to Claude Code once, then ask in plain words.',
  cmdTitle: 'terminal',
  cmd: `claude mcp add --transport http trail \\
  https://stats.example.com/mcp \\
  --header "Authorization: Bearer <read-token>"`,
  cmdCopy: 'claude mcp add --transport http trail https://stats.example.com/mcp --header "Authorization: Bearer <read-token>"',
  toolsLabel: `${facts.mcpTools} tools`,
  tools: ['list_sites', 'get_stats', 'get_series', 'get_breakdown', 'list_visitors', 'get_journey', 'goal_report'],
  trust: '<b>Read-only token.</b> The tools read your stats. They cannot change goals, sites or settings.',
  window: { title: '~/mysite', sample: 'Sample conversation' },
  question: 'Which pages brought signups this week?',
  call: { name: 'goal_report', args: '{site: "mysite", range: "7d"}', toggle: 'Result' },
  json: `[
  { "name": "Signup", "kind": "event",
    "visitors": 39, "rate": 0.044,
    "prev": { "visitors": 30, "rate": 0.036 } },
  { "name": "Install docs", "kind": "page",
    "match": "/docs/installation",
    "visitors": 212, "rate": 0.237,
    "prev": { "visitors": 154, "rate": 0.172 } },
  { "name": "Pricing page", "kind": "page",
    "match": "/pricing",
    "visitors": 96, "rate": 0.107,
    "prev": { "visitors": 101, "rate": 0.118 } }
]`,
  a1: '<b>39 people signed up this week</b>, up from 30. Here are your page goals over the same week:',
  tableHead: ['Page', 'Visitors', 'Last week'],
  // [page, visitors, last week, change]
  table: [
    ['/docs/installation', '212', '154', '+38%'],
    ['/pricing', '96', '101', '−5%'],
  ] as [string, string, string, string][],
  a2: "<code>goal_report</code> counts each goal on its own, so it can't tell which page came before a signup. Want me to read the signups' journeys with <code>get_journey</code> and check the last page before each one?",
}

export const faq = {
  h2: 'Questions',
  items: [
    { q: 'Do I need a cookie banner for Trail?', a: 'In the default mode the tracker writes nothing to the browser until you call <code>trail.consent(true)</code> or <code>trail.identify()</code>. Until then it stores no cookie and no localStorage. Whether your site needs a banner for other reasons is a question for your own legal advice.' },
    { q: 'Will ad blockers stop it?', a: 'Serve the tracker and its endpoint from your own domain with a <code>/_t/*</code> rewrite. The browser then sees a first-party script and a first-party request.' },
    { q: 'What do I need to run it?', a: 'One machine that can run a static Go binary, or Docker. The database is SQLite inside the same process, so there is nothing else to install or keep running.' },
    { q: 'How do I back up or move my data?', a: 'All data is one SQLite file. Snapshot it with <code>sqlite3 .backup</code> on a schedule, and copy the file to move to a new server.' },
    { q: 'Can one server track several sites?', a: 'Yes. List them in <code>TRAIL_SITES</code> as <code>id=domain</code> pairs, or add them in Settings, and switch between them in the dashboard.' },
    { q: 'What does it cost?', a: 'Nothing. Trail is MIT licensed and there is no hosted plan or paid tier. You pay only for the server you run it on.' },
  ] as { q: string; a: Html }[],
}

export const cta = {
  h2: 'Walk one real journey in the demo.',
  p: 'Read-only, with generated data. No sign-up.',
  button: 'Try the live demo', // href is DEMO_URL
  term: 'docker run -d -p 8080:8080 -v trail-data:/data trail',
}

// Literal URLs: these equal GITHUB_URL / NPM_URL in src/config.ts, which can't be imported here (it reads process.env).
const GH = 'https://github.com/karanjot786/trail'
export const footer = {
  links: [
    { text: 'Docs', href: '/docs/quickstart' },
    { text: 'GitHub', href: GH },
    { text: 'npm', href: 'https://www.npmjs.com/package/trail-analytics' },
    { text: 'Changelog', href: '/docs/changelog' },
    { text: 'MIT License', href: GH + '/blob/main/LICENSE' },
  ],
  meta: 'MIT · Open source · Self-hosted', // owner: no version number
  repoLabel: 'karanjot786/trail',
}
