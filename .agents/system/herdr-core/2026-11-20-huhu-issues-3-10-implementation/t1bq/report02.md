# Windows 全量 Vitest 的 onTaskUpdate 超时

**结论：`7ff591a0` 的失败点是 worker 等待任务状态上报回包超过 60 秒。** Vitest 汇总了 1291 个通过用例、25 个跳过用例，另有 1 个未处理错误，单元门禁正确地返回失败。1291 是用例数，日志没有统计各用例内部的断言次数。现有日志能确定故障层，无法确定哪个 worker、哪一个文件，或收发哪一段耗尽了时间。

**最快的区分试验**是在空闲 Windows 冻结副本上，用原 forks 和原 reporter 单独跑完整的 `packages/editor/test/golden-roundtrip.test.ts`。它是两轮共同最慢、且测试文件内容相同的候选，一次只需覆盖 128 个用例。若全通过但出现同一 RPC 错误，就把复现缩到一个文件；若干净通过，再将 editor 项目和其余项目分别置于独立 Vitest 进程串行运行。无需先花约 14 分钟重跑单 worker 全库；更早已有该配置失败的记录。

## 现场证据

| Windows 运行 | 观察 | 能支持的判断 |
| --- | --- | --- |
| `7ff591a0`，forks，最多 3 workers | 前置 `node --test` 18/18。Vitest 3.2.7，135 文件通过、2 跳过，1291 用例通过、25 跳过，332.28 s。最后只有 `[vitest-worker]: Timeout calling "onTaskUpdate"`，无具名失败测试。 | 该次门禁因 runner 未处理错误退出。此前的 build 已完成，脚本到单元门禁失败即停。 [实际命令与前置检查](../../../../../temp/issue-baseline/7ff591a0-window-candidate.log#L482) · [异常与汇总](../../../../../temp/issue-baseline/7ff591a0-window-candidate.log#L1092) |
| `0c96c27b`，forks，最多 **1** worker | 127 文件通过、2 跳过，1259 用例通过、25 跳过，854.73 s，同一个 RPC 栈。另一个 gates 进程与 unit 均于 04:58:28 启动，分别在 05:04:17、05:12:50 结束。 | 单 worker 仍需跨进程上报。旧轮有外部负载重叠，不能从两次不同提交推出 worker 数的因果关系。新轮无同时段 CPU、内存、磁盘或 IPC 时序记录。 [旧轮参数与结果](../../../../../temp/issue-baseline/0c96c27b-windows-unit.log#L566) · [unit 时间窗](../../../../../temp/issue-baseline/0c96c27b-windows-unit-transcript.log) · [另一门禁时间窗](../../../../../temp/issue-baseline/0c96c27b-windows-gates-transcript.log) |
| 两轮共同的长文件 | golden-roundtrip 分别耗时 85.291 s、148.582 s。20k 样本分别 47.942 s、56.025 s；冻结测试给大样本 360 s。更早的 Windows 单文件复跑中，20k 样本用时 **63.123 s**，整文件 128/128 通过，未报 RPC 错。 | 这是优先验证的文件；文件或用例耗时超过 60 s 本身不足以解释故障。文件包含富文本转换和同步序列化，两轮的 Git blob 相同。 [新轮耗时](../../../../../temp/issue-baseline/7ff591a0-window-candidate.log#L597) · [旧轮耗时](../../../../../temp/issue-baseline/0c96c27b-windows-unit.log#L60) · [独立单文件对照](../../../../../temp/issue-baseline/764e324-golden-rerun.log#L37) |
| 更早的 OAuth/W5 定向组装 | 6 文件、55 通过、3 跳过，15.70 s。新轮全量中的 OAuth 两项也通过。 | 有本地轻量对照，没有证据把此次超时归到 OAuth、W5 或汇总前最后打印的文件。[定向范围与结果](../../../../../temp/issue-baseline/w5-oauth-assembly.log#L71) · [冻结版 OAuth 结果](../../../../../temp/issue-baseline/7ff591a0-window-candidate.log#L836) |

## 为什么全部测试能通过，进程仍退出 1

1. 安装的 `@vitest/runner@3.2.7/dist/chunk-hooks.js:1456–1505` 按 task ID 合并状态，保留事件，按固定 **100 ms** 节流发批次；收尾时等待未结算或已拒绝的更新。Vitest 的 `index.CwejwG0H.js:47` 将批次传给 `rpc().onTaskUpdate`。它不在无需回复的事件名单中。[本机 runner](../../../../../temp/issue-worktrees/integration/node_modules/.pnpm/@vitest+runner@3.2.7/node_modules/@vitest/runner/dist/chunk-hooks.js#L1456) · [worker 封装](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/rpc.-pEldfrD.js#L42)
2. forks 使用 V8 序列化和子进程 `process.send/message`；threads 改用 MessagePort。两者共用 birpc 的请求 ID 与计时器。安装版本的 `DEFAULT_TIMEOUT = 6e4`，worker 发送时开始计时，收到匹配回包才清除。到期则拒绝并删除该待处理请求。报错栈里的 `rpc.-pEldfrD.js:53` 与 `index.B521nVV-.js:59` 正是这条路径。这个错误没有携带测试路径、worker PID 或耗时分段。[两种 transport](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/utils.CAioKnHs.js#L9) · [计时器与回包](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/index.B521nVV-.js#L53)
3. 主端先 `state.updateTasks`，逐项等待报告事件，再等待 reporter；birpc 等处理函数返回才发 ACK。状态可能已计入通过数，而 worker 的回包尚未处理。主端积压、慢 reporter、系统调度或 worker 事件循环长时间不能消费消息均与该现象相容。仅凭这一栈无法区分。最终 Vitest 收到未处理错误便设置非零退出码。[主端处理顺序](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/cli-api.DVe0nWUx.js#L8876) · [退出码](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/cli-api.DVe0nWUx.js#L9894)

本轮做了一个**不运行测试的 Windows 子进程对照**。Node 24.21.0 通过 stdin 载入实际安装的 `createRuntimeRpc` 和 forks transport，发两次合成 `onTaskUpdate`。父进程对第一条按请求 ID 回包，worker 正常完成；第二条父进程已收到，刻意不回包，worker 在 **60,011 ms** 报出与冻结日志完全相同的错误。探针沿用默认超时，未写仓库文件。这证明该栈可以由等待 ACK 单独产生；现场是否丢包、主端迟发或 worker 迟收仍待区分。

## 冻结结束后的最小复跑步骤

使用准备好依赖和原生测试二进制的 **`7ff591a0` Windows 副本**。分析时集成目录的 HEAD 已向前移动，复跑时须核对对象。保留原 `CI=true`、`NO_COLOR=1`、三个 `HUHU_*` 原生二进制路径、Node 24、pnpm 12.10.1、数据盘和日志重定向方式，每一轮使用新日志；确保同机无另一套 build、Playwright 或全量 Vitest 在竞争。原门禁按 workspace 的 `packages/*`、`plugins/*`、`apps/*`、`tests/perf` 选项目；editor 默认排除 vendor，perf 的常规 test include 为空。保留这些选择条件。[门禁环境及入口](../../../../../temp/issue-baseline/full-window-checkpoint.ps1#L4) · [workspace](../../../../../temp/issue-worktrees/integration/vitest.workspace.ts) · [editor 配置](../../../../../temp/issue-worktrees/integration/packages/editor/vitest.config.ts) · [perf 配置](../../../../../temp/issue-worktrees/integration/tests/perf/vitest.config.ts)

以下 PowerShell 在该副本根目录执行。固定 pnpm 是原门禁使用的本机路径，日志写入系统临时目录。函数在任何一次非零退出时中止当前步骤并保留原始输出，方便按结果选择下一步。

```powershell
if ((git rev-parse HEAD) -ne '7ff591a0ff797c3205e50a3d788173c783164723') { throw '冻结提交不符' }
$pnpmBin = 'D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/970127aafa9ec9f356ff26bd7887dbdb8a2494cef0a96bf91bbdea1323026672/node_modules/@pnpm/exe.win32-x64/pnpm.exe'
$env:Path = (Split-Path $pnpmBin) + ';' + $env:Path
$env:npm_config_verify_deps_before_run = 'false'
$env:npm_config_manage_package_manager_versions = 'false'
$env:CI = 'true'
$env:NO_COLOR = '1'
$env:HUHU_HERDR_BIN = Join-Path $PWD 'apps/desktop/resources/herdr/win32-x64/herdr-core.exe'
$env:HUHU_AGENT_LAUNCH_TEST_BIN = $env:HUHU_HERDR_BIN
$env:HUHU_AGENT_PTY_HOST = Join-Path $PWD 'native/agent-pty/bin/huhu-agent-pty.exe'
$pnpmFlags = @('--config.offline=true', '--config.verify-deps-before-run=false')
function Invoke-UnitProbe([string]$label, [string[]]$commandArgs) {
    $log = Join-Path $env:TEMP ("7ff591a0-{0}-{1}.log" -f $label, (Get-Date -Format 'yyyyMMdd-HHmmssfff'))
    & $pnpmBin @pnpmFlags @commandArgs *> $log
    $code = $LASTEXITCODE
    Write-Host "$label exit=$code $log"
    Get-Content -Encoding UTF8 $log -Tail 24
    if ($code -ne 0) { throw "$label 退出码 $code" }
}

$vitest = @('exec', 'vitest', 'run')
$fork1 = @('--pool', 'forks', '--maxWorkers', '1')
$golden = @('--project', '@huhu/editor', 'packages/editor/test/golden-roundtrip.test.ts')
Invoke-UnitProbe 'golden' ($vitest + $fork1 + $golden)
```

- **单文件复现**：保留整文件、forks、1 worker、同一日志目的地，仅增加 `--reporter=dot` 再跑一次。需要比较 transport 时恢复默认 reporter，改为 `--pool threads --maxWorkers 1`，仅比较同一个 golden 文件。必要时再跑原条件确认是否间歇。一个文件用 3 与 1 个 worker 都只有一个活动文件，这一对照不能测量多文件竞争。dot 只改变输出格式，非 TTY 下仍输出进度；`--silent=passed-only` 另行控制测试 console。JSON-only 在此版本的 `success` 判定未计入独立的 unhandled errors，因此始终保留人可读日志和原进程退出码。[reporter 实现](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/index.VByaPkjc.js#L1711)
- **单文件干净**：下一步运行下列两个互补 project 选集，每组一个新进程，依次运行。在同一提交与原 Windows 环境下，原日志逐文件计数得到 **editor 9 文件，176 通过、1 跳过；其余 128 文件，1115 通过、24 跳过**。同时比对文件名和用例数，避免重复、漏跑或因原生路径失效新增跳过。若一组失败，保留失败结果，对该组按 project 或文件二分；若测试集相同且单独运行干净，再比较多个文件下原来的 3 workers 与 1 worker。多次 `--project` 在同一命令中仅筛选项目，分两次调用才能获得两个独立主进程。[Vitest v3 项目筛选](https://v3.vitest.dev/guide/workspace)
- **需要恢复原全量门禁时**：在安静窗口单独执行下面的 `original-gate` 一行。两个分组都干净可证明覆盖到了同一组用例；原 3-worker 单进程调度能否干净结束，须由原命令的独立结果记录。分组用 `exec vitest` 节省重复开销，根门禁用 `run test` 以带上前置 18 个 Node 用例。

```powershell
# 单文件干净后顺序执行；若失败，先诊断失败组。
Invoke-UnitProbe 'editor' ($vitest + $fork1 + @('--project', '@huhu/editor'))
Invoke-UnitProbe 'other-projects' ($vitest + $fork1 + @('--project', '!@huhu/editor'))

# 仅作最终原条件复核，单独执行。
Invoke-UnitProbe 'original-gate' @('run', 'test', '--pool', 'forks', '--maxWorkers', '3')
```

**调参边界。** 本仓常规项目没有另设 forks 的 min/max。在这版 `--maxWorkers 1` 将该 pool 的并行文件上限降为一；`--no-file-parallelism` 也会将池的 min/max 设为一。两者都保留 worker IPC。无需打开改变隔离语义的 singleFork。项目分池、项目内并发以及测试里启动的 git、Core 等子进程应分别看待。`maxConcurrency` 约束并发用例；`testTimeout`、`hookTimeout`、`teardownTimeout` 各作用于测试、钩子、销毁。安装版公开 CLI、配置和 worker transport 均未提供调节上述 **60 s RPC 时限**或 **100 ms 上报节流**的字段。把全库切到 threads 还会引入新的平台差异，例如冻结的 CLI 测试使用 `process.chdir()`，本机 Node Worker 实测抛 `ERR_WORKER_UNSUPPORTED_OPERATION`。保留原有未处理错误策略。[forks 池实现](../../../../../temp/issue-worktrees/integration/node_modules/vitest/dist/chunks/coverage.DfSpMS-b.js#L2608) · [CLI 用例](../../../../../temp/issue-worktrees/integration/apps/cli/test/cli.test.ts#L219) · [Vitest v3 pool 配置](https://v3.vitest.dev/config/#pool)

**判定与留证。** 每轮记录 SHA、命令、开始结束时间、原退出码、文件/用例/跳过数和 unhandled 明细。出现具名断言差异或外部行为不符，沿该用例检查产品与夹具；出现具名 `Test timed out` 或 hook 超时，查用例/钩子的等待；再次仅见 `onTaskUpdate` 则继续查 runner。若隔离组仍能复现，下一轮采样主进程及对应 worker 的 PID、CPU、内存、磁盘等待；要进一步判定耗时在哪一段，诊断探针需按同一 RPC ID 对齐四个时刻（worker 发出、主端收到、主端发回、worker 处理回包）。日志最后打印的文件及一次绿色重试均不能归因。全量通过要求原命令 exit 0、预期覆盖、无 unhandled error。

本轮未运行项目测试或构建。除本报告外，未写仓库、业务文件或 node_modules。
