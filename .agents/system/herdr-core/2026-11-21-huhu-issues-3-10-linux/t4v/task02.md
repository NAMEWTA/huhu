# task02.md #3、#6、#10 桌面、Web 与看板组合验收准备

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t4v/task02.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/report02.md`
- Lead — `t3p`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`，以 `f2159c2e` 为读取基线

## 交付

按 `dev-review` 核对 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/program.md` 的第三组联验和 Issue #3、#6、#10。请查实际入口、现成用例和证据，列出与验收直接相关的未实现／候选未合入／仅缺实跑，并为每项指出准确的文件、命令选择和源码证据。重点看桌面真实菜单与文档落盘、看板草稿保存失败/放弃/继续编辑与关窗，及两份邀请三个浏览器会话的重用、按邀请撤销和布局保存重开。从已确认规格和原文追踪，复用现有验收记录，不重新确认原型。优先找能在当前候选上通过一个组合用例触达的路径，并标明何处仍需要最终包或不同宿主。

## 读写和验证

- 只读实现、测试和证据；只允许写当前同号报告与同目录临时稿。不运行 E2E、全量门禁、构建或打包，不拉取或写远端，不触碰真实 Vault 或凭据，不派发子任务。
- 保留之前 #7 审查报告。核对本轮 Core 任务身份、父地址、manifest 指针及同号报告位置。

## Lead 验收

由 Lead 复核填写。
