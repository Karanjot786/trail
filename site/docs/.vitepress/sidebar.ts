import type { DefaultTheme } from 'vitepress'

export const sidebar: DefaultTheme.Sidebar = [
  { text: 'Getting started', items: [{ text: 'Quickstart', link: '/quickstart' }] },
  {
    text: 'Install',
    items: [
      { text: 'Docker', link: '/install/docker' },
      { text: 'Fly.io', link: '/install/fly' },
      { text: 'Binary, systemd and Caddy', link: '/install/binary' },
      { text: 'Rewrites (Vercel and others)', link: '/install/rewrites' },
    ],
  },
  {
    text: 'Add to a site',
    items: [
      { text: 'Script tag', link: '/add/script-tag' },
      { text: 'npm package', link: '/add/npm' },
      { text: 'React', link: '/add/react' },
      { text: 'Next.js', link: '/add/nextjs' },
      { text: 'Vue and Nuxt', link: '/add/vue-nuxt' },
      { text: 'SvelteKit', link: '/add/sveltekit' },
      { text: 'Astro', link: '/add/astro' },
      { text: 'Plain HTML', link: '/add/html' },
      { text: 'AI crawlers', link: '/add/ai-crawlers' },
    ],
  },
  {
    text: 'Tracking',
    items: [
      { text: 'Custom events', link: '/tracking/custom-events' },
      { text: 'Named clicks', link: '/tracking/named-clicks' },
      { text: 'Identify and journeys', link: '/tracking/identify' },
      { text: 'Privacy modes and consent', link: '/tracking/privacy' },
      { text: 'Do Not Track and GPC', link: '/tracking/dnt' },
      { text: 'Web vitals, rage clicks, forms and errors', link: '/tracking/extras' },
      { text: 'Tracker cost', link: '/tracking/cost' },
    ],
  },
  {
    text: 'Dashboard',
    items: [
      { text: 'Overview', link: '/dashboard/overview' },
      { text: 'Visitors and journeys', link: '/dashboard/visitors' },
      { text: 'Goals', link: '/dashboard/goals' },
      { text: 'AI visibility', link: '/dashboard/ai-visibility' },
      { text: 'Delivery health', link: '/dashboard/delivery' },
    ],
  },
  {
    text: 'API',
    items: [
      { text: 'Read API', link: '/api/read-api' },
      { text: 'MCP', link: '/api/mcp' },
      { text: 'Keys and tokens', link: '/api/tokens' },
    ],
  },
  {
    text: 'Operations',
    items: [
      { text: 'Configuration', link: '/operations/configuration' },
      { text: 'Backups', link: '/operations/backups' },
      { text: 'Geo database', link: '/operations/geo' },
      { text: 'Agent signature probe', link: '/operations/agent-probe' },
      { text: 'Upgrades', link: '/operations/upgrades' },
      { text: 'Troubleshooting', link: '/operations/troubleshooting' },
    ],
  },
  { text: 'Changelog', link: '/changelog' },
]
