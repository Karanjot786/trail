# Deploying trail.karanjot.co.in

One Vercel project serves the landing page (`/`), the docs (`/docs`) and the dashboard demo (`/demo`).

## Vercel project settings

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | `site` |
| Include files outside the Root Directory in the Build Step | On (the default; the build reads `../web`, `../cmd` and `../go.mod`) |
| Install Command | from `vercel.json`: `pnpm install --frozen-lockfile && pnpm --dir ../web install --frozen-lockfile` |
| Build Command | from `vercel.json`: `pnpm build` |
| Output Directory | from `vercel.json`: `dist` |
| Node.js Version | 22.x or newer |
| Domain | `trail.karanjot.co.in` (a CNAME to `cname.vercel-dns.com`) |

Leave the command fields in the dashboard empty, so `vercel.json` decides them. No environment variables are needed.
`TRAIL_DEMO_URL` changes where the Demo links point, and `SITE_URL` changes the canonical origin.

## What `pnpm build` does

1. Builds the landing page (Astro) and the docs (VitePress) into `dist/`.
2. Runs `scripts/demo.mjs`:
   - It records the demo data with `pnpm fixtures` in `web/`, which runs the Go recorder. If Go is not installed, as on Vercel, it downloads the Go version named in `go.mod` into `node_modules/.cache/go`.
   - It builds the dashboard in fixtures mode (`pnpm build:demo`, Vite base `/demo/`) into `web/dist-demo`.
   - It copies that build to `dist/demo`.

The demo data is recorded fresh on every build, so its dates follow the deploy date. Locally, an existing
`web/demo-data` is reused. Set `TRAIL_DEMO_RECORD=1` to record it again.

`pnpm build:site` builds only the landing page and the docs.

## Routing (`vercel.json`)

- `/demo/*` deep links (for example `/demo/ai` or `/demo/activity/visitors`) are rewritten to `/demo/index.html`. Files under `/demo/assets/` and `/demo/demo-data/` are not rewritten, so a missing file is a real 404.
- `/demo/assets/*`, `/_astro/*` and `/docs/assets/*` have hashed names and are cached for a year (`immutable`).
- `/demo/demo-data/*` revalidates on every request, because each deploy records it again under the same names.

After a deploy, check the routes with `scripts/check-redirects.sh https://trail.karanjot.co.in`.
