# 评论对照 OK（D02）

对照基线：OK `44a2e0a` `packages/app/src/comments/`。

| OK 能力 | Huhu | 说明 |
| --- | --- | --- |
| 选区浮动输入框（`CommentSelectionAffordance`，Enter 发表 / Esc 取消、`add-comment` 快捷键） | ✓ 原样 | 工具栏“添加批注”改为触发 `emitStartComment` |
| 正文高亮（`anchor-decorations`，`placeAnchors` 按 quote + 上下文重建） | ✓ 原样 | 偏移只作提示 |
| 边距提示（`CommentMarginRail`） | ✓ 原样 | 未单独截图对照 |
| 线程列表 / 卡片（`CommentListPanel`、`ThreadCard`） | ✓（补丁 P-S4-04/05） | 去发送勾选 / 发送栏；加 解决、回复、删除确认 |
| 已解决过滤（`comment-doc-resolved-toggle`） | ✓ 原样 | |
| 重新定位孤立线程（“Re-place on selected text”） | ✓ 原样 | 经 `replace` 动作 → `comments.relocate`（引用文字） |
| 点线程引用定位正文（`jumpToQuote` / `scrollAnchorIntoView`） | ✓ 原样 | |
| 评论编辑 | ✗ 不接 | Huhu 消息追加式 |
| 发送给智能体 / 队列 / 批量派发 | ✗ 不接（Q2） | |
| 项目级评论面板（`CommentProjectPanel`） | ✗ 不接 | |
| Markdown 渲染评论正文 | ✗ 纯文本 | 上游线程卡也是纯文本 `<p>`；回复同 |
| 属性评论（`PropertyCommentButton`） | 路由 + 引擎已支持 | UI 随 S3 属性区 |

## 上游评论测试分类（`test:vendor`）

- 迁入并通过（22 个非 dom 文件，190 个用例）：`active-thread` `anchor-layers` `anchor-nearby-edit` `anchor-repro` `anchor-search` `anchor-transaction-effect` `comment-hue-contrast` `comments-client` `dispatch-batch` `margin-rail-layout` `open-chat-send` `open-thread-bus` `open-thread-lifecycle` `property-anchor-click` `queue-grouping` `reopen-requeue` `reveal-queue` `scroll-to-anchor` `selected-span` `store.refresh-fanout` `store.settle-reporting` `store.snapshot-stability`。其中 `dispatch-batch` / `reopen-requeue` / `open-chat-send` / `queue-grouping` 测的是 AI 队列与派发逻辑——代码仍在 vendor 里、未接入 UI，测试照常通过，不代表 Huhu 有这些功能。
- 未迁入（19 个 dom 测试，需 jsdom 预加载与上游 test-support）：`QueueNewChatRow` `comment-chips` `comment-composer-submit` `comment-send-footer` `edit-propagation` `jump-scroll-ownership` `open-thread-panel` `orphan-deleted-quote` `project-file-groups` `property-anchor-click` `property-row-rect` `queue-shortcut-scope` `queued-toggle` `reveal-comment` `reveal-thread` `thread-card-click` `thread-card-jump-miss` `thread-card-property-miss` `thread-edit-save` `thread-edited-stamp` `use-send-queue`（dom 版本）。其中 `comment-send-footer` `queue-shortcut-scope` `queued-toggle` `use-send-queue` `thread-edit-save` `thread-edited-stamp` `QueueNewChatRow` `project-file-groups` 对应不接的功能 → **不适用**；其余为“待迁”（S8 前随 dom 测试基础设施一并处理）。
