# task05 · 终端性能夹具超时后的清理
Lead t3p；执行 t178；integration。query三文件已独审关闭，暂勿再改。读取 temp/final-audit/t17c-report06.md 中清理时限发现。唯一可写 tests/e2e/perf.spec.ts 及必要既有helper（先检查复用）。为终端吞吐测试采用独立 teardown/After Hooks 清理时限，让测试本体总超时后仍尝试Electron和本次Core停止并留证；保持20秒测量窗和全部指标，不能仅放宽阈值。保留 t176 task06隔离Core身份校验，避免影响其他perf用例。只写代码和定向静态检查，不跑E2E/build/全仓测试，不开代理。报告 temp/final-audit/t178-report05.md，Lead主动读取，勿尝试需要权限的hc send。
