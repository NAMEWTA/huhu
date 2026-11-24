# #4／#5 同一安装包候选独立复审

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- Core / Lead / terminal_address — wta-ubuntu / t3p / t4t
- task — t4t/task07.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task07.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report07.md
- 执行结果 — done（独立复审完成，安装包签收待验证）
- 固定提交 — f310e541a86825cc5a7ac100b4c230e5bbf1fdca，Linux x64。#7 已暂缓。

## 结论

**暂缓 #4／#5 共包签收。** 固定提交的预检日志有 5 项源码联验通过，分别验证了真实 Core 上的 MCP／CLI、回执重投与真实 Codex 在新建／已有宿主会话中的原生问答。候选源码的 Tasks 切换路径可以追到实际调用者。审查时集成树没有该提交的 release 产物。主树旧 deb 的元数据为 0.0.1 amd64，候选 desktop 版本为 0.0.1-rc.4。两个包用例目前可校验一份制品、启动另一份程序。T7.2 的跨日和接收前停用回执顺序也尚无同包证据。

依据为固定树内 [W8.2](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W8.2-integrated-workspace.md)、[W8.3](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W8.3-acceptance-package.md)、[T7.1](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md) 和 [T7.2](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T7.2-full-task-journey.md)。下文代码位置均指固定提交。

## 阻断与覆盖缺口

1. **P1 · 两组用例缺少制品到实际进程的绑定。** 两项分别散列 HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT，对比调用者所给 SHA，再用独立的 HUHU_PACKAGED_EXE 启动。传入正确散列的 AppImage 和另一个 linux-unpacked 或 Electron 可执行文件时，散列检查仍成功。资源目录只用来定位清理用的 Core。W8 附件记录了测试进程的平台与版本，T7 附件连平台和版本也没有；两者均无包进程的 app.isPackaged、可执行文件身份和构建提交断言。门禁应从同一个已锁定的 AppImage 解包一次，由解包根推导 huhu 和 resources，固定两项输入。用例在每次启动后还应核对 app.isPackaged、process.execPath、process.resourcesPath、实际平台／架构与 huhu-app://workbench 页面来源。用 app.asar 内 out/build-info.json 核对完整提交，桌面 appInfo() 的 commit 是前 12 位，可用于交叉核对。保留原包、解包 exe、ASAR、随包 Core、派遣 helper 和 HUHU CLI 的散列与版本。构建记录需确认当时源码树干净，write-build-info.mjs 可接受 GITHUB_SHA，单独设置该变量不足以绑定源码。证据位置为 tests/e2e/workflows/task-journey.spec.ts:204–245、:334–346、:361–406、:590–594，apps/desktop/src/main/index.ts:30–35、:447–449，scripts/write-build-info.mjs。

2. **P1 · 进程仍可从环境加载开发页面或访问个人上下文。** 两项通过 ...process.env 构造子进程环境，ELECTRON_RENDERER_URL 仍生效，桌面主进程据此选工作台入口。W8 仅删除 HUHU_HERDR_BIN 和 HC_TERMINAL_ID，继承 XDG 路径、D-Bus、其余 HC 配置及 Git 环境，同时调用 git init 生成评审夹具。T7 清除更多 HC 变量并重设部分目录，仍继承 D-Bus、XDG_CACHE_HOME 和开发页面变量。候选门禁从白名单环境启动，使用每组独立的 HOME、XDG 与已解锁私有 Secret Service，继承范围仅需测试工具、Xvfb 和私有总线。用例内应统一复用这份隔离环境，包括辅助 git、Core 和 provider 命令；断言正式 workbench origin。证据位置为 task-journey.spec.ts:215–243、:376–440，apps/desktop/src/main/index.ts:54、:144、:542。

3. **P1 · T7.2 的回执故障顺序缺失。** T7 案例覆盖 18 秒以内的真实定时、已有会话原生提问、一次回答、任务结果、匹配持久 ACK 和人工完成。W8 故障夹具先等 Tasks 持久保存消费记录并拦住返回给 Agent 的 ACK，而后才停用 Tasks，释放 ACK 门并重新启用。该场景能核对已消费的结果重投和单条评论。T7.2 另要求 Agent 已保存结果且 Tasks 尚未接收时停用，之后重启接收，再丢弃一次 ACK；现有门在持久写入并回读之后，每一次命中都拒绝，直至 release。补充独立故障阶段并留下有序证据：Agent 已存同一 receiptId、Tasks 尚无消费记录 → Tasks 停用 → 启用并首次持久化 → 仅丢一次响应 → 同 receiptId／payload 重试 → Agent 保存匹配 ACK，观察重投停止。在重新装载或重放后核对只有一个 delivery、一个 message 和一次原生工作。证据位置为 task-journey.spec.ts:264–346、:513–563，plugins/tasks/src/engine/receipt-inbox.ts:38–54、:81–110。

