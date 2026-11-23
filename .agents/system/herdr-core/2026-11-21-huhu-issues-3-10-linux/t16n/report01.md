# t16n/task01 Notes 保存事件独立复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t16n`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t16n/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t16n-report01.md`
- 执行结果 — `done`

## 规格审查

上一轮 P2 的虚假冲突已修正。读盘正常时，无论自身通知在成功回执前或后到，下一笔编辑都保持 `dirty`，并可按成功回执中的版本保存。本轮确认两项读盘异常回归。 [原审查](t15y-report02.md) · [实现说明](t169-report01.md)

1. **[P2] 自身通知先到时，额外读盘可以卡住已经收到成功回执的保存。** `notes.save` 新增的路径事件也广播给保存者。回执前到达时，会话记录待核对通知，接纳成功回执后仍在 `finishFileWrite()` 等待 `notes.read` 结束。该调用未传超时或取消信号。探针让 A 先落盘并返回成功回执，挂住额外读盘，此时内部已接纳 A，`save()` 仍未返回，快照仍为 `saving` 且标记有未保存内容。排入的 B 未发出写请求，`flushForExit()` 也在等待。拒绝该读请求后，A 的保存返回 `true`，同时会话发出 `flushError`，随后 B 和退出结算才推进。相同输入在基线没有自身路径事件，A 收到回执即返回成功。建议让保存者识别同一笔提交的通知，保留其他会话的刷新以及真实外部变更的核对。 [事件发布](../../plugins/notes/src/engine/index.ts#L568) · [WS 广播](../../packages/kernel/src/server/ws-workbench.ts#L26) · [保存结算](../../plugins/notes/src/ui/documents/DocumentSession.ts#L383) · [退出等待](../../plugins/notes/src/ui/documents/DocumentSession.ts#L729) · [HTTP 客户端](../../packages/workbench/src/engine-client/client.ts#L53)
2. **[P3] 晚到通知复读失败会误报保存失败，随后读盘恢复也会留下提示。** 探针先成功保存 A，再输入 B 并交付 A 的迟到通知。让这次 `notes.read` 拒绝后，磁盘仍是 A，B 仍为 `dirty`，会话却设置 `flushError`，Markdown 界面会用「保存失败」展示它。再次交付通知，成功读到相同版本和正文后直接返回，提示依旧可见。建议将通知核对的失败和实际保存的结果分开处理，成功复读时清除该核对错误。 [读盘失败和成功返回](../../plugins/notes/src/ui/documents/DocumentSession.ts#L815) · [错误字段](../../plugins/notes/src/ui/documents/DocumentSession.ts#L859) · [界面提示](../../plugins/notes/src/ui/NoteDocument.tsx#L302)

## 已核对的行为

- 保存使用已有条件写，更新索引后才发布规范路径事件。Markdown 和 HTML 用例经真实 Engine 派发，覆盖 `./` 路径归一、干净会话刷新、另一脏会话保留编辑、拒绝过期写入及两种自身通知顺序。 [写入与索引](../../plugins/notes/src/engine/service.ts#L579) · [集成用例](../../plugins/notes/test/document-events.engine.test.ts#L9)
- 脏会话对比最近确认的磁盘版本和正文。新通知、重载和已推进磁盘状态的写入会淘汰先前取样。只读探针重现了重载淘汰旧成功读数、较新通知淘汰旧读错误，以及真实外部更新保留 B 且条件写拒绝覆盖。保存淘汰旧读数也有已有单测覆盖。 [读盘守卫](../../plugins/notes/src/ui/documents/DocumentSession.ts#L803) · [保存及重载回归](../../plugins/notes/test/document-session.test.ts#L1179) · [新通知回归](../../plugins/notes/test/document-session.test.ts#L1206)

## 规范审查

路径处理沿用 Vault 的规范化入口。会话继续负责版本、缓冲和写入队列。检查了现有事件合同、订阅和写入回执过滤。指定差异内未发现其他明确项目规则违反。 [路径事件合同](../../packages/contracts/src/events.ts#L8) · [会话订阅](../../plugins/notes/src/ui/NotesModule.tsx#L67)

## 范围与验证

核对 topic 和 manifest，当前指针为 `t16n/task01.md active`。审查工作树 `integration`，分支 `impl/huhu-acceptance-followup`，基线与 HEAD 均为 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。仅发布本报告。

| 文件 | Git blob 前 12 位 |
| --- | --- |
| `plugins/notes/src/engine/index.ts` | `ecc9faba7ab6` |
| `plugins/notes/src/ui/documents/DocumentSession.ts` | `7deab23b9bbd` |
| `plugins/notes/test/document-session.test.ts` | `6b481ae7f9ce` |
| `plugins/notes/test/document-events.engine.test.ts`（未跟踪） | `20ee96283f52` |

- Node 24.21.0 只读探针对工作树和基线的真实 `DocumentSession` 注入磁盘与通知时序。两项发现和上述会话行为均有探针断言。退出影响验证至 `flushForExit()`。
- 已有证据为 t169 会话单测 87 项通过及 Lead/t16k 的 Engine 集成 2 项通过。已核对四文件的工作树版本和空白检查。 [会话单测报告](t169-report01.md#验证) · [Engine 集成日志](notes-delayed-event-check.log)

## 未运行的验证

- 本轮未复跑 Vitest。集成用例通过进程内 EventBus 控制到达顺序。实际 HTTP 与 WebSocket 交付、桌面与浏览器双向编辑，以及 Electron 关窗后的结果均未验收。 [双向编辑场景](../../tests/e2e/workflows/web-share.spec.ts#L214)
- 未运行 Electron、Playwright、构建、打包、全量测试、全仓类型检查、lint、knip 或视觉取证。
