# Windows 交互式 Agent 的受保护环境

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t192`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report01.md`
- 执行结果 — **done（只读分析）。W7.3 交互式秘密注入尚未通过产品验收。**

## 结论

**保留 Core 管理的交互终端。带受保护环境的启动，建议由随应用交付的 Windows 控制台宿主承接，并在 Engine 核对本次启动和实际宿主进程后，向它单次交付目标环境。** 目标是让真实 CLI 运行在内层 ConPTY，输入、尺寸和中断都可达，在输出进入 Core 屏幕或历史之前处理受保护值。当前代码已有凭据存储、固定目标批准和会话对账三部分，还缺进程身份绑定及保留 TTY 的受保护交接。这个方案是设计判断，下面列出已实测的边界。

| 固定 Core 0.1.19 上的本机观察 | 结果 | 对设计的影响 |
| --- | --- | --- |
| 由 Core 直接运行交互式 Node REPL | stdin/stdout/stderr 都是 TTY，输入表达式得到 132。普通合成标记实际进入 Core 私有磁盘记录的 `restart_env` | 可用于无秘密的交互启动。事后删除来不及阻止启动时落盘 |
| 原样使用现有 `ProtectedLaunch.issue`、Electron 44.9.1 和项目 helper 运行同一 REPL | 子进程收到合成环境；Core 记录仅含 `ELECTRON_RUN_AS_NODE`。三个流均非 TTY，两轮均未得到 132。两轮退出码都是 0，其中一轮 Core 甚至受理了输入 | 退出码、输入 RPC 成功、收到环境值，均不足以证明交互可用 |
| 真实安装的 Pi 1.5.2 直接走 Core | 空配置、离线、禁用扩展与 MCP，看到启动界面，输入内建 `/quit`，退出码 0。未发模型请求 | 固定 Core 能承载真实交互 CLI。该次只验证 PTY，无产品授权或凭据交付。Pi 本机 `dist/main.js:84` 会在 stdin 或 stdout 非 TTY 时选择 print 模式 |

以上两轮分别清除了 2、3 个测试终端，停止各自独立的 Core，并删除临时目录。磁盘检查直接读取私有快照。`terminal.list` 会隐藏该字段。[首次对照](pty-result.json) · [带真实 Pi 的第二轮](pty-with-pi.json)

## 代码与装配证据

以下 Huhu 路径相对于 integration 的取证提交 `46a770ed6f0224b5d9c2f273432620449fb04dc2`。另以 Git 对象只读检查 `69776e6887fb8ff75f4992f81445ebc8f15fa959`，它在取证时尚非该 integration 提交的祖先。

