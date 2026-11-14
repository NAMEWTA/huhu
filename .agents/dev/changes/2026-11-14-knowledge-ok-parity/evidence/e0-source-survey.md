# E0 来源与现状调查（2026-11-14）

> 方法：只读调查，由 `search` / `grep` 子代理在本地工作副本上用 `find` / `wc` / `git grep` 取数，结果在主会话汇总。**数字来自实际命令；标“未核实”的是子代理自己说没核实到的。** 实施前（S0）要在固定 SHA 上重跑一遍并存成机器可读清单（`closure-manifest.json`）。

## 1. 本地来源工作副本

| 来源 | 本地路径 | HEAD | 与 issue 固定 SHA | 工作区 | 许可证 |
| --- | --- | --- | --- | --- | --- |
| Open Knowledge（下称 OK） | `temp/sources/open-knowledge` | `44a2e0a6acce5952da0764746e3693fded5025b4` | 相同 | 只有 ` D LICENSE`（根 LICENSE 在工作区被删，`git show HEAD:LICENSE` 为 GPL-3.0 全文） | **GPL-3.0-or-later**（`package.json`） |
| ORCA | `temp/sources/orca` | `7041ea022826ec19d627cd3a129b665822e7bf0a` | 相同 | 只有 ` D LICENSE` | **MIT**（`git show HEAD:LICENSE`：Copyright (c) 2026 Lovecast Inc.） |
| Huhu | 仓库根 | `9132640`（`v0.0.1-rc.4`） | issue 调查基线同此提交 | — | **GPL-3.0-or-later**（`package.json`、根 `LICENSE`） |
| obsidian-huhu | `/home/wta/projects/obsidian-huhu` | 未核实（issue 固定 `d527f14`） | — | — | 未核实 |

结论：issue 里“未取得本机 `temp/sources` 工作副本”的限制已解除，OK / ORCA 的固定 SHA 与本地副本一致；Huhu 与 OK 同为 GPL-3.0-or-later，复制 OK 代码在许可证上同向（仍需按台账登记来源与改动，见 [reuse.md](../reuse.md)）。

## 2. OK 编辑器与 core 的真实规模（`packages/app` + `packages/core`）

| 项 | 数据 |
| --- | --- |
| `packages/app/src/editor` 非测试 | 312 文件 / 约 4.8 万行；测试 310 文件（其中 85 个 `*.dom.test.*`，jsdom） |
| `packages/core` 的 `extensions` + `markdown` | 133 文件 / 约 1.8 万行（`markdown/` 98 个非 fixture 源文件约 1.6 万行；`extensions/` 约 35 文件 2.1k 行） |
| 直接体量（editor + core 两处） | 约 445 文件 / 6.6 万行 |
| 静态 import 闭包（BFS，排除测试/fixtures/`.d.ts`） | **861 文件（app 551、core 310）/ 约 12.3 万行 ts/tsx / 126 个 npm 包**；未计动态 `import()`、json、CSS、i18n 资源 |
| `core/src/bridge` + `registry` | 约 5.2k 行 |
| 黄金样本 | `core/src/markdown/fixtures` 22 文件 7.5 MB；`app/tests/stress` 另有 202 个 `*.e2e.ts`（Playwright） |
| 样式 | Tailwind `^4.2.2`；`app/src/globals.css` **7079 行** + `cmd-f.css` 91 行；`@theme`（L83、L3387）、`@source` ×4、`@plugin "tailwind-scrollbar"`、`@custom-variant dark/reduced-transparency`；`editor/` 内无 CSS 文件 |
| 依赖版本 | Tiptap 全系 `^3.22.3`；`yjs ^13.6.30`；`@hocuspocus/provider 4.0.0-rc.1`；`y-codemirror.next ^0.3.5`；`y-indexeddb 9.0.12`；`@handlewithcare/remark-prosemirror 0.1.5`；unified ^11、remark-gfm ^4、remark-math ^6；React `^19.2.5`；Vite `^8.0.0`（Huhu：React `^19.3.1`、Vite `^8.3.7`、Electron `44.9.1`，OK desktop 也是 Electron 44.9.1） |
| 补丁 | `patches/` 与 `pnpm-workspace.yaml:294-306`：`@tiptap/extension-drag-handle@3.22.3`、`@tiptap/y-tiptap@3.0.3`、`@hocuspocus/provider@4.0.0-rc.1`、`@handlewithcare/remark-prosemirror@0.1.5`（`y-prosemirror@1.3.7` 补丁是否登记：未核实） |
| 许可证头 | editor / core 源文件**没有**版权头（grep 0 命中）；`THIRD_PARTY_NOTICES.md` 6754 行（生成的，1161 条 `###`，含 LGPL-3.0 / OFL / Apache-2.0 / MIT / ISC / BSD / CC-BY / PSF 分节） |

