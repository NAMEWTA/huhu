# t194/task01 停放恢复磁盘核对独审

Lead `t3p`，审查者 `t194`，状态 `done`。基准 `4bd62e5a3eaa8a384aff6ba4ed468dd1df77a557`，候选 `17ce3c60f38ac769ef8dd6b5b56c78e2efe21074`。正式任务来自 [t194/task01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t194/task01.md)。

**原 Web 联验已通过，规格轴仍有两项 P2 草稿回归。** 两项均在实际 `DocumentSessionRegistry` 和 `DocumentSession` 上通过内存 Engine 对照重现。建议先处理草稿状态再关闭此次审查。

## 规格审查

1. **P2｜恢复读盘的迟到读数会重新显示用户已丢弃的草稿。** 打开已停放、正文干净且有可恢复草稿的 Markdown 笔记。恢复自动发出读盘请求，编辑区仍可使用，草稿横幅也可操作。若 `notes.draft.get` 已取样、`notes.read` 尚未返回，此时点击「丢弃」，`discardDraft()` 会清掉快照并按版本删除落盘草稿。它没有使在途草稿读数失效。等待正文返回后，`loadFile` 仍接纳删除前的草稿，横幅重新出现，可以再次把已丢弃内容恢复进可编辑缓冲。即使正文磁盘版本未变化，恢复也会发起这次读取。最小验证是在已有停放草稿测试中阻塞 `notes.read`，让草稿读取先取样，再执行并确认丢弃，最后放行正文。基准和候选的落盘草稿均为空，基准快照保持为空，候选快照重新出现旧草稿。 [触发读取](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L91) · [草稿取样和接纳](../../plugins/notes/src/ui/documents/DocumentSession.ts#L256) · [丢弃操作](../../plugins/notes/src/ui/documents/DocumentSession.ts#L960) · [横幅动作](../../plugins/notes/src/ui/NoteDocument.tsx#L287)

2. **P2｜草稿接口单独失败会隐藏当前可恢复的草稿。** 同一恢复路径中，正文读成功而草稿读失败时，`loadFile` 把拒绝转成 `null`，接纳正文后清空先前已知的草稿。UI 的恢复入口随之消失，快照无错误，落盘草稿仍在。Engine 的正文和草稿使用独立请求及文件读取，草稿读盘的非 ENOENT 错误可单独返回。最小验证是为已加载的停放草稿在第二次 `notes.draft.get` 注入一次拒绝，正文仍返回版本 2。基准保留草稿入口，候选正文更新为版本 2、快照草稿变为 `null`，两者落盘草稿均保留。 [读取失败归为空](../../plugins/notes/src/ui/documents/DocumentSession.ts#L256) · [快照清空](../../plugins/notes/src/ui/documents/DocumentSession.ts#L309) · [Engine 草稿读盘](../../plugins/notes/src/engine/index.ts#L467)

3. **待验证｜恢复读盘可能在富文本组合输入交付前接纳磁盘正文。** 已经进入 `setText` 的输入受 revision 保护，现有用例直接验证了这一层。恢复复用的干净会话路径以 `expectedRevision = undefined` 调用 `loadFile`，接纳前不会调用已注册的编辑器 drainer。内存探针阻塞读取、恢复租约并注册一个能交付待结算输入的 drainer，再放行读取。候选切到磁盘版本 2，drainer 调用为 0。这证明会话只保护已交付的编辑。实际富文本通常在事务批后的微任务交付，输入法组合期间会延迟交付，收到不同正文的 value 后可替换 Y.Text 和富文本表示。最小 UI 验证是延迟恢复 `notes.read`，让复用的编辑器进入组合输入并产生本地变更，再放行读盘，检查组合提交后本地文本及保存状态。实际浏览器下的组合状态与内容结果未测。 [会话接纳门槛](../../plugins/notes/src/ui/documents/DocumentSession.ts#L264) · [现有测试直接交付输入](../../plugins/notes/test/document-session.test.ts#L2165) · [生产 drainer 注册](../../plugins/notes/src/ui/NoteDocument.tsx#L125) · [组合输入延期与外部正文替换](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L267) · [Y.Doc 更新](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L325)

## 规范与生命周期

- 两个改动文件均在派发范围内。Registry 沿用按 Vault 和 path 的会话键、现有结算及外部通知机制。首个活动租约在等待结算后同步增加引用才发起核对，其他并发活动租约复用同一会话。未发现引用计数或结算边界的新增缺陷。独立探针先阻塞最后一个活动租约的 drainer，两个 acquire 等待同一次结算，解除阻塞后两者共享同一次读盘。随后并行释放活动租约及停放引用，再次打开取得新 epoch，旧会话的迟到读数被丢弃，所有租约释放后 registry 为空。 [引用和结算](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L30) · [获取租约](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L79) · [旧会话失效](../../plugins/notes/src/ui/documents/DocumentSession.ts#L214)
- Gateway 往返走实际消费者。切至 Gateway 会卸载 Notes，富文本 provider 池保留停放引用。回到同路径时 `useDocumentSession` 重新 acquire，已加载会话不会走首次加载，新增核对负责回读并通过订阅更新 UI。干净正常路径更新正文及基线，脏缓冲按已有版本判断冲突。迟到自身写入通知仍由原 writeId 分支识别。现有核对也可能按版本清理内容已等于正文的普通草稿。 [模块挂载](../../packages/workbench/src/shell/AppShell.tsx#L140) · [provider 保留](../../packages/editor/src/host/provider-pool.ts#L63) · [调用与订阅](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L40) · [外部核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L788)

## 版本、验证与限制

| 文件 | 基准 blob | 候选 blob |
| --- | --- | --- |
| `plugins/notes/src/ui/documents/DocumentSessionRegistry.ts` | `fb21382fbc9a4d591f8532acccd0a0af38fcc242` | `70ecac26baee7a454bc58c13e82ad6d8217317ff` |
| `plugins/notes/test/document-session.test.ts` | `28d812f6391781cd2d410098bf51a1a93e0bf975` | `1ffd7dcf310f460070483b10f7c7447893e99eea` |

- 核对工作树这两份文件的哈希与候选 blob 相同，`git diff --check 4bd62e5a 17ce3c60f` 退出 0。独立内存探针使用 Node 24.21.0，加载该候选与 Git 基准 Registry，两个版本共用未改动的实际 `DocumentSession`。探针仅注入 Engine 读数、延迟和错误，WorkBench 请求 ID 导出使用占位，本轮探针无正文保存。
- 已核对实现方红灯的旧正文／版本 1 和期望新正文／版本 2，以及绿灯同文件 97/97。原包 `b8f6c427` 的失效断言发生在确认 Web 内容已落盘之后。Lead 在候选新构建复跑同一完整 `web-share` 用例，日志第 109–111 行记录 1 项通过，总用时 17.4 秒。Git 确认两候选之间该测试文件无差异。该运行验证 Gateway 往返和双向编辑，事件帧与会话调用的原始失败时序仍无 trace。 [前次故障报告](t176-report19.md) · [实现报告](t176-report20.md) · [红灯](t176-park-resume-red.log#L105) · [绿灯](t176-park-resume-green.log#L5) · [原包失败](final-package-web-b8f6c427.log#L113) · [候选复跑](park-web-recheck-17ce3c60.log#L109) · [原断言](../../tests/e2e/workflows/web-share.spec.ts#L214)
- 未运行的验证包括本轮复跑 Vitest、真实组合输入、Electron／E2E、构建、打包和全仓类型检查。业务源码与测试文件保持只读，未提交、未启动 agent。原包 Web 结果来自 Lead。

### Modern Web Guidance

我检索并读取了 `deprioritize-background-fetches` 与 `performance`，核对恢复当前文档继续使用既有 Engine 请求优先级。本轮交付为只读审查。
