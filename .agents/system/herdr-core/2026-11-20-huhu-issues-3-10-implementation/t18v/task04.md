# 收束批准规则独立审查中的四个竞态

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18v`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 分支 `impl/huhu-issues-3-10-production-cutover`
- 前置提交 `69776e6887fb8ff75f4992f81445ebc8f15fa959`，沿用 task03 完成后的 HEAD。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report04.md`

对照 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report04.md`，先闭环 P1。把受信调用方与规则动作类型的检查放到同一个配置事务，写入当前版本；用真实能力入口和可控写入交错验证。再处理三个 P2。实际目录身份在 protected helper 的 spawn 边界也需核对，不能只在排队前做检查；复用现有 Windows canonical path、FS identity 和现有 private ticket。条件保存失败须保持原批准，改名后恢复原名字仍需重新批准。终端的作用域、退出结果与待释放状态分开，原会话暂不可释放时落盘，在重开后按原身份安全重试。为上述可复现路径加入实际回归或确切说明剩余边界。

可写 Automations、本切片测试及证据、与 Lead 约定的 Agent CLI protected launch 适配、必要的 shared schema。Agent CLI workspace/tree、通用插件注册装配和根锁继续归 Lead。先证明 P1 能被回归拦截。只用本地 Windows 和合成 Vault、合成凭据。不要创建 worktree、操作远端、访问 ubuntu26 或委派。