| 边界 | 事实与可复用部分 |
| --- | --- |
| 固定 Core | 官方 `v0.1.19` 指向 `06793ede1bedb1fed8d22d3cae476d3eb239edf0`。从 Windows 只读取得该标签源文件，逐个用 Git blob 哈希核对。常用的 `temp/sources/herdr-core@c751780` 标为 **0.1.21**。锁定 ZIP 的实测 SHA-256 为 `1cf7de14c862abc49b8eaeed32dc6a60d8146740edb2c244570d1a9f07cb813a`，与 `scripts/herdr.lock.json:10` 一致。工作树二进制及历史安装包解出二进制均为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`，测试 Core 自报 0.1.19。[精确源文件清单](core-source.json) |
| Core 持久化与连续性 | 固定版 `api/run.rs:156,173–178` 记录 argv，将请求 env 放入 restart_env，提交快照后才给 holder 发 SPAWN。`terminals.rs:406–429` 从公开投影移除私有字段。`holder.rs:310–351` 报 PTY 根进程 PID，`platform/windows.rs:920–1014` 创建伪控制台、目标进程和 Job；`kept.rs:82–107` 对保留终端重建 shell 时再次合并 restart_env。因此重连能看到原地址，不能据此认定原 Agent 仍在。[启动源码](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/api/run.rs#L173) · [keep 源码](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/kept.rs#L82) |
| 桌面信任边界 | `apps/desktop/src/main/engine-supervisor.ts:107–125` 用 utilityProcess.fork 将 desktop userData、随应用的运行时、helper 与 Core 位置交给 Engine。`apps/engine/src/boot.ts:133,220–233` 仅向相应模块注入本地 host。`apps/desktop/electron-builder.yml:8–26` 规定解包原生 keyring，并将 helper 放入 resources。实际编译产物 `apps/desktop/out/main/index.js:466` 和 `engine.js:30438` 含装配。历史 `temp/issue-baseline/installer-extract-3bd2e24/resources` 中可见固定 Core 和 keyring 原生模块；它早于此次交互设计。本轮没有将新宿主打包或声称安装包端到端通过。 |
| 凭据所有者 | `apps/engine/src/module-credential-host.ts:10–76` 用 Windows Credential Manager 的 `@napi-rs/keyring`（桌面固定 2.1.2）保护数据密钥；Vault 目录实例与 userData 本地存储有单独绑定。`packages/kernel/src/credentials/{protection,versions}.ts` 用 AES-256-GCM 和关联数据保护版本；`module-credentials.ts:312` 只在可信回调取用所需 purposes，结束释放 pin、清除 Map。此清除不能证明 JS 字符串物理清零。`plugins/agent-cli/src/engine/launch-environment.ts:114` 已按 provider 保存普通定义、受保护名称、替换/保留/显式清除，并投影状态；尚未把该 profile 接到交互 launch。 |
| 已批准规则 | `69776e68:plugins/automations/src/engine/terminal-environment.ts:195,214,235,369–396` 核对本地批准、CLI/MCP 工具开放、实际 Space/规则身份、版本与精确变量名；在 use 回调及提交前复核。`service.ts:512` 的 invokeApprovedTerminal 用 intentId 关联记录。其实际提交固定为 **provider=shell**，所有者是 Automations。可移植绑定/复核方式；Agent 需要自己的授权、凭据命名空间和目标。参考提交的 ModuleCredentials.use 回调提供 revision；integration 当时的回调只有 definition 和 values，不能仅在回调前 list 一次代替原子版本检查。 |
| 真实启动 | `plugins/agent-cli/src/engine/{launch,index}.ts` 的 resolver / detector 负责实际命令、参数、模型、恢复和预览。`sessions.ts:351–378,463–501` 仅为 shell + env 申请 ticket；普通 provider 将 resolver 的 env 送进 terminal.run。已有明文 settings.env 不具有升级后的保护语义。`index.ts:610` 的私有环境调用者也是 shell 专用。`protected-launch.ts:11–48,90–138` 的 PowerShell 中继和 30 秒单用 TCP 票据适合已验证的非交互命令。票据本身可领取内容，并出现在可还原的 Core argv；一次领取不能证明领取者身份。helper 的 `protected-launch-helper.cjs:85–87` 用两条 pipe 遮蔽输出。 |
| 输出 / 回执 | `sessions.ts:496,634,874` 的内存值表与读文本遮蔽只覆盖特定读入口；`terminal-bridge.ts` 直接转发 attach 帧。若秘密曾到达外层 PTY，Core、其他直接 attach 或历史读取均可能先观察到。`launch-binding.ts` 与 `sessions.ts:560–632` 已有 Core ID、协议代、attempt 标签、cwd、argv 指纹、地址/PID/创建时间和唯一候选核验，适合复用作会话对账。Core 的 created_ms 是终端时间，另须核对 Windows 进程对象的创建时间。 |

## 建议的交付合同

1. **批准的是一次明确的目标。** 预览、刷新和恢复意图只处理普通变量和保护状态，不解保护。冻结 Vault 本机实例、machine/Space 及目录身份、provider、解析后的实际可执行文件及身份、解释器/shim 和脚本目标、参数、profile ID/revision、允许的变量名、入口调用方和 requestId。输入、PATH 覆盖、命令包装器或目标版本能改变接收者时重新批准。旧的 Automations 批准、Safe 登录或 CLI 原生登录都不能推导出 Agent 这次的授权。
2. **将三类输入分开。** 普通变量按便携定义管理。持久保护值由 Agent 私有 `ModuleCredentials.use` 在上述目标与版本复核后按名取用。显式单次值留在可信 Engine 内存，绑定 requestId、attempt 和变量名，设置期限，一次消费或取消即失效；不调用 save，不因恢复或回放改用同名持久值，也不将缺失值从父环境补齐。Windows 名称大小写折叠后有冲突就拒绝，防止同名普通项改变保护项。配置管理或对外执行的权限由各自入口判断，批准运行不授予读取明文能力。
3. **让 Core 先启动可核验的宿主。** durable claim 先落下，Core argv 只含受信安装位置与非秘密关联 ID，env 仅含公开启动项。Core 创建独立控制台宿主作为 PTY 根。Engine 在确认单一匹配的 Core 启动记录后，通过本机限定的命名管道比对操作系统报告的对端 PID、被持有进程句柄、创建时间和安装映像身份。宿主同样验证管道服务端为该次可信 Engine。限制为本登录会话、拒绝远程客户端、独占首个实例、超时和撤销；用户名、管道名、可见的随机串或裸 PID 单独均不构成批准。待两端绑定后才消费本次授权并交付。桌面已有 MessageChannelMain 的一次性回复与退出取消模式可供复用（`engine-supervisor.ts:64–95`）；Core 创建的任意 CLI 并非 Electron 子 utility，不能直接接收该 MessagePort。
4. **目标程序须有真正的控制台。** 宿主仅向已冻结命令创建的子进程提供该次环境块，明确控制句柄和基础环境继承，保持参数边界；不向运行中的任意进程写入环境。建议用成熟 Windows ConPTY 实现承接内层 PTY，将输入、resize、焦点要求、中断、退出状态和受控输出接回 Core。外层可见的宿主以及 Agent 正常退出后的保留 shell 使用干净环境；关闭或崩溃时核验内部进程树已结束。ORCA `8bc232f5` 的 `src/main/windows/windows-pty-job.ts:5,58,134` 和 Windows PTY 测试提供 Job 所有权与生命周期参考，ORCA 的 node-pty 是外部依赖，Huhu 当前锁文件未列入。固定 Core 的 Job 允许 breakaway，不能把父进程退出等同整个树已清理。需要验证进程归属、Job 绑定成功及后代继承边界。
5. **在秘密首次可能进入记录的位置处理输出。** 若只继承外层控制台，目标的回显会直接进入 Core。内层输出先做跨块、跨 UTF-8 边界的过滤，再交给外层，覆盖 stdout/stderr、终端控制序列、回显与快照；必须测试空闲提示符不会因保留尾部而永久不显示。单纯字符串匹配不能担保任意第三方程序的变形输出、私有日志、转储或其后代不使用所继承的环境。只给已批准且能验证相应行为的命令配置保护值；无法满足该目标的输出/后代边界时应拒绝此类启动。回执仅含不透明 ID、版本、状态、原因、进程绑定；不要持久化原值、可兑换的票据、环境内容指纹或原始错误。对迟到/分片输出也应持续过滤至 PTY 已排空。
6. **同一 requestId 只对账。** 授权接受时原子记录 attempt 与不可再次提交标记，启动前复核来源和版本。回包丢失、spawn_pending、多候选、PID 复用、keep 换 shell、Engine/Core 重启或 IPC 中断，均保留可核对状态。使用 `peek`、标签、Core 身份与原进程绑定查询原运行；若宿主与子进程已核实接单，用相同回执继续；证据不足展示待核实。取消、过期、明确未创建或未能解保护也记录结果，撤销未给付授权。**同一 ID 任何失败路径均不得再 run、签发或解保护。** 当前 `sessions.ts:422–428,553–557` 对已有 attempt 能对账，但 confirmed_not_created 会保存无 attempt 的回执；受保护入口须单独保留已消费/终结事实。即使已有 Core 根宿主，也要等获准目标真正启动的确认后再标记 Agent 已运行。进程重启后无单次值时，用户显式发起新请求、重新批准。

**第三方与进程范围。** #4 的最低真实兼容面是 Claude Code、Codex、Pi 和 shell，已有登录继续由各 CLI 管理。保护链应能运行受批准的真实外部可执行文件，不需要第三方接入专用 provider SDK、远程服务、独立常驻凭据服务或 Safe。保持 Core 0.1.19 且要对通用 CLI 做 PTY 前置过滤时，需要一个受信的控制台进程承接这次运行；可沿用已有随应用交付 helper 的装配惯例，不能原样套用当前 PowerShell/Node 双管道。独立 GUI、脱离 Job 的后台程序、无法核验的 shim 或自行写日志的未知 provider 不属于这份证据能批准的范围。某个 CLI 若已有绑定目标的私有凭据回调，可逐个验证，通用 PTY 支持仍需独立成立。

**重连与隔离的限度。** 单独关闭 viewer 或 Engine 断连时，若 holder、宿主和实际 Agent 仍存活，可重新绑定原进程，继续已开始的交互；无需重新领取。宿主死亡、显式取消或目标退出时才按对应归属收尾。若要求只让目标进程本身取得值，提供环境块的方案还依赖目标约束其后代继承。Credential Manager 与同一登录用户执行的任意程序之间没有产品级的应用隔离保障；本方案防止 Huhu 自身通道扩大授权，无法对已完全控制该用户或目标程序的一方保证保密。

## Windows 证据与复跑

从 `D:/Document/code/huhu/temp/issue-worktrees/integration` 运行。探针只收集合成字段与布尔结果；不读取用户的 provider 配置，不连接模型服务。Pi 路径指向本机安装的发行版程序文件。

```powershell
$ev = 'D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192'
$env:TSX_DISABLE_CACHE = '1'
$piInstall = Join-Path (Split-Path (Split-Path (Get-Command pi.ps1).Source)) 'install'
$piEntry = Join-Path $piInstall 'releases/1.5.2/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
node "$ev/pty-probe.cjs" $piEntry
& "$ev/peer-probe.ps1"
$env:HUHU_AGENT_LAUNCH_TEST_BIN = (Resolve-Path 'apps/desktop/resources/herdr/win32-x64/herdr-core.exe').Path
$pn = (Get-ChildItem 'D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/*/node_modules/@pnpm/exe.win32-x64/pnpm.exe' | Select-Object -First 1).FullName
& $pn --config.offline=true --config.verify-deps-before-run=false exec vitest run apps/engine/test/module-credential-host.test.ts plugins/agent-cli/test/launch-reconcile.test.ts
```

| 检查 | 实测与限度 |
| --- | --- |
| 合成进程与固定二进制 | Windows x64 10.0.26300，Node v24.21.0。直连与 helper 分开读取内核实际终端标志、表达式结果和 Core 私有 JSON；只输出是否匹配，未将环境值写入证据。直连的持久化正对照仅用普通合成标记。[探针](pty-probe.cjs) · [实测](pty-with-pi.json) |
| 本机 IPC | 单独的 Windows 子进程连接随机命名管道，未传输凭据或业务载荷。服务端从管道句柄取得 PID，与持有的启动进程及其创建时间匹配，核对时仍存活，子进程正常退出。只验证 Win32 原语。实际产品中的双向身份、ACL、撤销竞态和映像校验待实现。Windows SDK 10.0.26100.0 的 `um/WinBase.h:6481,6497` 声明双向 PID 查询，`um/processthreadsapi.h:137` 声明 GetProcessTimes。[探针](peer-probe.ps1) · [实测](peer-result.json) |
| 模块凭据与回执回归 | 固定 pnpm 12.10.1、Vitest 3.2.7，**2 个文件，19/19 通过**，其中 Windows Engine 3 项、launch 对账 16 项。覆盖 Safe 未初始化/锁定/停用的配置状态、跨 Vault 恢复须补配、合成 shell 环境、脱敏输出、ZIP、首个 Core 回包丢失和并发重投。由现有测试覆盖的实际注入目标是 shell；三种 Safe 状态下真实受保护 Agent 的安装包验收仍缺。 |
| 只读与产物 | 仅在本终端共享目录发布此报告、两份探针和四份结果/源文件清单。业务与构建配置均无本任务编辑；未建 worktree、委派、远程写入或扩大权限。对固定标签的上游读取均为公开只读请求。 |

## 阻碍与接续

本次分析完成。若实施，首先验证已批准的真实 CLI 在内层 ConPTY 里能同时接收指定环境、保持 TTY 并响应普通键入、resize、中断及退出；固定 Core 的屏幕、attach、恢复 shell 和原始快照均应只含允许的数据。随后在候选安装包覆盖三种 Safe 状态、取消/过期、运行中崩溃、领取或目标启动回包丢失、同 requestId 并发、凭据轮换、目标替换、进程代际改变和清理失败。检查 UI/诊断、回执、Vault/ZIP、provider 自有输出及进程树；同 requestId 的 Core run 计数和机会性凭据交付计数各不得超过一次。当前证据不能替这些场景签收。

## Lead 验收

由 Lead 追加。

Lead 已核对真实 Core 固定版及向内层 ConPTY 的结论。先按 task02 对受信宿主、实际 TTY 与合成凭据做最小技术验证，尚未签收产品实现。
