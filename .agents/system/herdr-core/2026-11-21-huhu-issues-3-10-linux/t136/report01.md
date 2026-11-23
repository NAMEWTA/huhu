# 文档保存基线与队列分析

Lead `t3p`，worker `t136`，[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t136/task01.md)。分析基于 `agent-linux` 的未提交实现，HEAD 为 `4ae7e7e4`，`DocumentSession.ts` 的 SHA-256 为 `b8fb64f23221f80327190afde116ca8342f6a462f8530092eb8423a11e848203`。[前序实现](t12c-report01.md) · [独立审查](t12v-report01.md)

**建议保留现有串行队列，在会话内记录一次“已接受的基线切换”。** 每次保存冻结该次正文，轮到执行时使用同一基线内上笔成功回执的版本。冲突解决一旦接纳新磁盘内容，先前操作即失去使用新版本的资格。档案字段的前置正文也使用现有保存快照。成功回执先记录实际写入的正文，再据此计算保存状态。实现主要集中在 `DocumentSession`，字段回调有一处发请求前的异步检查需要配合。

## 三个时序及验收值

| 时序 | 当前行为 | 修复后的观察值 |
| --- | --- | --- |
| 磁盘为 `a/middle/z@1`，保存 `a1/middle/z` 在途，`a2/middle/z` 排队。外部改末行为 `z2@2`，用户重载或合并，然后放行首笔 | 首笔以版本 1 失败。第二笔使用冲突解决刚写入的版本 2，旧正文覆盖外部末行。Lead 的 t137 定向运行两例均在磁盘断言失败 | 只出现首笔 `notes.save`。磁盘保持 `a/middle/z2@2`。重载缓冲与磁盘相等并显示 saved；合并缓冲为 `a2/middle/z2` 并显示 dirty。表中的斜线表示换行。[红灯日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/save-baseline-red.log#L23) |
| 手动保存 A 等待回执。此时字段失焦，在其后明确保存 A+B，再输入 C | 字段执行时读到 A+B+C，经 `notes.save` 写入并刷新索引。下一笔明确保存又把正文改回 A+B，单看最终磁盘会漏报 | 依序为旧字段的 `A @1`、用版本 2 更新字段、带新字段的 `A+B @3`。末次回执后版本 4。每一笔正文请求均无 C。当前缓冲含新字段及 A+B+C，仍为 dirty。[字段回归](../../plugins/notes/test/document-session.test.ts#L265) · [条件写及索引更新](../../plugins/notes/src/engine/service.ts#L578) |
| 磁盘 X，保存 A 在途，输入 B 后撤销回 A 或 X | 写 A 的回执同时比较 revision 和正文。回到 A 时仍显示 dirty，尽管 `hasUnsaved` 已为 false | 两种分支磁盘都为 A。缓冲 A 得到 saved、`hasUnsaved=false`；缓冲 X 得到 dirty、`hasUnsaved=true`。两个分支都保留已增长的 revision。[撤销回归](../../plugins/notes/test/document-session.test.ts#L312) · [状态栏及按钮](../../plugins/notes/src/ui/NoteDocument.tsx#L356) |

## 会话内的最小变更

1. **区分基线、磁盘版本及编辑次序。** 新增私有整数 `baselineGeneration`，保存在 `SaveSnapshot` 中，异步操作在入口捕获它。`version` 继续作为 Engine 的条件写版本，`savedText` 表示最近接纳的磁盘正文，`revision` 保留编辑变动及富文本等价规范化保护。注册表的 `id.epoch` 标识会话实例，同一打开文件内的冲突解决始终复用该实例。正常保存 ACK 和成功的字段回读更新版本，维持本代，这样后笔可用新版本推进；普通输入只增加 revision。不要在入队时冻结 `expectedVersion`，已有两笔手动保存用例要求两笔依次使用 1、2。[现有字段与快照](../../plugins/notes/src/ui/documents/DocumentSession.ts#L79) · [正常版本推进用例](../../plugins/notes/test/document-session.test.ts#L143)

2. **在接纳新基线的同步代码段切代。** `load()` 通过现有 `loadSeq`、revision、`isCurrent`、草稿条件后，紧邻赋值 `text/version/savedText` 切代。被新输入、更新的读取或失效标签驳回的载入，保留原队列。成功的 `merge()` 和 `keepMine()` 也切代，包括磁盘版本字符串恰好相同的显式冲突解决。合并使用当前本地正文与共同基线；保留我的修改只接受磁盘作比较基准，用户下一次明确保存才可覆盖。三种读操作复用 `loadSeq` 仲裁先后，成功和错误分支都检查序号、代数及 `disposed`。若读取期间本代正常写入已推进 `version`，不能用早先的读数回退版本，必要时重新读取。恢复草稿显式改用草稿基线并替换全文，也应淘汰恢复前的正文操作；仍沿用草稿的 `baseVersion` 供下一次条件写发现真正的外部冲突。[载入](../../plugins/notes/src/ui/documents/DocumentSession.ts#L172) · [保留、合并和恢复](../../plugins/notes/src/ui/documents/DocumentSession.ts#L489)

3. **发出写入、接收回执各检查一次。** 保持 `inflight` 的 Promise 链直到实际工作结束。排队操作轮到时，先检查代数和 `disposed`，过期返回 `false`，跳过 `rebaseFailed` 报错、`saving`、条件写及后续操作。真正发请求的时刻才读 `this.version`。`doSave` 在成功和 catch 里重复检查，迟到结果不能写 `version/savedText/state/flushError/equivalentMarkdown/draft/fileWrites`、触发草稿删除、发布快照或调用 `onSaved`。快照从 `queuedSaves` 摘除须覆盖淘汰和异常路径。保持原队列在前笔普通 I/O 失败后仍可执行同代的独立保存，Engine 负责校验真实版本。[保存和串行队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L245)

4. **在字段操作的编辑器交付结束时冻结正文。** `writeFields` 入口记代，`await drainForWrite()` 后核对，再以 `captureSave()` 取得快照并加入 `queuedSaves`，与入队之间不再等待。轮到字段操作时先摘除自身，检查过期及 `rebaseFailed`，对已加载文件调用 `doSave(snapshot)`。用快照正文与**当时最新的** `savedText` 决定是否需要前置条件写。即使当前缓冲已撤销回磁盘，也应尊重字段触发时已交付的正文。前置写成功后重查代数，取此刻真实 `savedText` 为 `before`（含 Markdown 规范化的情况），再执行字段条件写及 `notes.read`。沿用已有三方合并，把 `before → file.text` 的变更分别应用于**当前缓冲**和**同代每个等待快照**。后面的字段操作也会因此吸收前面的字段。某个快照合并冲突，标记该笔失败；当前缓冲合并冲突，保留本地正文和现有冲突提示，避免让未重基的旧快照取得新的磁盘版本。[字段队列与重基](../../plugins/notes/src/ui/documents/DocumentSession.ts#L314)

5. **在档案回调真正提交处检查。** `ArchivesViews.save` 的回调可能先 `await archives.read` 比较字段，再发 `rawCall("archives.update")`。可让 `writeFields` 给此唯一生产调用方多传一个只读 `isCurrent()` 闭包，在预检返回后、发写请求前检查；失效时直接结束，外层再检查并返回 `false`。保留原有字段值、删除键及 `expectedVersion` 校验。`writeFields` 在前置保存、字段写入、最终回读各自的 await 之后及错误分支检查，特别在修改当前缓冲、遍历 `queuedSaves` 之前。异步回调内部的等待使单独一处入口检查不足以拦下尚未发出的字段写入。[字段提交、预检及更新](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L377) · [Engine 局部修改](../../plugins/notes/src/engine/archives/service.ts#L402)

6. **保存状态按当前正文与最新确认正文计算。** 同代成功 ACK 后设置 `savedText=body`，用 `text === savedText` 决定 saved 或 dirty，和 `hasUnsaved` 的比较一致。后续编辑不同则原样保留。在 `body === savedText` 的无写入快路径也校正普通 dirty 状态（只在变化时 emit），按当前缓冲计算，保留独立冲突和错误提示。对于空闲时直接编辑再撤销至磁盘正文，在 `setText` 同步反映相等，使手动模式无需再点一次保存；在途的结果仍要按真正落盘的正文重新计算。Markdown 等价比较会**改写缓冲原文**，该路径继续要求 revision 匹配。同一字符串经撤销恢复只够判定 clean，不能授权覆盖较新的编辑或重置 revision。[状态快照及编辑](../../plugins/notes/src/ui/documents/DocumentSession.ts#L152) · [等价与逐字节保存用例](../../plugins/notes/test/document-session.test.ts#L59)

## 其余调用及不可撤回的边界

- **手动与自动保存。** 笔记按钮、菜单、Mod+S 和档案保存按钮走默认 `flush()`；纯文本及 JSON 调 `save()`。保留手动模式第一次编辑器交付后立即冻结本次正文。入口在 drain 前记代，跨代返回 false，避免在新基线上替旧点击发起保存。`untilClean` 的批注、路径操作、模式切换、Vault 切换仍走排空循环，各 await 返回核对操作代数，失效时让调用方停止依赖动作。自动保存保留轮到执行时取最新正文的行为，定时器携带**安排时**的代数，接纳新基线时清掉旧定时器；已经进入队列的旧回调也要核对代数。若产品需要自动保存冲突解决后的内容，应由新代操作按既有策略调度。[笔记入口](../../plugins/notes/src/ui/NoteDocument.tsx#L128) · [文本入口](../../plugins/notes/src/ui/viewers/TextFileView.tsx#L77) · [排空循环](../../plugins/notes/src/ui/documents/DocumentSession.ts#L390) · [路径操作](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L105)
- **外部事件、轮询与错误。** 文件事件在缓冲干净时触发 load，脏时只提示冲突。删除或改名前路径沿用错误提示与留草稿，并使未完成的基线读取失效。脏稿轮询记录发读时的代数和版本，返回时检查二者及会话存活，避免旧读把刚合并的 dirty 再标成 conflict。`readDisk` 只向差异视图返回字符串。`load` 的旧错误应在会话内消化为 false，避免挂载、编码转换和外部事件的 catch 对新状态调用 `setError/fail`。同理，旧 drainer 失败不得覆盖新代错误、为新代错误留草稿，或在 finally 清除新输入的定时器。[外部事件和停放](../../plugins/notes/src/ui/NotesModule.tsx#L65) · [载入与首次挂载](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L69) · [轮询及差异读取](../../plugins/notes/src/ui/documents/DocumentSession.ts#L435)
- **退出与销毁。** `flushForExit` 先结算编辑器并等已有写入。手动模式以最后接纳的版本保存剩余草稿，自动模式尝试排空，失败则保存草稿。退出期间当前基线若被替换，按最新活会话重新检查是否仍有稿件需要保存。草稿入队前后同样识别失效。`dispose` 在成功结算后才关闭会话并使晚到的读写失效；进入 dispose 时提前作废首笔合法 ACK 会导致退出草稿记录旧版本。退出失败保留可重试会话，定时器按原 finally 清理。注册表在同路径重新 acquire 前等待 settling；停放使用 `flushForExit/reopenDraft`，并继续保留后者原有的 revision 与标签有效性检查。[草稿与退出](../../plugins/notes/src/ui/documents/DocumentSession.ts#L363) · [销毁](../../plugins/notes/src/ui/documents/DocumentSession.ts#L549) · [注册表结算与重试](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L30)
- **已经发给 Engine 的写入。** `SessionEngine.call` 没有取消参数。已发出的 `notes.save` 或 `archives.update` 仍可能按原版本成功并产生文件、索引、事件或缓存刷新副作用；已发出的 `notes.draft.save/discard` 也可能完成。会话能阻止后续请求、丢弃迟到成功与失败、跳过旧 ACK 派生的草稿清理。磁盘是否已写要由真实版本和重新读取判定。若外部修改已先落盘，旧条件写会被拒绝；若旧写已完成、仅回执晚到，冲突解决读到的实际文件就是当时基准。极端情况下切换读数之后旧写仍以匹配版本提交，后续以文件事件、复读和条件写呈现实际磁盘差异，切勿自动重放旧正文或补写回滚。[Engine 接口](../../plugins/notes/src/ui/documents/DocumentSession.ts#L12) · [字段缓存刷新](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L17)

## 最小回归组合

1. **基线替换。** 保留 Lead 的 load/merge 红灯和“同基线两次手动保存”正例。给同一时序加 keepMine 分支，断言只发出首笔旧保存，外部文件保持版本 2，缓冲保留本地最新正文并显示 dirty；再明确保存才写本地正文。另用一个返回门控，让首笔真实写入先完成，读取新的外部文件后才释放旧**成功**回执。断言版本、正文、状态、草稿、`onSaved` 均以新基线为准。现有 FakeEngine.saveGate 拦在版本检查之前，只能证明该时序下的旧失败回执。[已有参数化回归](../../plugins/notes/test/document-session.test.ts#L370) · [FakeEngine](../../plugins/notes/test/document-session.test.ts#L24)
2. **字段取样。** 使用 Lead 新增的“排队的档案字段操作不能抢先保存触发后的正文”，逐笔检查正文，另可直接在字段回调断言传入版本 2、两笔 `notes.save` 预期版本分别为 1 和 3。保留既有“档案条件写与新正文使用同一版本队列”，它覆盖字段触发时已有未保存正文、必须先写该正文。对两次相邻字段操作，确认第二笔冻结快照能吸收第一笔字段变更。跨代守卫用字段回读门控即可区分：字段已提交，暂停回读返回，重载较新的外部文件，再放开旧读；新缓冲、版本、等待快照均维持新代结果。[字段两种时序](../../plugins/notes/test/document-session.test.ts#L239)
3. **撤销。** 使用 Lead 已写的 A/X 两个参数。两例都检查磁盘 A、状态及 `hasUnsaved`，再点保存可分别断言零次追加写入、一次以版本 2 写 X。复用已有 Markdown 等价与退出草稿用例保护原契约。时序门控可沿用该文件的 `Promise.withResolvers()`。[撤销用例](../../plugins/notes/test/document-session.test.ts#L312) · [前端指南的异步协调章节](/tmp/mwg-guide-4-1795367557788.md)

## 未运行的验证

本次仅进行了静态调用追踪和已存日志核对。未运行单测、E2E、类型检查、lint、构建或打包。t137 的两条失败属于 Lead 已运行的证据。本报告未改业务代码或测试。
