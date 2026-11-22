# #5 T1.1 正文身份返工与 T1.2 持久受理

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t6n
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t6n
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/tasks，分支 impl/huhu-issues-3-10-tasks，当前 `a5d82cb704cdd44fbae387518f7d1c4246908fb1`，已含 W6.0。

按 dev-build、dev-verify。读 #5 spec/design、T1.1 和 T1.2、t44/report01 与 t54/report01 的证据。先以 `persistence-http.test.ts` 或同等真实 Engine HTTP 入口加红测，复现给同一正文加首尾换行只升 inputRevision 却不改读回正文和 inputHash。`TaskService` 应复用实际序列化及解析后的正文计 hash。覆盖真正改正文仍前进，保存或重开不调用 CLI。先独立提交该修复，便于马上送独立复核。

继续 T1.2 的独立后端。Tasks 拥有持久受理、输入快照、run 身份与 task 排他。优先复用现有 Markdown 与 Vault 原子落盘、TaskRun 和 Automations 领取样式。只在当前 `plugins/tasks/src/engine`、Tasks 的测试和确实需要更新的 Tasks 私有 manifest 或 DTO 实现。涉及共享 contracts DTO、Engine 装配、Vault 包收集器或 Automations 切换时，交 Lead 核对再接线。无需 UI 原型决定，运行时以真实 Tasks 入口和合成执行器验证受理与重开恢复。核对同请求重交、相同 ID 异载荷、取消/阶段范围、不同来源竞争、输入变更、过期窗口与已占用的实际表现。任何暂不能完成的验收在报告列精确依赖。

只在 Windows，使用隔离 Vault 和合成配置。禁止真实原生 CLI 历史、外部写入、增加 worktree 或派遣。依赖从当前锁定 pnpm 安装；原工作区 `temp/issue-baseline/run-workspace-check.ps1` 有 pnpm 路径。记录父提交和每个候选 SHA、红绿及持久证据。发布前确认工作树干净，关闭自行启动且已完成的非复用命令 pane。
