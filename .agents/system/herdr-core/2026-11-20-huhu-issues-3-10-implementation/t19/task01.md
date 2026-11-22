# task01.md #4 W6.0 回执与双 ACK

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t19
- 身份核对 — 本机 Windows 默认 Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`），本地 ID `t19`
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report01.md
- Lead 回告方式 — 报告写成后在终端回复绝对路径，外部 Lead 从共享根收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/receipt
- 接续依据 — 首次任务。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`。

## 目标与输入

- 权威 Change 目录 `D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-4-agent-cli`。任务 `W6.0-receipt-contract.md`。
- 读取来源、规格、设计、计划和 W6.0，并沿 #5 设计、任务接收与投递路径核对消费者。沿 packages/contracts 考察现有 schema、task-run 和测试约定，核对 Herdr Core、Herdr App 及 ORCA 的本地检出，区分参考与实际代码采用。
- 应用当前任务工作区的 AGENTS.md、dev-build；真实入口按 dev-verify。若涉及客户端 JS/TS、HTML 或 CSS，选定实现前完成 zh-modern-web-guidance 的 search 和 retrieve。与体验确认有关的实现等明确确认，并继续独立范围。

## 读写范围与产物

- 可读范围 — 本 worktree，主目录的用户未提交批次计划和协作规则，`D:/Document/code/huhu/temp/sources`，GitHub Issue 的只读快照 `D:/Document/code/huhu/temp/issue-baseline`。
- 可写业务范围 — 独占 packages/contracts 内执行回执与 ACK 合同的新增文件、现有 task-run 相关最小修改、公共 barrel src/index.ts 和相应测试/固定样例。共享 barrel 在本任务交回前仅此任务可写。若必须改其它共享文件，先在报告写明，不改。
- 保留他人工作、根锁及全局装配。仅在指定 worktree 与本任务报告路径写入。不得派发其他代理。全部 GitHub 操作保持只读。不得操作真实 Vault、原生历史、邮箱或未明确授权的 SSH 目标。仅以正常认证及合成数据验证，限本任务描述的通用产品行为。
- 预期产物 — 本地提交，附导出入口、版本、固定样例及两端各自重新加载后可验证的预期。
- 本机锁定版 pnpm 12.10.1 在 `D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/` 下，PATH 上的 shim 不可用。可在本 worktree 运行冻结安装并把实际目录加入该进程 PATH。不要写共享锁。上游实际采用项随报告给出文件、提交、许可和改动，Lead 统一登记。

## 验收与验证

按 W6.0 逐项执行绑定一致的 result、question、两处持久化前后 ACK、重交、同 ID 异 payload、跨 Vault/attempt/运行绑定、错版本和无持久接收依据的检查。区分验证器检查和样例驱动器能证明的行为。记录 pnpm 测试/typecheck 和未覆盖项。实现不接入真实 provider，不触碰会话历史。

## worker 执行约定

遵守 `D:/Document/code/huhu/.agents/skills/system-herdr-core/references/file-coordination.md`。先核对 topic、当前 manifest 行、准确报告位置和 `HC_TERMINAL_ID`。只有当前指针为 active 且没有匹配终稿时开始。不覆盖 task 或其他 report；用同目录临时文件及不覆盖目标的原子发布写报告。按 `D:/Document/code/huhu/.agents/skills/system-herdr-core/assets/report.md` 填写身份、本地提交、实际检查及未测项，完成后在终端回告 report01.md 的绝对路径，再等待下一项。