### 2.1 编辑器内部分区（`packages/app/src/editor`）

- `TiptapEditor.tsx` 1308 行（`:208` `new MarkdownManager`，`:238/241` `Collaboration.configure`）；`provider-pool.ts` 2121 行（`:942` `new HocuspocusProvider`）；`DocumentContext.tsx` 1868；`editor-panes.ts` 1054；`editor-cache.ts` 869（`MAX_CACHE=10`，`park` 只摘 DOM，`evict` 才销毁）。
- `extensions/` 76 个非测试文件；`slash-command.ts` 213、`shared.ts` 139；`suggestion-ime / suggestion-floating-ui / suggestion-allow` 在 `extensions/`，不在 `slash-command/`。
- `slash-command/` 非测试约 1.5k 行：`component-items.tsx` 592、`items.tsx` 362、`SlashCommandMenu.tsx` 164、`embed-starter-items.tsx` 164、`apply-item.ts` 51。
- `bubble-menu/` 18 文件 2220 行；`block-ux/keyboard-nav.ts` 306；`clipboard/` 44 文件 12141 行（含测试）；`table-controls/` 5 文件 1026 行；`presence/` 2554 行（云协作，可不要）。
- 源码模式 `SourceEditor.tsx` 492 行 = CodeMirror 6 + `y-codemirror.next`（`new Y.UndoManager(ytext)`）；`RawMdxFallbackCMView.tsx` 499。`use-editor-mode.ts` 只有 `['wysiwyg','source']`，**没有独立的阅读模式**。

### 2.2 core

- `src/extensions/shared.ts` 导出 `sharedExtensions`；`:64-66` `StarterKit.configure({undoRedo:false})`，撤销全部交给 `Collaboration`（y-tiptap 的 yUndo）。
- `src/markdown/`：`index.ts` 1737（`class MarkdownManager` `:118`）、`pipeline.ts` 329、`parse-with-fallback.ts` 460、`to-markdown-handlers.ts` 1332、`position-slice.ts` 882。
- frontmatter：`core/src/frontmatter/yaml-codec.ts`（126，`yaml` 包 `parseDocument`）、`record.ts`、`schema.ts`（177）。

## 3. OK 的文档模型（决定 Yjs 去留的关键事实）

