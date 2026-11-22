# task01.md #6 G1.1 能力目录与授权的动作盘点

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t1c
- 身份核对 — 本机 Windows 默认 Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`），本地 ID `t1c`
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report01.md
- Lead 回告方式 — 报告写成后在终端回复绝对路径，外部 Lead 从共享根收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/capability
- 接续依据 — 首次任务。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`。

## 目标与输入

- 权威 Change 目录 `D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web`。任务 `G1.1-action-inventory.md`。
- 按 source/spec/design/plan 与 G1.1，盘点当前 HEAD 的 UI、manifest、preload、WS、CLI/MCP/内外部调用及拟增入口。检查 Notes（含 #2）、Agent 状态、SSH 文件流及 Core 查询目前是否有启动副作用。查能力注册、授权、调用结果与 handler。沿用现有 Engine，不设计第二套调用入口。
- 应用当前任务工作区的 AGENTS.md、dev-build；真实入口按 dev-verify。若涉及客户端 JS/TS、HTML 或 CSS，选定实现前完成 zh-modern-web-guidance 的 search 和 retrieve。与体验确认有关的实现等明确确认，并继续独立范围。

## 读写范围与产物

- 可读范围 — 本 worktree，主目录的用户未提交批次计划和协作规则，`D:/Document/code/huhu/temp/sources`，GitHub Issue 的只读快照 `D:/Document/code/huhu/temp/issue-baseline`。
- 可写业务范围 — 仅可写本 change 内的 evidence/G1.1-action-inventory.md 及用于该证据的隔离样例或短日志，归本任务所有。业务代码先只读。公共能力 descriptor/授权的后续实现由本 worker 接续，在第一任务验收并核定可写范围后分派。
- 保留他人工作、根锁及全局装配。仅在指定 worktree 与本任务报告路径写入。不得派发其他代理。全部 GitHub 操作保持只读。不得操作真实 Vault、原生历史、邮箱或未明确授权的 SSH 目标。仅以正常认证及合成数据验证，限本任务描述的通用产品行为。
- 预期产物 — 提交可追踪的能力矩阵。行能定位 owner、schema、真实入口、权限/风险和证据。给出 G1.2/G2 下一片所需的最小稳定公共合同选择与证据。
- 本机锁定版 pnpm 12.10.1 在 `D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/` 下，PATH 上的 shim 不可用。可在本 worktree 运行冻结安装并把实际目录加入该进程 PATH。不要写共享锁。上游实际采用项随报告给出文件、提交、许可和改动，Lead 统一登记。

## 验收与验证

按任务要求用现存测试/隔离测试 Vault 核对 Notes 读取、Agent 状态及 SSH 文件动作的实际入口和副作用。无授权主机时记录范围和解除条件，使用现有本地夹具或静态交叉引用完成独立项。标明可信回执内部可见性。

## worker 执行约定

遵守 `D:/Document/code/huhu/.agents/skills/system-herdr-core/references/file-coordination.md`。先核对 topic、当前 manifest 行、准确报告位置和 `HC_TERMINAL_ID`。只有当前指针为 active 且没有匹配终稿时开始。不覆盖 task 或其他 report；用同目录临时文件及不覆盖目标的原子发布写报告。按 `D:/Document/code/huhu/.agents/skills/system-herdr-core/assets/report.md` 填写身份、本地提交、实际检查及未测项，完成后在终端回告 report01.md 的绝对路径，再等待下一项。
