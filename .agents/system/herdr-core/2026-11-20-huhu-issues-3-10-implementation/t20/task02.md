# task02.md 复审 W6.0 返工候选

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t20
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t20`
- 当前任务 — task02.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/task02.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report02.md
- Lead 收件 — 回告终稿绝对路径，外部 Lead 主动收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/receipt

## 输入与验收

按 dev-review 独立复审候选 `9a8225f10937661882efbb4ce3067dd82cf53d7c`，直接读取相对 `3804140` 的 diff 和所有新增文件。原审查 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report01.md` 与返工报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report02.md`。核对既有 Markdown 写入与读取、反例 ID 拒绝及合法 ID 重交去重。针对同一原生问题对照运行时和 JSON Schema。核对 Node 专用子路径无法被客户端导入，既有浏览器调用可构建，Node 执行得到原始固定指纹。复查行为和证据漏洞，明确能否合入 W6.0 与仍待真实 Agent/Tasks 的产物。

## 读写范围与交付

业务、规格和共享文件只读。测试用自己的临时目录、已安装依赖和合成数据。只写自己的报告目录，无远端写入或其他派发。按 Core 文件协议核对实际身份和当前 active 指针，非覆盖发布终稿并回告绝对路径。