4. **P2 · 两项入场条件和 T7.1／T7.2 验收矩阵不齐。** W8 有 Linux x64 保护，T7 缺同一平台保护；两项都能因缺 opt-in 或输入而跳过。playwright.packaged.config.ts 只运行 tests/e2e/packaged，因而 pnpm e2e:packaged 即使绿灯也没有这两项。普通配置枚举与零退出也不提供已执行证明。T7 采用 schedule(18) 的墙钟，不验证测试时钟下从今天跨到明天；亦未在包中验证手动运行及新模板。W8 验了四向分栏、两 Space、同会话定位、评审、重开、关闭和历史路径，Pi 历史恢复用合成 JSONL 与 shell 代身校验 --session 原路径，不足以签收真实 Pi。包内 T7.1 授权矩阵仍缺真实 CLI／MCP 默认拒绝、逐项开放后经客户端成功、撤权后拒绝，以及同版本新 Vault 恢复和损坏包失败；W8 的 capability catalog 读数及 gateway.update 回包只覆盖其中一部分。需要保留 W8.2 风格／窄窗／DPI、共享 viewer、外部邀请撤权、高输出和性能证据，以及 T7.2 中文长输入、窄窗焦点结果。#7 与其它平台保持待验。证据位置为 task-journey.spec.ts:42–45、:204–210、:361–369、:423–451、:465–511、:576–588，playwright.config.ts:3–10、playwright.packaged.config.ts:4–9。

## 实际 Tasks 调用者与已核证据

| 范围 | 固定提交中的实际路径与支持证据 |
| --- | --- |
| Automations 到 Tasks | Scheduler 进入 activate → TaskScanOccurrences.scheduled；工作台 automations.runNow 经 activate/invoke 或带意图的 invokeWorkbench；对外专用 automations.taskScan.runNow 经 authorize 和 invokeExternal。发生记录将稳定的 dispatchId、输入版本／指纹、规则版本与 occurrenceId 传入 Tasks 的 acceptRule 服务。任务详情经 tasks.dispatch.list，自动化运行抽屉经 tasks.dispatch.recent。证据为 plugins/automations/src/engine/index.ts:358–388、:475–493、task-scan-tools.ts:153–155、task-scan-occurrences.ts:395–410、plugins/tasks/src/engine/index.ts:556、plugins/tasks/src/ui/TaskDetail.tsx:298、plugins/automations/src/ui/RunsPanel.tsx:31。 |
| 旧记录与接收能力 | 固定 Engine 回归检查 automations.runs.answer／retry／activeFor 和 tasks.markDispatched 均不存在，旧 claim 和旧 run 原字节保留，新的规则仍能产生 Tasks 派遣。tasks.receipts.consume 禁止对外暴露并只接受 plugin:agent-cli。较早 Linux 690e9097 的定向日志为 2 通过、48 过滤；本轮只查阅该记录和固定树中的断言。证据为 apps/engine/test/engine.test.ts:572–605、plugins/tasks/src/engine/index.ts:456–469 与 [切换预检](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/t71-cutover-690e9097.log)。 |
| 固定提交源码联验 | native-receipts.live.test.ts 3/3。CLI 在测试进程内调用 apps/cli 的 run，以临时 Vault 的 CLI 身份经回环 HTTP 调用；MCP 启用 HTTP transport，用 MCP token 和会话执行真实 tools/call。真实 Core、Tasks 持久 inbox 和 Node 合成 provider 运行于同一用例，核对 3 次输入、同一 Core session、一个 native answer、一个普通补充、两条时间线评论和四个已持久 ACK。普通问题回执由测试通过受信插件调用注入。另两项核对两段 ACK 丢失恢复、原生回答在重启后的匹配对账。该用例未启动随包的 resources/bin/huhu，未覆盖 MCP stdio。证据为 plugins/agent-cli/test/native-receipts.live.test.ts:261–430 和 [组合预检日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/agent-tasks-combined-linux.log)。 |
| 固定提交真实 provider 联验 | 同一组合日志中的 codex-native.live.test.ts 2/2，Core 0.1.19 与白名单 Codex 0.170.0 ELF 在隔离源码 Engine 中分别跑新会话、原会话，模型应答由本机 HTTP 夹具生成，凭据保护采用 TestProtection。较早 t72 日志中的 5 项 Playwright 行是 Listing tests；同一日志后段实际运行的是两项 Vitest。证据为 plugins/agent-cli/test/codex-native.live.test.ts:14–51、[组合预检日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/agent-tasks-combined-linux.log)、[原会话预检](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/t72-original-session-preflight.log)。 |
| 候选制品 | 固定包配置为 Linux x64 AppImage／deb。检查时集成树无 release 目录；主树留存旧包，deb 的版本字段为 0.0.1。两项候选包用例没有实际执行结果。本次发现工作树另有 packaged.spec.ts 未提交改动，审查只读取固定 Git 对象，未将该改动计入结论。 |

