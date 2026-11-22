#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export GOWORK=off GOTOOLCHAIN=local GOTELEMETRY=off
export CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v1

go mod verify
case "${1-}" in
  --test) go test -mod=readonly ./... ;;
  "") ;;
  *) printf 'Usage: %s [--test]\n' "$0" >&2; exit 64 ;;
esac
go build -mod=readonly -trimpath -buildvcs=false -o bin/huhu-agent-pty .
go version -m bin/huhu-agent-pty
