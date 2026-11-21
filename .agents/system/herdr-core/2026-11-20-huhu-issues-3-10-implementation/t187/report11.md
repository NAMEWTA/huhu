# Windows 受保护启动与 Space 数据包复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task11.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task11.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report11.md`
- 桌面固定候选 — `5b904b5e4e07dd0cd72db8811b99c7a0d1d0b78d`
- SpaceStore 固定候选 — `331defdb626fbca6320e042872d570bbf432d588`
- 执行结果 — `done`

## 结论

report10 的共前缀遮蔽问题已修正，原失败探针和新增 Go 用例均通过。Windows 定向记录覆盖实际桌面在三种 Safe 状态下的启动。独立会话探针确认丢失 Core 回包后可认回原终端，缺少可信运行回执时保留待核实，且重试原请求均未重复注入。发现一项 **P2**，打包的宿主资源缺失时，Engine 仍继承开发宿主覆盖变量。一项 **P3** 来自桌面 UI 的恢复范围，切换模块或重开窗口后，原请求还在 Engine，用户失去「核对原启动」入口。SpaceStore 的新旧包往返、外部绑定及破损记录回归通过，UI 与恢复流程的正式接线由 Lead 验收。 [原生独立复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/native-go.log) · [Windows 定向运行](D:/Document/code/huhu/temp/issue-baseline/native-integration-protected-5.log) · [独立会话探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop-reconcile.log) · [SpaceStore 定向回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space-all.log)

## 产物与改动

从两个固定 Git 对象分别解出临时快照。Go 测试、会话／进程边界探针和 Vault 数据包测试只使用本机工具、合成值或临时 Vault。仅写临时探针及本文件，业务源码、工作树、根锁、远端与真实 provider 凭据未改动。两个候选分别评估。 [原生快照](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/native/agent-pty/mask.go) · [SpaceStore 快照](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space/plugins/agent-cli/src/engine/spaces.ts)

## 验证

### 桌面受保护启动

| 范围 | 实际核对 | 证据 |
| --- | --- | --- |
| 长值共享前缀 | 当前遮蔽段保留所有同前缀候选的尾段，匹配任一尾段后恢复输出。复用 report10 的原失败用例，第二个值脱敏后普通输出已恢复。固定 Go 新回归逐字节输入两个值及交错事件，两个值均脱敏，两个后续标记均保留。Windows x64 上使用 Go `1.26.7`、x/sys `v0.50.0` 离线构建，EXE SHA-256 `2a5a8d1598354ce8191a5dbd42c79fb534e5a3ac33d60f642d930daf63dbc5b9` 与桌面记录一致。 | [遮蔽状态](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/native/agent-pty/mask.go:78) · [固定回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/native/agent-pty/mask_test.go:35) · [独立 Go 复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/native-go.log) |
| 实际 Windows 桌面与 Safe | 提供的 Electron `44.9.1`／Core `0.1.19` 定向日志通过一项包含 Safe 未初始化、锁定和停用的桌面用例。源码的实际断言覆盖菜单预览无子进程、确认后的合成值摘要、两路 TTY、遮蔽输出、键盘交互和退出。本轮独立复建原生 binary 并复验组件，桌面整条用例沿用提供的 Windows 日志。 | [Windows 定向日志](D:/Document/code/huhu/temp/issue-baseline/native-integration-protected-5.log:4) · [实际用例](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/tests/e2e/shell.spec.ts:1764) · [候选证据](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-desktop-protected-environment.md) |
| Core PID、文件身份及取值 | `terminal.run` 的终端先核对本次请求标签和 argv 摘要，丢回包时仅在同一 Core 快照中取唯一匹配记录。原生 `inspect` 对真实根 PID 核对安装路径、文件摘要，返回 Win32 FILETIME。随后才调用凭据所有者。授权传输仍由原生双向核对 PID、创建时间和进程映像路径。已装载 DLL 的身份仍超出磁盘文件固定证据。 | [发送及同 Core 查回](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/sessions.ts:588) · [终端身份检查](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/sessions.ts:686) · [inspect](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/native-pty.ts:162) |
| 公开文本、消息与环境 | Core 只收到外层 argv、cwd 和标签，调用没有 `env` 字段，也显式禁用 keep。本次值经受监管 broker stdin 写入，成功只从其私有 stdout 的消费和运行记录判定。原生输出先过滤再进入 Core attach。公开终端内容没有流入回执解析，broker stderr 被丢弃，stdout 设长度上界。独立探针确认模拟 Core 记录未收到 env；公开标记隔离由实际数据流核对。 | [公开 Core 调用](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/sessions.ts:590) · [私有输入与回执](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/native-pty.ts:120) · [独立会话探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop-reconcile.log:13) |
| 断线对账与单次注入 | 独立探针用受控 Core／broker 回执驱动固定 `SessionsService`。Core 接收后丢回包，服务认回原终端并取到私有运行回执；重开服务再查同一请求，返回同会话。若已有消费而运行回执缺失，重开后仍为 `RUN_UNKNOWN`，即使 Core 有同名终端也未认作运行。两组分别只调用一次 `terminal.run`、一次凭据取用和一次交付。该探针覆盖会话阶段判断，真实 Core 和进程行为以桌面与原生日志为准。18 项会话测试通过。 | [独立输入及断言](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/test/t187-protected-reconcile.test.ts) · [两条结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop-reconcile.log:12) · [原请求拒绝重投](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/sessions.ts:457) · [待核实判断](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/sessions.ts:739) |

