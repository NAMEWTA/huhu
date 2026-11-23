# t17c task02 回执延后唤醒及结果阅读复核
Lead t3p，integration未提交diff。接续report01。只读无子代理，不重跑重型测试。
1.复核原低项：TaskDispatch新增wakeAfterReceipt/scheduleReceiptCheck，通过setImmediate合并唤醒，ACK当前调用返回前不触发replay；close清理immediate，已有check清空队列，finally补排。t17f两条新回归通过（含ACK返回前replay零次），task-receipt-defer-check.log。核对丢唤醒/忙循环/abort，不要求新架构或固定繁忙时限。
2.核对plugins/tasks/src/ui/TaskDispatchPanel.tsx和compact.tsx的阅读呈现：匹配原run评论，delivered未取到评论有加载态，普通段落复用@huhu/editor/reading，复杂内容保持原reader，记录选择/安全渲染不退化。前端指南沿既有检索。
3.可顺带核对acceptance.spec.ts夹具，Lead t17d相同4a应用+新测试3项已通过。报告temp/final-audit/t17c-report02.md，不覆盖report01，不复制外目录或hc权限升级。