- **真源是 `Y.Text('source')`（原始 Markdown 字节）**，`Y.XmlFragment('default')` 是由它派生的 ProseMirror 视图。磁盘 → Y.Doc 不是 `prosemirrorJSONToYDoc`，而是 Markdown → `parseWithFallback` → `schema.nodeFromJSON` → `updateYFragment`（`packages/server/src/bridge-intake.ts:101-148`，`applyFastDiff` 写 Y.Text）。
- 加载：`server/src/persistence.ts:2470-2600 onLoadDocument`；保存：Hocuspocus 防抖 2 s / 上限 10 s（`server-factory.ts:608-609`），写盘前 `markdownSemanticallyUnchanged`（`persistence.ts:1744`，比较 `normalizeBridge`）命中则**不写盘**；原子写 `:2038/:2067/:2199-2205`；回声靠 `FILE_WATCHER_ORIGIN.skipStoreHooks` + 写入哈希（`server-factory.ts:3856`）。
- 外部变更：`server-factory.ts:3826 intakeDiskUpdate`，文档已打开时走块级 `reconcile({base, ours, theirs})`（`reconciliation.ts:197`，块切分后 LCS，4M 格上限；结果 clean / merged / both-kept / refused）。
- 客户端 `TiptapEditor` 对 provider 实际读取的成员：`document`（约 38 处）、`configuration.name`（约 18 处）、`awareness`（`:275`，必须存在）、`on/off('synced')`；池层另用 `status / disconnect / destroy / forceSync / connect`。最小接口（推断）：`{document, configuration:{name}, awareness, on/off('synced'), destroy()}`，`forceSync` 可选。
- 评论锚点**不依赖 Y**：`comments/anchor-decorations.tsx:39 placeAnchors` 对每个线程按 `anchor.quote` 调 `createAnchorResolver`（`anchor-search.ts:185`），每次文档变化重建；无 RelativePosition。评论数据走 REST（`/api/comments`），不走 Y.Doc。
- 属性面板（`PropertyPanel` 601、`FrontmatterRow` 759、`PropertyWidgets` 764 等合计约 3163 行）经 `provider: HocuspocusProvider` 读写 Y.Doc 中的 frontmatter（`lib/use-frontmatter-field.ts:19`），**没有直接 fetch**。
- 去掉 Yjs 的代价：非测试文件导入 yjs / y-tiptap / hocuspocus / y-indexeddb / y-codemirror 共 **52** 个（`editor/` 内 27 个约 1.03 万行，`editor/` 外 25 个）；撤销要从 `undoRedo:false` 改回 history，source ↔ PM 双向同步、lint-fix / paste 的事务语义都要重做。

## 4. OK 的后端调用面（宿主适配的工作量）

编辑器 / 评论 / 文件树 / 属性面板用到的调用（`packages/app/src` 下，`git grep`；动态拼接与 `okDesktop` 的方法清单未穷尽）：

| 分组 | 端点 | 备注 |
| --- | --- | --- |
| 协作 | `ws /collab`（`provider-pool.ts:942`、`live-doc-pool.ts:59`、`SystemDocSubscriber.tsx:59`）、`/api/principal`、`/api/config` | 本地用 `LocalDocProvider` 取代；principal 用本机固定身份 |
| 页面 / 链接 | `/api/pages`、`/api/page-headings`、`/api/forward-links`、`/api/backlinks`、`/api/backlink-counts`、`/api/document`（wiki-link-suggestion、internal-doc-preview、PageListContext） | 映射到 Huhu 的资源目录 / 搜索 / 链接能力 |
| 标签 | `/api/tags`、`/api/tags/:name`（tag-suggestion、TagDialog） | 映射 `notes.tags` |
| 上传 / 预览 | `POST /api/upload`（`image-upload/upload-file.ts:20`）、`POST /api/link-preview`（外链预览）、`/api/documents/refresh` | 上传写入 Vault 附件目录；外链预览联网需策略（见 spec） |
| lint / audit | `/api/lint/*`、`/api/audit`（`lint-config-client.ts`、`validation-audit-client.ts`） | 服务端能力（`lint-routes` 437 + `lint-write-routes` 528 + `lint/audit` 352 + `validation-audit` 488 行 + markdownlint）；见 spec“待决问题” |
| 评论 | `GET/POST /api/comments`、`POST/DELETE /api/comment`（`comments-client.ts` 140 行，`request()` 包装） | 映射 `comments.*`（Huhu 已有，且 R-24 已复制过 OK 锚点算法） |
| 文件树 | `/api/documents?showAll=true&dir=&depth=1`、`/api/workspace`、duplicate-path / rename-path / create-page / create-folder / delete-path / trash / upload（`FileTree.tsx` 多处，POST 为推断） | 映射新资源目录 + 现有 `vault.*` / `notes.*` 写能力 |
| Electron 桥 | `window.okDesktop`（`FileTree.tsx:599/1140/2711/2782/2828/3214/3218`、`DocumentContext.tsx:267/274`、`asset-dispatch/dispatcher.ts:20`、`plugins/asset-context-menu.ts:94` 等，107 个文件） | 用 Huhu 桌面桥的等价物替换（reveal in OS、复制路径、打开方式等） |
| localStorage 键 | `ok-editor-mode-v1`、`ok-properties-collapsed-v1`、`ok-editor-visible-v1`、`ok.propPanel.advanced.*`、`ok-last-observed-branch`、`ok-doc-lineage-epochs`（后两者仅云协作）等 | 前缀改为 `huhu.ok.*` 或并入每 Vault UI 偏好 |

