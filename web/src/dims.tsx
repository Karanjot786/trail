import { useState, type ReactNode } from 'react'
import { GlobeIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react'
import type { Dim } from './api'
import { countryName, flag } from './flags'

export const DIM_LABEL: Record<Dim, string> = {
  path: 'Page',
  route: 'Route',
  host: 'Hostname',
  referrer: 'Referrer',
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
  country: 'Country',
  device: 'Device',
  browser: 'Browser',
  os: 'OS',
  event: 'Event',
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function Favicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || !host) return <GlobeIcon className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-4 rounded-[3px] outline outline-1 -outline-offset-1 outline-white/10"
    />
  )
}

export function Flag({ code }: { code: string }) {
  return (
    <span className="w-5 text-center text-[17px] leading-none" aria-hidden>
      {flag(code)}
    </span>
  )
}

export function DeviceIcon({ device }: { device: string }) {
  const I = device === 'mobile' ? SmartphoneIcon : device === 'tablet' ? TabletIcon : MonitorIcon
  return <I className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
}

/** Human label and leading icon for a breakdown key. */
export function renderKey(dim: Dim, key: string): { label: string; icon?: ReactNode } {
  switch (dim) {
    case 'country':
      return { label: countryName(key), icon: <Flag code={key} /> }
    case 'referrer':
      return { label: key, icon: <Favicon host={key} /> }
    case 'device':
      return { label: cap(key) }
    default:
      return { label: key }
  }
}

/** Filter chip value text. */
export function filterValue(dim: Dim, value: string) {
  return dim === 'country' ? countryName(value) : dim === 'device' ? cap(value) : value
}
