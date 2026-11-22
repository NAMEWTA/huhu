# task01.md #9 P0.1 / P0.2 本机保护取证与凭据合同分析

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t1b
- 身份核对 — 本机 Windows 默认 Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`），本地 ID `t1b`
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1b/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1b/report01.md
- Lead 回告方式 — 报告写成后在终端回复绝对路径，外部 Lead 从共享根收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/credentials
- 接续依据 — 首次任务。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`。

## 目标与输入

- 权威 Change 目录 `D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-9-safe-accounts`。任务 `P0.1-local-protection.md、P0.2-credential-replacement.md`。
- 以 #9 规格与设计为准，读取 Safe crypto、Engine supervisor、现有 Vault 条件写、SSH、Versioning、Agent CLI、Automations 凭据直接调用者，定位 Mail 所需能力。核对 temp/sources/motty 的 keystore 与许可，检查 Electron/OS 实际保护后端与进程边界。
- 应用当前任务工作区的 AGENTS.md、dev-build；真实入口按 dev-verify。若涉及客户端 JS/TS、HTML 或 CSS，选定实现前完成 zh-modern-web-guidance 的 search 和 retrieve。与体验确认有关的实现等明确确认，并继续独立范围。

## 读写范围与产物

- 可读范围 — 本 worktree，主目录的用户未提交批次计划和协作规则，`D:/Document/code/huhu/temp/sources`，GitHub Issue 的只读快照 `D:/Document/code/huhu/temp/issue-baseline`。
- 可写业务范围 — 所有业务、规格和上游均只读。可写本 worktree 的 temp 目录合成夹具，并写自己的 report。系统保护试验只用随机合成标记与临时未使用的命名空间/新目录，不读取已有密钥存储或真实 Vault。
- 保留他人工作、根锁及全局装配。仅在指定 worktree 与本任务报告路径写入。不得派发其他代理。全部 GitHub 操作保持只读。不得操作真实 Vault、原生历史、邮箱或未明确授权的 SSH 目标。仅以正常认证及合成数据验证，限本任务描述的通用产品行为。
- 预期产物 — 提交给 Lead 的取证报告，包含 P0.1 两个候选的真实可用性、重启与私有绑定验证，以及 P0.2 可冻结接口、引用和替换事务语义，以及由它解锁的消费者。只读分析者不提交业务文件。
- 本机锁定版 pnpm 12.10.1 在 `D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/` 下，PATH 上的 shim 不可用。可在本 worktree 运行冻结安装并把实际目录加入该进程 PATH。不要写共享锁。上游实际采用项随报告给出文件、提交、许可和改动，Lead 统一登记。

## 验收与验证

执行主机可用的合成测试，分别说明 Windows、Linux、macOS 的实测、待测及缺保护后端状态。证据与实际进程和平台绑定；列出密钥缺失、故障/并发替换与引用清理的预期。未经实测不得把候选方案写成通过。

## worker 执行约定

遵守 `D:/Document/code/huhu/.agents/skills/system-herdr-core/references/file-coordination.md`。先核对 topic、当前 manifest 行、准确报告位置和 `HC_TERMINAL_ID`。只有当前指针为 active 且没有匹配终稿时开始。不覆盖 task 或其他 report；用同目录临时文件及不覆盖目标的原子发布写报告。按 `D:/Document/code/huhu/.agents/skills/system-herdr-core/assets/report.md` 填写身份、本地提交、实际检查及未测项，完成后在终端回告 report01.md 的绝对路径，再等待下一项。
