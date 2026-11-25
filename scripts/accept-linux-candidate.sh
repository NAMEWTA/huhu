#!/usr/bin/env bash
# Run one final candidate acceptance in a fresh display and Secret Service session.
set -euo pipefail
mode=${1:?usage: accept-linux-candidate.sh tasks|workspace|credentials|native|web|rule|tools-web|git|web-terminal|package|gateway|close|external-agent|dashboard APPIMAGE SHA256 GIT_SHA CODEX [LINUX_PROBE]}
artifact=$(realpath -e "${2:?AppImage required}")
artifact_sha=${3:?SHA-256 required}
candidate_commit=${4:?full Git SHA required}
provider=$(realpath -e "${5:?pinned Codex required}")
case "$mode" in tasks|workspace|credentials|native|web|rule|tools-web|git|web-terminal|package|gateway|close|external-agent|dashboard) ;; *) exit 64 ;; esac
[[ $(uname -sm) == 'Linux x86_64' ]]
[[ $(git rev-parse HEAD) == "$candidate_commit" ]]
[[ -z $(git status --porcelain) ]]
printf '%s  %s\n' "$artifact_sha" "$artifact" | sha256sum -c -
printf '%s  %s\n' 880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971 "$provider" | sha256sum -c -
native_probe=""
expected_tests=1
if [[ "$mode" == native ]]; then
  native_probe=$(realpath -e "${6:?built Linux fixture required for native acceptance}")
  sha256sum "$native_probe"
  expected_tests=2
fi
browser_cache=${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}
if [[ "$mode" == close || "$mode" == external-agent || "$mode" == workspace || "$mode" == web ]]; then expected_tests=2; fi
if [[ "$mode" == package ]]; then expected_tests=5; fi
if [[ "$mode" == web-terminal ]]; then expected_tests=3; fi
node_binary=$(node -p 'process.execPath')
playwright_cli=$(realpath -e node_modules/@playwright/test/cli.js)
for command in dbus-run-session gnome-keyring-daemon xvfb-run; do command -v "$command" >/dev/null; done
mkdir -p temp/candidate-acceptance
report_directory=$(mktemp -d "$PWD/temp/candidate-acceptance/$mode.XXXXXX")
report_file="$report_directory/result.json"
acceptance_root=$(mktemp -d /tmp/hc-a.XXXXXX)
trap 'rm -rf -- "$acceptance_root"' EXIT
mkdir -m 700 "$acceptance_root"/{home,data,config,state,cache,runtime,tmp}
exec 9>/tmp/huhu-heavy.lock
flock 9
# The child receives no developer renderer, alternate Engine, Core address or login history.
env -i PATH="$(dirname "$node_binary"):/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 \
  HOME="$acceptance_root/home" USERPROFILE="$acceptance_root/home" \
  XDG_DATA_HOME="$acceptance_root/data" XDG_CONFIG_HOME="$acceptance_root/config" \
  XDG_STATE_HOME="$acceptance_root/state" XDG_CACHE_HOME="$acceptance_root/cache" \
  XDG_RUNTIME_DIR="$acceptance_root/runtime" TMPDIR="$acceptance_root/tmp" \
  PLAYWRIGHT_BROWSERS_PATH="$browser_cache" \
  PLAYWRIGHT_JSON_OUTPUT_FILE="$report_file" \
  HUHU_AGENT_LINUX_PROBE="$native_probe" \
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
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/task-journey.spec.ts -g "W8\.1 候选安装包|W8\.2/W8\.3 候选安装包" ;;
      native)
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/agents/linux-environment.spec.ts ;;
      web)
        export HUHU_WEB_SHARE_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/web-share.spec.ts ;;
      dashboard)
        export HUHU_DASHBOARD_APPEARANCE_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/dashboard-appearance-package.spec.ts ;;
      external-agent)
        export HUHU_EXTERNAL_AGENT_DESKTOP_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/external-agent-desktop.spec.ts ;;
      close)
        export HUHU_CLOSE_PACKAGE_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/close-package.spec.ts ;;
      gateway)
        export HUHU_GATEWAY_BOUNDARY_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/gateway-package-boundaries.spec.ts ;;
      tools-web)
        export HUHU_EXTERNAL_TASK_WEB_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/external-task-web.spec.ts ;;
      git)
        export HUHU_GIT_PACKAGE_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/git-credentials-package.spec.ts ;;
      web-terminal)
        export HUHU_WEB_TERMINAL_WIDGET_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/web-terminal-widgets.spec.ts ;;
      rule)
        export HUHU_RULE_PACKAGE_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/automation-linux-environment.spec.ts ;;
      package)
        export HUHU_PACKAGED_CREDENTIAL_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json -c playwright.packaged.config.ts ;;
      credentials)
        export HUHU_PACKAGED_CREDENTIAL_ACCEPTANCE=1
        xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json -c playwright.packaged.config.ts -g "CLI 与 HTTP MCP" ;;
    esac
  '

"$node_binary" --input-type=module -e '
  import { readFileSync } from "node:fs";
  import assert from "node:assert/strict";
  const report = JSON.parse(readFileSync(process.argv[1], "utf8"));
  assert.equal(report.stats.expected, Number(process.argv[2]));
  for (const name of ["unexpected", "skipped", "flaky"]) assert.equal(report.stats[name], 0, name);
  assert.equal(report.errors.length, 0);
' "$report_file" "$expected_tests"
printf 'Accepted %s at %s; artifact %s; report %s\n' "$mode" "$candidate_commit" "$artifact_sha" "$report_file"
