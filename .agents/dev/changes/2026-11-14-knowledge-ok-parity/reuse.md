# 复用核对（CLAUDE.md“强制执行复用优先原则”）

> 顺序：① Huhu 现有实现 → ② `temp/sources` → ③ 成熟开源依赖 → ④ GitHub 优秀项目 → ⑤ 小范围适配 → ⑥ 自行开发。
> 每行：检查过的文件 / 符号 → 可复用部分 → 不足 → 适配边界 → 验证。检查证据见 [evidence/e0-source-survey.md](evidence/e0-source-survey.md)。**“未核实”是真未核实，S0 补。**
> `temp/sources/open-knowledge` 与 `temp/sources/orca` 均已核实在固定 SHA（`44a2e0a` / `7041ea02`），两者工作区只缺根 `LICENSE`（取 `git show HEAD:LICENSE`）。用户已决定：来源“复制复刻”，编辑器以 OK 为主。

## 1. 主编辑器与 Markdown 保真

| 需要 | ① Huhu 现有 | ② 来源 | ③④ 依赖 / 项目 | 结论 | 适配边界与验证 |
| --- | --- | --- | --- | --- | --- |
| 富文本编辑器总装 | `MarkdownEditor.tsx`（CM6 + Atomic 装饰，564 行）——**不满足**（用户要求 OK 体验；D-08 将被取代） | OK `packages/app/src/editor/TiptapEditor.tsx`（1308）+ `extensions/`（76 文件）+ `editor-cache.ts`（869）+ `editor-panes.ts`（1054） | Tiptap 3（OK 使用 `^3.22.3`） | **② 整体复制**（闭包 861 文件） | `host/` 与 `rich/` 装配；`DocumentContext.tsx`（1868）、`provider-pool.ts`（2121）**不原样复制**：保留 `editor-cache` 的 park / evict 与 `Collaboration` 绑定，其余云协作逻辑（lineage epoch、branch mismatch、auth token、replay-outbox、collab-otel）不带；`DocumentContext` 是**重写为 Huhu 版并保持 `DocumentContextValue` 子集**（S0 spike 量化需要多少字段，未核实） |
| schema / 扩展 / Markdown 保真链 | `packages/vault/src/semantic/frontmatter.ts`（仅 frontmatter）；Huhu 无 Markdown ↔ PM 链 | OK `packages/core/src/extensions/`（~35 文件）、`markdown/`（98 文件 1.6 万行）、`bridge/`+`registry/`（5.2k）、`frontmatter/` | `unified ^11`、`remark-gfm`、`remark-math`、`@handlewithcare/remark-prosemirror 0.1.5`（带补丁） | **② 整体复制** | `packages/editor/src/vendor/open-knowledge/core/`；黄金样本 22 文件 7.5 MB 迁入测试（OP-D16） |
| 文档 ↔ Y.Doc 的“服务端半边” | 无 | OK `server/src/bridge-intake.ts`（240，取约 100 行）、`disk-content-intake.ts`（24）、`persistence.ts:1684-1744`（无编辑不写）、`core/bridge/{apply-diff,diff-lines,compose,normalize}` | `yjs`、`y-tiptap` | **② 摘取复制**（只要上述函数，不复制 `persistence.ts` 其余） | `host/local-doc-provider.ts` 调用；SP-4 做黄金样本往返 |
| 外部变更块级合并 | `NoteDocument` 现有“查看差异 / 保留我的修改” | OK `reconciliation.ts`（888）+ `server-factory.ts:3826-4030`（~200）+ `external-change.ts`（648） | — | **不复制**（Huhu 已有冲突模型）；登记为可选增强 | OP-D03 |
| 撤销 / 重做 | CM6 history | OK：`undoRedo:false` + y-tiptap `yUndoPluginKey`；`undo-isolation.ts`、`source-undo-mode-flip.ts` | — | **② 保持 OK 方式**（随 Yjs 保留） | issue B05：一次撤销正确、不被误禁用——E2E |
| 源码模式 | `MarkdownEditor` 的 CM source 模式 | OK `SourceEditor.tsx`（492，CM6 + `y-codemirror.next`）、`RawMdxFallbackCMView.tsx`（499） | `@codemirror/*`、`y-codemirror.next ^0.3.5` | **② 复制 OK** | 绑同一 Y.Doc；Huhu 现有 CM 依赖版本需与 OK 对齐（S0 比对） |
| `.txt` / `.json` 编辑 | `FileCard.tsx` 只读 `MarkdownEditor`（不可保存） | OK 无对应纯文本编辑器；ORCA 用 Monaco | `@codemirror/*`、`@codemirror/lang-json`（是否在锁文件：未核实） | **⑤ 适配**（CM6 现成扩展装配成 `PlainTextEditor`） | OP-D07；F01–F02 |
| 阅读模式 | `MarkdownPreview.tsx`（marked + DOMPurify，82 行）| OK 无独立阅读模式（只有 wysiwyg / source） | — | **⑤ 适配**：同一 schema 的 `editable:false` Tiptap | `ReadonlyMarkdown`；issue §6.2 “阅读与编辑同一语义” |

