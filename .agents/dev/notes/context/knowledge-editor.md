# 知识库编辑器（Open Knowledge 移植）

> 移植的规格与历史证据见 [Open Knowledge 移植归档](../../archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/README.md)。会话与保存条目于 2026-11-23 按 `fc43ceef` 核对，取代初版只描述自动保存和原样写回的说明。

## 架构（一份文件、一个会话、多种视图）
- **会话与保存**。工作台按 `(vaultId, path)` 共享文档会话，保存、冲突和草稿由会话结算。正文按提交的字符串以 UTF-8 条件写入，格式保留取决于编辑器送入的文本。工作台保存携带 `expectedVersion` 和 `writeId`，文件变更事件用该 ID 识别自身通知。背景读写按基线和编辑 revision 对账，输入法组合期间推迟外部刷新，组合结束后重新读取。 [文档会话](../../../../plugins/notes/src/ui/documents/DocumentSession.ts) · [会话注册表](../../../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts) · [保存能力](../../../../plugins/notes/src/engine/index.ts)
- **编辑内核**：`packages/editor/src/vendor/open-knowledge/`（固定上游 `44a2e0a`，GPL-3.0-or-later，**不升级**；补丁全部登记在同目录 `PATCHES.md`，`pnpm exec node scripts/ok-patches.mjs --check` 校验；来源与重新生成方法见 `UPSTREAM.md`）。本地没有 Hocuspocus：`host/` 里的 `LocalDocProvider` 提供 Yjs 文档（`Y.Text('source')` 为真源，`Y.XmlFragment` 是派生的 ProseMirror 视图），OK 服务端的“树 ↔ 源文本”桥（`server-bridge/`）搬进渲染进程原样运行。
- **宿主适配**：`packages/editor/src/host/`（`host-fetch` 把 OK 的 `/api/*` 路由到 Huhu 能力：`routes/{core,comments,files}.ts`；`document-context`、`provider-pool`、`desktop-bridge`、`explorer`）。消费者只通过 `@huhu/editor/rich`（`RichMarkdownEditor` / `ReadonlyMarkdown` / `SourceMarkdownEditor` / 紧凑变体 / 评论面板宿主）与 `@huhu/editor/ok-explorer` 使用，**都经动态 `import()` 加载，不进首屏**。
- **视图**。富文本、源码、阅读共用源文本。笔记视图切换须等 `flush({untilClean: true})` 成功；迟到结果只对原视图请求有效。编辑按事务交付给会话，300 ms 防抖仅用于大纲和属性面板，自动保存仍为 800 ms。内容不变时跳过写盘（`markdownSemanticallyUnchanged`）。`PlainTextEditor`（`.txt` / `.json`，CM6，不绑 Y）与 PDF / HTML / 图片 / 未知查看器见 `plugins/notes/src/ui/viewers/`（分派表 `dispatch.ts`）。 [视图切换](../../../../plugins/notes/src/ui/documents/useFlushedMode.ts) · [事务交付](../../../../plugins/notes/src/ui/NoteDocument.tsx)
- **手动保存、关页与重开**。显式保存以该次写入回执为准，需要稳定正文的操作可要求排空更新。退出时自动保存，关闭自动保存或正文保存失败时尝试保留版本化草稿。丢失写回执时保留结果未确认信息，重开再核对磁盘与草稿。后台读失败后仍保留待刷新状态，返回停放的文档时会重新核对。正文和草稿都未能保全时，会话保留供重试，桌面关窗联动见 [工作台总体](workbench.md)。 [退出与刷新](../../../../plugins/notes/src/ui/documents/DocumentSession.ts) · [草稿能力](../../../../plugins/notes/src/engine/index.ts)

## 必须知道的坑
- **依赖版本是行为的一部分**：`pnpm-workspace.yaml` 的 `overrides` 把 tiptap / ProseMirror / mdast / hast 等钉在上游锁文件版本。浮动版本实测出过两类故障：`@tiptap/react` 3.34 与 park / 重挂载不兼容；`mdast-util-gfm-task-list-item` 2.0.1 把任务项序列化成 `- [ ] [ ] x`（上游 `list.test.ts` 抓到）。改依赖后必须跑 `pnpm test:vendor`。
- **往返不是字节保真**：`parse → serialize` 对 444 个本仓库 `.md` 只有 66% 字节相等（规范化后 85%）。所以“无编辑不写盘”靠源文本为真源，**首次编辑后文件会被整体规范化一次**。
- **大文档**：超过 256 Ki 字符（`NoteDocument` 的 `LARGE_DOC_CHARS`）默认以源码模式打开，源码模式只装载 `Y.Text`、富文本表示（解析 + `Y.XmlFragment` + 桥）延后到切换时构建（`lazyRich`）；输入后的桥结算在上次耗时 > 12 ms 时推迟（补丁 P-S3-01～03）。Markdown 笔记上限 16 MiB，其它文本 1 MiB。
- **`editor-cache` 会驱逐在屏的实例**（超过 10 个挂载）：紧凑变体（`compact-` 前缀）不缓存（补丁 P-S2c-01）。
- **样式**：`.ok-root` 作用域与 `vendor.ok-*` 子层，见 [design-system.md](design-system.md)。
- **资源目录**：文件树的数据源是 `vault.list`（逐目录列举，不过滤，受保护目录仅元信息）；`vault.indexEntries`（原 `vault.tree`）是平铺索引条目，给 `@` 候选 / MCP `huhu://notes/recent` / tasks 引用用；`notes.files` 已删除。`hiddenPaths`（`.huhu/notes/hidden-paths.json`，`notes.hidden.get/set`）**只用于文件树视图**，搜索 / `@` / 双链 / 已打开标签 / 评论不使用。
- **标签与侧栏**：`DocTab`（file / archives-home / archive-type / archive-record）与 `shellState` reducer（`plugins/notes/src/ui/tabs/`）；档案 = 文件夹笔记（见 [archives.md](archives.md)），同一 `index.md` 同一会话。
- **HTML 预览**：`<iframe sandbox="allow-scripts">` + `huhu-preview` 协议（路径守卫 + CSP + nonce 授权表，主进程）。已知未缓解：`<link rel="dns-prefetch">` 可能泄露主机名（`evidence/s7/sp-7.md`）。

## 有意不做（Q2 / OP-D19）
OK 的 lint / audit 面板、Share、Open with AI、presence、history、云协作与账户、AI 派发 / 队列评论、`.okignore` 隐藏、外链预览（默认关闭）。
