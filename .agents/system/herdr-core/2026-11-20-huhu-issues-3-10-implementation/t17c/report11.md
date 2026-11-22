# t17c · Windows 受保护宿主原生实现

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task11.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task11.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report11.md`
- 执行结果 — `done`

## 交付

在 `impl/huhu-issues-3-10-agent-pty` 提交 `cfcea9842681ded8d937a71c32001b9679e441d9`，父提交为指定基线 `0e1b116775d79936b270a8252ba406fcae726962`。提交限 `native/agent-pty/` 和 #4 W7.3 验收证据。工作树干净，根锁 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。 [原生模块与离线构建](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/native/agent-pty/README.md)

同一个 `huhu-agent-pty.exe` 提供 `broker`、`host`、`inspect`、`directory`。Engine 保持 broker 及其私有 stdin，按本机 Core 返回的本次宿主 PID、Win32 创建 FILETIME 和批准安装映像交付。Core 的 `terminal.run` 接收公开外层参数。两侧核对本地命名管道报告的进程身份，broker 只传一帧，收到消费确认即关闭。 [提前发布的接线协议](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/native-pty-api.md)

内层用系统 ConPTY 与 `CreateProcessW`，按冻结的 cwd、绝对映像、argv 和完整批准环境创建为 suspended。创建时关联 Job、禁用句柄继承并提供显式 UTF-16 环境。核对实际映像再恢复线程。文件按 SHA-256 并保有句柄，目录按卷序号、文件索引和创建 FILETIME 固定，目录链拒绝 reparse。

## 验证

最终同一二进制在两个独立的临时 Windows Core 实例各通过 17 个场景。Go 模块校验、5 项 Go 测试、Go vet 和 Git 差异检查通过。 [验收说明](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-native-pty.md) · [两轮机器结果](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-native-pty-runs.json)

| 验收 | 观察 |
| --- | --- |
| 单次交付与双向身份 | 两端创建时间不匹配与同内容的另一安装路径均拒绝，零内层启动。成功消费后同名管道不可重新打开。公开 argv 与 Core 实际接收内容一致，`restart_env` 为空或省略。 |
| 批准环境和外层 TTY | 独立 Node CLI 首条业务语句核对合成原值摘要、Unicode、完整环境名、批准 cwd、含引用符的 argv 和三路 TTY。父环境诱饵缺席，省略保护变量的负对照返回 17。真实 attach 收到无换行提示，输入回应正常，且无键入时已观察到内层 resize 到 94 × 27。 |
| 文件及目录变更 | 实际替换批准的解释器和脚本、更换 cwd 或换成 junction 均被拒绝。改变入口路径大小写、将保护值放入 argv、大小写重复环境名也被拒绝。运行期打开入口写入失败，退出后句柄释放。 |
| 可见输出 | 对照脚本分两段回显合成值，中间插入 stdout 输出。外层原始 attach、屏幕、Core 视图、broker 诊断和文件扫描均无原值。可见通道也未发现合成随机部分任意连续八位。停服后补扫被 Windows 占用的文件。 |
| Job 与真实 Pi | 正常退出和 Core 主动结束外层均回收独立的内层后代。实际 Pi 1.5.2 在全新 HOME 离线运行，固定 85 个 Pi 文件，仅用 `/session` 和 `/quit` 实测交互、正常退出。 |
| 清理 | 两轮均 `remainingPanes=0`、`coreStopped=true`、`tmpRemoved=true`。每次只操作本次新建的临时 Core 终端。 |

## 构建与接续

- Windows x64 `10.0.26300`、Go `1.26.7`、Node `24.21.0`。本地缓存 `golang.org/x/sys v0.50.0` 用 `go.sum` 离线校验。Go 与 x/sys 的许可和 PATENTS 随提交。
- 最终构建为工作树下的 `native/agent-pty/bin/huhu-agent-pty.exe`，SHA-256 `905cc819483996cab9fd1b1c0a51a36db2632dac7cf65f878a9af8e87e6f9b85`。固定 Core 0.1.19 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。已编译 exe 和临时输出位于本模块忽略目录。
- 复用 t192 已验证的 Go Win32 绑定、命名管道、ConPTY 和环境块。使用实际 Windows SDK 的 `PROC_THREAD_ATTRIBUTE_JOB_LIST` 在创建时绑定 Job。 [t192 探针与来源](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report03.md)
- 输出证据覆盖原样和已验证的交错合成值。进程本身必须经过批准，解释器动态依赖、变形输出与运行时权限仍属于产品信任策略。桌面和 TS 接线、安装包验收、Safe 三种状态以及重启对账由 Lead 接续。

## Lead 验收
