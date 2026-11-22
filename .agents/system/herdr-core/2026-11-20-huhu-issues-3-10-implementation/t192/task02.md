# Windows 隔离内层 ConPTY 与受保护凭据单次交接的验证探针

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t192`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report02.md`
- 上一份分析 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report01.md`

阅读 Huhu、ORCA 和固定 Herdr Core v0.1.19 已用的 Windows PTY 实现。核对现有 Rust/Go/Windows SDK 工具链和复用许可。用本次共享目录中的最小验证探针验证受信宿主承接外层 Core，内层 ConPTY 保留真正的 CLI TTY，合成变量仅交付给已核对 PID 和创建时间的子进程，进入 Core 外层输出前可截断原值。跑本机合成进程；可复用空夹具的离线 Pi，只在临时目录和临时配置下运行。请优先证明完整最小成功路径，若编译环境或 Core 的限制造成阻断，给出准确的可重复结果与可复用落点。若用到明确采用的上游，写许可证、文件、提交和具体调用范围。

本任务是独立技术验证。探针、构建产物和证据只放此共享目录或临时路径。不得写业务代码、根锁、安装配置、调用真实 provider、访问其他机器、创建额外 worktree 或委派。已有 integration 仍做组合验收，不跑其构建。需要 native 依赖时首先复用本机已有源码与工具链，限制在探针目录。完成清理自开的测试 pane。
