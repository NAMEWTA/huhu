# t176 task05 洪流采样提前停止
Lead t3p，cwd integration。task04 已独审关闭，冻结UI。仅可写 tests/e2e/perf.spec.ts，其他worker不改此文件。
读取 temp/final-audit/terminal-flood-diagnostic-4a54f0a9.log 和 artifacts。真实395窗内事件，但400键上限在releasedAt后3495.6ms便退出，tailAt null，不能判性能。移除任意次数上限，仍以20秒时限和实际尾标为边界，保持真实键盘和满速10MiB、≥10窗内样本、p95≤100ms，不能故意降速输出。确认采样pending回调和done通知竞态，正常尾标必须被等待；到时限不能算成功。不要改阈值或吞吐。遵循已有frontend guidance。只做最小测试驱动修正，不跑E2E/构建/全仓检查，无子代理。报告 temp/final-audit/t176-report05.md。
