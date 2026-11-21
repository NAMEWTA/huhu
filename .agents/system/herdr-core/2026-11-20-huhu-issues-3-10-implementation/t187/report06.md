# E07 批准终端规则与生产 CLI 独立复验

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task06.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task06.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report06.md`
- 执行结果 — `done`

## 结论

**签收启用鉴权、批准目录核对和生产 CLI 文件输入。配置变更与终端清理的原修复路径通过，恢复边界各有一处已实测的 P2，组合候选暂缓签收。** 普通改名再改回会要求重新批准，释放失败及确认丢失可沿原会话恢复。独立复跑 108 项通过。附加本机探针分别证实，原位回滚配置定义可恢复已因改名失效的批准，工作台恢复旧运行版本可覆盖已持久化的结果与清理标记。

## 固定候选与产物

- 只读组合候选 `3f479b899d67000d26ba95f0f069a39aa86569df`，父提交 `9198c3497285182f7a2efb26a9a2c4d0e8442f4d`。CLI 文件输入提交 `815d9917b2a32f246725343fd633040fe39b7acf`。原独立审查基线 `69776e6887fb8ff75f4992f81445ebc8f15fa959`。 [report04](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report04.md)
- 源码读取使用 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover` 的固定 Git 对象。测试开始时已跟踪源码与候选一致，结束时 HEAD 相同，出现的并行本地变更均在 SSH。测试以隔离临时 Vault、应用目录和本机二进制执行。本作业只交付本报告，另存临时验证日志。 [实际二进制版本和摘要](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/versions.log)

## 逐项复验

| 报告事项 | 判定与证据 |
| --- | --- |
| P1 启用鉴权 | **签收。** `9198c349` 将调用方检查移入 `setEnabled` 的配置队列，对同一次读取得到的动作和版本判断并提交。真实 HTTP 两项通过，覆盖提醒编辑与启用交错、外部终端及 Agent 启用拒绝、允许提醒启用和暂停。Desktop 用原权限判据，现有停用和调度约定仍有回归。 [事务](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:239) · [HTTP 夹具](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/engine.test.ts:1084) · [定向日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/enable-http.log) |
| P2 批准目录 | **签收本片。** 批准真实路径、文件系统身份与出生时间沿私有票据传递。等待 Core 后重新核对，Windows helper 再检查继承 cwd 后才启动子进程。两条 Windows 定向用例通过，覆盖在准备后更换目录及实际 helper 拒绝目录失配。真实 Core 与构建 CLI 的成功路径核对 PowerShell 回报 cwd。确知目录不符的提交记录失败，Core 确认缺失且结果仍未知时保留待核对。Desktop 手动和定时入口继续使用可选批准目录字段，原凭据 lease 版本回归通过。 [Core 前核对](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/sessions.ts:478) · [helper 核对](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/protected-launch-helper.cjs:72) · [Windows 夹具](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/test/protected-launch.test.ts:13) |
| P2 变量改名条件保存 | **签收事务修复，暂缓签收原位恢复。** 变量名代次与定义一起发布。同名改值保留代次，改名成功才失效。实际 Engine 发布故障注入后，原批准 ID、版本和外部状态仍可用。改回旧名字、ZIP 恢复到新 Vault 均维持授权隔离。先批准后首次写值的旧格式路径和显式撤销也通过。相同 Vault 回滚旧定义的实测见下。 [定义与批准比较](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:239) · [Windows 条件保存](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/module-credential-host.test.ts:158) · [原位恢复观察](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/approval-restore.log) |
| P2 终端结果和释放 | **签收正常重开对账，暂缓签收历史恢复。** 退出事实、正文及待释放标记一起落盘。结果已结束时停止显示可取消，待核对运行仍按原 request/session 核对。真实 Core 用例故障注入释放不可用，重开后实际移除并丢确认，第二次对账清标记，原结果与正文一致，启动及实际移除各一次。全树调用点核对显示原生产调用方 Automations 已同步传入 requestId，释放仍是非外部公开能力。还验证异 Vault、错误请求和已结束作用域的拦截。历史恢复问题见下。 [退出与释放](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:714) · [释放身份检查](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/sessions.ts:898) · [真实 Core 回归](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/module-credential-host.test.ts:334) |
| 生产 CLI | **签收普通文件输入。** `815d9917` 先读常规文件、严格 UTF-8 解码并解析 JSON，再连接 Engine，沿用认证和整包限额。真实构建 CLI 加本机 Core 通过合成保护值写入、轮换、清除、授权撤回、未知回执对账和 HTTP/stdio MCP 路径。独立用同一 CLI 进程验证缺失、目录、坏编码、坏 JSON、超限、选项冲突六类输入都返回 2，stdout 为空，stderr 无测试文件路径和内容。help 列出新参数。套件另覆盖 BOM、中文带空格路径和既有行内输入。 [读取实现](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/cli/src/commands/call.ts:8) · [CLI 选项](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/cli/src/main.ts:27) · [真实子进程](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/cli/test/approved-terminal.test.ts:49) · [生产 CLI 错误探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/cli-errors.log) |

