// The route registry (plan §0.8, Task P0-4): every screen in IA order, lazily loaded. Frozen after P0.
import type { ComponentType } from 'react'
import type { ScreenId } from './state/url'

export interface ScreenRoute {
  id: ScreenId
  label: string
  path: string
  tabs?: { value: string; label: string }[]
  load: () => Promise<{ default: ComponentType }>
  requires?: 'revenue'
}

export const SCREENS: ScreenRoute[] = [
  { id: 'overview', label: 'Overview', path: '/', load: () => import('./screens/overview/index') },
  { id: 'live', label: 'Live', path: '/live', load: () => import('./screens/live/index') },
  {
    id: 'acquisition',
    label: 'Acquisition',
    path: '/acquisition',
    tabs: [
      { value: 'sources', label: 'Sources' },
      { value: 'ai', label: 'AI referrals' },
      { value: 'campaigns', label: 'Campaigns' },
      { value: 'landing', label: 'Landing pages' },
    ],
    load: () => import('./screens/acquisition/index'),
  },
  {
    id: 'activity',
    label: 'Activity',
    path: '/activity',
    tabs: [
      { value: 'visitors', label: 'Visitors' },
      { value: 'sessions', label: 'Sessions' },
      { value: 'events', label: 'Events' },
      { value: 'paths', label: 'Paths' },
    ],
    load: () => import('./screens/activity/index'),
  },
  {
    id: 'conversions',
    label: 'Conversions',
    path: '/conversions',
    tabs: [
      { value: 'goals', label: 'Goals' },
      { value: 'funnels', label: 'Funnels' },
    ],
    load: () => import('./screens/conversions/index'),
  },
  { id: 'revenue', label: 'Revenue', path: '/revenue', load: () => import('./screens/revenue/index'), requires: 'revenue' },
  {
    id: 'crawlers',
    label: 'AI visibility',
    path: '/ai',
    tabs: [
      { value: 'funnel', label: 'Funnel' },
      { value: 'crawlers', label: 'Crawlers' },
      { value: 'agents', label: 'Agents' },
    ],
    load: () => import('./screens/crawlers/index'),
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    tabs: [
      { value: 'sites', label: 'Websites' },
      { value: 'install', label: 'Install' },
      { value: 'assistants', label: 'AI assistants' },
      { value: 'tokens', label: 'API tokens' },
      { value: 'sharing', label: 'Sharing' },
      { value: 'data', label: 'Data' },
      { value: 'config', label: 'Config' },
    ],
    load: () => import('./screens/settings/index'),
  },
]
