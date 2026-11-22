# Windows 交互 Agent 的原生受保护宿主

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t17c`
- 同一现有工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，新分支 `impl/huhu-issues-3-10-agent-pty`，基线 integration `0e1b1167`。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report11.md`

依据 #4 W7.3 和 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report03.md` 及其可复跑探针，实现可随应用分发的 Windows 原生内层 ConPTY 宿主和单次交付进程。复用探针已核验的 x/sys、Win32 双向身份、应用私有 stdin、固定 Core 外层 terminal.run、TTY/resize 和 Job 回收。提供独立 Native 子目录及精确构建说明，接线需求写清 broker 及 host 启动参数、否认/退出状态、授权内容一次性协议。可信的 Engine 预持有 broker 进程和私有 stdin，只在识别本机 Core 的此次宿主 PID、进程创建时间与安装映像后交付。Core 只收到公开参数。内层命令以冻结的 cwd、argv、可执行映像与批准的环境启动，外层可见输出不包含合成原值。用已经装好的离线 Pi 和本机合成 CLI 验收，不接真实账号或 provider。明确限制经批准的实际文件、解释器和路径变更。

可写独立 `native/agent-pty/` 子目录与 #4 本片测试证据。不要写 TS host 装配、Engine/preload、Electron builder、根锁或其他插件，Lead 接入启动与打包。提交源码、已验证的构建依赖和许可，二进制与临时产物留在忽略区。只用本机 Windows；不可新建 worktree、远程写入或委派。完成清理自开的非复用 pane。
