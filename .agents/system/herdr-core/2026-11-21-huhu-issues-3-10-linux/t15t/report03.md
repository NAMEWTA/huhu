# t15t/task03 审查返工

Lead `t3p`。核对主题、manifest 的 `t15t/task03.md active` 及 `HC_TERMINAL_ID=t15t`。工作树为 `integration`，分支 `impl/huhu-acceptance-followup`，HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。变更仅涉及本任务归属及 Lead 追加授权的事件合同和 Notes 订阅。实施前方案见 [t15t-position03.md](t15t-position03.md)。

## Agent 恢复视图 P2

t168 的定向探针在 Core 收据超时后重开终端，收到带恢复证明的 `observe`。删除唯一未知意见已清空持久记录，现有生命周期却只在审查发送结束时检查是否接管，终端持续只读。 [独立审查及探针](t168-report02.md)

`SessionsService.deleteComment` 落盘删除未知意见后调用 `InputOwnership.notifyReviewRecovered`。同一检查也供审查借用结束后的恢复使用。只在当前持有恢复证明且已没有未知意见时通知，复用桥已有 `control-free`。若审查借用仍在进行，等释放还原视图再检查。随后原恢复证明仍只限明确重交，工作台重连才获取新的正常控制证明，原有 Tasks 排他规则和观察者限制继续生效。 [删除入口](../../plugins/agent-cli/src/engine/sessions.ts#L1607) · [仲裁恢复](../../plugins/agent-cli/src/engine/input-ownership.ts#L48)

- 单文件红灯 1 失败、11 通过、46 过滤，失败点是删除最后一条后没有回调。绿灯 12 通过、46 过滤。新增测试模拟真实 `SessionsService` 收据丢失，验证删第一条不接管、删最后一条通知一次、无自动重交、旧证明不可发送、重连证明可发送。 [红灯](t15t-review-recovery-red.log) · [绿灯](t15t-review-recovery-green.log) · [用例](../../plugins/agent-cli/test/sessions.test.ts#L796)
- 未运行真实 Herdr Core 及 WebSocket 重连、多视图实际键盘或 ACC-AG-10 E2E。现有桥协议本次沿用。

## Notes 保存事件 P2、P3

t16n 的探针验证 A 已落盘时，早到自身通知登记的 `notes.read` 可让成功回执卡在保存队列和退出结算。晚到自身通知在 B 已为脏缓冲时也会额外读盘，错误被写入 `flushError` 并显示成保存失败。 [独立审查及探针](t16n-report01.md)

- `DocumentSession` 使用工作台已有的安全随机请求标识生成器，为每次正文写入生成单独的 `writeId`。`notes.save` 接收可选字段，只有工作台请求写入成功后才把它附在规范路径的 `vault.fileChanged`。可选事件字段由 Notes 订阅传给对应 Vault 及路径的会话。条件写的版本、HTTP 回执格式及索引时序沿用现有实现。 [事件合同](../../packages/contracts/src/events.ts#L8) · [Engine 发事件](../../plugins/notes/src/engine/index.ts#L562) · [Notes 订阅](../../plugins/notes/src/ui/NotesModule.tsx#L68)
- 活跃保存认领早到通知。回执先到时，会话保留待认领 ID，收到后即移除。积压上限为 1000，超过时淘汰最早项，剩余未能认领的通知经原外部核对处理。其他会话的标识与无标识 watcher 通知继续复读，包括另一会话成功写入相同正文的情况。混合交付保留真正的外部冲突。回执未知及跨基线写入继续在原队列对账并保护草稿。 [保存回执](../../plugins/notes/src/ui/documents/DocumentSession.ts#L446) · [通知分流](../../plugins/notes/src/ui/documents/DocumentSession.ts#L787)
- 延后或脏缓冲通知的尽力核对读失败保留保存状态和之前的写入错误。后续通知或脏缓冲轮询可继续确认外部变化，真实写入错误和未知回执仍由原保存与对账路径处理。 [延后核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L398) · [脏缓冲核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L825)
- 定向红灯 3 失败、1 通过、87 过滤。失败分别为保存及退出不结算、迟到自身通知误报、其他通知读失败占用保存错误。单文件绿灯 91 通过。保留旧断言里的正文、条件写版本、调用次数及草稿行为，扩展断言覆盖随请求传入的标识。 [红灯](t15t-notes-write-event-red.log) · [绿灯](t15t-notes-write-event-green.log)
- Markdown/HTML 的 Engine 测试已更新，完整保留两编辑会话的读取、脏文本保护、真实冲突、拒绝旧版本和两种交付顺序。新增发件会话只提交一次 `notes.save`、无需自身副读的断言。worker 环境已有 `listen EPERM` 记录，本轮未运行监听验证。Lead 在可监听环境运行 `pnpm exec vitest run plugins/notes/test/document-events.engine.test.ts --reporter=dot`。旧候选 2 通过的日志只支持变更前行为。实际 HTTP 与 WebSocket、桌面/Web 双向编辑和关窗 E2E 未运行。 [Engine 用例](../../plugins/notes/test/document-events.engine.test.ts) · [先前集成结果](notes-delayed-event-check.log)

## 交付

已格式化任务涉及文件，跟踪文件及未跟踪 Engine 用例的空白检查无输出。各 Vitest 命令一次只运行一个文件。构建、打包及全仓检查未运行。无提交、推送或扩权请求。

### Modern Web Guidance

我全文读取 Lead 已检索的 `js` 指南。测试沿用 `Promise.withResolvers()` 显式释放保存回执和读取门，控制回执与通知顺序，覆盖指南所说的 “when a promise's resolve and reject callbacks must be stored or invoked outside the new Promise executor scope”。 [已检索指南](/tmp/mwg-guide-742470-1795376192756.md#L159)
