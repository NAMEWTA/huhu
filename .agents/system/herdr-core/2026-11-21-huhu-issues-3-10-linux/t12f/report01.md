# t12f · Graph 收件箱有效窗口补位

- Lead `t3p`，worker `t12f`，任务 `task01.md`。[派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t12f/task01.md)
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-mail-graph-completion`，基线 `4ae7e7e4`。
- 执行结果 `done`。实现和回归用例保留在工作树中，待 Lead 运行验证。

## 改动

- 原先收件箱列表在收满 200 行时返回，随后应用 delta 才移除旧列表中的 A，导致客户端遗漏下一页的历史邮件。现在先处理当轮 delta，每个 `verify` ID 查询一次。列表计数前过滤当轮确认已删除、已移出或为草稿的 ID，包括单封查询返回 404 的情况，并沿用现有 `nextLink` 继续补位。有效项满 200 或列表正常耗尽后，复用同一批已解析的有效 delta 行合并元数据。[Graph 列表分页](../../plugins/mail/src/engine/graph-mail.ts#L189) · [当轮合并](../../plugins/mail/src/engine/graph-mail.ts#L290)
- 新增回归先由三页初扫 delta 返回 201 个历史 ID，并确认正文缓存只包含前 200 个。下一轮用冲突 delta 触发单封查询，模拟 Graph 已将 A 删除但列表仍含 A。用例检查单封查询一次且先于列表读取、继续访问 `$skip=200`、采纳终态游标，并取得原排 201 的 MIME。[历史补位回归](../../plugins/mail/test/oauth-engine.test.ts#L280)
- 现有 OAuth 集成用例改为在旧列表的补位页返回 500，检查 Vault 版本、已提交游标及通知数，再从检查点 `window-20` 重试并读取补位正文。夹具可分别配置列表的旧条目及指定分页偏移的错误。原有 410 恢复用例的请求断言对应新的查询顺序。[重试回归](../../plugins/mail/test/oauth-engine.test.ts#L1338) · [Graph 夹具](../../plugins/mail/test/fixtures/graph.ts#L15)

本次范围为 S4.2。S5.2 到达通知产品口径仍待决定。

## 待验证

由 Lead 在工作树内串行执行 `pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts`。该文件覆盖新增的 201 封历史补位，以及现有 OAuth 集成用例中的补位页失败重试、410 恢复、取消和账号换代。

## 未运行的验证

按派工要求，本轮未执行任何验证命令，包括修复前后的 Vitest、全仓类型检查、构建、E2E、打包、安装包检查和真实租户验证。
