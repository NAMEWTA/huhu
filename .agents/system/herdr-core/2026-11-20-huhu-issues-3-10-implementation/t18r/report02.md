# E07 Windows 控制台中继回归诊断

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t18r`，与本机 `HC_TERMINAL_ID` 一致
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18r/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18r/report02.md`
- 执行结果 — **done**

## 结论

第一轮中继在 **Windows PowerShell 5.1 的 JSON 数组解包**处失败。对 `ProtectedLaunch.issue()` 真实返回的 argv 解码后运行其赋值语句，四元素数组整体落入 `$executable`，`$helper`、`$port`、`$ticket` 均为 null。`ProcessStartInfo.FileName` 最终等于四项以空格连接的字符串。Node 和 Electron 都未能启动 helper，中继输出固定错误并返回 1。Engine 据此把运行记为 `failed`，复现原 profile 的 `module-credential-host.test.ts:212`。

最小修复是给第 19 行右侧调用加一对括号，先求出数组，再做多变量赋值。

```powershell
$executable, $helper, $port, $ticket = (ConvertFrom-Json -InputObject $serialized)
```

**工作区在诊断期间已纳入这行修复，并更新了测试中对 argv 的断言。** 已使用更新后 `issue()` 的原始返回值复测，Node 与 Electron 的四个成功/非零退出对照全部符合预期。Engine 丢首个启动回包时也能按原地址恢复同一会话。Lead 重跑的 profile 中，原失败测试文件 3/3 通过。

## 产物与改动

