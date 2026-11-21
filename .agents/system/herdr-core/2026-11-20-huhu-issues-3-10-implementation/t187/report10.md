# Windows 原生受保护 PTY 只读审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task10.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task10.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report10.md`
- 固定候选 — `f4f68fd34f2badf64bc7802091a081369ff3d805`
- 比较基准 — `cfcea9842681ded8d937a71c32001b9679e441d9`
- 执行结果 — `done`

## 结论

固定候选独立复建后与实现者的本轮 EXE 指纹完全一致。18 项 Windows 场景通过，包括消费与运行回执分离、批准目标被替换时拒绝交付、Job 回收和独立 HOME 的真实 Pi 离线交互。另发现一项 **P2**，两个长保护值共用前缀时，普通终端输出可能在首次脱敏后持续消失。已声明 DLL 的磁盘文件可以固定，候选未验证进程实际装载的 DLL。桌面 Engine 的回执读取、安装资源信任和持久对账仍属 Lead 正在接入的路径。 [独立 Windows 复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) · [原生协议](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/PROTOCOL.md)

## 产物与改动

在系统临时目录从指定 Git 对象归档原生模块和探针依赖的固定源码，引用本机已有 Go 与 Node 依赖。新增两份独立复核探针只留在临时目录。只使用本机 Core、合成环境值和临时 HOME，业务代码、既有 worktree、真实 provider 凭据及远端均未写入。 [输出探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/t187_output_review_test.go) · [Core 重开探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/tests/t187-core-reopen-review.cjs)

## 验证

| 范围 | 观察与边界 | 证据 |
| --- | --- | --- |
| 目录、映像、脚本与 DLL | 每一级目录经 Win32 句柄核对规范路径、目录类型和 reparse 属性，根目录限固定卷。批准的 cwd 对比卷序号、文件索引、创建 FILETIME。文件经 SHA-256 校验，持读句柄且排除写入及删除共享。内层用绝对 `lpApplicationName` 和 cwd 挂起创建，从新进程句柄核对映像路径后恢复线程。复跑拒绝了改写入口、改写映像、换 cwd 和 junction，证实运行中入口写保护和退出释放。显式列入 `files` 的 DLL 按普通文件固定，代码没有枚举和核实装载后的 DLL 路径或摘要。系统 ConPTY 由 x/sys 的系统 DLL 绑定提供。 | [路径与文件固定](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/pins_windows.go:74) · [声明文件](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:145) · [挂起后核验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/console_windows.go:229) · [系统 DLL 绑定](C:/Users/cdewta/go/pkg/mod/golang.org/x/sys@v0.50.0/windows/zsyscall_windows.go:45) · [Windows 复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) |
| 双向进程身份 | 管道两端各取 Win32 返回的对端 PID，与本次期望 PID 比对。打开进程后核对原始 FILETIME、映像规范路径和活性，授权前再检查活性。独立复跑中，两个方向的 FILETIME 不符及把安装声明改为同字节的另一位置均被拒绝，消费和内层启动均为零。实际映像检查的运行态证据为进程句柄给出的映像路径，SHA-256 来自同时固定的磁盘文件。 | [broker 核对 host](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:218) · [host 核对 broker](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:302) · [进程身份](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/pins_windows.go:190) · [Windows 复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) |
| 私有 stdin 和命名管道 | 测试调用者直接 spawn broker，持有 stdin 与两路输出。Go 入口要求 stdin 为 `FILE_TYPE_PIPE`，读取带上限和期限。匿名性和私有性由调用者的句柄布置保证，该类型检查本身不区分匿名管道和命名管道。本地命名管道用当前用户 DACL、首实例、单实例、拒绝远端标志和双向身份核对。内层 `CreateProcessW` 禁用句柄继承。ACL 与远端范围来自源码，独立运行在当前 Windows 用户和本机 Core 内完成。 | [stdin](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:152) · [管道创建](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:387) · [内层句柄边界](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/console_windows.go:95) · [探针 spawn](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/tests/verify.cjs:223) |
| 消费与运行回执 | 私有 broker stdout 在 host 验收后、允许启动前写 `ISSUED_ONCE`。只有收到已验证 host 在成功 `ResumeThread` 后发出的运行回执才写 `RUNNING`。公开 Core 文本没有进入 native 的回执解析。正常场景私有顺序为先消费再运行。无效批准映像由 Windows 拒绝创建时，私有顺序为先消费再 `START_FAILED 70`。固定单测覆盖断管、确认失败和无效回执时保留消费并报告 `START_UNKNOWN`。 | [私有回执解析](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:247) · [host 运行回执](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/console_windows.go:136) · [断管与无效回执](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows_test.go:16) · [Windows 复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) |
| 进程清理 | 内层在创建时绑定带 `KILL_ON_JOB_CLOSE` 的 Job，核验失败或退出进入收尾。真实 Core 中，内层根进程正常退出及 Core 主动结束外层均观察到仍存活的独立后代结束。管道重叠 I/O 超时后取消并等待完成。全套运行最终无剩余终端，临时 Core 已停且本轮夹具目录已删除。 | [Job 与创建](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/console_windows.go:57) · [关闭及排空](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/console_windows.go:199) · [管道取消](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:421) · [Windows 复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) |
| 字符串、环境和可见输出 | 环境为显式 UTF-16 块，校验大小写重复键、空秘密、控制字符及长度，cwd 与 argv 含原值会拒绝。Go 清理可管理的授权字节和 UTF-16 缓冲，运行仍需保留用于遮蔽的字符串。通过合成入口核对 Unicode、引号、正常 stdin 与尺寸、父环境未继承。原样和已测交错回显经遮蔽，Core attach、屏幕、持久记录和停服后落盘扫描均无合成原值。多值的输出连续性见下方 P2。 | [环境和 argv 校验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/protocol_windows.go:71) · [诊断码](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/main_windows.go:34) · [内层输出路径](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/console_windows.go:193) · [Windows 复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) |
| 拒绝、失败和重开 | 文件身份变更在消费前拒绝。启动失败已确认消费后管道关闭，公开 argv 仅保留外层启动参数，Core 持久记录的 `restart_env` 为空或省略。额外探针在确认消费但创建失败后实际停启 Core，旧记录仍为退出 70。以旧记录的公开 argv 新开外层终端时，旧管道始终不存在，新外层超时退出 75，未启动内层。 | [持久记录断言](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/tests/verify.cjs:252) · [失败与单次端点](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/tests/verify.cjs:313) · [Core 重开探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/core-reopen.log) |

