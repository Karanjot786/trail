# syntax=docker/dockerfile:1

# The build stages run on the builder's own platform and cross-compile, so a
# multi-arch build (linux/amd64 + linux/arm64) needs no emulation.

# Build the tracker (-> internal/ingest/t.js) and the dashboard (-> web/dist)
FROM --platform=$BUILDPLATFORM node:22-alpine AS assets
RUN npm i -g pnpm@10
WORKDIR /src
COPY tracker/package.json tracker/package-lock.json tracker/
RUN cd tracker && npm ci --ignore-scripts
COPY web/package.json web/pnpm-lock.yaml web/
RUN cd web && pnpm install --frozen-lockfile
COPY tracker tracker
COPY web web
RUN mkdir -p internal/ingest && cd tracker && node build.mjs
RUN cd web && pnpm build

# Build the static Go binary for the target platform
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS gobuild
ARG TARGETOS TARGETARCH
ARG VERSION=dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=assets /src/internal/ingest/t.js internal/ingest/t.js
COPY --from=assets /src/web/dist web/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /trail ./cmd/trail
# An empty data directory owned by the nonroot user. A new named volume copies
# this ownership, so the server can create its database in /data.
RUN mkdir -p /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=gobuild /trail /trail
COPY --from=gobuild --chown=65532:65532 /out/ /
ENV TRAIL_DB=/data/trail.db TRAIL_ADDR=:8080
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/trail", "health"]
ENTRYPOINT ["/trail"]
CMD ["serve"]
