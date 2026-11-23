# t176 task04 运行正文加载反馈
Lead t3p；cwd integration。读取 temp/final-audit/t17c-report02.md 唯一低项。修复首次任务查询无缓存时缺少反馈，以及已读完但对应评论不存在时无限称正在读取。使用现有查询状态和已存在组件，最小改动，保留 runId 匹配，不改后端。可写 plugins/automations/src/ui/RunsPanel.tsx、plugins/tasks/src/ui/TaskDispatchPanel.tsx 及直接相关测试。遵循前端指南 search/retrieve（已有检索结果可复用并注明）。
无子代理，不跑 E2E/构建/全仓门禁，仅允许单个相关 Vitest。报告 temp/final-audit/t176-report04.md，列未运行验证，不申请扩权。
