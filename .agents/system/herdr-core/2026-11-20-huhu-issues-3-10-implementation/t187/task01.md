# #5 T7.1 生产切换独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t187`
- 审查候选 — `9bb7efaffe2a101ed1de755731dd176aa9883106`，位于 `D:/Document/code/huhu/temp/issue-worktrees/integration`
- 只写报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report01.md`

按 dev-review 核对 #5 T7.1-cutover.md 与 #4 W8.3 对 Tasks 和 Automations 生产切换的前置条件。读实际候选提交、旧产物、公开入口与调用方，确认旧自动化 supervisor/claims 已退役，规则、人工和外部入口是否走同一份派遣及受理，原结果 ACK/投递与终端核对是否有旁路写入。检查真实源码、构建和已有测试证据，给出可复查的规格遗漏、影响和修复指针。能独立用现有不写真实 Vault 的回归取证时，限 Windows 固定 pnpm 和合成夹具，使用独立测试输出，避免仓库范围重建。Lead 正在同一候选运行 lint、TypeScript、构建、Windows 安装包和回归；不要写业务文件、锁、构建输出、Git refs 或远端。无需等待安装包再给 T7.1 结论。结论把候选证据与尚待 W8.2／T7.2 的覆盖准确分开。

候选日志在 `D:/Document/code/huhu/temp/issue-baseline`，入口为 `9bb7efaf-windows-gates.log`、`9bb7efaf-windows-regressions.log` 与 `task-run-projection-core.log`。报告包括可以支撑的证据、严重程度及待证据项。
