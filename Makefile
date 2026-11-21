.PHONY: tracker web build test dev seed dev-seed e2e demo-fixtures geo cloudflare-ips clean

tracker:
	cd tracker && npm ci && node build.mjs

web:
	cd web && pnpm install --frozen-lockfile && pnpm build

build: tracker web
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o trail ./cmd/trail

test:
	go test ./...
	cd tracker && npm test
	cd web && pnpm test

# Backend on :8080 with a throwaway DB; run `cd web && pnpm dev` in another shell for the UI.
dev:
	TRAIL_PASSWORD=dev TRAIL_DB=dev.db TRAIL_SITES=demo=localhost go run ./cmd/trail serve

seed:
	TRAIL_DB=$${TRAIL_DB:-dev.db} go run ./cmd/trail seed

# Seed dev.db like the e2e harness does (60 days, 1,800 people, seed 42). Falls back to the plain seed until the flags exist.
dev-seed:
	TRAIL_DB=$${TRAIL_DB:-dev.db} TRAIL_SITES=demo=demo.trail.dev,docs=docs.trail.dev go run ./cmd/trail seed --sites demo,docs --days 60 --persons 1800 --seed 42 --revenue demo --crawlers demo \
		|| TRAIL_DB=$${TRAIL_DB:-dev.db} TRAIL_SITES=demo=demo.trail.dev,docs=docs.trail.dev go run ./cmd/trail seed

# Build, seed a temp DB, serve on :8120 and run every Playwright project (chromium, firefox, phone).
e2e: tracker
	cd web && pnpm install --frozen-lockfile && pnpm build && E2E_ALL=1 pnpm exec playwright test

# Check fixture drift, record, build the static demo and run the server-less smoke.
demo-fixtures:
	cd web && pnpm fixtures:check
	cd web && pnpm fixtures
	cd web && pnpm build:demo
	cd web && E2E_ALL=1 pnpm exec playwright test -c playwright.fixtures.config.ts

# Refresh the embedded DB-IP Lite Country database (CI runs this monthly and opens a PR).
geo:
	./scripts/update-geo.sh

# Refresh the bundled Cloudflare IP ranges (trusted for CF-Connecting-IP).
cloudflare-ips:
	./scripts/update-cloudflare-ips.sh

clean:
	rm -f trail dev.db dev.db-* internal/ingest/t.js
	rm -rf tracker/dist
	find web/dist -mindepth 1 ! -name .keep -delete 2>/dev/null || true