## 2. `/` 命令、工具栏、块与表格、剪贴板、输入法

| 需要 | ② 来源 | 结论 |
| --- | --- | --- |
| slash 命令 | OK `extensions/slash-command.ts`（213）、`slash-command/{SlashCommandMenu 164, items 362, apply-item 51, component-items 592, embed-starter-items 164}`、`extensions/suggestion-{allow,ime,floating-ui}.ts`、对应测试 | **② 整体复制**；`component-items` / `embed-starter-items` 里依赖 OK 工作区 API 的项在 S0 逐项归类（本地 / 需适配 / 不适用） |
| 气泡菜单 / 块 UX / 表格控制 / 剪贴板 / 键盘 | OK `bubble-menu/`（18 文件 2220 行）、`block-ux/`、`table-controls/`（1026）、`clipboard/`（44 文件，含测试 12141 行）、`extensions/` 其余 | **② 整体复制** |
| 输入法 | OK `extensions/suggestion-ime.ts`、`lib/ime-composition.ts`（宿主 lib） | **② 复制**；Huhu 现有 `huhu-composition.ts`（12 行）随旧编辑器删除 |
| 评论 UI | OK `comments/`（78 文件，约 35 个源码） | **② 整体复制** |
| 属性面板 | OK `PropertyPanel`（601）、`FrontmatterRow`（759）、`PropertyWidgets`（764）、`PropertyDisclosure`、`PropertyContext`、`AddPropertiesButton`、`AddPropertyNameField`、`ReadonlyPropertyPanel`、`PropertyInlineLinks`、`PropertyDiffBlock` 等约 3163 行 + `lib/use-frontmatter-field.ts`、`properties-collapsed-store.ts` | **② 整体复制**（issue 正文没列，用户要求“YAML 顶部属性”，OK 已有，直接取用）；YAML 编解码见 OP-D17 |
| 图片上传 / 外链预览 / 内部预览 | OK `editor/image-upload/`、`link-preview/` | **② 复制 + 宿主适配**：上传写 Vault 附件目录；外链预览联网需策略（spec 待决 Q3） |
| lint / audit 面板 | OK `editor/lint-config-client.ts`、`validation-audit-client.ts` + 服务端 `lint-routes` 437 / `lint-write-routes` 528 / `lint/audit` 352 / `validation-audit` 488 / `markdownlint` | **待用户**（spec Q2）：默认“本期不接，登记为不适用”，因为它是服务端能力；若用户要保留，则 ⑤ 把服务端 lint 搬进 Engine（≈1.9k 行 + 依赖） |

## 3. 文件树、右键菜单、图标

| 需要 | ① Huhu | ② 来源 | ③ 依赖 | 结论 |
| --- | --- | --- | --- | --- |
| 树 | `NoteExplorer.tsx`（293，自制树，无 contextmenu） | OK `components/FileTree.tsx`（**3469** 行）+ `file-tree-{adapter 430, operations 287, selection 161, rename-validation 47, utils 237, shared 106, density 70, listing-transport 78}`、`use-file-tree-listing.ts`（314）、`OkFileTree.tsx`（160），34 个相关测试 | `@pierre/trees 1.0.0-beta.4`（beta） | **② 整体复制** + 宿主适配；数据源换成 `vault.list`（OP-D10）；“只显示 Markdown”开关不带 |
| 菜单 | `NotesModule` 手写浮层 | OK `FileTargetMenuItems.tsx`（259，原语可注入）+ `EditorTabTargetMenuItems.tsx` | Radix `DropdownMenu` | **② 复制**；Hide→仅视图隐藏（OP-D11）；Share / OpenWithAi / 账户云项不带（登记） |
| 图标 | 无统一映射 | OK `file-entry-icon.tsx`（175）+ `file-tree-extension-badge.ts`（140）+ `registry/lucide-svg.ts`（57） | lucide-react（Huhu 已有）；Material Icon Theme 映射（对照） | **② 摘取复制 + 共享化**（OP-D13） |
| `@` 候选与排序 | `plugins/tasks/src/ui/references.ts`（稳定回调、候选刷新、`scoreText`） | OK `wiki-link-suggestion.ts`、`PageListContext.tsx` | — | **① 抽取共享**（多消费者部分）+ ② 取 OK 的 UI 交互 |

