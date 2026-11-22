# SSH 绑定文件会话与并发文本编辑

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18v`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`，沿用本分支 `7ae257b2772a178d3b5821b7b862f31ff3b047f9`。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report06.md`

按已确认 #7 H6.1、H6.3，先复用 SFTP 与 FilesPanel 交付可独立浏览、切 Shell 后仍明确绑定原主机/连接的文件会话。上游和系统原生选取按现有 repo 验证。若前置已具备，接入当前远端文本编辑及基于原版本的替换，第二次写入冲突需要保留草稿和远端新内容。先提交最小实际入口，给 Windows 回环 SSH/SFTP 用例及真实 Workbench 验收。若原会话断开，展示原目标状态、禁止悄悄跳到新连接。

可写 plugins/ssh 与专属测试、证据。SSH trust/提示已由 integration 合并为现行 promptId/状态机，尽量保持 SshManager 的现有握手和权限不动。真业务写入前完成组件 web-guidance search/retrieve。仅用本机 Windows、临时 Vault 和回环 SSH，不写真实主机、根锁、其他模块、远端或额外 worktree。清理自开的非复用测试 pane。
