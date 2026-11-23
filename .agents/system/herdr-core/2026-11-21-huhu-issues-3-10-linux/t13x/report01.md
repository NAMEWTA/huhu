# 迟到写入的磁盘对账

Lead `t3p`，worker `t13x`，task01，状态 `done`。本报告基于 agent-linux 工作树、三份前序报告及 t13b 正在补充的回归。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13x/task01.md) · [队列设计](t136-report01.md) · [现有实现](t13b-report01.md) · [独立审查](t13p-report01.md)

**建议在原串行队列释放已发请求之前，按当前会话代数复读一次 `notes.read`。** 对账判断依据是磁盘与当前已知磁盘基线是否相同。例中旧操作始终返回 `false`；只有实际观察到磁盘从 X 变成 A，才需要接纳 A 为比较基线、保留缓冲 X 并阻止自动写。外部版本 E 已被接纳、旧成功回执随后才到的场景，复读仍为 E，当前操作和状态都可继续。当前 `doSave` 的两个过期分支直接返回；写入可能已经过 Vault 版本检查，正文写后的索引刷新也可能抛错。[回执分支](../../plugins/notes/src/ui/documents/DocumentSession.ts#L304) · [Engine 保存顺序](../../plugins/notes/src/engine/service.ts#L578) · [Vault 条件写](../../packages/vault/src/write.ts#L128)

## 在哪里读，以及读数何时有效

1. 在 `doSave` 真正调用 `notes.save` 后，若结算时已跨代且会话仍存活，在当前队列任务内直接 await 对账；字段前置正文保存自然覆盖。对已发字段更新，记录实际进入 `rawCall("archives.update")` 的时刻，例如把“检查当前代并立即发更新”的小回调传给字段调用方。字段预检保留在回调外。未发写就被预检拦截的路径直接退出，保持现有“两次 read”断言。已发更新跨代，在成功、未知异常或随后字段回读跨代时均走同一对账出口；过期字段回读自身的正文可能采自切代前。每次实际写最多进入一次该出口。已证实为提交前的版本拒绝可以跳过；普通异常不能证明零写入，档案包装还会在 Engine 成功后等待缓存失效。旧操作不再发写、不调用 onSaved、不清草稿、不计 fileWrites。对账直接读，若在当前队列任务中再次入队并等待，将形成自等。[字段预检](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L377) · [档案调用包装](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L17) · [字段回读和队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L333)
2. 到达上述出口时先递增单调的 `diskRevision`，让在可能写入前已取样的 load/merge 重新读。每轮复读记录当前 `baselineGeneration`、`diskRevision`、当前版本以及 `loadSeq`，成功和异常都先校验。遇销毁结束；基线被再次接纳、同代版本推进或读序号变化时，丢弃旧结果，在仍存活的最新代重读。对账只观察 `loadSeq`，不递增它抢占用户重载。需要覆盖“新 load 在对账期间起读，但稍后返回”的顺序：接纳磁盘偏离时同步切代，使那笔旧读无法提交。单凭版本字符串比较会漏掉内容变回原值的 ABA。复读期间输入只改编辑 revision；结果比较和状态推导使用返回时的当前 text，保留其 revision。整个过程仍占原队列槽，后面的保存和等待退出均会等到判断完成。[现有读取仲裁](../../plugins/notes/src/ui/documents/DocumentSession.ts#L190) · [冲突解决读取](../../plugins/notes/src/ui/documents/DocumentSession.ts#L587)

## 如何接纳结果

| 当前代复读结果 | 同步处理 |
| --- | --- |
| 文件正文及实际版本均与当前已接纳的磁盘快照一致 | 结束对账。保留当前 generation、编辑状态、待恢复草稿、错误、新代队列及计时器；例如缓冲 A、磁盘 E 的 keepMine 结果仍为 dirty。恢复草稿是特例，restoreDraft 会有意将写入版本换成草稿 baseVersion；比较时沿用最近观察的磁盘版本（必要时单存该版本），防止一次无变化复读解除恢复草稿已有的版本保护。 |
| 磁盘变成 A，当前缓冲 X | 同步切代，清旧自动保存，采用实读 `savedText=A/version=vA` 和磁盘格式，保留 X、编辑 revision 和已有草稿。记录对账前的共同祖先供 merge 使用，同时标记本次冲突待解决。发布一次快照：`lastSavedText()=A, baseVersion=vA, hasUnsaved=true, state=conflict`。若实读已经等于当前缓冲，可按已观察到的一致状态结清，仍淘汰以先前磁盘快照授权的写入。 |
| 当前代复读失败，如路径缺失 | 保存当前正文、最后可信版本和可重试的读取错误；标记磁盘未核实，即使缓冲等于旧 savedText，也要阻止 clean 快路径。允许后续独立操作重新读一次；本次持续失败即返回，不在失败队列中无限重试。退出按当前正文及最后可信版本保草稿；草稿写失败向上抛出，让会话留存可重试。 |

待解决标记可作为会话内一个可空记录，存共同祖先；读取失败另标“未知”。明确处理后释放。原因是 `state` 会被 setText 改写，`flush({untilClean:true})` 又会对任何不等的正文直接调用 save。仅更新 savedText/version 会把新观察到的 vA 变成静默覆盖 A 的授权。[编辑状态](../../plugins/notes/src/ui/documents/DocumentSession.ts#L235) · [排空与退出](../../plugins/notes/src/ui/documents/DocumentSession.ts#L460)

- **待解决期间**，统一挡在正文无写快路径、字段提交、自动保存及排空之前。setText 仍接收输入、保留冲突；已知磁盘时 hasUnsaved 按逐字节比较，未知时保守为 true。成功复读并切代会淘汰上次基线下已排队的明确保存、字段快照、待交付编辑器操作和已入队自动保存。排空返回 false，退出等完队列后，无论自动或手动，都把当前 X 及 vA 留为草稿。未知分支要让 preserveDraft 越过原来的“与旧正文相等即跳过”，并令新的队列请求遵守同一标记。因读数未变化而结束时保留新代的正当保存，旧代快照照原守卫退出。[草稿写入条件](../../plugins/notes/src/ui/documents/DocumentSession.ts#L426)
- **明确解决后再保存**。选择“保留我的修改”复读并按既有路径解锁；下一次明确保存 X 才按当时版本写入，期间再有外部修改仍由 Engine 拒绝。选择“合并”用记录的共同祖先、最新缓冲和重新读取的磁盘三方合并；若直接用已推进的 A 作祖先，磁盘侧的改动会被当成共同内容。选择“重载”按现有确认流程替换正文。笔记及文本查看器已有这些入口，档案独立页面只有普通保存及错误提示，需要在该冲突态提供可达的解决动作，至少能选择保留当前正文或确认重载。草稿恢复仍按已有的明确恢复动作及 baseVersion 保护。[笔记冲突操作](../../plugins/notes/src/ui/NoteDocument.tsx#L257) · [档案正文保存](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L451)
- **回执前撤销**。从 X 保存 A 后再次输入 X，只要仍有会改变文件正文的请求待结算，setText 就应发布 `dirty`，手动按钮才能把 X 当第二笔保存排队；判为 `saving` 也会禁用该按钮。空闲撤销仍立即 saved。在途正常 ACK、对账或已知无写入的队列收尾时重新按当前正文推导，保留独立冲突和错误。优先复用队列的未结算文件写标记，注意 inflight 还包含草稿和无写入操作，直接用它判断需在对应队列清空时重算普通状态，避免永久 dirty。[按钮判定](../../plugins/notes/src/ui/NoteDocument.tsx#L361)

## 需要锁住的时序

1. 沿用 t13b 的两个正文门控。提交前门控验证 X→A 后，磁盘 A、缓冲 X、排空 false、退出草稿 X@vA，所有正文写调用总数为一；随后另测 keepMine 再明确保存才写 X@vA。仅扣 ACK 时，在它返回前撤销必须为 dirty，两笔正常保存的预期版本依序为 vX、vA。[新增回归](../../plugins/notes/test/document-session.test.ts#L570) · [手动按钮回归](../../plugins/notes/test/document-session.test.ts#L429)
2. 保留原“迟到成功 ACK 遇更新外部版本”和“迟到字段回读后新保存”正例，断言无伪冲突、无草稿删除、无 onSaved 副作用，新代合法保存仍可执行。字段另设实际更新门控，参数化正常返回与落盘后抛错，均断言当前缓冲不变、磁盘采用字段后版本、排空失败，排在被替换基线后的旧字段或正文写次数为零。[已有回执正例](../../plugins/notes/test/document-session.test.ts#L540) · [字段预检与回读正例](../../plugins/notes/test/document-session.test.ts#L328)
3. 在对账读取样后再次重载、编辑，再释放旧读，检查新缓冲与新版本；让读取直接失败一次，检查不会假干净、退出可留 X，草稿失败可重试。沿用 FakeEngine 的读、写、回执门控即可。若传输失败时 Engine 甚至还没有结束原请求，一次 GET 只能证明取样时的磁盘；这种未获终态的失败须保留“未知”保护和退出草稿，不能依据一次相同读数恢复自动写。原接口没有跨端取消或提交屏障。[Engine 客户端](../../packages/workbench/src/engine-client/client.ts#L53) · [异步协调指南](/tmp/mwg-guide-3235787-1795365728802.md#L160)

## 未运行的验证

本次仅静态分析。未运行单测、E2E、类型检查、构建、打包或其他验证。档案 Engine 的缺文件版本检查由实现任务处理。
