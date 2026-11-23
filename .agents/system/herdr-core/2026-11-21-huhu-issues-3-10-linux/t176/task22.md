# task22：首页成功回执不能被已完成旧读覆盖
Lead t3p，实施者t176，cwd /home/wta/projects/huhu/temp/issue-worktrees/integration，基线f55f0759。
只处理首页P3。独审 temp/final-audit/t194-task04-final.md 即将写完；其屏幕已确认：旧GET的JSON promise先解决、更新回执后解决，retryer已resolved但setData(old)续体仍排队，此时cancel不会取消resolved retryer，成功revision2被旧revision1覆盖。实际安装TanStack5.107.1。原cancel误报已修复，不回退该修复。
先用实际代码路径复现并最小修复；需证明成功回执在旧读收尾后仍保留、真正读取失败仍显示可重试，不通过隐藏错误掩盖。检查存活/不同Vault和保存inFlight/离开语义。
按zh-modern-web-guidance先search/retrieve（可复用本轮完整js记录temp/final-audit/query-guidance-search.log、query-guidance-read.log，阅读并注明），复用现有逻辑，避免新通用基础设施。
写范围 packages/workbench/src/home/useDashboard.ts、相关定向单测和tests/e2e/workflows/dashboard-appearance-package.spec.ts。共享engine-client/query.ts只读；如必要改其他文件先报理由。不要改Notes/editor/脚本/锁文件/文档。不要stage/commit/push，Lead唯一git索引写入者。
仅单个vitest允许运行；E2E只写不跑，不构建打包/全仓检查/截图，不启动agent。报告temp/final-audit/t176-task22-final.md，列红绿、必要验证与未运行项，完成hc send t3p。可以先读取review探针，不需重造一套测试设施。
