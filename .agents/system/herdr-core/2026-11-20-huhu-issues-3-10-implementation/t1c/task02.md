# task02.md #6 G1.2 静态工具目录

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t1c
- 身份 — Windows 本机 Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t1c`
- 当前任务 — task02.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task02.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report02.md
- Lead 收件 — 回告终稿绝对路径，由外部 Lead 从共享根主动收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/capability

## 目标、依赖与验收

以前置 G1.1、实际提交 2dfd762 及 report01.md 继续。读取 G1.2 和 #6 规格、设计、计划。复用注册与 gateway 管理；以 Notes 读取和可停用 SSH 工具提供静态描述和唯一 ID。可在停用、重启后查相同 owner、input/output、risk。活动 handler 和说明同源。重复记录拒绝，未安装与停用状态区分。使用实际 Engine 入口及隔离测试 Vault取证。G2 授权后续。

## 读写范围与交付

packages/contracts/src/capability.ts（现有 barrel 继续适用）、packages/kernel/src/capabilities 的目录和注册、相应测试，Notes/SSH 各自的能力定义，以及 apps/engine/src/boot.ts 的当前功能装配。此切片 t1c 独占 Engine 装配；Renderer、插件全局注册、根锁、Vault 包收集器仍归 Lead。

阅读原项目的 Change、已交 report 和上游 checkout。按 dev-build、dev-verify 执行。客户端改动先完成 zh-modern-web-guidance 的 search 和 retrieve。相关原型体验仍待确认。只在授权目录内使用临时 Vault、合成数据及正常认证验证。保护真实数据和历史。GitHub 只读，不派发其他代理。交本地提交、检查输出和未测范围。

按指定的 system-herdr-core 文件协议核对身份和 manifest 指针。确认 active 且终稿路径不存在后开始。报告先写同目录临时稿，再用不覆盖的方式发布，随后回告路径。
