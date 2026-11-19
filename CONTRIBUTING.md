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

## Rules of the road

- Tests first for logic changes (Go table tests, Playwright for the tracker, vitest for the dashboard).
- The tracker must stay at or under **2048 bytes gzipped** — `node tracker/build.mjs` fails the build above that.
- Never store raw IP addresses.
- Keep the dashboard calm: every view should answer one question at a glance.
- Conventional commit messages (`feat:`, `fix:`, `chore:` …).

Open an issue before large changes so we can agree on the approach.