### P2 · 两个长保护值共用前缀时，终端正常输出可能停止

遮蔽器把长值拆成前缀和尾段。当前缀同时命中且同样长时，它选列表中的第一个，之后只等这个值的尾段。独立 Go 探针配置两个同前缀、不同尾段的合成值，只输出第二个值再输出一行正常文字。两个合成值都未出现在输出中，正常文字也未出现。只要选错的尾段一直未出现，后续提示和交互回显就会持续被吞掉。此问题可由获准进程普通回显触发。原有交错场景只覆盖单一匹配，用例通过与此现象相容。 [前缀和尾段选取](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/mask.go:31) · [同位置择一后等待尾段](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/mask.go:75) · [独立失败日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/mask-output-continuity.log)

### 证据对应和规范

- 实现者历史 JSON 内含两轮各 17 项，两个实例均清理完毕。记录中的 `sourceHeadAtLoad` 是前序提交父对象 `0e1b1167`，当时运行的是指纹为 `905cc819483996cab9fd1b1c0a51a36db2632dac7cf65f878a9af8e87e6f9b85` 的实现者产物。两阶段补充记录给出 18 项和新 EXE 指纹。本轮从 `f4f68fd34f2badf64bc7802091a081369ff3d805` 归档源码独立重建，SHA-256 为 `034ecc6858010adb28bf977654b1ddf3fd537ae13ffb9823ec9c065cfac30fba`，与补充记录一致。 [历史两轮 JSON](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-native-pty-runs.json) · [两阶段补充记录](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-native-pty.md:28) · [固定对象复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log)
- 工具为 Windows x64 `10.0.26300`、Go `1.26.7`、`golang.org/x/sys v0.50.0`、Node `24.21.0`、Herdr Core `0.1.19` 和 Pi `1.5.2`。探针验证了 Node、Core、Pi 入口指纹和 85 个 Pi 文件声明，并在全新 HOME 用 `/session`、`/quit` 验证离线交互。Go 模块验证、已有测试、Go vet、提交差异检查均通过。临时附加输出用例失败已单列。固定范围内未确认另有项目规范违反。 [固定指纹与调用](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/tests/verify.cjs:23) · [复跑环境与结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/verify-windows.log) · [Go vet](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/go-vet.log) · [diff 检查](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/diff-check.log)

## 阻碍与接续

原生只读审查已完成。P2 可沿两值探针复验。接线验收仍需对实际安装产物核对可信启动路径、私有 broker stdout、原 requestId 对账和三种 Safe 状态；已装载 DLL 的身份也未由本轮文件固定证据覆盖。 [接线协议](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/native/agent-pty/PROTOCOL.md) · [W7.3 验收](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task10-2124c0ac/candidate/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W7.3-agent-settings.md)

## Lead 验收
