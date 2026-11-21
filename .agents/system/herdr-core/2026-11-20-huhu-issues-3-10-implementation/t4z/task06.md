# #6 Windows Web 分享 HTTP 与活动流独立复核

- 终端 `t4z`，完成后写同目录 `report06.md`。
- 冻结候选 `aab62ba183bf054d7225bd6e36dcab7783e70c5f`，父提交 `5beba4c1c8028988a9c7440584fbcd4c71b2b4fb`。用 `git archive` 或已有隔离测试目录。四个 Git worktree 已满，请勿创建新 worktree。
- 只用本机 Windows、合成 Vault、回环监听器和生成的测试邀请。用户选定仅 Windows。生产工作树和所有分支只读，禁止远端写入。原型体验仍待用户确认。
- 对照 #6 G6.1–G6.4 规格与 `apps/engine/test/web-share.test.ts`。独立验证真实 Engine 上启停、端口与 Vault 代次、两份邀请/三份会话、实际任务变更经同一 Dispatcher 和事件到达、单邀请撤销时 HTTP 和已升级会话断开、控制 listener 不受影响。重点补现有测试没有覆盖的同配置重启、切换端口、含正在等待的活动流，视成本用合成回环 SSH/Core fixture 或直接共享 bridge fixture 核对终端关闭/不混入事件载荷。
- 检查 HTTP/WS 的来源匹配、仅邀请身份建立 Web 会话、Unix/Windows 分支之外的静态数据边界，以及 `isWorkbenchCaller` 对外部入口、现有专用所有者判断与 Web 端能力范围的影响。发现故障请提供最小、可重放本机验证或精确源码证据。仅在测试隔离目录放合成值，报告不写入活动邀请或令牌。
- 保存可复核日志和两轴结论，注明跑过的真实入口与仍待浏览器、终端本机或 UI 确认的边界。报告写入后结束本项。