OK 的“隐藏”（`FileTree.tsx:605-613`）是**写入 `.okignore` 的 pattern**，不是视图隐藏——不能照搬，Huhu 要的是“仅资源管理器隐藏”（见 spec）。OK 的“只显示 Markdown”是客户端过滤 `failsOnlyMarkdownAxis`（`file-tree-utils.ts:172`，受 `showOnlyMarkdownFiles` 控制），列表数据来自 `/api/documents`。

## 5. OK 评论 / 文件树 / 图标 / 样式

- 评论 `packages/app/src/comments/` 78 文件（43 个测试，约 35 个源码）：`CommentsPanel` 52、`CommentListPanel` 327、`ThreadCard` 414、`CommentMarginRail` 223、`CommentSelectionAffordance` 226、`CommentSendFooter` 125、`anchor-decorations.tsx` 179、`anchor-layers.ts` 100、`anchor-search.ts` 196、`selected-span.ts` 19、`store.ts` 529（`useSyncExternalStore`）、`comments-client.ts` 140；模型 `types.ts`（`CommentThread` / `CommentAnchor`：quote/prefix/suffix/start/end），权威 schema `core/src/schemas/api/comments.ts`（`AnchorSchema`：exact/prefix/suffix/start/end）；core 的 `comments/passage-match.ts` 335、`leaf-text.ts` 84；服务端 `comments/comment-api.ts` 340、`thread-store.ts`（`<localDir>/comments/<id>.meta.json`）、`anchor.ts` 192。
- 文件树 `components/`：`FileTree.tsx` **3469 行**、`file-tree-adapter.ts` 430、`file-tree-operations.ts` 287、`file-tree-selection.ts` 161、`file-tree-rename-validation.ts` 47、`file-tree-utils.ts` 237、`file-tree-shared.ts` 106、`file-tree-density.ts` 70、`file-tree-listing-transport.ts` 78、`use-file-tree-listing.ts` 314、`OkFileTree.tsx` 160；库 `@pierre/trees 1.0.0-beta.4`；树样式经 `unsafeCSS` 字符串注入；34 个相关测试。
- 菜单 `FileTargetMenuItems.tsx` 259 行：新建文件 / 模板 / 文件夹、Share、复制完整 / 相对路径、全部展开 / 折叠、导入模板、Duplicate、Rename、Hide、Delete、Reveal、OpenWithAi；原语可注入（`FileTargetMenuPrimitives`，`FileTree.tsx:469` 注入 Radix `DropdownMenu`）。
- 图标 `file-entry-icon.tsx` 175 行：lucide + 自绘 `MarkdownFileIcon`；扩展名角标 `file-tree-extension-badge.ts` 140；`editor/registry/lucide-svg.ts` 把 lucide 转 SVG 字符串给 pierre sprite。
- `components/ui/` 共 79 文件；编辑器 / 评论 / 文件树 / 属性面板用到 25 个（alert-dialog、badge、button、calendar、checkbox、collapsible、command、dialog、dropdown-menu、empty、input、input-group、kbd、loading-image、panel、popover、select、separator、sidebar、skeleton、sonner、spinner、switch、textarea、toggle、tooltip）；282 个文件引用 `components/ui/`。
- i18n：`@lingui`（61 个文件使用）；`lingui.config.ts` sourceLocale `en`，`src/locales/{locale}/messages`，13 个语言（含 `zh-Hans`、`zh-Hant`），**每个 .po 4064 条 msgid**。
- 宿主依赖：233 处 `@/` 别名导入 + 14 处越界相对导入；越界最多的前几项：`components/ui/*`（约 54）、`lib/perf`（21）、`lib/doc-hash`（9）、`lib/utils`（8）、`lib/keyboard-shortcuts`（4）、`components/PageListContext`（4）、`lib/external-link`（3）、`comments/store`（2）。zustand 0 处，未见 react-router；sonner toast 8 个文件。

