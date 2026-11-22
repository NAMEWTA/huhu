# task01.md 独立审查 #4 W6.0 回执与双 ACK

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t20
- 身份核对 — 本机 Windows 默认 Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`），本地 ID `t20`
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report01.md
- Lead 回告方式 — 完成时在终端给出报告绝对路径，外部 Lead 从共享目录收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/receipt
- 接续依据 — W6.0 实现者 t19 已报告，等待独立审查。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`，候选 `3804140c6c4da026694e2d798b348f1229848d42`。

## 目标与输入

应用 dev-review，对 W6.0 的规格和仓库规范分别审查。读取两端现有直接消费者、#4 W6.0/W6.3 和 #5 T3.1/T3.3、实现者报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report01.md`。查看实际候选中的新增文件与测试。检查运行身份、幂等、两次 ACK 的持久释放依据、回读能否重建 delivery、错版本及同 ID 异内容处理。跟踪共享契约的桌面与浏览器构建依赖、Schema 数据边界和导出。以现有确认范围与实际运行证据判断，不沿用实现者结论。

## 读写范围与产物

- 可读范围 — 实现 worktree、原项目 change 和协作记录、本地上游检出。也可查看集成 worktree当前的构建入口。
- 可写业务范围 — 无。可运行只读检查及现有测试，合成夹具限自建临时目录；只写自己的 report。
- 禁止改动 — 不改代码、规格、工作树或 Git 远端。仅验证正常协议及合成数据，保护真实 Vault、历史和认证。不得派发其他代理。
- 预期产物 — findings 按影响排列，提供文件/行号、触发条件、证据版本与检查结果，标记需返工项和剩余验收。若发现问题，提供可供实现者独立复核的范围。

## 验收与验证

核对实际提交和工作树，参照 W6.0 的九类回执/ACK 样本和生产调用的责任边界。可用本 worktree 的锁定 pnpm 和既有测试。验证失败或未执行时说明环境、命令和影响。报告区分未接线的后续生产任务和 W6.0 当前缺陷。

## worker 执行约定

按原工作区 `.agents/skills/system-herdr-core/references/file-coordination.md` 核对身份、当前指针和终稿路径。仅在指针 active 且终稿不存在时开工。以相同目录临时稿、非覆盖方式发布符合 `.agents/skills/system-herdr-core/assets/report.md` 的终稿，并在终端回告其绝对路径。
