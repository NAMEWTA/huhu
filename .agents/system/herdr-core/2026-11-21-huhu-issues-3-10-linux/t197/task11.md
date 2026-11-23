# task11 历史栏桌面重开入口
Lead t3p；worker t197；共享根为本任务所在根；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
前序 task10 已验收。最新 f7992cd0 源码 E2E t1cr 首条通过，第二条已走通 Claude 分支/恢复/定位但桌面 history-toggle 隐藏无法重开。日志 temp/final-audit/history-final-source-ui.log。
根因：locateHistory 无条件 setShowHistory(false)，aside 条件渲染，CSS toggle仅max760可见。请最小修复使桌面定位后可重新打开历史（优先现有toggle所有宽度可用，检查布局）；保留窄屏定位收起及焦点。先执行现代web guidance search/retrieve。只可改 AgentCliModule.tsx/agent-cli.css 及该流程相关E2E断言（必要时）。不改变其他历史语义。不得跑build/E2E/全仓检查；可定向静态检查。Lead同路径E2E验证。
报告 /home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t197-task11-final.md；报告说明变更、指南、未运行验证并冻结，hc send t3p 报路径。不得新建agent或提交。
