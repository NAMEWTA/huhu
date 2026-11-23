# Linux 受保护启动、规则批准与 T7.2 跨日包验收

| 交接项 | 记录 |
| --- | --- |
| 共享根 / Core / Lead / worker | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux` / `wta-ubuntu` / `t3p` / `t5h` |
| 任务与报告 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task08.md`、同目录 `report08.md` |
| 工作树及结论状态 | `/home/wta/projects/huhu/temp/issue-worktrees/integration`。任务未指定 SHA，最终核对至 `47fb9c283acfa4aeb6af7f29e14a792aa383d4fa`。只读分析 `done`。 |

**本批次须补两处 Linux 缺口。** 第一处是 Agent 选择模块环境后，普通配置和受保护交互启动都被 Windows 原生宿主门槛挡住。第二处是 Linux 终端规则虽有本地受保护执行基础，受权 CLI/MCP 却不能完成针对该规则的桌面批准、配置及运行闭环。二者的修复规模不同。T7.2 的另一处缺口在时钟：包用例已有真实定时、原生问答和回执断言，但默认把任务设在约 18 秒后，不能稳定证明跨日。

## 判定依据

| 原始文字 | 对本批次的含义 |
| --- | --- |
| #4 原文 §安装验收要求“macOS、Windows、Linux 按支持的目标/架构验收实际安装包”；C04 要求预览、手动和任务/自动化共享 resolver，C13 点名 Safe 三态下的“模块自有环境设置和已授权 shell 启动”。W7.3 要求“获准的进程能使用输入”，并指定假秘密、实际安装包和结束清理。 | 当前 Linux x64 属于本批次安装目标。普通环境的查看、编辑、预览和实际启动必须独立成立；用户明确选择有保护值的配置时，还必须证明值交至获准的交互进程。支持目标、提供方和可执行入口须按实测逐项记录。 [#4 原文，第 371–373、561、570、635 行](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/source.md) · [#4 行为规格](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/spec.md) · [W7.3，第 9–17 行](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W7.3-agent-settings.md) |
| #5 E07 要求“运行时注入、MCP/CLI 操作及清理形成闭环”；T6.3b 验收明确“分别用授权的 UI/MCP/CLI 操作，验证实际进程收到配置”。#5 规格保留终端规则、同一 Agent CLI 执行合同及仅对获准目的开放。 | Linux 工作台的本地手动/定时、外部主体的已批准手动运行应分行验收。Windows PowerShell 的已有证据只覆盖相应平台。按支持的 Linux shell 和具体批准目标交付即可，不能据此放开任意命令、解释器或定时用途。 [#5 原文 E07](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/source.md) · [行为规格](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md) · [T6.3b，第 16–17 行](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T6.3b-terminal-rule.md) |
| #9 规格要求“区分普通变量、受保护变量及显式清空”，规则保护值“仅交目标子进程”。P6.1 约定“保护通路不可用则明确拒绝该次受保护环境启动”；P6.2 要求重复 requestId 只产生一个会话，并检查实际 Core、运行文件及取消/恢复。 | 缺少保护服务或无法核验进程时应拒绝该次操作，这是失败合同。支持平台长期只显示拒绝，仍缺正向交付。未发现用户批准把这两项收缩为 Windows 专用。 [#9 规格](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/spec.md) · [P6.1](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P6.1-agent-launch-env.md) · [P6.2](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P6.2-automation-run-env.md) |

## 两个实施入口

**1. Agent 环境按所选配置分流。** 现有 `InteractiveEnvironment.prepare` 在读 profile 之前检查 Windows x64；`ProtectedLaunchDialog` 也按全局 `nativeAvailable` 禁用预览。即便 `protectedNames` 为空，这个入口仍被挡住。保留普通“启动 Agent”和 provider 原生登录，沿用 `launch-environment.ts` 的模块所有权、profile id、provider、revision 和显式清空语义。

