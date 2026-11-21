// Debug my install (plan F5-2): the six checks from /api/sites/{id}/check, each with status, reason code, detail and fix.
import { Check, Clock, RefreshCw, TriangleAlert, X, ListChecks } from 'lucide-react'
import type { CheckItem, InstallCheck } from '../../api/types'
import { Button } from '../../ui/button'
import { CopyButton } from '../../ui/code'
import { Skeleton } from '../../ui/states'
import { Card } from './parts'

const STATUS: Record<CheckItem['status'], { word: string; icon: typeof Check }> = {
  pass: { word: 'Passed', icon: Check },
  fail: { word: 'Failed', icon: X },
  warn: { word: 'Warning', icon: TriangleAlert },
  pending: { word: 'Pending', icon: Clock },
}

export function Checklist({ check, busy, onRerun, note }: { check: InstallCheck | undefined; busy: boolean; onRerun: () => void; note?: string }) {
  return (
    <Card
      icon={ListChecks}
      title="Debug my install"
      sub="Six checks, run from this server against your live site. Nothing is stored."
      actions={
        <Button size="sm" onClick={onRerun} disabled={busy}>
          <RefreshCw size={14} aria-hidden="true" />
          Run checks again
        </Button>
      }
    >
      <div className="scard-b">
        {!check ? (
          <Skeleton height={120} />
        ) : (
          <>
            <ul className="checklist" aria-label="Install checks" aria-busy={busy || undefined}>
              {check.checks.map((c) => {
                const S = STATUS[c.status]
                return (
                  <li key={c.id} className="ck">
                    <span className="st" data-s={c.status} aria-hidden="true">
                      <S.icon size={12} aria-hidden="true" />
                    </span>
                    <div>
                      <b>{c.label}</b>
                      <span className="sw" data-s={c.status}>
                        {S.word}
                      </span>
                      {c.code !== 'ok' && (c.status === 'fail' || c.status === 'warn') && (
                        <>
                          {' '}
                          <code className="inl">{c.code}</code>
                        </>
                      )}
                      {c.detail && <p>{c.detail}</p>}
                      {c.fix && c.status !== 'pass' && <p className="fix">{c.fix}</p>}
                    </div>
                    {c.fix && c.status === 'fail' ? <CopyButton text={c.fix} label={`Copy the fix for ${c.label}`} /> : <span />}
                  </li>
                )
              })}
            </ul>
            <p className="method">
              Checked {new Date(check.checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}.
              {note ?? ' The checks run again by themselves after every test visit.'}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
