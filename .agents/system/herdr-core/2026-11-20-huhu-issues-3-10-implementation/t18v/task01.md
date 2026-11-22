# #5 T7.1 定时终端规则在启动前中断时可确定恢复

- 共享根：`D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address：`t18v`
- 工作目录：`D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 实施分支：impl/huhu-issues-3-10-production-cutover
- 基线：311ba0c82839f627018695f8651541c8ff63ad71
- 审查来源：`D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report01.md` 规格发现第 2 项
- 报告：`D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report01.md`

实现并验证定时 Terminal 规则在写发生和创建 run 中间被进程中断时，原计划点有唯一运行和确定可见状态。基线已经切换受保护环境。沿用现有 automation-run、Activations、owner、session requestId 与对账，不更改 Agent 或 reminder 调用方。建议在任何外部副作用前以 automation-run 作为终端发生的持久锚，把 activation 从同一记录投影并保留旧历史投影识别，区分尚未交给 Core 与已提交／待核验。重新启动仅继续可证明尚未提交且身份、原配置与规则版本一致的运行，不能证明时对原记录停在明确可核对状态。丢启动 ACK 时只重查原 request/terminal，不重启，不把历史或复制 Vault 当本机事实。不能用新的独立 worker/队列/扫描表绕开现有代码。

只写本工区 plugins/automations/src/engine/service.ts、相关 Automations 测试与 #5 该切片证据。公共 contracts 字段如需调整，本任务授权仅写 packages/contracts/src/kinds/automation.ts 的 automation-run frontmatter，新旧格式兼容。不要修改 Engine 装配、preload、其他插件或根锁。固定 pnpm 12.10.1 在 Windows 跑，覆盖两个精确故障窗口（运行持久写入前及 Core 提交确认缺失）、旧日志浅层中断、并发同槽、其他 Vault 归属、稳定 id，以及原本提醒、手动、规则停用行为。不要委派，不连接远端。完成提交及 report01.md。
