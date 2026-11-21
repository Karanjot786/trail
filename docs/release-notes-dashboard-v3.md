# Dashboard v3: release notes

## New screens and routes

- Overview, Live, Acquisition (`/acquisition`, `/acquisition/ai`, `/acquisition/campaigns`, `/acquisition/landing`),
  Activity (`/activity/visitors`, `/activity/sessions`, `/activity/events`, `/activity/paths`),
  Conversions (`/conversions/goals[/{id}]`, `/conversions/funnels[/{id}]`), Revenue, AI crawlers and Settings.
- The whole dashboard state lives in the URL, including sheets (`v=`, `dr=`, `rep=`, `evn=`, `fd=`), panel tabs
  (`p.pages=exit`) and screen sub-views (`p.goal=sources`, `p.acq=channel`, `p.rev=country`). Links and Back keep them.
- Old links (`/people`, `?view=visitors`, `range=24h`) redirect.

## API changes

All `/api/v1` changes are additive, except one:

- `Point.v` on `/api/v1/series` may be `null` for buckets in the future (for example the rest of today).
  Scripts that sum points should skip nulls.
- Visitors carry `visitsTotal` (every visit the journey lists) next to `visits` (visits in the range).
- Stats totals carry `eventPeople`: people who sent at least one custom or outbound event.
- What changed sends a day item's `day` as `YYYY-MM-DD`; the dashboard writes the label.
- Share links take `ttl`: `"24h"`, `"7d"`, `"30d"` or `"never"`.

## Revenue

Revenue comes from the browser `Purchase` event (amount and currency, one currency per site) and is labelled
"reported by your site". The Revenue screen appears once a site has sent a Purchase.

## AI crawlers

Crawler hits are imported from server logs (`trail crawlers import`) and stored per hour, bot, path and status class
(2xx to 5xx). Bots are named by user agent, not verified by IP.

## Demo without a server

- `pnpm fixtures` records the seeded demo into `web/demo-data` (never embedded in the Go binary).
- `pnpm build:demo` builds with `VITE_DATA=fixtures` (`VITE_MOCK=1` still works) and copies the recording into
  `dist/demo-data`. Views that were not recorded fall back to the nearest preset and say so.
- `pnpm fixtures:check` records twice and checks determinism, the TypeScript contract and the size caps.