## Linux x64 候选门禁与夹具

以下是给 Lead 的复验命令，本轮未执行。先在固定提交的干净输入上用已缓存依赖、Node 24.21.0 和 pnpm 12.10.1，持有 /tmp/huhu-heavy.lock，串行运行 pnpm build 与 pnpm --filter @huhu/desktop exec electron-builder --linux AppImage --x64 --publish never。固定构建记录中的 AppImage 路径与 SHA，核对完整 build-info。包验收阶段从这一个 AppImage 解出真实应用目录，运行两个单独的 grep，各自一个临时 Vault、应用数据目录、provider home、独立的 Xvfb 和私有 Secret Service。已确认本机有 dbus-run-session、gnome-keyring-daemon、secret-tool、xvfb-run 和 jq。若本机预检遇到 AppArmor 的已知只读错误，沿用既有私有测试总线配置及合成条目读写探针。 [既有私有 Secret Service 预检](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-7-ssh-module/verification/headless-engine-credentials-linux.md)

可用的合成输入是仓库的 codex-responses HTTP 回环夹具（Circle／Square、READY、固定结果、无需 OpenAI 账户）、用例自己的空 Vault／第二 Space／Git 评审文件，以及 W8 的 Pi 历史输入。真实 Codex fixture 已静态重算 SHA，匹配 880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971。集成资源的 Linux x64 Core 文件重算 SHA 为 d408197a6b85af97b2fe93a10e6f4bee18d3a654307db94df2b35aea277c466f，版本锁为 0.1.19；锁文件内 4adcfb423d52f24c5cc4a1e2cd2fcad1f62d28bb77876ac472c29082a3eaa424 是发行 tar.gz 的 SHA。验收时沿用相同 Core，核对解包后的实际字节。HUHU_AGENT_LAUNCH_TEST_BIN、HUHU_CODEX_NATIVE_TEST_BIN 仅用于单独复跑上述源码预检。两个包用例使用 HUHU_CODEX_DISPATCH_BIN 及包内 Core。 [固定 Codex 预检](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/codex-pinned-fixture.log)

从集成根执行下列 Bash。先由构建记录设置 CANDIDATE_APPIMAGE 和 CANDIDATE_SHA256。两个入口现阶段即使都实际通过，也只能补齐已有包用例的执行证据。完整签收还须补齐上述阻断场景和进程断言，按最终提交重新固定包。

