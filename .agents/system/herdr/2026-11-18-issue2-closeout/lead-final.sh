#!/bin/bash
# Lead 最终验收链：一次性在集成候选上运行门禁、全量 e2e、性能、启动对照与打包。
# 用法：lead-final.sh <输出目录> [步骤...]；无步骤时运行全部。
set -u
WT=${WT:-/home/wta/projects/huhu-wt-int}
RC4=/home/wta/projects/huhu-wt-rc4
OUT=${1:?输出目录}; shift
mkdir -p "$OUT"
STEPS=${*:-"gates e2e parity perf g07 pack"}
cd "$WT"
log(){ echo "$(date '+%F %T') $*" | tee -a "$OUT/progress.log"; }
waitlow(){ # 负载 <2 且无其他 Electron/Playwright
  while pgrep -f "electron|playwright" >/dev/null || ! awk '{exit !($1 < 2)}' /proc/loadavg; do sleep 20; done
  log "start $1 load=$(cut -d' ' -f1-3 /proc/loadavg)"
}
run(){ # name cmd...
  local n=$1; shift
  log "run $n"
  ( "$@" ) >"$OUT/$n.log" 2>&1; local rc=$?
  log "exit $n $rc"; echo -e "$n\t$rc" >>"$OUT/status.tsv"
}
export OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge ORCA_SRC=/home/wta/projects/huhu/temp/sources/orca
log "candidate $(git rev-parse HEAD)"
for s in $STEPS; do case $s in
gates)
  run format pnpm format:check; run lint pnpm lint; run typecheck pnpm typecheck
  run test pnpm test; run test-vendor pnpm test:vendor
  run build pnpm build; cp apps/desktop/out/build-info.json "$OUT/" 2>/dev/null
  run knip pnpm knip; run notices pnpm notices
  run patches-check node scripts/ok-patches.mjs --check; run patches-replay node scripts/ok-patches.mjs --replay
  run orca-replay node scripts/ok-patches.mjs --replay --orca; run catalog node scripts/ok-patches.mjs --check-catalog
  run host-endpoints node packages/editor/build/check-host-endpoints.mjs --assert
  ;;
e2e)
  waitlow e2e; run e2e-full xvfb-run -a pnpm e2e --workers=1 --retries=0 ;;
perf)
  for i in 1 2 3; do waitlow f09-strict-$i; run f09-strict-$i env HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts --workers=1 --retries=0; done
  waitlow f09-journey; run f09-journey env HUHU_NOTE_PERF=1 HUHU_NOTE_PERF_SAMPLES=20 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g "F09 笔记旅程" --workers=1 --retries=0
  waitlow huge; run huge-vault env HUHU_E2E_HUGE_VAULT=1 xvfb-run -a pnpm e2e tests/e2e/knowledge/huge-vault.spec.ts --workers=1 --retries=0
  waitlow h05-cost; run h05-cost xvfb-run -a pnpm e2e tests/e2e/knowledge/compact-cost.spec.ts --workers=1 --retries=0
  ;;
g07)
  waitlow g07-rc4; run g07-rc4 xvfb-run -a node scripts/measure-notes-startup.mjs "$RC4" --pairs 20 --frame-click
  waitlow g07-aa; run g07-aa xvfb-run -a node scripts/measure-notes-startup.mjs --aa --pairs 20 --frame-click
  waitlow g07-rich; run g07-rich xvfb-run -a node scripts/measure-notes-startup.mjs "$RC4" --pairs 20 --frame-click --nav-only --rich-inbox
  ;;
parity)
  OKS=/tmp/ok-parity-source
  [ -d $OKS ] || git -C /home/wta/projects/huhu/temp/sources/open-knowledge worktree add --detach $OKS 44a2e0a >"$OUT/parity-setup.log" 2>&1
  ( cd $OKS && HUSKY=0 pnpm install --frozen-lockfile && cd packages/app && pnpm run predev ) >>"$OUT/parity-setup.log" 2>&1
  OKC=$(mktemp -d /tmp/ok-parity-content.XXXXXX); OKB=$(mktemp -d /tmp/ok-parity-build.XXXXXX)
  ( cd $OKS/packages/app && NODE_ENV=development OK_TEST_PREBUILT_OUT_DIR=$OKB pnpm exec vite build --mode development --config vite.prebuilt-dev.ts ) >>"$OUT/parity-setup.log" 2>&1
  ( cd $OKS/packages/app && NODE_ENV=development OK_TEST_CONTENT_DIR=$OKC OK_TEST_PREBUILT_OUT_DIR=$OKB VITE_PORT=17385 exec pnpm exec vite preview --config vite.prebuilt-dev.ts --host 127.0.0.1 ) >"$OUT/parity-server.log" 2>&1 &
  SRV=$!; for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:17385 && break; sleep 5; done
  waitlow parity
  run parity-ok env PARITY_OK_URL=http://127.0.0.1:17385 PARITY_OK_CONTENT=$OKC PARITY_OK_OUTPUT="$OUT/parity-ok" xvfb-run -a -s '-screen 0 1600x1000x24' pnpm exec playwright test --config tests/parity-ok/playwright.config.ts --retries=0
  kill $SRV 2>/dev/null; pkill -f "vite preview --config vite.prebuilt-dev.ts" 2>/dev/null
  ;;
pack)
  run pack pnpm --filter @huhu/desktop exec electron-builder --dir --linux --publish never -c.electronDist="$(realpath apps/desktop/node_modules/electron/dist)"
  ASAR=$(ls -d apps/desktop/release/linux-unpacked/resources/app.asar 2>/dev/null)
  run asar node scripts/check-asar-contents.mjs "$ASAR"
  X=$(mktemp -d); waitlow packaged
  run e2e-packaged env XDG_CONFIG_HOME=$X/c XDG_DATA_HOME=$X/d XDG_CACHE_HOME=$X/k HUHU_PACKAGED_EXE="$(realpath apps/desktop/release/linux-unpacked/huhu)" xvfb-run -a pnpm e2e:packaged --retries=0
  run deb pnpm --filter @huhu/desktop exec electron-builder --linux deb --publish never -c.electronDist="$(realpath apps/desktop/node_modules/electron/dist)"
  ls -l apps/desktop/release/*.deb >"$OUT/deb-size.txt" 2>&1
  ;;
esac; done
log done