## 恢复边界发现

### P2 · 工作台恢复旧运行版本可覆盖退出结果和待释放标记

`Automation Runs/` 是可记录版本的 Markdown 目录。工作台调用的 `history.restore` 对 `Automations/` 规则和 Tasks 有专门保护，对运行文件按旧内容整份写回。隔离 Engine 探针先为一条运行中的合成记录保存历史，再写入已成功退出、输出和 `terminalReleasePending: true`。经真实获准 Desktop 能力恢复旧版本，记录回到运行中，退出时间、输出及待释放标记均被覆盖。若还能核对原会话，运行可重新进入收尾，这仍会重新读取输出。无法核对时保留待核对状态，已确认退出的记录和独立清理标记此时已丢。应保护运行事实和待释放状态免受普通历史恢复，或将待释放义务持久化到本机受管的独立记录。本探针已验证覆盖行为，真实 Core 跨此恢复动作的后续时序尚未实测。 [运行目录](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/packages/contracts/src/kinds/index.ts:29) · [历史恢复保护](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/versioning/src/engine/index.ts:35) · [版本化恢复写入](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/versioning/src/engine/history.ts:137) · [对账筛选](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:771) · [Engine 探针日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/history-restore.log)

### P2 · 同一 Vault 原位恢复旧环境定义会重新满足原批准

改名后，旧批准保留在应用私有存储，外部授权根据 Vault 中定义的 `namesRevision` 和批准记录是否匹配判断。在独立临时 Vault，正常改名及改回均得到 `PERMISSION_DENIED`。只原位恢复此前保存的可移植定义，规则、Vault 与本机批准存储保持原样，CLI 身份的状态读取重新成功并返回旧修订。再显式撤销批准，旧定义在场时状态继续被拒绝。实测仅调用遮蔽状态，未启动命令或写入保护值。该发现适用于同一 Vault 的本地文件级恢复，工作台历史排除 `.huhu/`，ZIP 恢复到新目录也已有通过证据。若原位恢复仍须重批，批准失效需要在本机保存可独立于便携定义版本回滚的依据。 [批准与代次判断](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:239) · [改名提交](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:272) · [显式撤销](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:313) · [工作台历史范围](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/versioning/src/engine/history.ts:20) · [隔离恢复实测](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/approval-restore.log)

## 验证与接续

- Windows x64，Node 24.21.0、Vitest 3.2.7、安装包提取的 Core 0.1.19。构建 CLI 的 SHA-256 为 `729710afd62ec3a2b63712836f1a71c0e4a187fb7d33fc814e5968c2298c3766`，和实施记录一致。真实 HTTP 定向 2 项，Automations、Agent CLI、Engine 凭据及全部 CLI 测试共 11 文件 106 项，两组退出均为 0。三组临时探针覆盖 CLI 错误、运行历史恢复和环境定义原位恢复。Git 差异检查通过。 [HTTP 日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/enable-http.log) · [Windows 回归日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task06-6e850298/windows-regression.log) · [CLI 构建原记录](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report03.md)
- 既有提前关闭、丢回包、待核对回执的测试适用于此候选。旧运行若从未记录待释放标记，当前实现无法凭历史结果补推。Windows 强制停止与超时后的整棵子进程树、组合候选安装包仍无本次实机证据。 [实施验证及边界](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report04.md)
- 本轮执行完成。候选的后续签收取决于两条恢复边界的处理。生产 CLI 的 stdin 和通用幂等协议沿各自切片推进。

## Lead 验收

Lead 在 c3d5b7ff 构建两处恢复修复。Engine 两项定向回归通过，实际提交同时联接 3f479b89 和生产 CLI。task07 独立复验。