```bash
set -euo pipefail
commit=f310e541a86825cc5a7ac100b4c230e5bbf1fdca
test "$(uname -sm)" = 'Linux x86_64'
test "$(git rev-parse HEAD)" = "$commit"
test -z "$(git status --porcelain)"
export PATH="/home/wta/.volta/tools/image/node/24.21.0/bin:/home/wta/.local/bin:/usr/bin:/bin"
export COREPACK_HOME=/home/wta/.local/share/corepack
export COREPACK_ENABLE_NETWORK=0
test "$(node -v)" = v24.21.0
test "$(pnpm -v)" = 12.10.1

exec 9>/tmp/huhu-heavy.lock
flock 9
artifact=$(realpath -e "${CANDIDATE_APPIMAGE:?}")
expected="${CANDIDATE_SHA256:?}"
provider=/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/fixtures/codex-0.170.0/codex
printf '%s  %s\n' "$expected" "$artifact" | sha256sum -c -
printf '%s  %s\n' 880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971 "$provider" | sha256sum -c -
gate_root=$(mktemp -d /tmp/huhu-pkg.XXXXXX)
mkdir "$gate_root/extract"
(cd "$gate_root/extract" && "$artifact" --appimage-extract >"$gate_root/extract.log")
appdir="$gate_root/extract/squashfs-root"
exe=$(realpath -e "$appdir/huhu")
test "$exe" = "$appdir/huhu"
test -x "$exe"
asar="$appdir/resources/app.asar"
node scripts/check-asar-contents.mjs "$asar" | tee "$gate_root/asar.log"
grep -F -- "($commit)" "$gate_root/asar.log"
sha256sum "$artifact" "$exe" "$asar" \
  "$appdir/resources/herdr/linux-x64/herdr-core" \
  "$appdir/resources/codex-dispatch/helper.cjs" \
  "$appdir/resources/bin/huhu" "$appdir/resources/cli/cli.mjs" \
  "$provider" >"$gate_root/inputs.sha256"
printf '%s  %s\n' d408197a6b85af97b2fe93a10e6f4bee18d3a654307db94df2b35aea277c466f \
  "$appdir/resources/herdr/linux-x64/herdr-core" | sha256sum -c -

run_case() {
  local name="$1" opt_in="$2" title="$3"
  local state="$gate_root/$name"
  mkdir -m 700 -p "$state"/{home,config,data,state,cache,runtime,tmp}
  env -i PATH="$PATH" COREPACK_HOME="$COREPACK_HOME" COREPACK_ENABLE_NETWORK=0 \
    HOME="$state/home" USERPROFILE="$state/home" \
    XDG_CONFIG_HOME="$state/config" XDG_DATA_HOME="$state/data" \
    XDG_STATE_HOME="$state/state" XDG_CACHE_HOME="$state/cache" \
    XDG_RUNTIME_DIR="$state/runtime" TMPDIR="$state/tmp" \
    SHELL=/bin/sh LANG=C.UTF-8 GIT_CONFIG_NOSYSTEM=1 \
    HUHU_PACKAGED_EXE="$exe" HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT="$artifact" \
    HUHU_TASK_JOURNEY_PACKAGE_SHA="$expected" HUHU_CODEX_DISPATCH_BIN="$provider" \
    "$opt_in=1" dbus-run-session -- bash -euo pipefail -c '
      printf "%s" "huhu-isolated-test" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
      printf "%s" "huhu-test-value" | timeout 10 secret-tool store --label="Huhu test" huhu-probe candidate
      test "$(timeout 10 secret-tool lookup huhu-probe candidate)" = "huhu-test-value"
      timeout 10 secret-tool clear huhu-probe candidate
      exec xvfb-run -a pnpm exec playwright test -c playwright.config.ts \
        tests/e2e/workflows/task-journey.spec.ts --grep "$1" --workers=1 --retries=0 \
        --reporter=json --output="$2"
    ' bash "$title" "$state/results" >"$state/report.json" 2>"$state/stderr.log"
  jq -e '.stats | .expected == 1 and .skipped == 0 and .unexpected == 0 and .flaky == 0' "$state/report.json"
  sha256sum -c "$gate_root/inputs.sha256"
}
run_case w8 HUHU_AGENT_WORKSPACE_ACCEPTANCE 'W8\.2/W8\.3 候选安装包'
run_case t7 HUHU_TASK_JOURNEY_ACCEPTANCE 'T7\.2 候选安装包'
printf '%s\n' "$gate_root"
```

同一解包目录另用 scripts/smoke-cli.sh 对真实随包 CLI 做版本和 headless vault.info 启动检查，沿用上面的隔离环境。T7.1 的权限和回执联验仍需对这个包启动的 Engine 运行随包 CLI 与真实 HTTP MCP 客户端，保留默认拒绝、显式开放和撤权的原始响应，以及与 Tasks 的共同 ID。W8、T7 两份 JSON 及其附件各保留包 SHA、完整提交、平台、实际 Core／provider 版本，以及对应的 occurrence／dispatch、run／attempt、session、request、receipt、message；需要完整签收时补齐前述覆盖缺口。包构建和验收应压在同一重型门禁安排中，任何跳过单列。

## 产物与改动

仅发布本报告。固定代码审阅、现成日志核对和夹具文件散列复算已完成。未启动构建、E2E 或测试套件，未修改源码、任务、manifest 或远端。

## Lead 验收

待 Lead 追加。
