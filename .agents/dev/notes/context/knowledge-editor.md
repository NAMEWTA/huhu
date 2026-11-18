# 知识库编辑器（Open Knowledge 移植）

> 来源：change `2026-11-14-knowledge-ok-parity`（规格 / 设计 / 决定 / 证据在该 change 目录，归档后在 `archive/changes/implemented/`）。本文只留“改代码前必须知道的事实”。

## 架构（一份文件、一个会话、多种视图）
- **会话**：`plugins/notes/src/ui/documents/DocumentSession.ts`（纯类）+ `DocumentSessionRegistry`（按 `(vaultId, path)` 引用计数，销毁中重开会等旧会话写完）。唯一的保存 / 冲突 / 草稿 / flush 权威；`notes.save({expectedVersion})` 与草稿机制沿用。**保存永远保存原样字符串**（BOM / 换行 / 末尾换行逐字节还原，JSON 不在保存路径里 `stringify`）。
- **编辑内核**：`packages/editor/src/vendor/open-knowledge/`（固定上游 `44a2e0a`，GPL-3.0-or-later，**不升级**；补丁全部登记在同目录 `PATCHES.md`，`pnpm exec node scripts/ok-patches.mjs --check` 校验；来源与重新生成方法见 `UPSTREAM.md`）。本地没有 Hocuspocus：`host/` 里的 `LocalDocProvider` 提供 Yjs 文档（`Y.Text('source')` 为真源，`Y.XmlFragment` 是派生的 ProseMirror 视图），OK 服务端的“树 ↔ 源文本”桥（`server-bridge/`）搬进渲染进程原样运行。
- **宿主适配**：`packages/editor/src/host/`（`host-fetch` 把 OK 的 `/api/*` 路由到 Huhu 能力：`routes/{core,comments,files}.ts`；`document-context`、`provider-pool`、`desktop-bridge`、`explorer`）。消费者只通过 `@huhu/editor/rich`（`RichMarkdownEditor` / `ReadonlyMarkdown` / `SourceMarkdownEditor` / 紧凑变体 / 评论面板宿主）与 `@huhu/editor/ok-explorer` 使用，**都经动态 `import()` 加载，不进首屏**。
- **视图**：富文本 / 源码 / 阅读读同一份 `Y.Text('source')`；切换前先 `session.flush()`（先排空编辑器 → 会话的 300 ms 防抖）。无编辑不写盘（`markdownSemanticallyUnchanged`）。`PlainTextEditor`（`.txt` / `.json`，CM6，不绑 Y）与 PDF / HTML / 图片 / 未知查看器见 `plugins/notes/src/ui/viewers/`（分派表 `dispatch.ts`）。

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
