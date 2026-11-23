# t176 task06 终端性能夹具清理
Lead t3p；cwd integration。只改 tests/e2e/perf.spec.ts 和必要tests/e2e/helpers独立辅助文件。终端测试app.close后会保留独立Core/shell（生产恢复语义），其后rm隔离目录导致Volta目录重建。已核对本次两个isolatedHOME残留：/tmp/hc-t.WPxIRS/home PID2075842Core/2075884holder/2075908sh；/tmp/hc-t.td9Bfc/home PID2140218Core/2140258holder/2140280sh；这些已删除socket的旧进程由Lead清理，worker不要kill。
修复未来性能测试：复用 tests/e2e/shell.spec.ts stopAutomationFixtureCore 或 helpers/candidate-desktop.ts 已有精确夹具Core确认/停止方式；拿当前isolatedVault及runtime确定唯一socket，app.close后仍保留Vault直到收到server.stop并验证退出。不能停止用户Core，不能广泛pkill，不能改变产品持续会话行为。不将清理时间放入性能计时，测试失败时仍尝试清理，停止失败应明确报错而非删目录掩盖。优先最小复用，避免新通用框架。
仅单相关Vitest可跑，无E2E/构建/全仓检查，无子代理。报告 temp/final-audit/t176-report06.md。
