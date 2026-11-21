# #6 G3.3 持久意图与操作对账
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t19m
task task03.md
report t19m/report03.md

完成一次只读设计核查，给出可落地最小方案，不写 tracked 文件，不启动额外测试（集成全量在跑）。依据 #6 G3.3、spec/design/source 和当前 3f4e8ee8。检查 IdempotencyStore/Dispatcher、HTTP/CLI、MCP HTTP 和 stdio 的实际 principal、授权恢复、idempotency handler domain，并说明如何在数据库/NDJSON 崩溃边界不重复做副作用、作用域隔离、输入摘要、结果失配和超时不误报、可凭已知 key 或受权 opaque handle 查询。保留敏感 handler 本身的持久意图和凭据不可扩散要求。首选现有持久记录和可验证特性，避免新数据库/依赖。读已有回归/test fixtures，给精确建议与简短测试矩阵。报告 ≤1800 中文字，保存 report03.md。
