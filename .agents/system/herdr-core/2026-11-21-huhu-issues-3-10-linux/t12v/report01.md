# 保存快照独审

Lead `t3p`，worker `t12v`，任务 `t12v/task01.md`。已完成静态审查。基线为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`，审查目标为 `agent-linux` 工作树中的未提交保存改动。`DocumentSession.ts` 的 SHA-256 为 `b8fb64f23221f80327190afde116ca8342f6a462f8530092eb8423a11e848203`。对照了 `t11n/task02.md` 的手动保存语义，以及 t12c 实现报告（历史位置 `t12c-report01.md`，本次未取得原件） 和 t124 前序审查（历史位置 `t124-report01.md`，本次未取得原件）。

## 规格发现

### P1 · 重载或合并后，排队的旧快照能用新版本覆盖磁盘

1. 关闭自动保存，文件为 `X@v1`。触发保存 `A`，将该 `notes.save` 请求拦在发送给 Engine 之前。继续键入并触发第二次保存，`A+B` 已进入队列。此时第二次保存尚未实际发出，输入已将状态改为 `dirty`。
2. 从外部把文件改为 `D@v2`。文件事件或脏稿轮询能在第一笔等待期间显示冲突。用户点击重载并确认放弃本地修改，`load()` 把正文、保存基线和版本设为 `D@v2`。选择合并也会更新版本并保留外部改动于当前缓冲。
3. 放行第一笔。Engine 拒绝 `A @v1`，失败分支保留会话已更新的 `v2`。队列忽略前笔的布尔结果，第二笔仍持有重载前的 `A+B`，并在发出时读取 `this.version`。`A+B @v2` 因而通过版本检查，磁盘上的 `D` 被覆盖。重载后的编辑缓冲还显示 `D`，第二笔回执之后才成为 `dirty`。合并路径同样会让旧快照覆盖磁盘，合并结果只留在内存。

修复时需要区分正常保存回执推进版本与冲突解决建立新基线。重载或合并前排队的旧正文应失效，旧回执也不应覆盖冲突解决后的状态。回归应断言放行后未发出 `A+B @v2`，磁盘仍为 `D`，重载缓冲为 `saved`，另以合并路径断言两边的修改留在当前缓冲。

[文件事件与冲突轮询](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L435) · [重载确认](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L257) · [重载更新基线](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L182) · [合并更新基线](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L504) · [队列及快照](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L285) · [发出写入与失败回执](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L258) · [Engine 版本检查](../../../../../plugins/notes/src/engine/service.ts#L578)

### P2 · 被前笔排队阻塞的档案字段写入会抢先落盘后续正文，再被旧快照回退

手动模式下，档案保存 `A` 的回执先在途。修改一个字段并失焦，让字段写入排在 `A` 后。再输入 `B` 并点档案保存，随后输入 `C`，等 `C` 交给会话后再放行 `A`。字段操作轮到执行时直接用 `doSave()` 取当前正文 `A+B+C` 写盘。字段变更落盘并回读后，重基将单独的 frontmatter 变更合入第二次保存的 `A+B`，该笔再把磁盘正文回退为 `A+B`。预期写入顺序是第一次明确保存的正文、字段变更、第二次明确保存的正文。`C` 应留在缓冲，尚未触发保存的内容却曾被写入磁盘并进入后端索引。序列结束时 `C` 仍在缓冲并显示 dirty。

现有字段单测在字段操作已越过前置正文写入之后才排队第二次保存，覆盖了字段变更重基，未覆盖这里的前置写入晚取样。可把字段动作和第二次保存都排在受控的首个保存回执后，逐笔断言请求正文与版本，以及独立的最终缓冲。

[字段失焦触发](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L618) · [字段与正文保存入口](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L377) · [字段前置写入及重基](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L314) · [Engine 局部字段更新](../../../../../plugins/notes/src/engine/archives/service.ts#L402) · [现有字段单测](../../../../../plugins/notes/test/document-session.test.ts#L239)

### P2 · 保存期间撤销回该笔正文后，状态仍显示「未保存修改」

从 `X` 编辑到 `A` 并点保存，首笔回执暂缓。输入 `B` 后撤销回 `A`。返回回执时磁盘和缓冲都是 `A`，`hasUnsaved` 为 `false`，但 revision 已增长，回执仍将 `state` 设为 `dirty`。再点击保存直接走正文相同的提前返回，按钮持续可用，状态栏也持续显示「未保存修改」。自动保存计时器触发后同样会走正文相同的分支。基线也有这一状态不一致，本轮没有覆盖它。修复时要保留另一种时序：若撤销回的是旧磁盘内容 `X`，而在途回执写成 `A`，则 `X` 确实仍待保存。

[回执的状态更新和相同正文分支](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L245) · [未保存状态计算](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L152) · [状态栏与保存按钮](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L356)

## 调用方与规范

- 笔记的按钮、应用菜单和 Mod+S 共用默认 `flush()`，档案保存按钮也用默认 `flush()`。关闭自动保存时，这些入口先结算编辑器，再冻结该轮正文。纯文本与 JSON 的保存入口直接冻结会话正文。自动保存计时器仍在写入队列轮到该笔时读取正文，自动模式的默认 `flush()` 仍循环排空。[笔记入口](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L128) · [应用菜单](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L147) · [Mod+S](../../../../../plugins/notes/src/ui/NoteDocument.tsx#L319) · [档案按钮](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L450) · [纯文本入口](../../../../../plugins/notes/src/ui/viewers/TextFileView.tsx#L73) · [自动保存](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L219)
- 前序审查的两处调用点已修复。档案移动、重命名、删除及附件等共用包装器，文件树及菜单的路径变更经会话注册表，两处均请求 `untilClean: true`。笔记模式切换及 HTML 回到预览、Vault 切换时选保存、批注按路径和无路径的前置保存都请求排空。批注带选区时还会前后核验 revision。[档案包装器](../../../../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L325) · [路径注册表](../../../../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L105) · [模式切换](../../../../../plugins/notes/src/ui/documents/useFlushedMode.ts#L15) · [HTML 预览](../../../../../plugins/notes/src/ui/viewers/HtmlPreview.tsx#L23) · [Vault 切换](../../../../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55) · [批注桥](../../../../../plugins/notes/src/ui/comments/useCommentsBridge.ts#L24) · [批注选区](../../../../../packages/editor/src/host/routes/comments.ts#L125)
- 普通写入失败保留文本和版本。后续快照在原版本依然有效时可独立成功，外部改版会触发条件写冲突。正常的手动退出会等既有保存，再用最后成功回执的版本留草稿。自动退出尝试排空，失败后留草稿。关闭窗口前渲染器会先禁止输入，停放和会话释放也走退出结算。草稿写入失败会沿现有退出协议报错。除上述行为发现，审查范围内未发现额外的项目规范违规。[版本失败与串行](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L260) · [草稿和退出](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts#L363) · [会话释放](../../../../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L30) · [关窗入口](../../../../../apps/desktop/src/renderer/main.tsx#L359)

## 测试覆盖与证据

- t12t 的既有日志显示 `document-session.test.ts` 38/38 通过。并发单测持有两笔写入，逐笔断言 `A @1` 与 `A+B @2`，第二笔完成后磁盘为 `A+B`，会话仍为 `A+B+C`、`baseVersion: 3`、`hasUnsaved: true`。退出单测用在途成功回执验证草稿版本。`keepMine()` 单测先完整等待首笔冲突回执，`merge()` 单测在队列空闲时调用。两者都未覆盖冲突处理期间队列里还有旧快照的情况。[t12t 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/save-snapshot-check.log#L45) · [并发单测](../../../../../plugins/notes/test/document-session.test.ts#L143) · [冲突和合并单测](../../../../../plugins/notes/test/document-session.test.ts#L300) · [退出草稿单测](../../../../../plugins/notes/test/document-session.test.ts#L431)
- `session-flush.spec.ts` 中两条新增 C06 用例把第一笔真实 HTTP 响应拦在渲染器前，先校验磁盘，再输入。重叠用例等待会话字数确认第三段已交付，再检查释放回执后的请求正文、磁盘和 dirty，最后一次明确保存才验证第三段落盘。它们能区分两笔各自冻结正文与等旧回执以后再取样。预期版本由单测直接断言，E2E 通过真实条件写和逐轮磁盘结果间接覆盖。现有 C06 写入失败用例在错误可见后才重试。现有 E04 档案用例延迟正文写请求再改字段，能覆盖两者最终都保留，未触发字段后方的第二次明确保存。[真实回执探针](../../../../../tests/e2e/knowledge/session-flush.spec.ts#L48) · [C06 失败重试](../../../../../tests/e2e/knowledge/session-flush.spec.ts#L544) · [E04 档案](../../../../../tests/e2e/workflows/archives-tabs.spec.ts#L225)
- `shell.spec.ts` 的「设置：编辑器页的开关真正生效」分别等到按钮和 Mod+S 的落盘及「已保存」，并在录入快捷键段前明确聚焦正文。离开前的下一段通过重新打开和恢复草稿断言。菜单用例调用真实菜单动作并检查当前正文落盘。受控并发由两条 C06 按钮用例覆盖。[按钮、Mod+S 和草稿](../../../../../tests/e2e/shell.spec.ts#L1667) · [应用菜单](../../../../../tests/e2e/knowledge/session-flush.spec.ts#L149)

## 未运行的验证

本轮未运行任何单测、类型检查、lint、构建、打包、安装包检查或 Playwright/Electron E2E。三项发现来自代码和实际入口的时序推导。Lead 仍需在新构建上运行两条 C06 手动保存、菜单和 shell 快捷键用例，并实跑 E04 字段、档案路径、批注、模式切换和退出草稿相关回归。历史记录中的单测与 Notes 模块类型检查只作为已有证据。[候选验收记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L108)
