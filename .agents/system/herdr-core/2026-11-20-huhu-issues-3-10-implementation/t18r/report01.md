# #5 E07 Windows 终端规则工作台空输出诊断

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t18r`（本机 `HC_TERMINAL_ID` 一致）
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18r/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18r/report01.md`
- 执行结果 — **done**

## 结论

Windows 桌面把 Electron 主程序作为受保护 helper 的 Node 运行时。由测试所用的 Herdr Core 直接在 PTY 中启动 `electron.exe` 并设置 `ELECTRON_RUN_AS_NODE=1` 时，helper 对标准输出和标准错误的写入可以成功返回，但 Core 的终端缓冲区收不到文本。换为控制台版 `node.exe`，保持同一 Core、helper、命令、票据协议和合成环境，3/3 次得到预期的 24 字符。换回 Electron，3/3 次在退出及退出后约 1.1 秒的两次 `terminal.read` 均得到原始 `{text:""}`。六次退出码都是 0。

真实桌面也复现了这个分界。原始桌面从工作台保存合成变量、停用 Safe、点击立即运行后，后台已持久化的正文和页面正文都只有标题。仅在诊断入口给 Engine 注入控制台 Node 作为 helper 宿主，再走相同桌面操作，两处都出现 `protected-environment-ok`。两次均为 `succeeded`，均在 finally 清除合成配置。结果足以定位输出丢失的进程边界；具体由 Electron 或 Windows 在哪个底层调用中选择了该标准句柄，未做原生调试。

## 产物与改动

工作目录 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`，分支 `impl/huhu-issues-3-10-production-cutover`，HEAD `5bdaff66`。按现场 E07 未提交工作文件和已有 Electron 构建进行诊断。业务源码、项目测试、Git 和清单均只读。未安装依赖、连接远端或运行全量门禁。

夹具与日志在 `D:/Document/code/huhu/temp/issue-baseline/t18r-output-diag`。`matrix.cjs` 直接复用项目的 `HerdrCore`、`ProtectedLaunch`、`shellCommand` 和真实 helper，对每次实验启动独立 Core，并在 finally 停止。`ui.cjs` 通过 Playwright 操作实际桌面。原始组直接启动现有桌面入口，对照组的 `ui-main.cjs` 在调用同一桌面入口前仅替换传给 Engine 的 `HUHU_NODE_BIN`。各组独立 Vault、userData 和票据。UI 夹具已清除合成凭据、停止独立 Core 并移除两份临时 Vault/userData。

## 验证

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 既有原始用例 | `acceptance.spec.ts:928` 多次得到 `<pre>## 输出</pre>`，缺少公开标记 | `../terminal-cutover-desktop.log:376–387`（相对夹具目录）；重复记录 `../terminal-cutover-desktop-e2e.log:25–36` |
| 原 PowerShell 命令，真实 helper | Node 3/3 读到 24 字符，Electron 3/3 读到 0 字符。六次的首次及延迟读数一致 | `matrix.log` |
| 绕开 PowerShell 与脱敏器，直接写 fd 1/2 | Node 为 TTY WriteStream，Core 收到 stdout、stderr 的流写与 fd 写共 4 个标记。Electron 为非 TTY SyncWriteStream，两路回调均成功，两个 fd 写均返回 10，Core 收到 0 字符 | `stdio.cjs`、`matrix.log` |
| 验证简易变体 | `ELECTRON_NO_ATTACH_CONSOLE=1` 仍为 0 字符。PowerShell 脚本只用调用运算符直接启动 GUI 程序，仍为空，还将子进程预期的 7 报成 0。管道到 Out-Host 的对照能收 stdout 并传回 7 | `controls.log`、`parent-direct.log` |
| Windows 控制台进程用独立管道转写两路字节 | 同一 Electron 和 helper 得到 24 字符公开标记；混合用例能读到 stdout、stderr 两个标记且退出码为 7；分两次写合成值后只看到 `env-received:***` | `parent-bytes.ps1`、`parent-bytes.log` |
| 实际工作台与后台正文 | 原始组 `apiMarker=false, uiMarker=false, headingOnly=true`；Node 对照组 `apiMarker=true, uiMarker=true, headingOnly=false`。两次页面与后台正文字面一致（去首尾空白），均未出现合成值 | `ui.log` |

