# 保存队列最终独立审查

Lead `t3p`，worker `t13p`，状态 `done`。在 `agent-linux` 比较任务指定基准 `f0fb1810` 与工作树。审查期间 HEAD 推进到 `4beb7eae`，两提交之间的范围未涉及本次审查的 Notes、Vault 或 Engine 文件。本轮仅新增本报告。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13p/task01.md)

## 规格发现

### P2 · 基线重载后，已发出的保存可以使会话持续误判磁盘为干净

手动模式下从磁盘正文 `X@vX` 编辑成 `A`，点击保存，暂扣已发出的 `notes.save(A, vX)`，让它尚未执行 Engine 条件写。撤销回 `X`，从外部更新该文件的 mtime，正文仍为 `X@vX`。Vault 监听按 mtime 上报，干净分支自动重载，接纳 `X@vX` 并切换基线。随后放行请求，`vX` 仍匹配，Engine 写入 `A@vA`。旧回执按设计退出，Vault 过滤本机写回声，会话在 saved 状态也没有脏稿轮询。此时编辑器和 `savedText` 都是 `X`，磁盘却是 `A`；`flush({ untilClean: true })` 等完队列仍返回 `true`，文件操作和模式切换继续，退出也不留草稿。重开文件才看见 `A`。需要按当前基线核对实际磁盘，并在偏离时阻止误报干净。原请求依旧只按 `vX` 执行一次。[基线接纳](../../plugins/notes/src/ui/documents/DocumentSession.ts#L217) · [晚到回执](../../plugins/notes/src/ui/documents/DocumentSession.ts#L304) · [排空](../../plugins/notes/src/ui/documents/DocumentSession.ts#L460) · [外部变更和轮询](../../plugins/notes/src/ui/documents/DocumentSession.ts#L518) · [Engine 文件事件](../../apps/engine/src/boot.ts#L596) · [mtime 与自写过滤](../../packages/vault/src/watch/watcher.ts#L178) · [内容版本](../../packages/vault/src/write.ts#L13)

### P2 · 档案字段请求可在旧版本文件被移走后重新创建 index.md

在已载入档案上修改一个有值的字段并失焦。让已带 `expectedVersion: v1` 的请求在到达 Engine 之前等待，从外部移走该档案的 `index.md`，保留档案目录及类型目录，再放行请求。客户端在会话和档案详情版本都为 `v1` 时直发，能力绑定位透传参数。Engine 只要求档案目录存在，`cur` 为 null 时把调用方的 `v1` 换成 `expectedVersion: null`，Vault 因目标确实不存在而独占创建。结果是旧字段动作重新生成一个仅含本次字段写入的档案文件。这个既有 Engine 分支违反了本轮对已发档案写入必须沿用原版本的要求。应在提供版本而文件已缺失时拒绝请求，保留原路径缺失状态。[档案字段提交](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L377) · [能力绑定](../../plugins/notes/src/engine/archives/capabilities.ts#L157) · [目录存在性](../../plugins/notes/src/engine/archives/service.ts#L113) · [字段写入](../../plugins/notes/src/engine/archives/service.ts#L402) · [Vault 版本语义](../../packages/vault/src/write.ts#L128)

### P2 · 撤销回原磁盘正文时，手动保存按钮提前禁用

手动模式下从 `X` 保存 `A`，等磁盘实际成为 `A`，把响应扣在渲染器之前。撤销回 `X`，`setText` 用未推进的 `savedText` 把状态直接设为 saved。笔记界面显示「已保存」并禁用保存按钮，用户在这段时间无法通过按钮将 `X` 排为第二次明确保存。回执放行后才恢复 dirty。已有撤销用例只断言回执后的状态，另一条立即 saved 用例没有在途写入。[编辑态](../../plugins/notes/src/ui/documents/DocumentSession.ts#L235) · [笔记保存按钮](../../plugins/notes/src/ui/NoteDocument.tsx#L356) · [两个撤销用例](../../plugins/notes/test/document-session.test.ts#L401)

## 三项原发现与调用边界

- 原来能借用新基线版本的旧排队保存已作废。重载、合并、保留我的修改和恢复草稿都切换基线。旧成功和错误回执在继续改会话、清理草稿或调用 `onSaved` 之前退出。档案字段回调在异步预检后再次检查基线，字段写入和回读返回也各有检查。已发出的 `notes.save` 使用发出时的版本；同基线正常回执推进版本，旧操作在新基线上不重发。已发档案更新的缺文件例外见上。[队列与回执](../../plugins/notes/src/ui/documents/DocumentSession.ts#L282) · [字段回读](../../plugins/notes/src/ui/documents/DocumentSession.ts#L367) · [旧操作回归](../../plugins/notes/test/document-session.test.ts#L469) · [正文条件写](../../plugins/notes/src/engine/service.ts#L578)
- 原先档案字段会抢先写后续输入的问题已修复。字段前置写在编辑器交付后冻结正文，回读差异合入当前缓冲和同基线排队快照。手动保存逐轮冻结正文，测试分别断言 `A @1`、`A+B @2`，`A+B+C` 留在缓冲。自动保存计时器携带安排时的基线，轮到执行时读取该基线的当前正文。[字段逐笔回归](../../plugins/notes/test/document-session.test.ts#L267) · [手动逐笔回归](../../plugins/notes/test/document-session.test.ts#L145) · [自动保存](../../plugins/notes/src/ui/documents/DocumentSession.ts#L250)
- 原先撤销到写入正文后状态仍为 dirty 的问题已修复。回执按当前正文是否等于实际写入正文确定 saved 或 dirty，富文本等价路径仍检查 revision。回执前按钮的独立问题见上。[回执状态](../../plugins/notes/src/ui/documents/DocumentSession.ts#L282) · [撤销回归](../../plugins/notes/test/document-session.test.ts#L401)
- 笔记按钮、菜单和 Mod+S 走默认保存。批注、模式切换、档案路径动作、注册表路径操作和切 Vault 选择保存都要求排空。跨基线的排空返回 `false`。退出等待在途队列，切换基线时重新检查；手动退出用最后接纳的版本留后续草稿，自动退出排空失败后留草稿。上面的磁盘偏离场景仍可绕过干净判断。[笔记入口](../../plugins/notes/src/ui/NoteDocument.tsx#L128) · [批注](../../plugins/notes/src/ui/comments/useCommentsBridge.ts#L24) · [模式切换](../../plugins/notes/src/ui/documents/useFlushedMode.ts#L15) · [档案操作](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L325) · [注册表](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L105) · [切 Vault](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55) · [退出草稿](../../plugins/notes/src/ui/documents/DocumentSession.ts#L481) · [在途回执后草稿回归](../../plugins/notes/test/document-session.test.ts#L635)

## 规范与验证

审查范围内未发现额外项目规范问题。三项新发现均有直接调用及版本分支证据，结果基于静态追踪。Lead 的现有日志显示 `document-session.test.ts` 50/50 通过。[Lead 单测日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/save-generation-check.log#L57)

### 未运行的验证

本轮未运行单测、类型检查、lint、构建、打包、安装包检查或 Playwright/Electron E2E。类型检查由 Lead 的另一任务跟进。桌面包验收仍取实际候选包的运行结果。