## 4. 评论持久化与锚点

| 需要 | ① Huhu | ② 来源 | 结论 |
| --- | --- | --- | --- |
| 持久化、能力 | `plugins/notes/src/engine/comments/{anchor,passage-match,service,whitespace-char-ref}.ts` + `comments.list/create/reply/resolve/reopen/relocate/delete`（`engine/index.ts:307-331`）；R-24 已从 OK 复制过锚点算法 | OK `core/comments/{passage-match 335, leaf-text 84}`、`server/comments/{comment-api 340, thread-store, anchor 192}`、`app/comments/store.ts`（529）、`comments-client.ts`（140） | **① 沿用 Huhu 持久化**；② 只复制 UI 与前端 store；`comments-client.ts` 换成适配到 `comments.*` 的实现；`CommentThread` ↔ `CommentDto` 字段对照在 S4 第一步做（`CommentDto` 定义位置：未核实） |

## 5. 文件查看器

| 需要 | ① Huhu | ② 来源 | ③ | 结论 |
| --- | --- | --- | --- | --- |
| PDF | 无（`FileCard` 提示“请用对应的应用打开”） | ORCA `PdfViewer 273 / PdfFind 182 / pdf-document-loader 172 / pdf-viewer-session 252 / pdf-view-position 121 / pdf-scale-preference 105+19 / pdf-js-document-options 17 / use-pdf-viewer-find-shortcut 56 / use-viewer-zoom-commands 27` + `pdfjs-dist 6.3.289` 补丁（84 行）+ `pdfjs-viewer-assets.ts` 构建插件 | `pdfjs-dist` | **② 摘取复制**（≈19 文件 / 1.6k 行，MIT）；`readPreviewRange` IPC → `vault.readRange`；**不复制** `viewer-zoom-request.ts`（拖入大量 ORCA store） |
| HTML | `FileCard` 当源码显示；Huhu 已有 `huhu-app` 协议处理（`apps/desktop/src/main/index.ts:31` 附近，**未核实细节**） | ORCA `open-editor-html-preview.ts`（117）依赖内嵌浏览器标签页——**入口不可单独复制**；其 `main/browser/document-preview/doc-preview-protocol.ts:65`（CSP `:46-50`）**可复用性未核实** | — | **S7 SP-7 先评估 ① + ② 的协议处理能否复用，再决定 ⑤ 适配或 ⑥ 自研**（OP-D08）；借鉴“flush / 请求归属 / 取消”思路 |
| 图片 / SVG / 二进制元信息 / 音视频 | `FileCard`（图片 data URL、SVG、元信息） | ORCA `ImageViewer`（64 行处 PDF 转 PdfViewer）、`MediaViewer`、`PanZoomImageDialog` | — | ① 保留现有可用能力，音视频 / 缩放按需 ② 摘取（S7 定，不强求） |
| 文件分派 | `FileCard.tsx` 的 `TEXT_EXT` 集合 | ORCA `EditorContent.tsx`（314）、`EditorEditFileSurface.tsx`（394）、`file-preview-kind.ts`、`binary-file-extensions.ts` | — | **⑤ 借鉴分派结构**，不复制其 Git / WSL / 远程 / Monaco 路径 |

## 6. 档案导航

| 需要 | ① Huhu | ② 来源 | 结论 |
| --- | --- | --- | --- |
| 档案业务 | `plugins/notes/src/engine/archives/{service 424, capabilities}.ts`、`ui/archives/{ArchivesViews 592, TypeEditorDialog 103, route 30, i18n 64, icons 18}` | — | **① 保留**，不恢复独立插件 |
| target 驱动的页面 / 标题 / 侧栏 | `NotesModule` 的 `folderView` 旁路 + `route.ts` | obsidian-huhu `src/app/contracts/workbench.ts:39 WorkbenchTarget`、`modules/archives/services/generic/workbench.ts`、`module.ts:82/:163` | **⑤ 借鉴交互模型**，用 OP-D12 的 `DocTab` 实现；不搬宿主 |

