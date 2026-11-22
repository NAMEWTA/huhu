# #7 H2.1 SSH 目录后端独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t4z
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t4z
- 当前任务 — task05.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task05.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report05.md
- Lead 收件 — 回告终稿绝对路径。
- 工作目录 — D:/Document/code/huhu，只读业务及用户改动。源检出退役，按 Git 对象和隔离归档读取。

按 dev-review 比较 #7 H2.1 `38891343ac6e64bcbba642189d07f399a13a91db` 相对 `65bd6eb`，读 t88/report01、H2.1 规格及角色边界。核对七个实际修改文件，使用真实 Engine HTTP 的合成 Vault，检查重开、同名不同用户、分组层级、排序与写冲突，目录畸形/陈旧引用、无凭据泄露、无端口连接、静态目录和 #6 CLI/MCP 判定、已有调用者和 Widget 不受影响。规格与规范双轴，明确后端可合入范围、待确认 UI 和未测范围。禁止在真实 SSH 上验证、开 worktree、改业务、自己派遣或远端写入。仅 Windows。
