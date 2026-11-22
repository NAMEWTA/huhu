# 分析交互式 Agent 的受保护环境

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t192`
- 业务代码只读。参考当前 integration 以及 69776e68 的已批准规则实现。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report01.md`

依据 #4 W7.3 与 #9 的模块凭据合同，检查固定 Core v0.1.19 源码和实际桌面装配，设计可采用的 Windows 交互式 Agent 安全注入方式。研究已有 shell/agent launch、ModuleCredentials、Windows Credential Manager、utility process 的 one-shot broker、Core terminal.run / PTY 生命周期，以及成熟的本机 IPC 与进程连续性方案。比较能否走真实已获准交互 CLI，由信任进程临时解保护，避免秘密落在 Core restart_env、命令参数、输出、回执、Vault、用户可见诊断中。单次授权与普通凭据不可串用，失败态允许核对，不重新启动同一 requestId。说明是否需支持第三方 provider 或独立进程、具体哪些接口能复用，带固定版本、代码位置和 Windows 的最小可复跑证据。

仅用 Windows 本机、合成数据，禁止远程写入、写业务代码、写原型、额外 worktree 或扩大权限。可以在共享证据目录保存最小非业务实验及报告。完成后清理自开临时测试 pane。不要委派。
