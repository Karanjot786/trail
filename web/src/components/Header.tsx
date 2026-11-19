import { useEffect, useState } from 'react'
import { CalendarIcon, CheckIcon, ExternalLinkIcon, GlobeIcon, LinkIcon, MoreHorizontalIcon, RefreshCwIcon, UsersIcon } from 'lucide-react'
import { api, type Env, type Site } from '@/api'
import { RANGES, useDashboard, type Range } from '@/state'
import { useFetch } from '@/useFetch'
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from './ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { dateToTs, dayKey, DAY } from '@/time'
import { num } from '@/format'

export function Header({ sites }: { sites: Site[] }) {
  const d = useDashboard()
  const site = sites.find((s) => s.id === d.site) ?? sites[0]

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <SiteSwitcher sites={sites} site={site} />
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
        <Online />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end lg:flex-nowrap">
        <Select value={d.env} onValueChange={(v) => d.set({ env: v as Env })}>
          <SelectTrigger aria-label="Environment" className="min-w-0 flex-1 sm:w-44 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="preview">Preview</SelectItem>
              <SelectItem value="all">All Environments</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <RangeSelect />
        <MoreMenu />
        {d.range === 'custom' && <CustomRange />}
      </div>
    </header>
  )
}

function SiteSwitcher({ sites, site }: { sites: Site[]; site?: Site }) {
  const d = useDashboard()
  if (!site) return null
  const others = sites.length - 1
  return (
    <div className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
      <GlobeIcon className="size-[18px] shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger className="pressable flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate">{site.domain}</span>
          {others > 0 && <span className="num shrink-0 text-muted">+{others}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Sites</DropdownMenuLabel>
          <DropdownMenuGroup>
            {sites.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => d.set({ site: s.id, filters: {}, person: '' }, { push: true })}>
                <span className="flex-1 truncate">{s.domain}</span>
                {s.id === site.id && <CheckIcon strokeWidth={1.5} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <a
        href={`https://${site.domain}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${site.domain}`}
        className="pressable -m-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-fg"
      >
        <ExternalLinkIcon className="size-4" strokeWidth={1.75} />
      </a>
    </div>
  )
}

function Online() {
  const d = useDashboard()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  // Online ignores the range; refetch every 30 s and on site/env change.
  const { data } = useFetch(d.site ? `online|${d.site}|${d.env}|${tick}` : null, (signal) =>
    api.stats({ ...d.query, from: Date.now() - 5 * 60_000, to: Date.now(), filters: {} }, signal),
  )
  const n = data?.online ?? 0
  return (
    <div className="flex shrink-0 items-center gap-2 text-[15px] text-fg" aria-live="polite">
      <span className={n > 0 ? 'live-dot size-2 rounded-full bg-good' : 'size-2 rounded-full border border-subtle bg-raised'} aria-hidden />
      <span className="num">{num(n)} online</span>
    </div>
  )
}

function RangeSelect() {
  const d = useDashboard()
  return (
      <div className="flex h-10 min-w-0 flex-[1.4] items-stretch overflow-hidden rounded-lg border border-border sm:flex-none">
        <span className="grid w-10 shrink-0 place-items-center border-r border-border text-muted" aria-hidden>
          <CalendarIcon className="size-4" strokeWidth={1.5} />
        </span>
        <Select
          value={d.range}
          onValueChange={(v) => {
            const r = v as Range
            if (r === 'custom') d.set({ range: r, from: d.from, to: d.to }, { push: true })
            else d.set({ range: r }, { push: true })
          }}
        >
          <SelectTrigger aria-label="Date range" className="h-full min-w-0 flex-1 rounded-none border-0 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {RANGES.filter((r) => r.value !== 'custom').map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
  )
}

function CustomRange() {
  const d = useDashboard()
  const today = dayKey(Date.now())
  const cls =
    'h-10 min-w-0 flex-1 rounded-lg border border-border bg-black px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40 sm:flex-none'
  return (
    <div className="flex basis-full items-center gap-2 sm:order-first sm:basis-auto">
      <input
        type="date"
        aria-label="From"
        className={cls}
        max={today}
        value={dayKey(d.from)}
        onChange={(e) => e.target.value && d.set({ from: dateToTs(e.target.value) })}
      />
      <span className="text-muted" aria-hidden>
        –
      </span>
      <input
        type="date"
        aria-label="To"
        className={cls}
        max={today}
        value={dayKey(d.to - 1)}
        onChange={(e) => e.target.value && d.set({ to: dateToTs(e.target.value) + DAY - 1 })}
      />
    </div>
  )
}

function MoreMenu() {
  const d = useDashboard()
  const [copied, setCopied] = useState(false)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More"
        className="pressable grid size-10 shrink-0 place-items-center rounded-lg border border-border text-fg outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-card"
      >
        <MoreHorizontalIcon className="size-5" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => d.refresh()}>
          <RefreshCwIcon strokeWidth={1.5} /> Refresh
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => d.set({ view: 'visitors', person: '' }, { push: true })}>
          <UsersIcon strokeWidth={1.5} /> View visitors
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(location.href).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          }}
        >
          {copied ? <CheckIcon strokeWidth={1.5} /> : <LinkIcon strokeWidth={1.5} />} {copied ? 'Copied' : 'Copy link'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
