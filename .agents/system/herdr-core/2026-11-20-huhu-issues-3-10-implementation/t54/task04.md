# #4 W1.1 与 W1.2 Windows 启动及对账独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t54
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 当前任务 — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report04.md
- Lead 收件 — 回告终稿绝对路径。
- 工作目录 — D:/Document/code/huhu，根及实现工作树源码只读，按冻结 Git 对象使用隔离快照。

按 dev-review 核对 `ce5289d → 5cda8418c5a278ee7c60b58599e28359949dd945 → db0a562fd7c15a031509e7ac1477228de5e4bfd3`，阅读你的 report01 和 t80/report01。重复旧超长路径失败与正常含空格 cwd/argv，验证真实 Core 丢回包后重开 Vault 和原尝试身份严格匹配。检查同键异意图、候选身份、重试负向、候选使用的信息完整性。已有 Agent 返回 shell 与进程退出限制由 t80 见证，区分此范围与可合入的后端增量。对 W6.1 新任务所需绑定给结论。仅 Windows，锁定 Core 0.1.19，独立 HC_SOCKET，仅合成 CLI 与 Vault，不读取真实历史，不新增 worktree、不改业务、不自行派遣或远端写入。
