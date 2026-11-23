# Graph 有效窗口补位
Lead t3p worker t12f，工作树 agent-linux。读 AGENTS/dev-build/dev-debug，以及 temp/final-audit/t125-report01.md、t120-report01.md。
只修 S4.2 的有效条目分页：本轮 delta 确认删除/移出/草稿的 ID 不计入 inboxWindow 200 名额；旧列表首 200 含已删除 A 时继续既有 nextLink 取 H201 补位。先解析 verify 再复用同一结果，不重复查对象。保留请求边界、循环/预算/取消/换代保护和正常耗尽少于200行为。
S5.2 到达通知产品口径正在等用户，不实施身份覆盖、时间通知规则改动或扩大范围。
可写 plugins/mail/src/engine/graph-mail.ts、plugins/mail/test/oauth-engine.test.ts、test/fixtures/graph.ts，仅对应补位与失败重试的代码和回归。保留未提交改动，不提交/重置，不触碰其他文件。
先写明确旧列表和初扫201个历史ID的回归，再最小修复；不运行任何验证，Lead 串行跑。不要启动子代理，不调用 hc send，不提权/权限绕过。结束写 temp/final-audit/t12f-report01.md，列变更与待验证命令以及未运行项。