- **仅普通变量。** 由 Engine 从可移植定义读取普通字段，重新校验所选版本，沿 `SessionsService.prepareLaunch → resolver → Core terminal.run → 现有 attach` 启动。合并普通 overlay 后再计算预览/执行标识，确认后版本已变则重做预览。该路径零取密，不依赖受保护 PTY 或可用系统钥匙串。桌面设置可查看和编辑普通值；列表、普通预览与秘密状态仍遵循各自权限。保留现有 argv 分界、GUI PATH、cwd 和终端退出语义。
- **包含保护值。** 仍以 `SessionsService` 管理 requestId、attempt、terminal address、恢复及 Core attach。沿用 `prepareNativeEnvironment → NativePtyBroker → 核对原 Core 根进程 → credentials.use → consumed/started/unknown`。新增 Linux 平台适配，复用 `native/agent-pty` 的协议、一次消费回执、流式遮蔽和测试向量。Linux 宿主负责真实 PTY 双向字节、窗口尺寸、信号和进程树回收；Engine 在领取前核对原终端进程实例、实际映像、批准的可执行文件/解释器及入口、目录身份和配置版本。具体可沿用现有 Go 宿主协议，增加 Linux 平台文件；用内层 PTY 承接键盘、尺寸和前台进程组，外层保持原 Core 地址。用内核可核验的进程实例和启动时间对照 Core 的根 PID，在持有目标文件及目录引用期间复核，回收能力须用会派生后代的离线夹具验证。保持目标文件与目录在执行边界的身份一致，避免预览后按同名路径重新选中另一目标。保护服务缺失、换目录、换映像、错进程代或中断且结果未知时，应返回相应阶段或待核实，禁止自动换普通启动重送。
- **改动位置。** `interactive-environment.ts` 增加普通/受保护的计划分支及平台目标解析，`native-pty.ts` 将 Windows 文件/进程身份与 Linux 身份编码分开。`sessions.ts` 保有同一个执行和回执所有者。桌面 `engine-supervisor.ts:134–150`、`before-pack.cjs`、`electron-builder.yml` 增加受支持架构的随包 helper、执行权限与构建校验；UI 按所选配置返回可用性及原因。POSIX 规则 helper 已证明一次领取、遮蔽和原目录复核，可复用这些行为；它的输出管道缺少交互 TTY、resize 和同等的进程身份见证，不能直接充当原生交互宿主。 [Linux 现有实测](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W-linux-native-execution.md) · [原生宿主协议](../../../../../temp/issue-worktrees/integration/native/agent-pty/PROTOCOL.md)

**2. Automations 只扩 Linux 外部批准及其端到端验证。** 已有规则本地调用链为 `AutomationsService → terminalEnvironments.use → agentProtectedTerminal → SessionsService → ProtectedLaunch → POSIX helper → sh`；无保护值时沿已有普通 launch。外部入口另经 `terminal.external.* → 当前工具开放及主体授权 → 当前本机批准 → 规则版本与凭据 lease → 同一派遣链`。当前 `terminal-environment.ts:32,222–239` 固定了回执 shell 类型和 Windows 平台，`AutomationsModule.tsx:217` 及 `TerminalApproval.tsx` 的按钮与命令说明也固定 PowerShell。Linux 缺的是这条批准链的正向行为。

- 最小正向目标选当前已能执行的显式 `sh`。核对、批准和执行共用同一解析结果，绑定实际 shell 映像与 argv 语义、原命令、Vault 实例、规则 ID/版本和文件身份、Space/目录身份与 revision、获批变量名及用途。改 `review.shell` 和可用原因，命令预览显示实际 shell；旧 Windows 记录继续按原合同验证。对 `default`、其他 shell 和未迁移规则，只有目标身份和执行方式可兑现时才开放相应项。特别注意 `shared/shell.ts` 的显式 sh 当前会生成名称 `sh`，批准后执行须使用核验过的目标，不能再次按变化后的 PATH 选择解释器。
- 沿用本机工作台批准/撤销、逐项开放、现有 `HUHU_RULE_SECRET_` 名称限制、版本冲突、同请求对账与 `approvedDirectory` 复核。普通规则保持原用法，带保护名字却缺值时提示补配。已有 POSIX 用例从 SessionsService 发起，尚缺安装版中规则编辑、手动/计划发生和授权 CLI/MCP 触达同一真实进程的证据。 [规则批准实现](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts) · [POSIX helper 用例](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/protected-launch.test.ts)

| 必要的真实子进程观察 | 签收条件 |
| --- | --- |
| 普通 Agent profile；受保护 Agent profile | 在随包 Core 上用离线测试程序，普通项能编辑且在系统保护不可用时进程仍能读到。保护项用合成值，仅报告匹配布尔值。Safe 三态下分别验证，实际检验 stdin/stdout 为 TTY、键盘输入、resize、退出与重新 attach。拒绝、取消、丢启动回包、Core/Engine 重启、预览后替换目标分别核对实际进程数，同请求最多一次消费，旧请求不能写入替代终端。 |
| 本地规则；外部获批规则 | 工作台真实创建 Linux sh 规则，手动及调度走对应发生；再经真实 CLI 和 MCP 使用同一规则，桌面按规则/变量名分别批准、替换与清除。已批准调用通过，未批准、撤权、改命令/目录/解释器或版本变化拒绝且启动数不增加。检查分段输出遮蔽、退出/取消清理、重复 requestId 与原会话一致；用无价值标记检查 Core restart_env、launch/运行文件、日志、任务、ZIP。保留 Windows 原批准回归。 |

