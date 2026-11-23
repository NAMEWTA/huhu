# t176/task19 · Web 保存后桌面重新打开仍显示旧正文

Lead `t3p`，worker `t176`，固定候选 `b8f6c427`。**最小根因假设是 Notes 卸载期间错过文件变更通知，回到 Notes 时复用已加载的停放会话，缺少一次正文复读。** 这两个生命周期在源码中确有缺口，并能解释本次快照。该运行没有记录事件交付及会话 load，实际先后顺序待复现确认。

## 本次运行确认了什么

- 用例先在桌面用应用菜单保存正文，等到磁盘写入和 UI「已保存」，随后切到能力网关。Web 通过同 Engine 分享地址打开同一路径，刷新后仍见桌面保存的内容，接着在浏览器写入新正文。第 224 行磁盘断言已返回，之后 `openNote(page)` 成功返回。第 226 行用同一笔记的 ProseMirror 等待 5 秒，14 次定位均只得到先前桌面保存的内容。失败快照仍显示正确笔记标题。 [驱动与前置保存](../../tests/e2e/workflows/web-share.spec.ts#L96) · [Web 写入与桌面断言](../../tests/e2e/workflows/web-share.spec.ts#L214) · [实际失败日志](final-package-web-b8f6c427.log#L113)
- 保全目录只有 `error-context.md` 和 `.last-run.json`。用例第 22 行设置 `trace: "off"`，无法从本次产物判断具体 WebSocket 帧何时到达、Notes 是否收到、是否发起 `notes.read` 或 Y.Doc 是否接纳正文。先前 Notes 32 项通过和此次同包其余八组通过都是已完成的独立结果。 [失败快照](final-package-web-artifacts-b8f6c427/workflows-web-share-Web-分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开/error-context.md) · [原用例采集配置](../../tests/e2e/workflows/web-share.spec.ts#L21) · [Notes 基线](followup-notes-b8f6c427.log#L142)

## 源码闭环

1. **调用驱动确实回到同一路径。** `openNote` 进入知识库、选全部笔记并点击 `noteName`。同一路径的 open 聚焦已有文档标签，这是用户正常重返文档的操作。切能力网关会使 `showNotes` 与 `alongsideNotes` 均为 false，因此卸载 `NotesModule`。Settings 和 Home 有保留挂载的专门分支，Gateway 不走该分支。 [openNote](../../tests/e2e/workflows/web-share.spec.ts#L40) · [模块挂载条件](../../packages/workbench/src/shell/AppShell.tsx#L140) · [同路径标签聚焦](../../plugins/notes/src/ui/tabs/docTabs.ts#L78)
2. **卸载的是事件订阅，保留的是正文会话。** `NotesModule` 负责把 `vault.fileChanged` 转给按 Vault、path 查到的 `DocumentSession`，`useEngineEvents` 在组件卸载时取消。EngineProvider 即使收到事件并失效查询，也只通知当时的监听者。编辑器 provider 持有一个 park 引用，离开时同路径会话仍留在 registry。因先前已保存，`flushForExit` 无新正文要写，`reopenDraft` 遇到干净会话直接返回。 [路径事件接线](../../plugins/notes/src/ui/NotesModule.tsx#L68) · [监听与分发](../../packages/workbench/src/engine-client/react.tsx#L10) · [park provider](../../packages/editor/src/host/provider-pool.ts#L63) · [停放引用与结算](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L30) · [干净会话提前返回](../../plugins/notes/src/ui/documents/DocumentSession.ts#L770)
3. **重新挂载缺兜底读取。** registry 等原结算后归还同一会话，`useDocumentSession` 只为 `loaded === false` 的会话发起 load。因此，如果外部事件在 Notes 卸载期间到达，回到知识库会继续使用旧快照；即使文件查询缓存已失效，正文仍通过会话独立发 `notes.read`。富文本已具备外部 `value` 变化后更新 Y.Doc 的路径。现有证据先指向没有给编辑器提供新值，尚无依据修改 Y.Doc 或 ProseMirror。 [会话重新获取](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L79) · [正文首次读取门槛](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L62) · [富文本外部正文更新](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L325)

`a821d4ca` 在 `notes.save` 成功后显式发布规范路径的 `vault.fileChanged`，桌面控制端和分享端绑定同一事件总线。迟到自身通知按活跃写入或待确认的同一 `writeId` 忽略，浏览器新保存的不同 ID 不会按设计被桌面当成自己的。若事件在重新挂载后交付，干净会话应走原 guarded reload。因此应优先验证订阅缺口与重新获取路径，现有快照无法证明 Engine 未发事件或旧通知逻辑误吞了新写入。 [保存发布](../../plugins/notes/src/engine/index.ts#L562) · [同一 Engine 事件总线](../../apps/engine/src/boot.ts#L574) · [自身通知与外部复读分支](../../plugins/notes/src/ui/documents/DocumentSession.ts#L788)

## 最低成本回归与修复边界

在现有 `plugins/notes/test/document-session.test.ts` 的 registry park 用例旁，用 `FakeEngine` 复现。获取租约、加载桌面旧正文并确认干净，保留 provider 的 park 引用后释放最后一个前台租约。确认只剩 park 引用，执行 `externalWrite(path, browserText)` 提升磁盘版本，期间不调用 `notifyExternalChange`，模拟事件已送到工作台但 Notes 未订阅。再 `acquire` 同一个路径。红灯断言是应复用同一会话且快照显示新正文和新版本。现有路径会直接返回仍为 `loaded:true` 的旧快照。无需监听端口、Electron 或真实文件系统。 [FakeEngine](../../plugins/notes/test/document-session.test.ts#L8) · [现有 park 用例](../../plugins/notes/test/document-session.test.ts#L2068)

最小修复点建议放在 registry 识别「仅有 park 引用 → 第一个活动租约」的边界。只对这次恢复做一次受现有版本、revision 和本地脏缓冲保护的磁盘对账。复用 `notifyExternalChange` 的干净正文刷新和脏缓冲冲突判定，保留新输入或未结算草稿。回归应断言额外 `notes.save` 次数为零，并保留当前脏缓冲、草稿恢复及迟到自身通知用例。原包用例的 Gateway 往返覆盖这条生产生命周期。若真实验证仍失败，再按桌面收到路径事件、`notes.read` 发起及版本、会话快照三点取证。

## 实际范围

仅阅读指定日志、失败快照、状态与源码。未修改任何 tracked 文件，未运行测试、Electron、E2E、构建或全仓检查。
