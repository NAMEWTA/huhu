# t17c task04 性能采样驱动独审
Lead t3p，cwd integration。只读检查 tests/e2e/perf.spec.ts 和 helpers/perf-diagnostics.ts 新采样，核对真实输入、20秒时间界限、完整字节尾标与窗内样本/延迟，不能提前停止、漏掉慢样本或误认命令回显。读取 t178-report01/02、t176-report05 和 terminal-flood-window-check-4a54f0a9.log 及 artifacts。新驱动1311窗内样本p95 32.4ms；不把单次基线签为最终包。只读不跑E2E/构建，无子代理，报告 temp/final-audit/t17c-report04.md。
