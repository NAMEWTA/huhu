# t178 task02 修复性能探针类型
Lead t3p；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。沿用 task01 可写范围，仅 perf.spec.ts 与 helpers/perf-diagnostics.ts。
读取 temp/final-audit/perf-probe-types.log，修复三项真实类型错误：可选 requestId 不传 undefined，dialog.showMessageBox 的 BaseWindow 重载正确保留，firstTaskId/lastTaskId 的可选字段不传 undefined。不要粗暴断言绕过真实签名；保留原调用行为。
不跑 E2E/构建/全仓类型检查，无子代理。报告写 temp/final-audit/t178-report02.md，列实际验证和未运行项。完成后通知 Lead；不要申请扩权。
