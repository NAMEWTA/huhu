# 评论字段对照与适配决定（S4）

OK 线程 `CommentThreadMeta`（`core/src/schemas/api/comments.ts`）↔ Huhu `CommentDto`（`plugins/notes/src/engine/comments/service.ts`）。适配代码：`packages/editor/src/host/routes/comments.ts`（`toThreadMeta`）；单测：`packages/editor/test/comment-routes.test.ts`、`plugins/notes/test/comment-adapter.test.ts`、`plugins/notes/test/comments.test.ts`。

## 字段

| OK 字段 | Huhu 字段 | 映射 / 决定 |
| --- | --- | --- |
| `threadId` | `id` | 原样 |
| `docName`（无扩展名） | `documentPath`（带扩展名） | `docNameOf` 去 `.md/.mdx`；反向 `pathOfDocName` 按已知笔记回查 `名.md` / `名.mdx` / 文件夹笔记 `名/index.md`，找不到按 `名.md`。**绑定的是稳定文档 id**：改名 / 移动 / 回收站恢复后 `documentPath` 由引擎同步，`comments.list(path)` 优先按 `documentId` 匹配（D06） |
| `target: {kind:'body'}` | `target:'body'` | 原样；锚点见下 |
| `target: {kind:'property', key, path}` | `target:'property'` + `property` | `key` ← `property`；`path` 固定 `[]`（Huhu 存的是顶层属性键；嵌套属性路径未登记，**偏差 1**） |
| （无） | `target:'file'` | **Huhu 扩展**：整篇笔记批注。经 `scope:'file'` 带到 UI（P-S4-01/05），线程卡显示“整篇笔记” |
| `anchor.{exact,prefix,suffix,start,end}` | `anchor.{exact,prefix,suffix,start,end}`（+`sourceVersion`） | 同名同义。**`start/end` 是已保存源码里的偏移，只作提示**（OK 的前端定位靠 quote + 上下文，`createAnchorResolver`）；真源是 `exact + prefix + suffix` |
| `state: anchored/orphaned/resolved` | `state: anchored/orphaned` + `resolved:boolean` | `resolved` → `state:'resolved'`；孤立保持 `orphaned`，**锚点原样保留，不吸附** |
| `queued` | （无） | 固定 `false`；队列 / 发送给智能体不接 |
| `latestComment` | `messages[0].text` | OK 线程只有一条正文；Huhu 是消息列表。首条 → `latestComment`；**完整消息列表经扩展字段 `messages` 带入**（P-S4-01），回复显示在卡片里（P-S4-05） |
| `createdBy` | `messages[0].author` | 无消息时 `'Huhu'` |
| `createdAt/updatedAt`（毫秒） | ISO 字符串 | `Date.parse` |

## 动作（`/api/comments`、`/api/comment`）

| OK | Huhu | 说明 |
| --- | --- | --- |
| `GET /api/comments[?doc=]` | `comments.list` | 不带 `doc` 列全部 |
| `POST /api/comments`（quote/prefix/suffix 或 start/end；`propertyKey`） | `comments.create` | **引擎新增 `quote/prefix/suffix` 输入**（`resolveRange`：先字面、再“渲染文本”匹配越过强调 / 链接等语法；frontmatter 不参与；多处命中用上下文判优，仍并列则报错）。创建前先 flush 该文档，引擎在**已保存文本**上解析（D05）。不传 PM 坐标 |
| `POST …{action:'replace'}`（重新选择位置） | `comments.relocate` | 同上，接受引用文字；先 flush |
| `POST …{action:'reopen'}` | `comments.reopen` | |
| `POST …{action:'reply'}` / `resolve`（**Huhu 扩展**） | `comments.reply` / `comments.resolve` | OK 没有这两个动作（OK 的解决来自派发完成） |
| `DELETE /api/comment?id=` | `comments.delete` | UI 两步确认（P-S4-05），正文不变 |
| `edit` | **不接** | Huhu 的消息是追加式记录，没有编辑能力；入口（铅笔）换成“标记为已解决”。**偏差 2** |
| `queue` / `unqueue` / `dispatch-prepare-batch` / `dispatch-complete-batch` | **不接**（Q2：AI 派发不属于本地编辑核心） | 路由返回带 `title` 的错误；发送栏 / 勾选 UI 不渲染（P-S4-04/05） |

## 不可映射 / 已登记的偏差

1. 嵌套属性路径（`propertyPath`）：Huhu 属性评论只存顶层键，`path` 固定 `[]`；OK 属性面板里的“属性评论”入口由 S3 的属性区接入，届时再核对。
2. 评论编辑：不接。
3. 属性值内引用文字锚点（OK 的属性线程有 `anchor`）：Huhu 属性评论无锚点（`anchor:null`），整条属性评论。
4. OK 的“项目级评论队列面板”（`CommentProjectPanel`）不接。
