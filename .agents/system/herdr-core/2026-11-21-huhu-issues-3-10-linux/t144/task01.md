# Mail 边界独审回归先行
Lead t3p / worker t144，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，当前 HEAD a1d3fd9a，Mail 未提交候选可读。读取 temp/final-audit/t142-report01.md 全文。
本轮仅写红灯回归，不改生产，不运行验证、不派代理、不 hc send。可写 plugins/mail/test/oauth-engine.test.ts 及 test/fixtures/graph.ts，确有必要可新增单一 graph 边界 test 文件；P3 UI 场景可补 tests/e2e/workflows/mail.spec.ts（只写不跑）。复用现有 FakeGraph/发行方/真实Engine fixture，不建立新通用设施。
分别复现3项P2：201条未缓存删除导致旧列表D漏排除、下一页H不补位；冲突单封核实跨一次预算且重启后应继续而非重复整轮；MIME构建挂起时重授权仅接收，放行后零POST/明确未投递/同意图回原操作。时间预算用可控时钟/门控，不真的耗时75秒。保留原4个OAuth测试以及既有发送未知回执断言。P3工作台手动刷新遇自身降权事件应完成读取且关闭写入口，真正换账号/关闭仍取消，写出对应E2E。
S5.2通知口径待用户，不实施通知算法、不改变范围。客户端指南已由Lead完成search/retrieve，可读取完整 /tmp/mwg-guide-3235787-1795365728802.md 复用，不联网查询。完成写 temp/final-audit/t144-red01-ready.md，列精确用例名和待Lead验证命令。等Lead确认红灯后才另任务修生产。
