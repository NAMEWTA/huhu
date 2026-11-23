# task07 · 插件启用472ms诊断
Lead t3p；integration，固定da645ee8新构建。perf复验3通过2失败，1MiB444ms、输入p9511.6ms、千任务滚动max50ms/0慢帧且退出通过；冷启动1984ms，但inbox插件启用472ms>300，停用15ms。只读诊断插件启用路径、已有性能trace，确定最小可证实瓶颈，读取dev-benchmark并复用现有实现。路径temp/final-audit/query-fixed-perf-artifacts-da645ee8及query-fixed-perf-da645ee8.log。不要跑E2E/build或改阈值，不修改业务，本轮报告temp/final-audit/t178-report07.md，Lead后续安排针对性采样。不要hc send。
