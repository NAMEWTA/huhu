#!/usr/bin/env bash
# Run one final candidate acceptance in a fresh display and Secret Service session.
set -euo pipefail
mode=${1:?usage: accept-linux-candidate.sh tasks|workspace|credentials APPIMAGE SHA256 GIT_SHA CODEX}
artifact=$(realpath -e "${2:?AppImage required}")
artifact_sha=${3:?SHA-256 required}
candidate_commit=${4:?full Git SHA required}
provider=$(realpath -e "${5:?pinned Codex required}")
case "$mode" in tasks|workspace|credentials) ;; *) exit 64 ;; esac
[[ $(uname -sm) == 'Linux x86_64' ]]
[[ $(git rev-parse HEAD) == "$candidate_commit" ]]
[[ -z $(git status --porcelain) ]]
printf '%s  %s\n' "$artifact_sha" "$artifact" | sha256sum -c -
printf '%s  %s\n' 880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971 "$provider" | sha256sum -c -
node_binary=$(node -p 'process.execPath')
playwright_cli=$(realpath -e node_modules/@playwright/test/cli.js)
for command in dbus-run-session gnome-keyring-daemon xvfb-run; do command -v "$command" >/dev/null; done
mkdir -p temp/candidate-acceptance
report_directory=$(mktemp -d "$PWD/temp/candidate-acceptance/$mode.XXXXXX")
report_file="$report_directory/result.json"
acceptance_root=$(mktemp -d /tmp/huhu-candidate-session.XXXXXX)
trap 'rm -rf -- "$acceptance_root"' EXIT
mkdir -m 700 "$acceptance_root"/{home,data,config,state,cache,runtime,tmp}
exec 9>/tmp/huhu-heavy.lock
flock 9
# The child receives no developer renderer, alternate Engine, Core address or login history.
env -i PATH="$(dirname "$node_binary"):$PATH" LANG=C.UTF-8 \
  HOME="$acceptance_root/home" USERPROFILE="$acceptance_root/home" \
  XDG_DATA_HOME="$acceptance_root/data" XDG_CONFIG_HOME="$acceptance_root/config" \
  XDG_STATE_HOME="$acceptance_root/state" XDG_CACHE_HOME="$acceptance_root/cache" \
  XDG_RUNTIME_DIR="$acceptance_root/runtime" TMPDIR="$acceptance_root/tmp" \
  PLAYWRIGHT_JSON_OUTPUT_FILE="$report_file" \
  HUHU_ACCEPTANCE_NODE="$node_binary" HUHU_ACCEPTANCE_PLAYWRIGHT="$playwright_cli" \
  HUHU_ACCEPTANCE_PROFILE_ROOT="$acceptance_root" HUHU_ACCEPTANCE_MODE="$mode" \
  HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT="$artifact" HUHU_TASK_JOURNEY_PACKAGE_SHA="$artifact_sha" \
  HUHU_CANDIDATE_GIT_SHA="$candidate_commit" HUHU_CODEX_DISPATCH_BIN="$provider" \
  dbus-run-session -- bash -c '
    set -euo pipefail
    printf "%s" "huhu-isolated-acceptance" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
    export HUHU_ACCEPTANCE_DBUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"
    case "$HUHU_ACCEPTANCE_MODE" in
      tasks)
        export HUHU_TASK_JOURNEY_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/task-journey.spec.ts -g "T7.2 候选安装包" ;;
      workspace)
        export HUHU_AGENT_WORKSPACE_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/task-journey.spec.ts -g "W8.2/W8.3 候选安装包" ;;
      credentials)
        export HUHU_PACKAGED_CREDENTIAL_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json -c playwright.packaged.config.ts -g "CLI 与 HTTP MCP" ;;
    esac
  '

"$node_binary" --input-type=module -e '
  import { readFileSync } from "node:fs";
  import assert from "node:assert/strict";
  const report = JSON.parse(readFileSync(process.argv[1], "utf8"));
  assert.equal(report.stats.expected, 1);
  for (const name of ["unexpected", "skipped", "flaky"]) assert.equal(report.stats[name], 0, name);
  assert.equal(report.errors.length, 0);
' "$report_file"
printf 'Accepted %s at %s; artifact %s; report %s\n' "$mode" "$candidate_commit" "$artifact_sha" "$report_file"
