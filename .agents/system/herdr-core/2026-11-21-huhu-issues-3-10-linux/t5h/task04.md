# #7 H4.3 新窗口工作区架构与验收切片

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，Core `wta-ubuntu`，Lead `t3p`，终端 `t5h`
- 任务 `t5h/task04.md`，报告 `t5h/report04.md`
- 只读目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，固定候选 `31352cae87ad11d5f12c7a3d125bc2fe8aee5189`

按 `dev-architecture`，用 #7 原文 W05/W06/A04/A05 与 H4.3，对照仓库 SSH 工作区运行/输入控制和 #3 窗口生命周期，给出跨窗口移动且保留同一个 shell 的最小实施边界。沿现有 Electron main、preload `window.huhuHost`、Workbench 导航/多窗口，检查真实能复用什么。给出具体地址和 renderer 启动打开目标会话、焦点以及源视图/控制权释放的时序，避免把能在 Web 看的和只能桌面启动新窗口的 API 混用。验证取消、目标窗口失败、错误 Vault、关窗或渲染 reload 不丢会话、不误转移控制，明确一个可交付实现的 write set 及串行 E2E 观察点。若源码本来已有可用入口，给证据后把余项收窄。对需要的常见 API 按实际 Electron 版本与现成惯例，禁止创建独立多窗口框架。只读、不改代码、不运行测试或构建，不发布远端。报告具体证据、实际查阅路径与观察边界。