## 6. ORCA 查看器（`temp/sources/orca`）

- **PDF**（最小集约 19 文件 / 1.6k 行）：`PdfViewer.tsx` 273、`PdfFind.tsx` 182、`pdf-document-loader.ts` 172、`pdf-viewer-session.ts` 252、`pdf-view-position.ts` 121、`pdf-scale-preference.ts` 105（+ storage 19）、`pdf-js-document-options.ts` 17、`pdf-orca-media-range-transport.ts` 64、`use-pdf-viewer-find-shortcut.ts` 56、`use-viewer-zoom-commands.ts` 27 等。`pdfjs-dist ^6.3.289`（锁 6.3.289）+ 本地补丁 `config/patches/pdfjs-dist@6.3.289.patch`（84 行，改 `web/pdf_viewer.mjs`）；worker 用 `?url` 导入 `pdf.worker.min.mjs`；cmaps / standard_fonts / wasm 由 `config/build-plugins/pdfjs-viewer-assets.ts` 提供。字节传输：本地文件走自定义协议 URL + `window.api.fs.readPreviewRange` IPC 分段读取（单次上限 4 MiB，`rangeChunkSize` 256 KiB），git / diff 走 base64。宿主耦合：`useAppStore`（仅读 keybindings）、`@/i18n`、`useShortcutLabel`、`@/lib/keyboard/*`、`ime-text-field`、`scroll-cache`（类型依赖 monaco）、`viewer-zoom-request.ts`（会间接拖入大量 store）。
- **分派**：`EditorContent.tsx` 314 + `EditorEditFileSurface.tsx` 394：csv → `CsvPagedViewer`；二进制非图片 → `MediaViewer`；图片 → `ImageViewer`（PDF 在 `ImageViewer.tsx:64` 转 `PdfViewer`）；文本 → `IpynbViewer` 或 **Monaco**（`monaco-editor ^0.55.1`）。扩展名表在 `src/shared/file-preview/file-preview-kind.ts`、`binary-file-extensions.ts`、`editor-language-detect.ts`。
- **HTML 预览不可复制**：`open-editor-html-preview.ts`（117 行）调用 `openFileInBrowserTab`——本地为 `file://` 的**内嵌浏览器标签页**，远程为 `orca-preview://` 自定义协议（`main/browser/document-preview/doc-preview-protocol.ts:65`，CSP 在 `:46-50`）。ORCA 的 guest 是否设 sandbox：未核实。可借鉴的只有“打开前 flush、`beginLinkOpenRequest` 归属、源标签变化取消”的思路。
- 测试：vitest（node 环境为主，DOM 环境未核实）。

## 7. Huhu 现状核对（issue F01–F10，在 `9132640`）