## T7.2 测试时钟的最小接入

**固定包首选在一次性 Linux 测试虚拟机内控制墙钟，从 D 日临近午夜连续走过 D+1 日的计划点。** 这样可原样运行包内 Croner、Tasks 到期判断、真实 Core/CLI 和生产派遣链。工程改动集中在包用例及其运行夹具，产品无需发布可调时间的接口。选择规则时区 UTC 和普通日期即可；DST 已有独立任务。预先设置隔离客机时钟并避免其被自动校时拉回，不调整开发主机。给离线 CLI 就绪和实际创建留足提前量；记录 Engine 写入的 task.createdAt，若已经跨日则本次布置失败。

| 核对点 | 代码事实与实现落点 |
| --- | --- |
| 时钟的所有者 | `apps/engine/src/boot.ts:85–100,254,458` 的 **BootOptions 没有 now**。`tasks.apply` 与 `automations.apply` 各有 `opts.now`，当前 boot 未传；Tasks 创建与派遣前的 availableAt 复核、Automations 扫描、规则时间、occurrence 可用同一业务时钟。安装版由 Electron main 的 `utilityProcess.fork` 启动 Engine，其墙钟独立于页面的 JS clock。 |
| 在线与补跑的区别 | `plugins/automations/src/engine/scheduler.ts:30–47` 在 sync 时用 `d.now()` 算宽限补跑，在线作业由 `new Cron(...)` 自己计时，以 `self.currentRun()` 取触发时间。只注入两个插件的 now 不能让这个计时器提前触发；跳时后重建规则得到的 missed run 仅能证明补跑。T7.2 正向用例应在到期前已启用且持续在线，由正常 Cron 回调进入 `activate → scans.scheduled → taskDispatch → Agent CLI`。 |
| 固定制品和断言 | 复用 `tests/e2e/helpers/candidate-package.ts` 的 AppImage 摘要、内嵌 Git SHA、真实进程/资源路径、ASAR 与随包 Core 核验，复用 `task-journey.spec.ts` 的真实 Codex 和受控回环响应。将 `schedule(18)` 改为由夹具选定的**次日具体时刻**，让规则 cron zone、availableAt 与该时刻一致。在生产入口于 D 日创建，确认到期前目标任务无 run、无 provider 输入；到期后读取 `trigger=schedule`、精确 scheduledFor 和唯一 occurrence，核对实际 run/attempt/session/request/receipt/message ID、原问题同会话作答、一次结果、用户手工完成。任务焦点在后台阶段保持。已有 seed 会话的流量单独计数。手动立即派与模板另验，不能手调 activate/runNow 代替计划触发。 |

**如果测试环境要求在数秒内主动推进业务时间**，最小代码接缝是 Engine 启动时接受仅限此次验收、绑定临时 Vault 的私有时钟，向 Tasks 和 Automations 传同一个 `now`，再让 Scheduler 的在线唤醒使用同一个时钟。可将定时依赖收敛为“读墙钟、在指定 instant 唤醒、取消”，以既有 Croner 的 `nextRun(from)` 和 zone 算计划点；让生产和测试走同一套注册、取消、重建、重叠保护及 scheduled 回调。测试时钟只推进 instant 和到期唤醒，不接收 ruleId、taskId 或派遣指令。默认生产装配继续使用系统时钟；若选择此实现，入口分别在 desktop 的 engine-supervisor、Engine main/boot 的启动装配和 Automations 的 SchedulerDeps。由包夹具在创建临时应用资料后建立仅宿主与该 utilityProcess 持有的测试通路，验证 Vault 实例并在启动注册作业前传入初始时间；后续推进应等待调度器确认已观察该时刻，再查持久 occurrence。不向工作台、CLI 或 MCP 注册调时能力。退出或换 Vault 后解除绑定，超时、重试等待与子进程看门狗保留真实耗时语义。此方案涉及调度实现回归，已有隔离客机的场合优先用前一方案。无论选哪项，保留 Engine 创建/计划/实际启动三个时刻、包 SHA 和身份链，断言 D 与 D+1 是规则时区内相邻的两个日期。[T7.2 原验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T7.2-full-task-journey.md) · [包用例](../../../../../temp/issue-worktrees/integration/tests/e2e/workflows/task-journey.spec.ts) · [现有取证范围](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T7-cutover-linux.md)

本轮仅核对源码、原规格与既有证据。未访问真实账号或凭据，未派发代理，未运行测试、打包或修改业务文件。以上 Linux 新增正向行为及 T7.2 跨日运行均待实施者在固定制品上取证。

## Lead 验收

由 Lead 追加。
