# #4 Windows 桌面受保护启动与 Space 数据包复核

- terminal_address `t187`
- Windows 桌面候选 `5b904b5e`
- SpaceStore 候选 `331defdb626fbca6320e042872d570bbf432d588`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report11.md`

先核对上轮长保护值共享前缀修复，利用固定候选原生 Go 测试。随后审查桌面链路使用真实 Core PID/映像、私有 broker 状态和三种 Safe 状态回归（Windows 定向日志 native-integration-protected-5.log）。优先检查断线后的原请求对账、假成功标记、重复注入、消息污染和公开 env。独立复核 SpaceStore 新格式里库内相对目录、外部绑定与已有破损数据。目录、包恢复的产品接线由 Lead 继续，报告区分固定组件和实际集成。只读业务和已提交对象，允许在系统隔离临时目录使用本机 Core 与合成数据，不写真实远端、其他 worktree、根锁或真实 provider。

