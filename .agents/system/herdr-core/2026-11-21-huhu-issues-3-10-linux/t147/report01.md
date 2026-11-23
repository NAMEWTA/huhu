# 保存对账定向独审

Lead `t3p`，worker `t147`，task01，状态 `done`。审查 `agent-linux` 的 `a1d3fd9a` 及未提交的 Notes 保存差异。核心文件工作树哈希为 `d5bf76eb`（DocumentSession）、`f6fa8a46`（ArchivesViews）、`d76e5916`（单测）。结论来自源码中的可构造时序。[本轮任务](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t147/task01.md) · [实现任务](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task04.md) · [前序独审](t13p-report01.md) · [对账设计](t13x-report01.md) · [实现报告](t13b-report04.md)

## 规格发现

### P2 · 对账切代会让「保留草稿并切换」跳过实际留稿

1. 从磁盘正文 `X@vX` 发出保存 `A@vX`，扣住实际写入。撤销回 `X`，外部触碰 mtime 触发重载，等会话接纳同内容的新基线 `g1` 后继续输入 `B`。此时 `B` 会出现在切 Vault 的未保存清单中。[自动重载](../../plugins/notes/src/ui/documents/DocumentSession.ts#L620) · [未保存参与者](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55) · [收集未保存文档](../../packages/workbench/src/state/flushers.ts#L38)
2. 点击「保留草稿并切换」，让 `keepDraft()` 把 `preserveDraft(g1)` 排在旧请求之后。此时放行旧请求。旧请求写入 `A@vA`，对账保留缓冲 `B` 并推进到 `g2`。排到的 `preserveDraft(g1)` 因代数过期返回 `false`，`keepDraft()` 直接成功返回 `void`。[迟到对账切代](../../plugins/notes/src/ui/documents/DocumentSession.ts#L394) · [草稿队列守卫](../../plugins/notes/src/ui/documents/DocumentSession.ts#L516) · [切 Vault 留稿](../../plugins/notes/src/ui/documents/DocumentSession.ts#L589)
3. 切换只把拒绝的留稿 Promise 计为失败，因此直接关 Vault 并重载工作台。关闭 Vault 的 Electron IPC 会停 Engine；这条路径不会调用应用退出所用的 `flushForExit()`。磁盘为 `A`，`B` 没有进入 `notes.draft.save`。现有退出用例覆盖了 `flushForExit()` 自己在切代后重试的路径。[草稿失败判断](../../packages/workbench/src/state/flushers.ts#L43) · [切换与重载](../../packages/workbench/src/shell/VaultSwitchDialog.tsx#L38) · [关闭 Vault IPC](../../apps/desktop/src/main/index.ts#L423) · [退出切代重试](../../plugins/notes/src/ui/documents/DocumentSession.ts#L571) · [已有回归](../../plugins/notes/test/document-session.test.ts#L658)

### P2 · 写入已落盘但结果未知时，先取样的重载能接纳旧正文

1. 手动模式从 `X@vX` 发出保存 `A@vX`，扣住实际写入。撤销回 `X` 后触碰 mtime，监听触发自动 `load()`。让 `notes.read` 取得 `X@vX`，扣住该响应或并行的 `notes.draft.get`，使重载尚未接纳基线。[撤销状态](../../plugins/notes/src/ui/documents/DocumentSession.ts#L257) · [自动重载条件](../../plugins/notes/src/ui/documents/DocumentSession.ts#L620) · [并行读取](../../plugins/notes/src/ui/documents/DocumentSession.ts#L207) · [mtime 通知与自写过滤](../../packages/vault/src/watch/watcher.ts#L178)
2. 放行保存使磁盘成为 `A@vA`，随后令响应丢失或落盘后的索引刷新报错。错误在重载接纳前到达，保存的 `finally` 仍见原代数，跳过对账。普通错误分支也未推进 `diskRevision`。[正文写入与错误结算](../../plugins/notes/src/ui/documents/DocumentSession.ts#L332) · [Engine 落盘后刷新索引](../../plugins/notes/src/engine/service.ts#L578) · [HTTP 调用](../../packages/workbench/src/engine-client/client.ts#L53)
3. 放行重载响应。代数、读取序号、编辑 revision、磁盘 revision 都能通过检查，`load()` 将 `X@vX` 标为已保存并清除错误。此后排空返回 `true`，退出不会留 `X` 的草稿。这一顺序中，重载在失败回执之后才切代。现有同代用例只覆盖成功回执推进磁盘 revision 的情况，跨代失败用例先完成了切代。[接纳旧取样](../../plugins/notes/src/ui/documents/DocumentSession.ts#L238) · [排空和退出](../../plugins/notes/src/ui/documents/DocumentSession.ts#L550) · [成功回执回归](../../plugins/notes/test/document-session.test.ts#L1039) · [先切代的失败回归](../../plugins/notes/test/document-session.test.ts#L437)

### P3 · 笔记页在磁盘未知且缓冲等于旧基线时只显示无确认重载

复用已有复读失败时序。旧请求实际写入 `A`，对账读失败，缓冲和最后可信正文同为 `X`，会话正确发布 `state: conflict, hasUnsaved: true`。笔记页依靠正文和旧基线的相等性隐藏「保留我的修改」与「合并」，并在点击「重载」时直接调用 `load()`。如果此时读取恢复，`A` 会直接替换仍受保护的 `X`。同一会话状态在独立档案页会显示「保留我的修改」，并以 `hasUnsaved` 要求重载确认。现有单测验证会话能重载，未经过这两个界面的按钮。[未知状态定义](../../plugins/notes/src/ui/documents/DocumentSession.ts#L181) · [复读失败回归](../../plugins/notes/test/document-session.test.ts#L808) · [笔记页动作](../../plugins/notes/src/ui/NoteDocument.tsx#L257) · [档案页动作](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L436)

## 已核对的边界

- 旧成功回执与实写偏离按实读正文和版本区分。未知结果即使实读相同仍保留保护。对账占用原队列槽，取样后重查代数、磁盘 revision 和读取序号。偏离切代会保留当前缓冲和合并祖先，淘汰按被替换基线入队的正文、字段和自动保存。明确合并采用保留的祖先，保持未变磁盘与恢复草稿条件写版本的区分。[对账及切代](../../plugins/notes/src/ui/documents/DocumentSession.ts#L364) · [队列守卫](../../plugins/notes/src/ui/documents/DocumentSession.ts#L433) · [三方合并与恢复草稿](../../plugins/notes/src/ui/documents/DocumentSession.ts#L678) · [门控回归](../../plugins/notes/test/document-session.test.ts#L700)
- 实际档案字段失焦和删除未定义字段都走 `writeFields`。路径／版本预检之后才通过 `submit` 进入真实更新，过期预检不会提交。已提交的包装在 Engine ACK 后还等待查询失效，包装失败按未知处理。已发更新和字段回读跨代由同一队列槽复核。档案的「保留我的修改」与确认重载调用会话接口并刷新详情；手动正文保存继续用默认 `flush()`。字段落盘后失败和后续回读过期均有会话层用例。[字段调用](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L378) · [实际表单和正文动作](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L463) · [查询失效包装](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L16) · [字段队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L446) · [字段回归](../../plugins/notes/test/document-session.test.ts#L336)
- 批注（显式路径及当前笔记回退）、模式切换、档案路径动作、注册表路径动作和切 Vault 的保存分支都要求 `untilClean: true`。笔记按钮、菜单和快捷键保留默认保存语义。[批注路径](../../plugins/notes/src/ui/comments/useCommentsBridge.ts#L24) · [笔记入口](../../plugins/notes/src/ui/NoteDocument.tsx#L128) · [模式切换](../../plugins/notes/src/ui/documents/useFlushedMode.ts#L15) · [档案命令](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L325) · [注册表](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L105) · [切 Vault 保存](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55)

## 规范与验证

范围内未发现额外项目规范违规。本轮沿用 Lead 已取得的客户端异步协调指南，业务文件保持只读。t145 日志显示 `document-session.test.ts` 62/62 通过。t146 类型检查日志当时只有命令输出，尚无完成证据。[客户端指南](/tmp/mwg-guide-3235787-1795365728802.md#L160) · [已有单测日志](save-reconcile-check.log#L69) · [类型检查日志](save-reconcile-types.log)

### 未运行的验证

本轮未运行测试、类型检查、构建或打包。以上三个发现为静态调用与时序推导。切 Vault、笔记与档案冲突动作及真实磁盘写入在 Electron 中的组合行为未做运行验收。
