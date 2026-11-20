import { useEffect, useRef, useState } from 'react'
import { Popover } from 'radix-ui'
import {
  ActivityIcon,
  CalendarIcon,
  CheckIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LinkIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  UsersIcon,
} from 'lucide-react'
import { api, isDemo, type Env, type Site } from '@/api'
import { RANGES, queryKey, useDashboard, type Range } from '@/state'
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
import { deliveryText, num } from '@/format'
import { formatRate } from '@/goals'
import { cn } from '@/lib/utils'

export function Header({ sites }: { sites: Site[] }) {
  const d = useDashboard()
  const site = sites.find((s) => s.id === d.site) ?? sites[0]

  return (
    <>
      {isDemo && <DemoBar />}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <SiteSwitcher sites={sites} site={site} />
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
          <Online />
        </div>
        <div className={cn('flex min-w-0 flex-wrap items-center gap-2 sm:justify-end lg:flex-nowrap', d.view === 'settings' && 'hidden')}>
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
    </>
  )
}

/** Public demo: say it's sample data, and point at the way to run your own. */
function DemoBar() {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card py-2 pl-2 pr-2 sm:pl-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 rounded-md border border-border-strong bg-raised px-2 py-1 text-[13px] font-medium text-fg">
          Demo · sample data
        </span>
        <span className="hidden truncate text-sm text-muted md:block">A read-only Trail with 60 days of generated traffic.</span>
      </div>
      <a
        href="https://github.com/Karanjot786/trail#quick-start"
        className="pressable inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-fg px-3 text-sm font-medium text-black outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring"
      >
        Self-host Trail <span aria-hidden>→</span>
      </a>
    </div>
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
      {!isDemo && (
        <a
          href={`https://${site.domain}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${site.domain}`}
          className="pressable -m-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-fg"
        >
          <ExternalLinkIcon className="size-4" strokeWidth={1.75} />
        </a>
      )}
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
  const [health, setHealth] = useState(false)
  // The menu hands focus back to its trigger as it closes; skip that when it is opening the popover,
  // or the popover would see focus leave and close itself straight away.
  const toPopover = useRef(false)
  return (
    <Popover.Root open={health} onOpenChange={setHealth}>
      <DropdownMenu>
        <Popover.Anchor asChild>
          <DropdownMenuTrigger
            aria-label="More"
            className="pressable grid size-10 shrink-0 place-items-center rounded-lg border border-border text-fg outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-card"
          >
            <MoreHorizontalIcon className="size-5" strokeWidth={1.75} />
          </DropdownMenuTrigger>
        </Popover.Anchor>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(e) => {
            if (toPopover.current) e.preventDefault()
            toPopover.current = false
          }}
        >
          <DropdownMenuItem onSelect={() => d.refresh()}>
            <RefreshCwIcon strokeWidth={1.5} /> Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => d.set({ view: 'visitors', person: '' }, { push: true })}>
            <UsersIcon strokeWidth={1.5} /> View visitors
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              toPopover.current = true
              setHealth(true)
            }}
          >
            <ActivityIcon strokeWidth={1.5} /> Delivery health
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
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          aria-label="Delivery health"
          className="pop z-50 w-[min(320px,calc(100vw-32px))] rounded-xl border border-border bg-card p-4 shadow-[0_8px_30px_rgb(0_0_0/0.6)] outline-none"
        >
          <DeliveryHealth open={health} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** How many events reached the server, and what share needed a resend. */
function DeliveryHealth({ open }: { open: boolean }) {
  const d = useDashboard()
  const { data } = useFetch(open ? queryKey(d.query, 'delivery') : null, (s) => api.delivery(d.query, s))
  const empty = data && data.events === 0
  // Values sit in fixed-height slots, so loading → loaded never changes the popover's size.
  const value = (v: string | undefined) => (
    <span className="num block h-8 text-2xl font-semibold leading-8 tracking-[-0.02em] text-fg">{v ?? ''}</span>
  )
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-fg">Delivery health</p>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-black px-3 py-2.5">
          <dt className="text-[13px] text-muted">Events</dt>
          <dd>{value(data && (empty ? '—' : num(data.events)))}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-black px-3 py-2.5">
          <dt className="text-[13px] text-muted">On a retry</dt>
          <dd>{value(data && (empty ? '—' : formatRate(data.retriedRate)))}</dd>
        </div>
      </dl>
      <p className="min-h-10 text-pretty text-[13px] leading-5 text-muted" aria-live="polite">
        {data ? `${deliveryText(data)}. ` : ''}A retry means the first send failed, often on a weak mobile connection.
      </p>
    </div>
  )
}
