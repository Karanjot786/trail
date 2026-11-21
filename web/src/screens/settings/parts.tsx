// Settings building blocks: the section rail, a titled card and a labelled switch.
import { useId, type ComponentType, type ReactNode } from 'react'
import { Download, Globe, KeyRound, Link2, Plug, SlidersHorizontal, Terminal } from 'lucide-react'
import { RouteLink } from '../../shell/RouteLink'
import './settings.css'

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>

export const SECTIONS: { tab: string; label: string; icon: Icon }[] = [
  { tab: 'sites', label: 'Websites', icon: Globe },
  { tab: 'install', label: 'Install', icon: Terminal },
  { tab: 'assistants', label: 'AI assistants', icon: Plug },
  { tab: 'tokens', label: 'API tokens', icon: KeyRound },
  { tab: 'sharing', label: 'Sharing', icon: Link2 },
  { tab: 'data', label: 'Data', icon: Download },
  { tab: 'config', label: 'Config and appearance', icon: SlidersHorizontal },
]

export function SettingsRail({ tab }: { tab: string }) {
  return (
    <nav className="set-rail" aria-label="Settings sections">
      <div className="nav-label">Workspace</div>
      {SECTIONS.map(({ tab: t, label, icon: I }) => (
        <RouteLink key={t} patch={{ screen: 'settings', tab: t, id: null, sheet: null }} aria-current={t === tab ? 'page' : undefined}>
          <I size={15} aria-hidden="true" />
          {label}
        </RouteLink>
      ))}
    </nav>
  )
}

export function Card({ icon: I, title, sub, actions, children }: { icon: Icon; title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section className="scard" aria-labelledby={id}>
      <div className="scard-h">
        <span className="ic" aria-hidden="true">
          <I size={16} aria-hidden="true" />
        </span>
        <span className="tt">
          <h2 id={id}>{title}</h2>
          {sub && <span>{sub}</span>}
        </span>
        {actions && <span className="acts">{actions}</span>}
      </div>
      {children}
    </section>
  )
}

/** A switch labelled for its ON state. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" className="set-switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
}

export const fmtDate = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never'

export function ago(ms: number | null, now = Date.now()): string {
  if (ms == null) return 'never'
  const s = Math.max(0, Math.floor((now - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
