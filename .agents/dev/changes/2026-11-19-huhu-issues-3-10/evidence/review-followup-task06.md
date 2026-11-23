原始报告位于 `temp/final-audit/t194-task06-final.md`；以下相对源码链接按原报告目录解释。

# t194/task06 Notes 组合输入自动保存复审

Lead `t3p`，审查者 `t194`，状态 `done`。基线 `f55f0759`，生产提交 `8d56591ff8d9c2bf484073b4fd775988b77df629`，审查时 HEAD `fda247614d291625d3011b03bc6cd07aaa88df25`。提交内和工作树内的六个 blob 均为冻结值。 [原 P2 审查](t194-task04-final.md#notes) · [实施报告](t197-task02-final.md)

**原 P2 关闭。** 后台读到不同正文时，两次检查编辑器组合状态。组合期间只留下重新核对的请求，跳过强制交付和快照采用。生产富文本在组合结束后安排结算，先交付编辑再通知会话。提交会进入已有的脏缓冲冲突核对，取消且没有本地编辑会重新取样并刷新干净缓冲。快照作废 guard 在回调中核对基线和读请求序号。 [加载防护](../../plugins/notes/src/ui/documents/DocumentSession.ts#L252) · [重新核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L807) · [输入法交付及事件](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L230)

## 发现

**P3｜组合中的后续后台读取单独失败，会吞掉已经安排的结算后复读。** 第一次恢复读到版本 2 并因组合记录当前请求序号。在同一组合期间收到另一条文件事件，第二次后台读增加序号但 `notes.read` 临时拒绝。错误回执显示后，用户取消组合，正文和基线仍是干净版本 1。此时回调先清掉待核对请求，再因旧序号失效跳过刷新，后续没有读盘，已可读的磁盘版本 2 继续缺席，直至下一条通知或重新打开。生产事件处理器会把同路径文件事件转给同一会话，单个 Engine 读取可独立失败。独立内存对照在真实 Registry 和 DocumentSession 上复现，初次加载在内共三次读盘，待刷新时无保存，取消后显示原文和临时错误。另发通知才读到版本 2。最小回归是在已延期的读取后注入一次同基线失败，取消组合时应重新取样并清除错误，同时保留显式重载、删除通知和基线切换的失效保护。 [序号分配](../../plugins/notes/src/ui/documents/DocumentSession.ts#L252) · [回调清理与判定](../../plugins/notes/src/ui/documents/DocumentSession.ts#L821) · [失败分支](../../plugins/notes/src/ui/documents/DocumentSession.ts#L857) · [生产事件入口](../../plugins/notes/src/ui/NotesModule.tsx#L68)

## 生命周期与实测证据

- 显式保存、切模式及退出仍调用原 flush，登记变化未触及版本条件写。富文本布局清理仍优先交付，passive 清理撤销组合定时器及 port 订阅。会话解除最后一个组合 drainer 后可恢复延期核对，销毁清除延期状态并注销剩余订阅。独立内存对照验证两个不同 port 要等最后一个结束、卸载 port 会退订并复读，以及等待期间丢弃草稿后复读不会重现旧草稿。单文件红灯两例写入了未提交拼音，冻结实现单文件 104/104，包括提交、取消及显式保存用例。 [注册和退订](../../plugins/notes/src/ui/documents/DocumentSession.ts#L380) · [销毁](../../plugins/notes/src/ui/documents/DocumentSession.ts#L1035) · [富文本卸载](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L291) · [单测](../../plugins/notes/test/document-session.test.ts#L2302) · [红灯](t197-task02-red.log#L114) · [绿灯](t197-task02-green.log#L5)
- **真实 Chromium 自动保存回归已跑。** Lead 的 `review-fixes-ime.log` 记录真实 Electron 源码构建的两条组合用例都通过。驱动打开真实知识库和 Gateway，确认自动保存开关开启，真实 Engine 的第一份外部正文响应在 renderer 中暂存，同时延迟生产文件事件。它通过 CDP 让真实 ProseMirror 持有临时拼音，直接还原隔离 Vault 的原字节，放行旧读数，明确等待 1,200 ms，超过生产 800 ms 自动保存窗口。期间断言零 `notes.save` 且原字节仍在。提交后断言从真实 Engine 至少复读一次，磁盘与请求只含最终汉字。另一条通过用例保留外部新版并验证手动条件冲突。真实 OS 输入法和包内组合输入依然未由这两条源码构建用例覆盖。 [源码构建启动方式](../../tests/e2e/helpers/launch.ts#L18) · [原样 Engine 响应闸门](../../tests/e2e/knowledge/session-flush.spec.ts#L149) · [800 ms 窗口与保存断言](../../tests/e2e/knowledge/session-flush.spec.ts#L294) · [Lead 运行日志](review-fixes-ime.log#L109)

## 冻结版本

| 文件 | Git blob |
| --- | --- |
| `packages/editor/src/rich/RichMarkdownEditor.tsx` | `8a974f46440ccc3d519a1e7b8c2f0d09a28f8f64` |
| `packages/editor/src/rich/rich.d.ts` | `8e0ac1ac1d0d5b8626098c3f35339827dc8fbcf5` |
| `plugins/notes/src/ui/NoteDocument.tsx` | `7b50941e151989cf29f8832a4c68b9b2f19d94e2` |
| `plugins/notes/src/ui/documents/DocumentSession.ts` | `d719f5dffbeb5fadcfde01396998a4ea63508e2c` |
| `plugins/notes/test/document-session.test.ts` | `06dafcd298bedb4176cd3f9f6f404695fefee456` |
| `tests/e2e/knowledge/session-flush.spec.ts` | `30397e03a66b526d2317d17f7ca5febb003efc8d` |

本轮只读核对生产与测试源码、Git 差异及原始日志，并跑了 Node 24.21.0 局部内存对照。未运行 E2E、Electron、构建、打包、全仓类型检查或全量测试，未改动业务和测试源码或启动 agent。
