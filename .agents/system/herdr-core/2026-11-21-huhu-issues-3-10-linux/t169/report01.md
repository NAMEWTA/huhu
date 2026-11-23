# t169/task01 Notes 迟到保存通知

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t169`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t169/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t169-report01.md`
- 执行结果 — `done`，集成绿灯交 Lead 复验

## 结论

Notes 现在会在脏会话收到文件通知后复读磁盘。若版本和正文都等于最近确认的保存基线，下一笔编辑保持 `dirty` 并可继续保存。若磁盘已变化，会话保留当前正文并显示冲突。较新的保存、载入或通知会让过时读数失效。

原因是 HTTP 保存回执与 WebSocket 通知到达顺序独立。回执结束活跃写入后，原来的脏会话分支收到自身通知便直接标记冲突，即使磁盘仍是该会话刚保存的 A。

## 产物与改动

工作树 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，分支 `impl/huhu-acceptance-followup`，HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。以下改动留在工作树。

| 产物 | 改动 | Git blob 前 12 位 |
| --- | --- | --- |
| [DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L769) | 共享保存基线比较。通知复读取样前记录 `baselineGeneration`、`loadSeq`、`diskRevision` 和通知检查序列，返回后也核对活动写入。用户若已撤销至干净正文且磁盘确有变化，沿用原有干净会话加载流程。 | `7deab23b9bbd` |
| [document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L1162) | 覆盖 A 回执、B 输入、A 通知、B 保存的完整顺序，以及保存、重载和较新通知使旧复读结果失效。真正的外部修改仍触发冲突并保留正文。 | `6b481ae7f9ce` |
| [document-events.engine.test.ts](../../plugins/notes/test/document-events.engine.test.ts#L51) | 保留 Lead 的两项 Markdown 和 HTML 用例及原断言。通过实际 Engine 事件总线扣住 A 对保存者的通知，在回执与新输入 B 之后交付，并复验 B 可保存。文件为未跟踪文件。 | `20ee96283f52` |

## 验证

| 检查 | 结果 |
| --- | --- |
| 单测红灯 | 修复前，`pnpm exec vitest run plugins/notes/test/document-session.test.ts -t '自身保存回执后'` 在预期断言失败。磁盘仍为 A，B 保留且基线版本为 2，状态从应有的 `dirty` 变成了 `conflict`。 |
| 集成红灯 | Lead 在已授权的隔离环境验证 Markdown、HTML 均在同一状态断言失败。见 [delayed-event-red.log](delayed-event-red.log)。 |
| 单测绿灯 | Node 24.21.0 下执行 `pnpm exec vitest run plugins/notes/test/document-session.test.ts --reporter=dot`，87 项全部通过。 |
| 空白检查 | 两个跟踪文件的 `git diff --check` 及未跟踪集成文件的 `git diff --no-index --check /dev/null` 均无空白问题输出。 |

## 未运行的验证

- worker 沙箱监听 `127.0.0.1` 时返回 `listen EPERM`。集成绿灯交 Lead 在原隔离环境运行，命令为 `pnpm exec vitest run plugins/notes/test/document-events.engine.test.ts --reporter=dot`。用例通过真实 Engine 派发和事件总线控制交付顺序，实际 WebSocket 到达顺序尚未运行验收。
- Electron、Playwright、构建、打包、全量测试、全仓类型检查、lint、knip 和视觉取证均未运行。

### Modern Web Guidance

- **`js`** 我沿用现有 `Promise.withResolvers()` 测试模式，从调用点释放已取样的读数，让保存、重载和通知的顺序可重复。指南建议在回调需要从执行器之外调用时使用它（“when a promise's resolve and reject callbacks must be stored or invoked outside the new Promise executor scope”）。本轮沿用 Lead 的 `abort stale fetch results` 搜索和 `js` 检索产物。[/tmp/mwg-guide-742470-1795376192756.md](/tmp/mwg-guide-742470-1795376192756.md:162)

Lead复验：t16k真实Engine Markdown/HTML两项通过，日志notes-delayed-event-check.log；现有会话87项worker报告已核对实际差异。独立复审/实际工作台仍待收尾，不记最终验收。
