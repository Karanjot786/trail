.PHONY: tracker web build test dev seed clean

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

clean:
	rm -f trail dev.db dev.db-* internal/ingest/t.js
	rm -rf tracker/dist
	find web/dist -mindepth 1 ! -name .keep -delete 2>/dev/null || true