诊断工作目录 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`，HEAD `5bdaff66`。两轮都读取实际工作文件。第一轮 `plugins/agent-cli/src/engine/protected-launch.ts` 的 SHA-256 为 `d4f927835f377e7f7c9a0d88b49b5e5ebc31ffac286cb59b2e7b4e6362695053`，加入括号后为 `010237d6666e0d664858cce8276b408c30d33c9bb3f4eb9d00e627d54fbb1578`。

本 worker 的写入仅为此报告及 `D:/Document/code/huhu/temp/issue-baseline/t18r-task02-relay` 下的独立合成夹具和日志。夹具使用产品原有 broker、helper 和 Core；在自己的含空格目录内复制同一份 helper。Engine 夹具使用独立测试 Vault 和合成凭据，收尾清除配置、关闭引擎和 Core、删除自己的临时运行目录。未编辑业务或项目测试，未提交。

## 验证

| 验收项 | 实测结果 | 证据（相对夹具目录） |
| --- | --- | --- |
| 真实 argv 与解析差异 | Core 收六项外层 argv：`powershell.exe`、`-NoLogo`、`-NoProfile`、`-NonInteractive`、`-EncodedCommand`、UTF-16LE Base64 脚本。脚本内的 UTF-8 JSON 确含四项。原语句得到 `System.Object[]`，长度 4，另三项为空；加括号后首项为 `System.String` 且等于实际可执行文件路径，helper、十进制端口与票据格式均正确 | `relay.log`、`relay-current.log` 的两条 `shape` |
| 含空格路径、stdout、stderr 与退出码 | 真实 helper 位于 `path with spaces/protected-launch-helper.cjs`。子命令检查合成环境，分两次写值至 stdout，再向 stderr 写公开标记。原语句在两种宿主都返回 1。当前原样 argv 在 Node 和 Electron 下分别跑预期 0 和 7，四次均读到 `env-received:***` 及 `stderr-marker`，退出码依次为 0、7、0、7 | `relay-current.log` 中 `argvAsIssued:true` 的四行 |
| Core 原地址、argv 与进程绑定 | 每次均按唯一标签在 `terminal.list(all:true)` 找回一行。`terminal.run` 回包、提交 argv 与查询所得 argv 逐项相同，项目 `launchHash` 相同，`processBinding` 的地址、PID、创建时间一致。按首次回包的原地址读取输出，cwd 与标签匹配 | `relay-current.log` 的 `oneAddress`、`argvEqual`、`hashEqual`、`bindingEqual` |
| 丢启动回包后 Engine 对账 | 桌面 dispatcher 对同一幂等键并发两次 `automations.runNow`。仅在真实 Core 接单后丢弃第一次回包。修前、修后均只签发一次、只执行一次 `terminal.run`、两份业务回包相等。修前 `failed`，修后 `succeeded` 且正文有脱敏输出。运行详情的 `data.sessionId` 对应会话的 `terminalId` 等于原 Core 地址，读后正常释放该地址。两组日志的 `t1` 分属独立 Core | `recovery.log`、`recovery-current.log` |
| 票据一次性与数据范围 | 对已领取的完整 argv 再执行，Node / Electron 均返回 1，并得到 helper 的拒绝提示。公开日志仅记录布尔结果。已检查 Core 外层参数、解码后的脚本和四项配置，均无目标命令、合成环境名或值；终端输出无合成明文 | `relay-current.log` 中 `envelopeSafe`、`privateInOutput` 和两条 `replay` |
| 原回归入口 | 初读 `temp/issue-baseline/terminal-cutover-desktop.log` 为第 212 行期望 succeeded、实际 failed，合计 20 过 1 败。此路径会被 profile 重写。修后同路径显示 `module-credential-host.test.ts (3 tests)` 通过，该批 21/21 通过 | `profile-summary.log` 摘录 Lead 的重跑结果 |

**复查命令。** 以下为本任务实际执行的两个独立诊断入口。Windows PowerShell `5.1.26100.9818`，pnpm `12.10.1`，Node `v24.21.0`，Electron `44.9.1`，应用测试 Core `0.1.19`。夹具同时支持上述两轮源码；最终日志的 `argvAsIssued:true` 表示没有更改产品签发的 argv，另一组仅在夹具内切换该行括号形成对照。

```powershell
Set-Location 'D:/Document/code/huhu/temp/issue-worktrees/task-cutover'
$pn = 'D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/970127aafa9ec9f356ff26bd7887dbdb8a2494cef0a96bf91bbdea1323026672/node_modules/@pnpm/exe.win32-x64/pnpm.exe'
$diag = 'D:/Document/code/huhu/temp/issue-baseline/t18r-task02-relay'
$flags = @('--config.offline=true','--config.verify-deps-before-run=false')
$env:TSX_DISABLE_CACHE = '1'
& $pn --version
& $pn @flags exec node "$diag/relay.cjs" | Tee-Object "$diag/relay-current.log"
& $pn @flags exec node --import ./node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/loader.mjs "$diag/recovery.mjs" | Tee-Object "$diag/recovery-current.log"
```

## 阻碍与接续

本项诊断无阻碍。原断言把 Core argv 当作四项直接 helper 参数。当前 `module-credential-host.test.ts:214` 已改为断言六项 PowerShell argv，并解码检查内部四项及合成值隔离。项目回归入口为该文件的「Windows 自动化用同一请求只启动一次，本机规则环境不进入 Core 或 ZIP」及 `tests/e2e/workflows/acceptance.spec.ts:900`。本 worker 直接验证了实际 Core、两种宿主、真实 Engine 和启动回包重查；完整桌面 profile 由 Lead 执行。

Lead 的最新桌面重跑已经越过第 928–929 行的公开输出与脱敏断言，随后在第 930 行等待精确名称为「规则」的按钮 30 秒超时，清除步骤尚未执行。见 `desktop-followup.log`。当前 `plugins/automations/src/ui/i18n.ts:3` 的规则导航文案为「定时自动化」，`AutomationsModule.tsx:70` 的按钮还渲染计数。建议将这个测试定位器限定在「自动化导航」内，按以「定时自动化」开头的按钮名称定位，再重跑同一条用例完成清除验收。

## Lead 验收

待 Lead 核验。
Lead 复验 Windows 21 项 Engine/领域测试及桌面 E2E。完整规则配置、公开输出、脱敏回显和清除在保护终端切换提交 311ba0c8 上通过。