## 7. 后端能力与基础设施

| 需要 | ① Huhu 现有 | 缺口 | 结论 |
| --- | --- | --- | --- |
| 读写、CAS、原子写、OperationLog、回收站、重命名 / 移动 + 双链重写 | `NotesService.read/save`（`expectedVersion`）、Vault 原子写、`OperationLog` | 无 | **① 复用** |
| 目录列举 | `vault.tree`（索引快照，无空目录、忽略 `.huhu/.git/…`） | 空目录、惰性展开、受保护目录元信息、分页 | **扩展** → `vault.list`（OP-D10），一次更新所有消费者 |
| 范围读取 | `vault.readBinary`（10 MiB 全量 base64） | PDF 大文件 | **新增** `vault.readRange`（OP-D09） |
| 每 Vault UI 偏好 | `<stateDir>` 下的设施（笔记侧 `.huhu/notes/*.json`、`settings.get`） | `hiddenPaths`（类型化字段） | **扩展**已有 |
| 实体失效 | `engine-client/query.ts` `ENTITY_CAPS` + `entity.changed` | 目录列举的失效键 | **扩展**已有 |
| 脏文档、flush | `workbench/src/state/flushers.ts` | 无 | **① 复用**，`DocumentSession` 注册 |
| YAML | `packages/vault/src/semantic/frontmatter.ts` | 浏览器可用的纯入口 | **① 复用 / 抽出纯模块**（OP-D17） |
| 导航贡献设施 | `workbench` 内（具体文件：未核实） | 档案 / 文件 `DocTab` 标签 | S1 核实后复用 |

## 8. 明确不复制 / 不采用（与 issue §3.4 一致，并加上调查新发现）

- OK 账户、组织、协作服务、Hocuspocus 服务端、presence（`presence/` 2554 行）、sharing / Share、OpenWithAi / handoff、`provider-pool` 的 lineage / branch / auth / outbox / otel 部分、`y-indexeddb`。
- OK 的 `.okignore` 隐藏语义、`showOnlyMarkdownFiles` 开关。
- OK 的 `globals.css` 里主题变量与 `color-themes.generated.css`（映射到 Huhu token，不整体搬）。
- ORCA 的 Git worktree / WSL / 远程 / Monaco / 浏览器标签页 / store / i18n。
- Obsidian 虎符的 schema / 实体迁移 / 宿主。
- 任何第二套文档数据库、富文本 JSON 真源、档案实体库。

## 9. 依赖增量（S0 固化为 `closure-manifest.json`）

- 新增的主要 npm 依赖（OK 闭包 126 个包中的关键项）：`@tiptap/*`（`^3.22.3`，含 `extension-drag-handle`、`y-tiptap`）、`prosemirror-*`、`yjs ^13.6.30`、`y-codemirror.next ^0.3.5`、`y-protocols`（awareness，未核实是否随 yjs 传递）、`unified ^11 / remark-*`、`@handlewithcare/remark-prosemirror 0.1.5`、`yaml`、`@pierre/trees 1.0.0-beta.4`、`@lingui/{core,react,babel-plugin-lingui-macro,vite-plugin}`、`tailwindcss ^4.2.2`、`@tailwindcss/vite`、`tw-animate-css`、`tailwind-scrollbar`、`radix-ui`、`cmdk`（command）、`sonner`（OK 用；Huhu 现有 toast 方案核对：未核实）、`pdfjs-dist 6.3.289`。
- **补丁**：`@tiptap/extension-drag-handle@3.22.3`、`@tiptap/y-tiptap@3.0.3`、`@hocuspocus/provider@4.0.0-rc.1`（本地不用 provider 则不需）、`@handlewithcare/remark-prosemirror@0.1.5`、`y-prosemirror@1.3.7`（是否登记：未核实）、`pdfjs-dist@6.3.289`。Huhu 的 pnpm 补丁机制（`patchedDependencies` 位置）：未核实，S0 确认。
- 版本对齐（已核实）：React 19 / Vite 8 / Electron 44.9.1 双方同主版本；TypeScript：Huhu `^5.9.0`，OK：未核实。
