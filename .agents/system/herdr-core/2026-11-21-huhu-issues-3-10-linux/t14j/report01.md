# Notes 保存三项独审关闭复核

Lead `t3p`，worker `t14j`，task01，状态 `done`。复核基准为 `agent-linux` 的 `HEAD fa5d5c3a` 及当前未提交差异。工作树对象短哈希依次为 `b426103e`（DocumentSession）、`1e639c48`（NoteDocument）、`f6fa8a46`（ArchivesViews）、`cd5a7af0`（单测）、`6dec194a`（session-flush E2E）。[任务](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t14j/task01.md) · 前序独审（历史位置 `t147-report01.md`，本次未取得原件） · 修复报告（历史位置 `t13b-report06.md`，本次未取得原件）

## 规格轴

原报告的切代留稿和旧读取样本两条复现时序已覆盖。笔记冲突动作已在源码接通。仍有两个 P2 时序可以使撤销后的正文丢失，当前范围不能整体关闭。

### P2 · 对账开始后的外部通知仍能自动覆盖受保护的缓冲

1. 磁盘和会话初始均为 `X`。发出保存 `A`，在回执前撤销回 `X`。让 `A` 落盘，随后让同代保存以错误结束。正文错误路径发布 `dirty`，随后启动只读对账、推进 `diskRevision`。扣住对账的 `notes.read` 回执。此时缓冲和最后可信正文仍为 `X`，`lateWriteConflict` 还没有发布。普通服务错误可发生在落盘后的索引刷新阶段。[撤销状态](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L270) · [错误结算](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L368) · [对账取样](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L389) · [落盘后刷新索引](../../../../../plugins/notes/src/engine/service.ts#L578)
2. 此时收到同路径外部修改通知，例如待自写回声已消费后，由外部进程触碰仍含 `A` 的文件。真实 `vault.fileChanged` 入口会通知会话。正文等于旧基线且状态为 `dirty`，`notifyExternalChange` 直接发起 `load()`。这个新 `load` 记录的就是推进后的 `diskRevision`，因此不会进入等待 `reconcilingWrite` 的分支。先让它读回 `A` 并接纳，`acceptBaseline` 和随后的状态更新直接替换 `X`、清除错误、显示已保存。[监听入口](../../../../../plugins/notes/src/ui/NotesModule.tsx#L67) · [mtime 与自写过滤](../../../../../packages/vault/src/watch/watcher.ts#L178) · [自动重载](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L651) · [取样与接纳](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L213)
3. 再放行对账。原对账样本因 `loadSeq` 或代数变动失效，重读与现在的 `A` 基线相同。普通同代错误留下已保存状态，`flushForExit` 也没有 `X` 可留。若错误是可识别的 `TypeError`，最终会回到未知冲突，但受保护的缓冲已变成 `A`。原回归先发起重载、后启动对账。已有「再次重载」用例直接调用显式 `load()`，走的是让用户主动采用新基线的场景。[对账判断](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L404) · [状态与缓冲判定](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L425) · [退出留稿](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L610) · [旧样本回归](../../../../../plugins/notes/test/document-session.test.ts#L1116) · [显式重载用例](../../../../../plugins/notes/test/document-session.test.ts#L754)

### P2 · 切换 Vault 在留稿入口之前漏掉回执待定的文档

让同一笔保存 `A` 已落盘，缓冲撤销回旧正文 `X`，并扣住回执，或让回执失败后扣住对账读。此时 `X === savedText`，`lateWriteConflict` 尚未生成，`hasUnsaved` 返回 `false`。再让同 Vault 的另一篇文档有普通编辑，打开「切换 Vault」并选择「保留草稿并切换」。对话框列出另一篇，提交时 `settleDirtyDocs` 再次只按 `hasUnsaved` 筛选，只调用另一篇的 `keepDraft`。另一篇留稿成功便停止旧 Engine 并重载，`X` 没有发出草稿写入，新实例磁盘只剩 `A`。桌面关窗的 `flushForExit` 会等待 `inflight`，切 Vault 走另一个入口。HEAD 已按正文相等性筛选，本轮补的是命中 `keepDraft` 后的切代回执，漏选路径仍在。现有切 Vault E2E 覆盖编辑器防抖交付，未扣住正文写回执或对账。[未保存判定](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L187) · [注册筛选](../../../../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55) · [收集和结算](../../../../../packages/workbench/src/state/flushers.ts#L38) · [切换入口](../../../../../packages/workbench/src/shell/VaultSwitchDialog.tsx#L38) · [停止旧 Engine](../../../../../apps/desktop/src/main/index.ts#L329) · [关窗 flusher](../../../../../apps/desktop/src/renderer/main.tsx#L359) · [既有切 Vault E2E](../../../../../tests/e2e/knowledge/session-flush.spec.ts#L728)

### 原三项的关闭情况

- **原 P2 切代跳过草稿，原时序已关闭。** 已进入 `keepDraft` 时，其队列任务只处理捕获代；排队或草稿回执在途时发生切代，外层按新代重新结算。仍有正文待保留时会等待 `notes.draft.save` 回执。当前代写入失败拒绝，Vault 切换根据失败清单留在原地。原测试先断言失败，再实读成功重试留下的 `B@vA`，磁盘仍为 `A`。[留稿队列](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L554) · [留稿循环](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L628) · [单测](../../../../../plugins/notes/test/document-session.test.ts#L1028)
- **原 P2 已发写入晚于旧读取取样，原时序已关闭。** 同代正文结果未知也会在原队列槽推进 `diskRevision` 并复读。已取样但尚未接纳的 `load`、`keepMine`、`merge` 在磁盘 revision 失效时等待对账。对账切代时旧操作返回，保留当前缓冲。已提交字段更新同样处理报错、迟到回读和跨代结果。原回归扣住旧读和对账，断言一次正文写、保留 `X`、排空失败及退出确实留稿。上面的新发现发生在对账开始后才发起读取。[正文与对账](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L378) · [重载等待](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L230) · [冲突读取等待](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L720) · [字段对账](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L539) · [单测](../../../../../plugins/notes/test/document-session.test.ts#L1116)
- **原 P3 笔记冲突操作，源码已关闭。** 回读失败可同时发布 `conflict` 和 `hasUnsaved: true`，即使缓冲等于旧正文。笔记据此提供「保留我的修改」、合并、查看差异，并先确认再重载。「继续编辑」收起确认，保留动作以新磁盘版本为基线，下一次手动保存才写正文。档案同样按会话 `hasUnsaved` 确认重载，保留或重载后刷新详情。[未知状态](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L425) · [笔记动作](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L257) · [档案动作](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L434) · [档案详情刷新](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L398) · [桌面用例](../../../../../tests/e2e/knowledge/session-flush.spec.ts#L149)

### 已核对的行为

- 手动按钮、菜单和快捷键仍走默认 `flush()`，保存采用各次交付时冻结的正文，队列轮到时使用上一笔的版本。批注、模式切换和路径操作显式排空。对账本身只读，当前版本偏离时切代淘汰旧快照，同盘且仍可正常重试时保留原代。普通同代失败经复读确认未改盘时保留重试条件，已识别的传输不确定结果即使读到相同内容也阻止干净结算。[保存快照与队列](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L444) · [手动和排空语义](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L588) · [笔记保存入口](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L128) · [普通错误重试用例](../../../../../plugins/notes/test/document-session.test.ts#L1375) · [传输未知用例](../../../../../plugins/notes/test/document-session.test.ts#L468)
- 档案字段失焦及删除未定义字段都走 `writeFields`。预检结束后才进入 `submit`，过期预检不会发更新。`rawCall` 还等待查询刷新，已提交但包装失败的路径保留对账。正常档案更新回读把字段差异并入排队的正文快照，各次手动正文仍各自独立。[字段入口](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L378) · [实际控件](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L463) · [写调用包装](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L16) · [字段队列](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L478)

## 规范轴

本次定向范围未发现额外项目规范违规。留稿、正文和字段沿用同一会话队列，冲突操作沿用已有组件；静态复核沿用任务指定的客户端异步指南。业务与测试文件保持只读。[现代 Web 指南](/tmp/mwg-guide-3235787-1795365728802.md#L160)

## 现有证据与未运行的验证

- t14c 修复前定向两项红灯，t14g 修复后单文件 65/65。Lead 回报及验收记录确认 t14h Notes 包和定向 E2E 类型检查均 exit 0。两条新增 P2 是当前版本的源码时序推导。红灯（历史位置 `save-review-races-red.log`，本次未取得原件） · 绿灯（历史位置 `save-review-races-check.log`，本次未取得原件） · 类型检查日志（历史位置 `save-reviewed-types.log`，本次未取得原件） · [Lead 记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L168)
- Electron 待运行项包括 `session-flush.spec.ts` 的两条手动保存回执用例和「C06 对账无法读取且缓冲等于原文时，笔记仍可保留修改并确认重载」。还缺对账期间的真实外部通知、两个脏文档切换 Vault 后的草稿回读，以及档案冲突按钮及详情刷新的组合运行证据。[session-flush E2E](../../../../../tests/e2e/knowledge/session-flush.spec.ts#L146)
- HTTP 客户端将响应体读取失败和 JSON 解析失败统一包装为 `CapabilityError(INTERNAL)`，会话的传输未知识别只判断 `TypeError`、`AbortError`、`TimeoutError`。如果未确认的请求在首次对账取样后仍可能提交，同盘读数无法证明最终状态。现有回归注入原始 `TypeError`，真实链路上的响应体丢失及远端完成顺序待核验。[客户端响应解码](../../../../../packages/workbench/src/engine-client/client.ts#L58) · [会话错误分类](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L94)
- 本轮未执行测试、类型检查、lint、构建、打包或 Electron E2E。