| 编号 | 结论 | 事实（路径相对仓库根） |
| --- | --- | --- |
| F01 | 成立，有细节差异 | `plugins/notes/src/engine/service.ts:26` `SEMANTIC_DIRS` 来自 `KINDS[].dir`（`packages/contracts/src/kinds/index.ts:26-31`：Tasks、Task Runs、Automations、Inbox、Comments）；`:28 isNoteFile` **只检查第一段目录**（嵌套的 `Tasks/` 不被排除）；`:386-400 list()`；`notes.files`（`engine/index.ts:54-61` → `svc.otherFiles()`，`service.ts:116-121` 过滤 `.md`、语义目录、点开头路径段） |
| F02 | 部分成立 | `packages/kernel/src/capabilities/vault.ts:96-106 vault.tree` = `index.entries(prefix)`，条目 `{path,type,size,mtimeMs}`；`vault-index.ts:76-85 treeFrom` 只为文件祖先生成目录条目，**空目录不会出现**；忽略表 `packages/vault/src/watch/snapshot.ts:6-7`（`.git`、`node_modules`、`.huhu`、`.agents`、`.DS_Store`、`Thumbs.db`）；`readBinary` `vault.ts:9 MAX_READ_BYTES=10 MiB`，`:171` 服务端 base64（`exposable:false`）；`vault.tree` 消费者：`plugins/tasks/src/ui/references.ts:15`、`packages/kernel/src/mcp.ts:84`、`packages/workbench/src/gateway/GatewayModule.tsx:39`（文案）、权限表 `permissions.ts:28` |
| F03 | 成立 | `plugins/notes/src/ui/NoteExplorer.tsx:30 buildTree(notes, folders)`；plugins/notes/src 内**没有** `contextmenu` / `onContextMenu`，菜单靠 `…` 按钮（`:143`、`:192` → `p.onMenu`；`NotesModule.tsx:39` 菜单状态，`:241-243` 定位） |
| F04 | 成立 | `packages/editor/src` 共约 3869 行：`MarkdownEditor.tsx` 564、`MarkdownPreview.tsx` 82、`wikilink.ts` 38、`mention.ts` 32、`MermaidBlock.tsx` 51、`editor.css` 64、`editor-cm.css` 884、`vendor/atomic/*`（`inline-preview.ts` 1168、`wiki-links.ts` 521…，MIT，kenforthewin/atomic-editor 0.6.2）；公共导出 `index.ts` 5 行；**消费者**：`plugins/notes/src/ui/{FileCard,NotesModule(类型),NoteDocument,archives/ArchivesViews}.tsx`、`plugins/tasks/src/ui/{TaskDetail,TaskEditor,references(类型)}.tsx`、`plugins/inbox/src/ui/InboxModule.tsx`；`packages/workbench` 不导入 `@huhu/editor` |
| F05 | 部分成立 | `FileCard.tsx` `TEXT_EXT` 含 txt / json / html（`:12/:16/:24`）；文本经 `vault.readFile` 预览（`:73-95`），json 做 `JSON.parse` 诊断；**html 当源码显示**（`:119-133`，只读 MarkdownEditor 源码模式，`.mmd/.mermaid` 走 MermaidBlock）；**pdf 不在任何集合**，落到 `kind:"none"` 提示“请用对应的应用打开”（`:157`） |
| F06 | 成立 | `MarkdownPreview.tsx:18-20 stripFrontmatter` 正则剥离；`packages/vault/src/semantic/frontmatter.ts`：`splitDocument :13`、`joinDocument :25`、`parseFrontmatter :38`、`patchFrontmatter :66`、`replaceBody :90`、`frontmatterScalarSources :98`、`renameFrontmatterKeys :109` |
| F07 | 成立 | `NoteDocument.tsx`（514 行）只有一个组件 `NoteDocument`（`:42`）；`AUTOSAVE_MS=800`（`:11`）；`SaveState`（`:20`）；`doSave :141-160`（`notes.save` 带 `expectedVersion`，`VERSION_CONFLICT` → conflict）；`flush :224-232` + `registerFlush`；草稿 `notes.draft.get :100-104`；外部变更 `:111-128`；工具栏 `:341-352` |
| F08 | 部分成立 | 标签模型是**单选字符串**（`NotesModule.tsx:32`）；`folderView :36`、`openArchiveFolder :160-175`、档案路由 `ui/archives/route.ts`（`ArchiveRoute = home | type | archive`）；`ui/` 文件行数：`NotesModule` 787、`NoteDocument` 514、`NoteExplorer` 293、`NoteInspector` 145、`CommentsPanel` 137、`FileCard` 172、`archives/ArchivesViews` 592 |
| F09 | 成立 | `CommentsPanel.tsx` 137 行；`plugins/notes/src/engine/comments/{anchor,passage-match,service,whitespace-char-ref}.ts`；能力 `comments.list/create/reply/resolve/reopen/relocate/delete`（`engine/index.ts:307-331`）；`CommentDto` 定义位置未核实 |
| F10 | 成立 | `NoteInspector.tsx:46-51` 用 `/^#{1,6}\s+\S/` 逐行扫描原文（围栏代码里的 `#` 会被当标题，未运行验证） |

