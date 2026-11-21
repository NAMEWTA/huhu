# task01.md 推进 #5 T1.1 任务持久记录

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t44
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t44
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t44/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t44/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 实施目录 — D:/Document/code/huhu/temp/issue-worktrees/tasks，分支 impl/huhu-issues-3-10-tasks，基线 1b3b385797eee2dbd9d9af42c57be44dd8ad2562。

按 dev-build 和已定 #5 T1.1 合同验证任务创建、缺配的 Agent 重开、引用、区段外字节以及零启动。从现有 Huhu 的 TaskWritable、TasksService、Tasks 插件 HTTP 入口开始。关注旧 baseInputHash 能否掩盖上次读取后外部改变的同一 frontmatter 可写字段。先证明实际请求能覆盖，再做最小条件保护，同时保留只追加评论或区段外 Markdown 时的已定合并行为。按规格确认 Agent 默认 new 和显式 existing 的持久字段；遇到与 #4 W6.1 实际接口有待对齐的消费，保存契约证据并限制本切片范围。后续显式委托、派遣、运行接线及真实 provider 过程由 T2/T3/T7 承接。

允许编辑 plugins/tasks 的本切片实现及测试、packages/contracts 中 Task 定义和面向 Task 的 DTO、上述报告。不得写公共 barrel、Engine 或 Renderer 装配、插件全局注册、Vault 包收集器、根锁或 Agent CLI。既有 TaskEditor 保存调用若需接线，先完成 zh-modern-web-guidance 的 search 和 retrieve，允许更新保存请求字段，不改原型待确认的界面与交互。系统工作树的 TEMP 每次隔离，保护真实 Vault 和 Agent 历史。实际 Engine/HTTP 测试可使用临时夹具；记录版本、测试命令、SHA 和零启动证据。禁止远端写入或自行派遣。
