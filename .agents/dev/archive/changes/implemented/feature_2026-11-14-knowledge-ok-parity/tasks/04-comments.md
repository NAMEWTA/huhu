# 04 评论（S4）

[验收报告](../evidences/04-comments.md)

规格：D01–D06；设计：[design.md](../design.md) §9；决定：OP-D04；复用：[reuse.md](../reuse.md) §4。
交付：用户角度——选中正文发起评论、整篇评论、属性评论；正文高亮、边缘提示、线程、回复、解决 / 重开、删除确认、过滤；点正文定位线程、点线程定位正文；孤立锚点；全部落在 Huhu 现有评论存储里。
依赖：S2b（编辑器宿主插槽）、S1。
边界：写 `plugins/notes/src/ui/comments/`、vendor 评论目录补丁（`P-S4-xx`）、`host/host-fetch.ts` 的评论路由段、`plugins/notes/src/engine/comments/` 只在字段缺口时扩展；**不新建评论后端**；旧 `CommentsPanel.tsx` 在 S8 删除。

## 当前代码指针

`plugins/notes/src/ui/CommentsPanel.tsx`（137 行）、`plugins/notes/src/engine/comments/{anchor,passage-match,service,whitespace-char-ref}.ts`、`comments.*` 能力（`engine/index.ts:307-331`）；OK `app/src/comments/`（78 文件，约 35 个源码；`store.ts` 529、`comments-client.ts` 140）、`core/src/{comments,schemas/api/comments.ts}`。`CommentDto` 的定义位置：未核实。

## 实施要点

4.1 **字段对照表（第一步）**：`evidence/comment-field-map.md`——OK `CommentThread / CommentAnchor / CommentThreadMeta`（exact / prefix / suffix / start / end、线程状态、消息）↔ Huhu `CommentDto`；差异列表与决定（扩展 DTO 还是适配层吸收）；适配层单测覆盖映射的往返与不可映射字段（AI 派发动作 `queue / dispatch-*` 不接）。
4.2 `commentAdapter`：`comments.list/create/reply/resolve/reopen/relocate/delete` ↔ `/api/comments`、`/api/comment` 动作集；`store.ts` 的订阅刷新由 `entity.changed` 驱动。
4.3 锚点：保持 OK 的 quote 搜索（`createAnchorResolver`）；**不**把 PM `from/to` 写成源码偏移；发起时冻结 quote / prefix / suffix / 缓冲 revision；异步 flush 期间继续编辑仍对应正确版本；歧义 / 找不到 → 孤立 / 待重新定位。
4.4 属性评论：锚点关联真实属性键；改名 / 删除后的定位状态。
4.5 只读：可查看 / 定位，写操作禁用并说明原因。
4.6 文件操作联动：重命名 / 移动 / 回收站恢复 / 档案视图打开同一文件时评论仍绑定同一资源；任务评论（#1 的任务讨论）回归。

## 验收

- [ ] D01：选区、整篇、属性评论都进入同一真实存储；取消输入不留伪线程或错误高亮。
- [ ] D02：高亮、边缘提示、线程、回复、Markdown 内容、解决 / 重开、过滤、删除确认与 OK 对照通过（`evidence/parity/comments.md`）。
- [ ] D03：点正文定位线程、点线程定位正文；切标签 / 模式 / 面板后无焦点劫持、无遗留浮层。
- [ ] D04：原文前插入、格式变化、表格 / 链接、重复段落的锚点定位正确；歧义和删除原文显示孤立，不吸附错误文本（新增黄金用例）。
- [ ] D05：发起评论后异步 flush 期间继续编辑，锚点对应正确缓冲版本；适配层不直接用 PM 坐标作源码偏移（单测）。
- [ ] D06：重命名 / 移动 / 回收站恢复 / 档案视图不丢评论；任务评论等既有消费者无回归（既有 e2e + 新增）。
- [ ] `test:vendor` 中评论相关上游测试的分类结果入表；不适用项有原因。

## 完成证据

`evidence/s4/`（字段对照、适配单测、e2e 报告、对照记录）；`PATCHES.md` 的 `P-S4-xx`。
