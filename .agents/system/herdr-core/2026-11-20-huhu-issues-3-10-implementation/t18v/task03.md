# CLI 的受保护规则输入与本机回执验收

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18v`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 分支 `impl/huhu-issues-3-10-production-cutover`
- 前置提交 `69776e6887fb8ff75f4992f81445ebc8f15fa959`，已读 #5 E07、#6 CLI 与 G5b.2/G3.3 的相关验收。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report03.md`

在实际生产 huhu CLI 的 `call` 接入文件输入，明确 argv、环境及输出均不携带凭据的使用方式。沿用已存在的 CLI 参数、输入上限、错误映射及网关认证。用应用实际入口执行合成值的写入、清除、回执读取和授权撤销，让 task02 的真实 Windows CLI/MCP 测试使用生产入口。提供输入读取/JSON 失败可理解且不回显内容的回归。包含稳定意图及重复投递时的对账证据。按已批准的 exact rule/refs 范围核对，先完成安全输入垂直切片。

可写 apps/cli 下直接调用与测试、#5/#6 当前变更的 CLI 证据。Engine/Renderer 装配、插件注册、根锁、测试包、其他模块归 Lead 或现有执行者。先阅读已有 CLI 和上游来源。涉及任何扩大外部规则能力的改动先报告明确的依赖。只在 Windows 用固定 pnpm，禁止远端写入、额外 worktree 或配置真实凭据。完成提交与证据后保持 pane 待下一份独立派发，清理自己完成且不复用的测试 pane。