### P2 · 打包宿主资源缺失时，Engine 仍收到开发宿主覆盖

打包模式先计算随包宿主路径，构造 Engine 环境时先复制父环境，仅在该资源存在时写入可信路径。资源缺失时，继承的宿主覆盖仍留在 Engine 环境中。独立探针运行固定 `EngineSupervisor`，令打包资源为空并截获子进程环境，观察到覆盖值透传。探针只使用不存在的路径，没有启动任何替代程序或使用凭据。Engine 随后按传入路径及文件是否存在判断受保护宿主可用性。打包模式应在资源缺失时禁用受保护启动，并从子进程环境明确去掉开发覆盖。 [打包路径与环境继承](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/apps/desktop/src/main/engine-supervisor.ts:108) · [Engine 读取](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/index.ts:67) · [可用性条件](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/engine/interactive-environment.ts:116) · [独立配置探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/packaged-env-review.log)

### P3 · 切换模块或重开窗口后，原请求的手动核对入口消失

「核对原启动」依赖 `AgentCliModule` 内存中的 `recoveries`，从首次失败保存原请求、目标及环境审批。Workbench 在切到其他模块时卸载当前组件，重开窗口也重新初始化该状态。持久记录可供 Engine 对账，但重新进入 Agent 时无法从已有待核实会话重建这个按钮。固定服务探针已核对重开后仍保留原请求，本项的 UI 生命周期结论来自源码。 [恢复缓存](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/ui/AgentCliModule.tsx:66) · [原请求操作](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/plugins/agent-cli/src/ui/AgentCliModule.tsx:466) · [模块卸载条件](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/desktop/packages/workbench/src/shell/AppShell.tsx:329)

### SpaceStore 与数据包

- 用实际 `Vault.open`、`exportPackage`、`importPackage` 往返。Vault 根在目的地解析为新根，已有库内相对目录绑定到新 Vault，缺失目录待绑定。外部业务记录只保存绑定 ID，其本机路径和目录身份进入 runtime，ZIP 未携带 runtime 并保留了源布局。恢复目标显式重绑保留 ID、增加版本，目录身份换掉后启动校验再次拒绝，未交给 Core。 [固定 Space 往返测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space/plugins/agent-cli/test/spaces-package.test.ts) · [记录投影](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space/plugins/agent-cli/src/engine/spaces.ts:148)
- 同机旧记录仅迁移能归属于当前 Vault 的安全目录。旧外部记录、他机和恢复副本的旧绝对记录待绑定。固定测试确认恢复后指回源库的目录联接、穿越相对路径和伪绝对值被拒绝。独立追加的破损数据探针确认损坏 JSON 与文件名／记录 ID 不符的项不会挡住有效项，损坏的本机外部绑定只让对应 Space 待绑定，原损坏文件未被改写。 [旧记录迁移](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space/plugins/agent-cli/src/engine/spaces.ts:121) · [破损数据探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space/plugins/agent-cli/test/t187-space-damaged.test.ts) · [运行日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space-all.log:17)
- 固定 SpaceStore、会话回归和 Vault 包测试合计 56 项通过，6 项按用例条件跳过。在独立 SpaceStore 候选中检查了组件与运行证据。Agent 模块挂载目录提示、历史／审查入口守卫和正式恢复页在无 Core 时的行为由 Lead 接线。 [完整结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space-all.log) · [接线边界](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task11-bd5cf21e/space/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W8.1-space-package.md:9)

## 阻碍与接续

两套固定对象审查已完成，提交差异检查通过。P2 可沿打包配置探针复验。后续正式安装包需核对随包宿主资源和缺失分支。P3 可在同一待核实请求下验证离开并返回模块及重开窗口。当前未把独立 SpaceStore 测试计作正式桌面恢复验收。

## Lead 验收
