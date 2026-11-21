// Settings → Config (plan F5-5): the effective server configuration (read-only), this view as an API call, and
// appearance (theme and sidebar, stored in this browser only).
import { Keyboard, Palette, SlidersHorizontal, Terminal } from 'lucide-react'
import { api } from '../../api/client'
import { useQuery } from '../../api/useQuery'
import { useDataMode } from '../../shell/useDataMode'
import { useTheme, type Theme } from '../../shell/theme'
import { setUi, useUi } from '../../shell/uiStore'
import { viewState } from '../../state/url'
import { useUrlState } from '../../state/useUrlState'
import { Button } from '../../ui/button'
import { CodeBlock } from '../../ui/code'
import { Kbd } from '../../ui/small'
import { ErrorState, Skeleton } from '../../ui/states'
import { Segmented } from '../../ui/tabs'
import { apiCall } from './model'
import { Card, Switch } from './parts'

export default function Config() {
  const s = useUrlState()
  const { mode } = useDataMode()
  const cfg = useQuery('config', (sig) => api.config(sig), { enabled: mode === 'http', staleMs: 60_000 })
  const { theme, setTheme } = useTheme()
  const ui = useUi()
  const c = cfg.data
  const rows: [string, string, string][] = c
    ? [
        ['Version', c.version, 'build'],
        ['Time zone', c.tz, 'TRAIL_TZ'],
        ['Public demo', c.demo ? 'On, at /demo' : 'Off', 'TRAIL_DEMO'],
        ['Locations', c.geo ? 'On: country, region and city' : 'Off: no GeoIP database', 'TRAIL_GEO_DB'],
        ['Ingest limit', `${c.ingestRps} events per second`, 'TRAIL_INGEST_RPS'],
        ['Sites from env', c.envSites.length ? c.envSites.join(', ') : 'None', 'TRAIL_SITES'],
        ['Tokens from env', String(c.envTokens), 'TRAIL_API_TOKENS'],
        ['Database file', c.dbFile, 'TRAIL_DB'],
      ]
    : []

  return (
    <>
      <Card icon={SlidersHorizontal} title="Effective configuration" sub="What this server runs with, and where each value comes from. Secrets are never shown.">
        {mode === 'fixtures' ? (
          <div className="scard-b muted">The demo shows recorded data, so there is no server configuration to read.</div>
        ) : cfg.error && !c ? (
          <ErrorState onRetry={cfg.refetch} />
        ) : !c ? (
          <div className="scard-b">
            <Skeleton height={120} />
          </div>
        ) : (
          rows.map(([k, v, src]) => (
            <div key={k} className="form-row">
              <div className="l">
                <b>{k}</b>
                <span className="mono">{src}</span>
              </div>
              <div className="v mono">{v}</div>
            </div>
          ))
        )}
      </Card>
      <Card icon={Terminal} title="Copy this view as an API call" sub="The same numbers as Overview, as JSON. Site, range, comparison and filters come from the current view.">
        <div className="scard-b">
          <p className="set-where" style={{ marginTop: 0 }}>
            <code className="inl">$TRAIL_TOKEN</code> is a read token from API tokens: run <code className="inl">export TRAIL_TOKEN=trl_…</code> first.
          </p>
          <CodeBlock code={apiCall(location.origin, viewState(s))} />
        </div>
      </Card>
      <Card icon={Palette} title="Appearance" sub="Stored in this browser only.">
        <div className="form-row">
          <div className="l">
            <b>Theme</b>
            <span>Dark is the default. Also T</span>
          </div>
          <div>
            <Segmented
              value={theme}
              onValueChange={(v) => setTheme(v as Theme)}
              items={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
              ariaLabel="Theme"
            />
          </div>
        </div>
        <div className="form-row">
          <div className="l">
            <b>Sidebar</b>
            <span>Also [</span>
          </div>
          <div className="set-acts">
            <Switch checked={ui.collapsed} onChange={(v) => setUi({ collapsed: v })} label="Collapse the sidebar" />
            <span className="muted">Collapsed</span>
          </div>
        </div>
        <div className="form-row">
          <div className="l">
            <b>Motion</b>
            <span>Follows your system setting</span>
          </div>
          <div className="v muted">Turn on “reduce motion” in your system and Trail fades instead of sliding, and nothing loops.</div>
        </div>
      </Card>
      <Card
        icon={Keyboard}
        title="Keyboard"
        sub="Everything works without a mouse."
        actions={
          <Button size="sm" onClick={() => setUi({ shortcuts: { instant: false } })}>
            <Kbd>?</Kbd> All shortcuts
          </Button>
        }
      >
        <div className="scard-b muted">
          <Kbd>⌘ K</Kbd> search and jump · <Kbd>F</Kbd> add a filter · <Kbd>Shift X</Kbd> clear filters · <Kbd>Esc</Kbd> close · <Kbd>G O</Kbd> go to Overview
        </div>
      </Card>
    </>
  )
}