**数据链。** `apps/desktop/src/main/engine-supervisor.ts:77` 把桌面 `process.execPath` 传给 Engine。`plugins/agent-cli/src/engine/index.ts:76` 将其用于 `ProtectedLaunch`；`sessions.ts:494` 用 `ELECTRON_RUN_AS_NODE` 交给 Core。helper 以管道接 PowerShell 的两个输出，逐流脱敏后写自己的 stdout/stderr 并等待回调（`protected-launch-helper.cjs:86–94`）。`sessions.ts:869–870` 优先读 Core 的 `text`，空串此次已经存在于 RPC 响应中。`plugins/automations/src/engine/service.ts:435–445` 按退出码 0 记成功并写标题和空文本。`RunsPanel.tsx:113,162` 读取该正文并 trim 显示。重复等待、改 Markdown 或改 UI 都没有触及已验证的丢失边界。

**实际运行的本机命令**（PowerShell；所有日志名相对 `$diag`）。

```powershell
Set-Location 'D:/Document/code/huhu/temp/issue-worktrees/task-cutover'
$pn = 'D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/970127aafa9ec9f356ff26bd7887dbdb8a2494cef0a96bf91bbdea1323026672/node_modules/@pnpm/exe.win32-x64/pnpm.exe'
$diag = 'D:/Document/code/huhu/temp/issue-baseline/t18r-output-diag'
$flags = @('--config.offline=true','--config.verify-deps-before-run=false')
& $pn --version
& $pn @flags exec node "$diag/matrix.cjs" | Tee-Object "$diag/matrix.log"
& $pn @flags exec node "$diag/matrix.cjs" --controls | Tee-Object "$diag/controls.log"
& $pn @flags exec node "$diag/matrix.cjs" --parent-direct | Tee-Object "$diag/parent-direct.log"
& $pn @flags exec node "$diag/matrix.cjs" --parent-bytes | Tee-Object "$diag/parent-bytes.log"
& $pn @flags exec node "$diag/ui.cjs" 2>&1 | Tee-Object "$diag/ui.log"
```

pnpm `12.10.1`，Node `v24.21.0`，Electron `44.9.1`。探针对应验收脚本的二进制 `D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe`，独立实例 `server.status` 报 `0.1.19`。主题协调使用的 Core 版本与此应用用例无关。

## 阻碍与接续

诊断已完成。建议最小修复位置是 **Windows 桌面的受保护 helper 启动入口**。若产品已有随包受信的控制台 Node，可仅为此入口选择它；当前 `apps/desktop/electron-builder.yml` 的额外资源中未列出独立 Node。沿用现有 Electron 分发时，可让控制台启动器以管道接收原 helper 已脱敏的 stdout/stderr，同时转写给 PTY，并等待两路排空和子进程退出，返回真实退出码。`parent-bytes.ps1` 是此路径的实验样本。保持票据领取、明文只送目标子进程、streaming 脱敏和启动回执 argv 绑定。桌面对照所用的开发机 Node 绝对路径仅用于诊断。字节中继已经过 Core 实验，尚未在打包桌面验证脚本资源、含空格安装路径和取消时的子进程回收。

**回归入口。** 在修复后的桌面构建运行以下单用例，覆盖实际 Electron 宿主、配置与清除、Safe 停用后仍能运行、报告有公开输出且无合成值。保留现有 Engine 真 Core 测试作为分段脱敏、单次启动和回执验证。它默认在测试进程的 Node 下启动 helper，正好解释了其成功和原始桌面失败可以同时成立。仅跑本文的 Node 对照不能验收产品修复。

```powershell
$env:HUHU_HERDR_BIN = 'D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe'
$env:HUHU_AGENT_LAUNCH_TEST_BIN = $env:HUHU_HERDR_BIN
& $pn @flags exec playwright test tests/e2e/workflows/acceptance.spec.ts:900 --workers 1
& $pn @flags exec vitest run --pool forks --maxWorkers 1 apps/engine/test/module-credential-host.test.ts -t 'Windows 自动化用同一请求只启动一次'
```

## Lead 验收

待 Lead 核验。