其他事实：测试方面 `plugins/notes` 没有 UI 测试（UI 靠 e2e），engine 测试约 61 个 `test(`（service 18、links-rewrite 13、comments 13、archives 17）；`tests/e2e` 约 110 个 `test(`；每 Vault 状态目录 `<root>/.huhu`（`packages/vault/src/vault.ts:113`），笔记侧状态 `.huhu/notes/{identities,folders,trashed-identities,favorites}.json`；工作台脏文档设施 `packages/workbench/src/state/flushers.ts`（`registerFlusher/runFlushers/registerDirtyDoc/settleDirtyDocs`）；`ENTITY_CAPS` 在 `packages/workbench/src/engine-client/query.ts:7-14`（note、archive 映射到 `notes. / vault. / archives.`）；Huhu 没有 Tailwind 依赖。

## 8. Huhu 既有决定与规范（将被反转或约束本次工作）

- **D-08**（`archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/decisions.md`）：CM6 单实现 + Atomic inline-preview；**否决 Tiptap / ProseMirror + Yjs + Hocuspocus**（理由：与行号要求冲突、PM ↔ Markdown 往返失真、需额外同步服务）；“若重构换引擎，需写后继”。`product.md:66` 把“可视化 WYSIWYG（ProseMirror）编辑”列为非目标。**D-09**：阅读渲染复用 ORCA `CommentMarkdown` 管线。**D-31**：样式用 Radix + 薄封装，不用 Tailwind（取代 D-17 的 Tailwind / shadcn）。R-21 / R-22（`reuse.md:62-63`）：Atomic 复制。→ 本 change 必须写后继决定（[decisions.md](../decisions.md) OP-D01）。
- 现行样式规范：`@layer theme, tokens, base, vendor, components, shell, modules;`；不分层白名单仅 `vendor-overrides.css` 与 `editor-cm.css`；`!important` 只允许两类且需说明；类名前缀 `hu-` / `shell-` / `notes-` / `editor-`；CodeMirror 运行时注入无层样式。
- 台账 `docs/upstream/ledger.md`：R-09 atomic-editor（MIT，复制并改造）、R-24 OK 批注锚点（GPL-3.0-or-later，已复制到 `plugins/notes/src/engine/comments/`）、R-40~R-42 ORCA（MIT）；`scripts/gen-notices.mjs` 读 `node_modules/.pnpm` 全部包的 license，**不在 ALLOWED 列表则退出 1**，并把台账原样嵌入 `THIRD_PARTY_NOTICES.md`（`release.yml:36` 调用 `pnpm notices`）。编号冲突：`reuse.md` 里的 R-09 是“文件身份”，atomic 在 reuse 中是 R-21——台账以 `ledger.md` 为准，新增条目沿用 `ledger.md` 编号序列。
- `knip.json` 忽略 `vendor/**`、`packages/editor/src/vendor/**`；CI `ci.yml:34` 跑 knip；`pnpm-workspace.yaml`：`apps/* packages/* plugins/* vendor/* examples/plugins/*`；当前 plugins 10 个。

## 9. obsidian-huhu 档案导航（外部工程，只读）

`src/app/contracts/workbench.ts:39 WorkbenchTarget {feature, section?, resourceId?}`；`src/modules/archives/services/generic/workbench.ts`：`navigation()` 为每个类型生成 target，`title(target)` 有 resourceId 用记录名否则用类型名，`panel(target)` 生成视图分组和树（节点 id 经 `target(id)` 映射回 target，按类型分页）；`module.ts:82 resources.open` 调 `shell.open({feature, resourceId})`，`:163` 索引变化调 `shell.refresh()`。状态流：shell 持有当前 target → 调 title / panel 取页面模型 → 点击树节点得到新 target 再 open → 索引变化后 refresh。Huhu 现状：路由由路径决定（`ArchiveRoute`），`NotesModule` 用 `folderView` 旁路切换，侧栏树是路径文件树。
