# syntax=docker/dockerfile:1

# Build the tracker (-> internal/ingest/t.js) and the dashboard (-> web/dist)
FROM node:22-alpine AS assets
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

# Build the static Go binary
FROM golang:1.26-alpine AS gobuild
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=assets /src/internal/ingest/t.js internal/ingest/t.js
COPY --from=assets /src/web/dist web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /trail ./cmd/trail

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=gobuild /trail /trail
ENV TRAIL_DB=/data/trail.db TRAIL_ADDR=:8080
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/trail"]
