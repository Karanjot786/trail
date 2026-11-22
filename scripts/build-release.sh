#!/bin/sh
# Build the release archives and checksums.txt into OUTDIR.
#
#   make tracker web                       # the embedded files must exist first
#   scripts/build-release.sh v1.2.3 dist/release
#
# Archive names carry no version (trail_linux_amd64.tar.gz), so
# https://github.com/karanjot786/trail/releases/latest/download/<name> always
# points at the newest one. install.sh relies on that.
set -eu

VERSION=${1:?usage: build-release.sh VERSION OUTDIR}
OUT=${2:?usage: build-release.sh VERSION OUTDIR}
TARGETS=${TARGETS:-"linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 freebsd/amd64"}

cd "$(dirname "$0")/.."
[ -f internal/ingest/t.js ] && [ -f web/dist/index.html ] || {
	echo "build-release: run 'make tracker web' first" >&2
	exit 1
}

# bsdtar (macOS) would add xattr headers that GNU tar warns about.
TARFLAGS=""
if tar --version 2>/dev/null | grep -q bsdtar; then
	TARFLAGS="--no-xattrs --no-mac-metadata"
fi

mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

for t in $TARGETS; do
	os=${t%/*}
	arch=${t#*/}
	name="trail_${os}_${arch}"
	mkdir -p "$STAGE/$name"
	echo "building $name"
	CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath \
		-ldflags="-s -w -X main.version=${VERSION#v}" -o "$STAGE/$name/trail" ./cmd/trail
	cp LICENSE NOTICE README.md SELF_HOSTING.md "$STAGE/$name/"
	# shellcheck disable=SC2086
	tar $TARFLAGS -C "$STAGE/$name" -czf "$OUT/$name.tar.gz" trail LICENSE NOTICE README.md SELF_HOSTING.md
done

cd "$OUT"
if command -v sha256sum >/dev/null 2>&1; then
	sha256sum trail_*.tar.gz >checksums.txt
else
	shasum -a 256 trail_*.tar.gz >checksums.txt
fi
cat checksums.txt
