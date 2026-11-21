// Settings → Data (plan F5-5): export every raw event of the current site. Import is out of scope for now.
import { Download, Table } from 'lucide-react'
import { api } from '../../api/client'
import { useSite } from '../../shell/useSite'
import { useDataMode } from '../../shell/useDataMode'
import { EmptyState } from '../../ui/states'
import { Card } from './parts'

export default function Data() {
  const { site } = useSite()
  const { mode } = useDataMode()
  if (!site) return <EmptyState title="Pick a website" body="Exports are per website. Choose one in the site switcher." />
  return (
    <Card icon={Download} title="Export your data" sub="It is your database. Take all of it, any time, in open formats.">
      <div className="form-row">
        <div className="l">
          <b>Raw events</b>
          <span>Every page view and event of {site.domain}, one JSON object per line, gzipped</span>
        </div>
        <div className="v">
          {mode === 'http' ? (
            <a className="btn" href={api.siteExportUrl(site.id)} download>
              <Download size={14} aria-hidden="true" />
              Export all events
            </a>
          ) : (
            <span className="muted">The demo is read-only. On your own server this downloads every event.</span>
          )}
        </div>
      </div>
      <div className="form-row">
        <div className="l">
          <b>Any table or panel</b>
          <span>With its range and filters</span>
        </div>
        <div className="v muted">
          <Table size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }} />
          Every panel and table exports CSV and JSON from its menu, with every row, not only the ones shown.
        </div>
      </div>
    </Card>
  )
}
