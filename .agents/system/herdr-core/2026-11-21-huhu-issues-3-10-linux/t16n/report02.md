# t16n/task02 Notes 保存通知返工复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t16n`，Lead `t3p`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t16n/task02.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t16n-report02.md`
- 执行结果 — `done`

## 规格审查

常规保存的早到和晚到自身通知都按每次保存的 `writeId` 正确识别，原 P2/P3 在常规路径已修复。保存期间发生重载时，旧成功回执仍存在一个关联缺口，可重现队列阻塞和误报保存失败。 [上一轮复核](t16n-report01.md) · [返工说明](t15t-report03.md)

1. **[P2] 跨重载的成功回执漏记自身通知标识，旧事件可卡住下一笔保存。** 成功回执到达后，`doSave()` 先检查基线代数，已重载时先返回，再在 `finally` 核对旧写入。此时仍未收到的自身 `writeId` 没有进入待认领集合。旧事件随后在 B 写入期间到达时，会登记为 B 的外部变更。只读探针复用现有「旧成功回执复读未发现变化」的重载顺序。A 落盘后重载，A 的回执按现有规则对账，B 使用新基线成功落盘。B 的自身通知先到并正确识别，接着交付 A 的旧自身通知，再放行 B 的成功回执。挂住额外读盘后，内部已接纳 B，界面快照仍为 `saving`，B 的保存和退出结算均等待第四次 `notes.read`。释放读盘后依次返回 `true` 和 `file`。同一根因也能复现上一轮的误报：重载已确认 A，旧回执对账结束且会话干净，交付 A 的自身通知会走重载，读失败写入 `flushError`。只在内存对照中把已确认的 `writeId` 登记移到基线检查之前，这个干净会话场景消除了额外读盘与误报。建议在收到成功回执时登记未认领的标识，继续用现有基线检查约束版本、正文和草稿更新，并补同样的跨重载迟到通知用例。 [成功回执与记录顺序](../../plugins/notes/src/ui/documents/DocumentSession.ts#L454) · [旧写入对账](../../plugins/notes/src/ui/documents/DocumentSession.ts#L490) · [通知分流](../../plugins/notes/src/ui/documents/DocumentSession.ts#L798) · [结算等待](../../plugins/notes/src/ui/documents/DocumentSession.ts#L388) · [原有跨重载用例](../../plugins/notes/test/document-session.test.ts#L843)

## 已核对的行为

- 常规保存中，匹配标识的早到通知仅在活跃写入中认领。额外读取被挂住的探针中，A、排队的 B 和退出仍分别返回 `true`、`true`、`file`。匹配标识的晚到通知在 B 已为脏缓冲时也没有调用读盘。另一写入的不同标识会复读，暂时读失败保留原保存错误和 B，后续真实外部改动触发冲突并拒绝用旧版本覆盖。混入无标识 watcher 通知的冲突也有当前回归用例。 [早到与晚到测试](../../plugins/notes/test/document-session.test.ts#L1182) · [混合通知测试](../../plugins/notes/test/document-session.test.ts#L1237)
- 真正的写入对账仍由回执结果驱动。探针在 A 已落盘、会话收到自身通知后让 HTTP 回执丢失，再让必须执行的对账读失败。会话保留撤销正文 X，记录对账错误，退出保存带 `outcome: "unknown"` 的草稿，磁盘保留 A。通知核对的尽力读盘失败没有吞掉主对账错误。 [写入对账](../../plugins/notes/src/ui/documents/DocumentSession.ts#L510) · [对账期间通知的测试](../../plugins/notes/test/document-session.test.ts#L951)

## 规范审查

事件和保存请求使用可选字段。Engine 仅在受信工作台成功条件写后把标识附在规范路径事件，Notes 按 Vault 及路径把标识送给当前会话。会话复用工作台的随机请求标识生成器，使用逐次标识识别自身来源，版本和正文比较仍用于判断磁盘差异。六文件内未发现其他明确的项目规则违反。 [事件合同](../../packages/contracts/src/events.ts#L8) · [Engine 发布](../../plugins/notes/src/engine/index.ts#L562) · [Notes 订阅](../../plugins/notes/src/ui/NotesModule.tsx#L68) · [标识生成器](../../packages/workbench/src/engine-client/client.ts#L10)

## 范围与证据

核对 topic、manifest 和本机终端。当前任务为 `t16n/task02.md active`，工作树为 `integration` / `impl/huhu-acceptance-followup`，HEAD 为 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。复核固定的六个工作树文件，检查空白，仅发布本报告。

| 文件 | Git blob 前 12 位 |
| --- | --- |
| `packages/contracts/src/events.ts` | `80ff157cf02c` |
| `plugins/notes/src/engine/index.ts` | `ca4205a86379` |
| `plugins/notes/src/ui/NotesModule.tsx` | `8d1b06efefbd` |
| `plugins/notes/src/ui/documents/DocumentSession.ts` | `b84a3141f314` |
| `plugins/notes/test/document-session.test.ts` | `83fc97398b06` |
| `plugins/notes/test/document-events.engine.test.ts`（未跟踪） | `1385b1c015b2` |

- 本轮 Node 24.21.0 只读探针运行工作树的 `DocumentSession` 和实际标识生成器，使用受控磁盘、保存回执和通知。跨重载发现验证至会话接口及 `flushForExit()`。
- 实施者当前会话单测 91 项通过。Lead 当前真实 Engine 的 Markdown、HTML 两项通过，使用进程内事件总线控制通知顺序。两种现有绿灯均未覆盖跨重载对账结束后再到达旧自身通知。 [91 项单测](t15t-notes-write-event-green.log) · [2 项集成](write-notice-integration.log)

## 未运行的验证

- 本轮未重复运行 Vitest。定向类型检查交 Lead 执行，本报告未独立核验其结果。
- 未运行实际 HTTP 与 WebSocket 的交付顺序、桌面和浏览器的双向编辑、Electron 关窗、Playwright、构建、打包或全仓门禁。 [双向编辑场景](../../tests/e2e/workflows/web-share.spec.ts#L214)
