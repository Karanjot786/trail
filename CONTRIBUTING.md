# Contributing

Thanks for helping. Small, focused PRs get merged fastest.

## Setup

Requires Go 1.26+, Node 22+ and pnpm.

```sh
make build        # tracker → dashboard → ./trail binary
make test         # go test, tracker Playwright tests, dashboard vitest
make seed         # fake data in dev.db
make dev          # run the server against dev.db
```

Dashboard against mock data, no server needed: `cd web && VITE_MOCK=1 pnpm dev`.

Landing page and docs: `cd site && pnpm install && pnpm dev`. Docs pages are Markdown in `site/src/content/docs/docs/`. Every env var, attribute, route or tool name a page mentions must exist in the code; check with `grep` before you commit.

## Rules of the road

- Tests first for logic changes (Go table tests, Playwright for the tracker, vitest for the dashboard).
- Every tracker file (`t.js`, `t.p.js`, `t.x.js`) must stay at or under **2048 bytes gzipped**. `cd tracker && npm run size` fails above that. Run `npm run bench` before and after a tracker change and put the numbers in the PR.
- Never store raw IP addresses.
- Keep the dashboard calm: every view should answer one question at a glance.
- Conventional commit messages (`feat:`, `fix:`, `chore:` …).

Open an issue before large changes so we can agree on the approach.
