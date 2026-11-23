# #7 首段出站代理独立审查

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，Core `wta-ubuntu`，Lead `t3p`，终端 `t4t`
- 任务 `t4t/task04.md`，报告 `t4t/report04.md`
- 只读目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，固定候选 `31352cae87ad11d5f12c7a3d125bc2fe8aee5189`

按 `dev-review` 对照 #7 H3.3、R03/R04、#6 外部权限，以及当前首段实现，独立审查变更。重点看第一阶段实际拨号与显示一致，SSH 主机身份验证和 direct-tcpip 顺序，CLI/MCP 要求逐跳授权且旧授权/路由撤销或更新时关闭，凭据文件/错误/状态不泄露，保存/移除和授权并发，以及 SOCKS/HTTP CONNECT 退出取消和流交接。另核查 Web 新主机设备路径的边界。共享编排根下 `t4x/report05.md` 与证据日志 `h7-first-proxy-recheck.log`、`h7-first-proxy-regress.log` 记录已执行的命令和数量。不要推断 ProxyCommand、ViaShell、UI E2E 已完成。只报告你找到的具体可核对问题、代码证据、可观察影响和建议验证，不修改代码或启动测试、构建、E2E。无远端写入。
