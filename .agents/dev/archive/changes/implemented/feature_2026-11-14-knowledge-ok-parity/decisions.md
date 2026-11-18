# 决定记录（OP-D01～D18）

> 范围：本 change 的技术与产品取舍。前缀 OP = Open-knowledge Parity。每条写：决定、依据（证据在 [evidence/e0-source-survey.md](evidence/e0-source-survey.md)）、被拒绝的替代、接受的代价、何时回头检查。
> 状态词：**定**＝用户已明确要求；**建议**＝我的方案，S0 用实测验证，不通过按“回退”改；**待用户**＝影响范围 / 许可 / 数据，需要你确认（汇总在 [spec.md](spec.md)“待决问题”）。
> 归档时：OP-D01 取代 `D-08`（并连带 D-09、D-31 在编辑器范围内的部分），按 `dev-archive` 写成 `notes/decisions/2026-11-14-knowledge-editor-ok.md`，并更新 `notes/context/design-system.md`、`product.md` 的非目标。

## OP-D01 主编辑器换成 OK 的 Tiptap 3 / ProseMirror 编辑器（取代 D-08）　**定**

- 用户在 issue #2 评论里明确：“直接复制他的，重构，技术栈也可以重构”，并说明本补充优先于正文里的技术选型限制。
- 依据：D-08 否决 Tiptap / PM 的理由是 **(a)** 与行号要求冲突，**(b)** PM ↔ Markdown 往返失真，**(c)** 需要额外同步服务。现在 (a) 产品不再以行号为主要体验（源码模式仍保留 CodeMirror 行号）；(b) OK 的 `MarkdownManager` + 位置 / 源文本保真链 + 22 个黄金样本（7.5 MB）就是为解决往返失真而建，我们用它的 `markdownSemanticallyUnchanged` 保证“无编辑不写盘”；(c) 见 OP-D02，同步服务不需要。
- 被拒绝：继续在 Atomic / CodeMirror 装饰层上模拟富文本（issue §3.4 明确不要）；只装 Tiptap StarterKit 自己补（会丢 OK 的保真与细节）。
- 代价：编辑器闭包 861 文件 / 约 12.3 万行 / 126 个 npm 包进入仓库；产品文档 `product.md:66` 的非目标要改；D-08 / R-21 / R-22 被取代。
- 回头检查：S0 的“闭包能在 Huhu 构建里编译并通过 typecheck + 黄金样本往返”不成立 → 停止并向用户汇报（这是整个 change 的闸门）。

## OP-D02 保留 Yjs，在渲染进程本地运行；不要 Hocuspocus 服务器　**建议（S0 闸门）**

- 事实：OK 的文档真源是 `Y.Text('source')`（原始 Markdown 字节），`Y.XmlFragment` 是派生的 PM 视图；撤销全部由 y-tiptap 接管（`undoRedo:false`）；属性面板、块操作、lint-fix、source ↔ wysiwyg 切换都绑在 Y 事务上。去掉 Yjs 要改 52 个非测试文件、约 10 万行里的 1.03 万行（仅 `editor/` 内），还要重做撤销与双向同步。issue 评论也明确允许：“如果移植闭包需要 Yjs……可以保留 / 引入并完成本地集成；不能仅为回避依赖重新发明文档同步、选区映射或撤销历史”。
- 决定：每个打开的文件在渲染进程里有一个 `Y.Doc`，由 **`LocalDocProvider`** 持有（最小接口 `{document, configuration:{name}, awareness, on/off('synced'), destroy()}`，`forceSync` 空实现；awareness 是本地孤立实例）。**没有网络、没有 Hocuspocus、没有 y-indexeddb**。`Y.Text('source')` 只是 `DocumentSession` 里那份 Markdown 的**内存镜像**，不是第二份持久真源（见 OP-D03）。
- 要从 OK server 复制进来的“服务端半边”很小：`bridge-intake.ts` 的 `composeAndWriteRawBody / replaceRawBody`（约 100 行）、`disk-content-intake.ts`（24）、`core/bridge/{apply-diff 99, diff-lines 38, compose 77, normalize 407}`、`core/extensions/frontmatter.ts`（28）、`persistence.ts:1684-1744` 的“语义无变化则不写”判断。**不复制**：`persistence.ts` 其余、`reconciliation.ts` 888 行块级三方合并、`server-factory.ts` 的文件监听 / receipt（Huhu 自有 watcher 与会话冲突模型，见 OP-D03）。
- **真正的耦合与自研量（调查补充，写死阈值）**：93 个 OK 文件导入 `provider-pool` / `DocumentContext` / `editor-cache` / `PageListContext`（含 `TiptapEditor`、`SourceEditor`、`FileTree`、`EditorTabs`、`OutlinePanel`）；`DocumentContext.tsx`（1868 行）与 `provider-pool.ts`（2121 行，`:942` 构造 Hocuspocus）**只能“去掉云协作部分后保留其余”，不是简单复制**——这是一块未登记的自研 / 适配工作。拟定阈值（**用户可调，但 S0 开始前写定，S0 不得事后放宽，放宽需用户确认**）：对 vendor 文件的补丁**不超过 150 个文件**（约占 861 的 17%）；替换 / 重写 `DocumentContext` 与 `provider-pool` 的 Huhu 侧代码**不超过 1200 行**；超过任一阈值 → 停止并汇报，重新评估“去 Yjs”或缩小范围。S0 用 SP-6（真实 Electron 运行时闸门）测量，而不只是编译通过（SP-1）。
- 被拒绝：**去 Yjs**（上面的代价）；**整套 Hocuspocus 内嵌到 Electron 主进程**（多一个 WS 服务、多一层序列化，且本地单用户没有价值）。
- 代价：渲染进程里多一份 Y.Doc 内存（OK 的 `editor-cache.ts` `MAX_CACHE=10` 的 park / evict 策略保留，限制数量）；补丁文件 4 个要带进 Huhu（OP-D15）。
- 回头检查：S0 spike SP-4 与 SP-6（hydrate → serialize 对黄金样本字节级相等 + 无编辑不写盘）。不通过且无法修补 → 走“去 Yjs”方案，并重新估算 S2/S3。

## OP-D03 DocumentSession 是唯一写盘与冲突权威；Y.Doc 只是编辑表示　**定（issue 要求）+ 建议（接口）**

- issue §4：同一文件的富文本 / 源码 / 档案渲染是不同视图，不能有互相覆盖的两个权威文本缓冲区。
- 决定：从 `NoteDocument.tsx` 抽出 `DocumentSession`（`plugins/notes/src/ui/documents/`）：持有 `{path, text(最近一次确认的 Markdown), baseVersion, dirtyRevision, inflightSave, draft, saveState}`，复用现有 `notes.save`（`expectedVersion` CAS）、草稿、冲突对话、`registerFlush`。编辑器适配层 `bindSession(session, provider)`：
  1. **装载**：session.text → `applyDiskContentToDoc` 写入 Y.Doc，`synced` 事件触发；
  2. **编辑 → 会话**：监听 `Y.Text('source')` 变化，防抖 300 ms（沿用现有 `onText` 节奏）后 `session.setText(source, {origin:'editor'})`；自动保存仍是会话的 800 ms；
  3. **会话 → 编辑**：只有外部版本被接受（干净缓冲的外部修改、冲突里选“用磁盘版本”、恢复历史版本）才用 `replaceRawBody`（`FILE_WATCHER_ORIGIN`，不进撤销栈）写回 Y.Doc；
  4. **dirty 外部修改**：不使用 OK 的块级 `reconcile`，沿用 Huhu 现有“查看差异 / 保留我的修改”冲突处理（issue §6.6）；
  5. **无编辑不写盘**：保存前 `markdownSemanticallyUnchanged(base, current)` 命中则不调 `notes.save`（对应 OK `persistence.ts:1744`）。
- **会话注册表与生命周期**：`DocumentSessionRegistry` 按 `(vaultId, path)` 登记并**引用计数**，生命周期**长于任何组件**（不挂在 `NoteDocument` 上）：同一 `index.md` 的 Markdown 标签与档案记录标签、`editor-cache` 里 park 着的最多 10 个编辑器都引用同一个会话（E04）；引用归零且无未保存内容、且 flush 完成后才销毁。
- **flush 必须先排空编辑 → 会话的 300 ms 防抖**，再保存；否则关闭 / 切标签 / 切 Vault 会丢最后一段输入（`flush()` = `provider.flushPending()` → `session.save()`，测试断言“输入后立刻关闭，磁盘内容包含最后一个字符”）。
- 保存回执只清除对应 `dirtyRevision`，新输入不会被旧回执标为已保存（issue C06）。
- 被拒绝：让 Y.Doc 自己持久化（重造第二套保存/冲突）；直接复制 OK 的 `reconcile`（888 行 + `server-factory.ts` 约 200 行，且和 Huhu 冲突 UI 重复）。
- 可选增强（不在本期验收内）：脏缓冲遇外部修改时用块级 `reconcile` 尝试自动合并；登记在 plan 的“后续”。

## OP-D04 宿主适配：一个“OK 宿主接口” + 一张 HTTP 面适配表，vendor 里的 `fetch('/api/…')` 只做机械替换　**建议**

- 事实：编辑器 / 评论 / 文件树 / 属性面板共约 26 个非测试文件直接 `fetch('/api/…')`，另有 `window.okDesktop`（107 个文件，实际方法集 S0 清点）。
- 决定：`packages/editor/src/host/` 提供 `OkHost`（`pages()`、`headings()`、`links()`、`tags()`、`upload()`、`linkPreview()`、`comments`、`files`（创建 / 重命名 / 移动 / 复制 / 删除 / 回收站）、`desktop`（reveal、复制路径、打开方式、外部链接）、`principal()`、`locale()`、`toast`、`prefs`）。vendor 内的 `fetch('/api/x')` 统一替换为 `hostFetch('/api/x', init)`（**机械补丁**，登记在 `PATCHES.md`，用脚本可重放），`hostFetch` 是一张 `(method, path-pattern) → handler` 路由表，handler 调 Huhu Engine（Dispatcher 能力）。这样 vendor 代码对“HTTP 形状”的假设不动，适配集中在一个文件里，可单测。
- 被拒绝：逐个把 26 个文件改成调用 Huhu 能力（补丁散、与上游差异大、升级难）；在 `window.fetch` 上全局拦截（污染其他模块，难测）。
- 需要新增的 Huhu 能力在 S1 / S5 / S7 清点，原则：**优先扩展已有能力，不另造并行服务**（见 [design.md](design.md) §6）。

## OP-D05 样式：Tailwind v4 **限定在 `.ok-root` 容器内**接入，层放进 `vendor` 子层；不引入全局变量与全局 reset　**建议（S0 spike SP-2，含断言）**

- 事实：OK 组件全部是 Tailwind utility class，`globals.css` 7079 行（含 `@layer base`（`:491`）、`@layer components`（`:6253`）、`@theme` 两处共约 3300 行、35 处 `@apply/@theme`）；Huhu 无 Tailwind，根上已有同名变量（`--font-mono`、`--radius-*`、`--shadow-*`、`--muted`、`--accent`，`themes.generated.css`；其中 **`--muted` 在 Huhu 是文字色，在 shadcn 是背景色**），层序 `theme, tokens, base, vendor, components, shell, modules`，且**十余个样式文件第一行都重复这条层序声明**（`notes.css:1` 等）。issue 评论放开了样式技术选择，但要求“同变更内更新规范、构建和检查”，并要求“避免无关页面受到全局样式污染”。
- 决定：
  1. **层放进 `vendor` 的子层，不新增顶层层名**：`@import "tailwindcss/theme.css" layer(vendor.ok-theme)`、`@import "tailwindcss/utilities.css" layer(vendor.ok-utilities)`、OK 自己的 base / components 规则改放 `vendor.ok-base` / `vendor.ok-components`。这样 `index.css` 的顶层层序声明**不变**，十余个文件第一行的重复声明不用动；子层顺序在 `ok-globals.css` 里声明（S0 验证 `@import … layer(a.b)` 在 Vite 8 / Lightning CSS 下行为，不可行则退回新增顶层 `ok-*` 层并由 S2a 用脚本一次改全部文件的首行）。
  2. **变量与 base 都收进 `.ok-root`**：OK 的 `:root`/`.dark` 变量、shadcn 变量、Tailwind `@theme` 产出的 `--color-* / --spacing / --radius-*` 一律作用域化到 `.ok-root`（`@theme` 用 `static`/`inline` 选项与选择器改写，S0 验证 Tailwind 不再向 `:root` 输出），**Huhu 根变量不被覆盖**；OK 的 `@layer base` 里对元素选择器的规则全部改写为 `.ok-root` 后代；**不导入全局 preflight，改为 `.ok-root` 作用域的 preflight 子集**（box-sizing、按钮 / 输入 / 标题的重置），因为 Huhu 的 base 元素样式会渗入 OK 组件。所有 OK 渲染的根（编辑器、评论、文件树、属性面板、slash / 气泡 / 对话框的 portal 容器）必须挂 `.ok-root`；portal 目标用 `.ok-root` 的专用容器。
  3. OK 的 `@custom-variant dark (&:is(.dark *))` 改为 Huhu 的 `data-mode="dark"`；颜色 / 圆角 / 阴影 / 字体通过 `ok/token-map.css`（只写在 `.ok-root` 上）映射到 Huhu token，**不整体搬 `color-themes.generated.css`**。
  4. `@source` 覆盖**所有 OK vendor 子树**：把 OK 的全部 vendor（含文件树）放在 `packages/editor/src/vendor/open-knowledge/` 下（S5 往其 `app/components/` 子目录写，见 plan 写入边界），一个 `@source` glob 即可；ORCA 的 PDF 不用 Tailwind。
- **守护**：`check-ok-class-collisions` 扩展为三类交集——(a) Tailwind 产出的类名 ∩ Huhu CSS（`components/shell/modules` 层）类名；(b) Tailwind 产出的类名 ∩ **Huhu TSX / HTML 里出现但没有 CSS 规则的类 token**（如 `hidden`、`truncate`，会被 utilities 意外命中）；(c) `.ok-root` 之外出现 OK 的变量名。SP-2 增加两条断言：**Huhu 根变量求值前后不变**（对一组关键变量在 `:root` 上取 `getComputedStyle`，接入前后相同）、`visual:compare rc4` 对非知识库屏幕 0 差异。`check-css-layers` 只登记“`vendor.ok-*` 子层文件”，不开放无层文件；不新增 `!important`。
- 被拒绝：把 Tailwind 类名全部手写成 `editor-*` 语义 CSS（issue §11.3 的原方案；数千处类名，违背“直接复制”，SP-2 不通过时回退为“只对 FileTree / 评论 / 属性面板手写，核心编辑器区域保留 Tailwind”）；全局 `@import "tailwindcss"`（preflight + `:root` 变量会改 Huhu 全局）；新增顶层 `ok-*` 层（要改十余个文件的首行；仅作为子层方案不可行时的退路）。
- 代价：D-31 在编辑器包范围内被取代；`design-system.md` 要增加“`.ok-root` 与 `vendor.ok-*` 子层”一节；构建多一个 Tailwind 编译步骤（`@tailwindcss/vite`）。

## OP-D06 国际化：保留 Lingui，用 OK 现成的 `zh-Hans` / `en` 目录；语言取自 Huhu 设置　**建议（S0 spike SP-3）**

- 事实：61 个文件用 Lingui 宏；OK 已有 13 种语言目录，`zh-Hans` 与 `en` 各 4064 条；Huhu 各插件各有 `i18n.ts`。
- 决定：用 `@lingui/core` + `@lingui/react` + Vite 宏插件（OK 自己的 `vite.config` 就是 Vite 8，S0 照搬配置）；编辑器包只带 `en` 与 `zh-Hans` 两个目录（`zh-Hant` 可选，其余语言不带），`locale()` 由 Huhu 设置决定；**不**把 Lingui 推广到 Huhu 其它模块。
- 被拒绝：用 codemod 把 61 个文件的宏改成 Huhu 的 `t()`（补丁量大、丢失现成翻译）；只用英文（Huhu 默认中文）。
- 代价：两套 i18n 机制并存（Lingui 只在 `@huhu/editor` / vendor 范围）；Vite 构建要装 `@lingui/babel-plugin-lingui-macro` 并让 plugin-react 走 babel（构建时间 S0 记录）。

## OP-D07 JSON / TXT / 源码模式继续用 CodeMirror 6（OK 的 `SourceEditor` 与新的纯文本编辑器），不引入 Monaco　**建议**

- 事实：OK 的源码模式就是 CM6 + `y-codemirror.next`；ORCA 文本编辑用 Monaco（`monaco-editor ^0.55.1`，体积大）。issue 评论说 CodeMirror 不再是必须保留的选型，“有合适实现就直接复用”。
- 决定：Markdown 的源码模式 = OK `SourceEditor`（绑同一个 Y.Doc）；`.txt` / `.json` = `PlainTextEditor`（`packages/editor/src/plain/`，CM6，直接 `@codemirror/*`，JSON 加语法高亮与 lint 诊断，**不绑 Y**，状态由 `DocumentSession` 直接持有）。不为 ORCA 的 Monaco 路径再引入第二个源码引擎。
- 代价：`PlainTextEditor` 是少量新代码（预计 < 300 行，装配现成 `@codemirror/*`，不是自造编辑器）。

## OP-D08 HTML 预览：先评估 ORCA 的 `doc-preview-protocol` 与 Huhu 现有 `huhu-app` 协议处理的可复用性，再在“协议 + sandbox iframe”与“独立分区的隔离视图”之间按安全用例选一个　**建议（S7 开头 SP-7 定案）**

- 事实：ORCA 的 `open-editor-html-preview.ts` 把 HTML 交给**内嵌浏览器标签页**（本地 `file://`，远程 `orca-preview://`），该入口不可单独抽出（已核实）；但其主进程的 `main/browser/document-preview/doc-preview-protocol.ts:65 handleDocPreviewRequest`（CSP 在 `:46-50`，`no-store`）可能可复用（**未核实**，S7 SP-7 评估）；Huhu 已有 `huhu-app` 协议（`apps/desktop/src/main/index.ts:31` 附近注册，**`registerSchemesAsPrivileged` 只能调用一次，新 scheme 必须与它合并在同一次调用里**）。
- 候选：
  - **(a) `huhu-preview` 协议 + `<iframe sandbox="allow-scripts">`**（不给 `allow-same-origin`）。需要额外硬化：`will-frame-navigate`（不是只拦主框架的 `will-navigate`；`new-window` 事件已不存在，改用 `setWindowOpenHandler`）与 `session.webRequest` 全拒非 `huhu-preview:` 的请求（`connect-src 'none'` 拦不住 iframe 自己导航到 `https://…?q=…` 的外发）；禁止下载；WebRTC 不受 CSP 约束，需按 webContents 设 `setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` 并拒绝全部权限请求；跨源 iframe 加载模块脚本 / 字体需要 CORS 头；开发模式（Vite dev server origin）下 `frame-ancestors` 的来源不同；`.huhu` / `.git` 等受保护目录在预览协议里同样拒绝。
  - **(b) 独立 partition 的 `WebContentsView`（或 `<webview>`）**：无 preload、无 `nodeIntegration`、独立 session，只允许 `huhu-preview:` 协议，`webRequest` 在该 session 上全拒其余；权限请求全拒；窗口 / 下载 / 导航在 session 与 webContents 层统一拦截。隔离更强，代价是嵌入布局与焦点管理更复杂、需要主进程管理视图生命周期。
- 决定规则：S7 开头 SP-7 用 F05 的完整安全用例集（`fetch` / XHR / 外部 `import()` / `postMessage` / `top` 导航 / iframe 自导航 / `window.open` / WebRTC / 下载 / `file://` / `../` / 符号链接逃逸 / 受保护目录）同时跑 (a)(b)，**选“用例全过且配置最简单”的一个**；(a) 无法堵住任一项时直接选 (b)。无论哪个，预览内容 = 会话已确认缓冲，相对资源走 Vault 路径守卫，外部链接走现有“打开外部链接”。
- 被拒绝：`srcdoc` + `<base>`（相对资源绕过路径守卫）；`file://`（绕开守卫）；去掉全部脚本只渲染静态 HTML（违背 issue §10.3 “完整预览”）。
- 回头检查：S7 的代表页面（含 `<script>`、相对 CSS / 图片）与恶意页在真实 Electron 里验收。

## OP-D09 PDF 复制 ORCA 最小闭包；读取用受控范围读取，不扩大 `readBinary`　**建议**

- 决定：复制 `PdfViewer / PdfFind / pdf-document-loader / pdf-viewer-session / pdf-view-position / pdf-scale-preference(+storage) / pdf-js-document-options / use-pdf-viewer-find-shortcut / use-viewer-zoom-commands`（约 19 文件 / 1.6k 行，MIT，保留 LICENSE 与来源声明），带 `pdfjs-dist 6.3.289` 与其 84 行补丁及 `pdfjs-viewer-assets` 构建插件（cmaps / standard fonts / wasm 本地打包，**不联网**）。把 ORCA 的 `readPreviewRange` IPC 换成 Huhu 新增能力 `vault.readRange({path, offset, length})`（单次 ≤ 4 MiB，路径守卫 / 权限与 `vault.readFile` 同级，`exposable:false`），loader 经 `huhu-preview` 协议或 IPC 取字节。ORCA store / i18n / 快捷键依赖换成窄接口。
- 被拒绝：把 `readBinary` 的 10 MiB 限制放开（全量 base64 在主进程与渲染进程各占一份内存）；起独立文件服务器。
- 注意：`viewer-zoom-request.ts` 会间接拖入大量 ORCA store，**不复制**，缩放命令用 Huhu 的快捷键系统重写那一小块（约 30 行）。

## OP-D10 资源目录：新增惰性目录列举 `vault.list`；`vault.tree` / `notes.files` 在旧文件树被 S5 替换之前保留，S5 结束时删除（对外接口变化见 spec Q8）　**建议**

- 事实：`vault.tree` 来自内容索引快照，忽略 `.git / .huhu / .agents / node_modules`，且不含空目录；`notes.files` 在服务层再过滤一遍语义目录与点路径。
- 决定：`vault.list({dir, cursor, limit, includeProtected})` 直接读文件系统（路径守卫、Unicode / 大小写规范化、符号链接 realpath 检查），返回 `{entries:[{name,path,kind:'file'|'dir'|'symlink',size,mtimeMs,protected?:'internal'|'git'|…}], nextCursor, total?}`，**空目录与点目录都返回**，内部受保护目录带 `protected` 标记（可见、不可写）。监听 / 内容索引 / 目录列举三套过滤规则分开维护（issue §5.1）。`vault.tree` 的消费者（tasks 的 `references.ts`、MCP `huhu://notes/recent`、权限表、`GatewayModule` 文案）逐个迁到 `vault.list` 或“索引搜索”；**现有的旧文件树（`NotesModule` 仍调 `notes.files`，`plugins/notes/huhu-plugin.json:42` 也登记了它）在 S5 被替换之前不能失去数据源**，所以 `notes.files` / `vault.tree` 的删除（或 `vault.tree` 改名 `vault.indexEntries`）放到 **S5 结束时**一次完成；`vault.tree` 改名 / 删除会改变 MCP / CLI / 权限组的对外接口，需要用户确认（spec Q8）。
- 被拒绝：直接去掉快照忽略表（全量递归、`.huhu` 写入回声、敏感内容被索引）；让渲染进程直接读 `node:fs`。
- 缓存 / 失效：目录列举结果挂到 `engine-client/query.ts` 的 `ENTITY_CAPS`（新增 `dir` 实体或扩展 `note` 的前缀映射），文件监听发 `entity.changed`。

## OP-D11 “隐藏”＝每 Vault UI 偏好里的 `hiddenPaths`，仅影响文件树；不复制 OK 的 `.okignore` 语义　**定（issue §5.2）**

- OK 的 Hide 写 `.okignore`（`FileTree.tsx:605-613`），会让该路径从索引 / 搜索消失，与 issue 要求相反。决定：`hiddenPaths: string[]`（规范相对路径，目录规则作用于子树）存在每 Vault 的 UI 偏好（`<stateDir>` 下，类型化字段，不写 YAML，不手拼 `.huhu`）；`@`、双链、搜索、已打开标签不使用它；重命名 / 移动由 `OperationLog` 回调重定位规则；外部重命名按路径规则处理，不猜测。

## OP-D12 标签是判别联合，档案首页 / 类型 / 记录是真实视图标签　**定（issue §9.2）**

- `type DocTab = {kind:'file', path} | {kind:'archives-home'} | {kind:'archive-type', type} | {kind:'archive-record', type, name}`，带 `vaultId`；统一标签条，活动标签决定侧栏上下文（文件树 / 档案树），文件树与档案树展开状态分别记忆；去掉 `folderView`。借鉴 obsidian-huhu 的 `WorkbenchTarget` 思路（target 驱动 title / panel / 侧栏），不搬其宿主。

## OP-D13 文件图标 = lucide + OK 的 Markdown 图形 + 一张静态扩展名表　**建议**

- 复制 `file-entry-icon.tsx` 的 `MarkdownFileIcon` 与 `file-tree-extension-badge.ts` 的角标逻辑，扩展名表放 `packages/ui/src/components/FileIcon.tsx`（共享入口）；不引入 Material Icon Theme 运行时（issue §10.4）。树里的 pierre sprite 通过 `lucide-svg.ts` 转换，需与共享表同源。

## OP-D14 许可证与来源登记：同为 GPL-3.0-or-later，复制即按台账登记　**建议（待用户确认一句话）**

- Huhu 与 OK 同为 GPL-3.0-or-later，复制在许可证上同向；ORCA 是 MIT，需保留其 LICENSE 与版权声明。要做：`docs/upstream/ledger.md` 新增条目（按“文件级清单”粒度，附 SHA、原路径、目标路径、性质、补丁编号）；`scripts/gen-notices.mjs` 对新增的 126 个 npm 包通过（OK 的 `THIRD_PARTY_NOTICES.md` 含 LGPL-3.0 / OFL / CC-BY / PSF，Huhu 的 `ALLOWED` 列表要逐个核对，不放宽白名单来“让它过”，除非逐包记录理由）；两个来源工作副本的 `LICENSE` 在工作区被删除，**复制许可证全文取自 `git show HEAD:LICENSE`**，不从工作区取。
- 待用户：确认“用 GPL-3.0-or-later 分发 Huhu”是既定事实（`package.json` 与根 `LICENSE` 已如此）——若有闭源 / 双许可计划，本方案要重审。

## OP-D15 vendor 目录策略：原样复制 + 补丁登记 + 单独的检查口径　**建议**

- 目录：`packages/editor/src/vendor/open-knowledge/{core,app}/…` 保持上游**相对目录结构**（便于 diff 与升级），入口适配放 `packages/editor/src/host/` 与 `packages/editor/src/rich/`，**不**改写上游文件的目录。ORCA：`plugins/notes/src/vendor/orca/pdf/`。每个 vendor 目录带 `UPSTREAM.md`（SHA、许可证、范围）、`PATCHES.md`（编号、文件、原因、重放脚本）和 `LICENSE`（取自 `git show`）。
- 检查口径：vendor 目录**不进** oxlint / stylelint / `check-css-*` / `check-ui-colors`（颜色与前缀规则对上游代码不适用），但 `typecheck`（独立的 `tsconfig.vendor.json`，沿用 OK 的严格度）、`build`、上游测试（OP-D16）必须通过；`knip` 对 vendor 已忽略。适配层（`host/`、`rich/`、`plain/`）完整受所有规则约束。补丁数量要有上限与趋势：S0 记录基线，每个切片结束汇报新增补丁数。
- 被拒绝：把上游文件改写成 Huhu 风格（升级困难、违背“直接复制”）；不登记补丁。

## OP-D16 上游测试接入：独立 vitest 项目，分三类处理　**建议**

- 把 OK 的 editor / core / comments / file-tree / properties 测试（约 310 + core 测试 + 78 + 34 + 21 文件，jsdom）迁入 `packages/editor/test/vendor/…`，用独立 `vitest` 项目运行（`pnpm test:vendor`，CI 里单独 job，不拖慢 `pnpm test`）。分类：**通过**（保持）、**需适配**（依赖 server / Hocuspocus 的用例改用 `LocalDocProvider`）、**不适用**（云协作 / 账户 / presence 相关，逐个登记原因）。要求在 `evidence/` 留“用例总数 / 通过 / 适配 / 不适用”表，**不适用清单需用户可审**。OK 的 Playwright stress e2e（202 个）不整体迁移，择取与编辑行为（选区、slash、IME、表格、剪贴板）对应者用 Huhu 的 Playwright Electron 重写为 `tests/e2e/knowledge/*`。

## OP-D17 frontmatter：数据面是 `Y.Text('source')` 里的 YAML；属性面板的编解码用一个实现　**建议（S0 spike SP-5）**

- 事实：OK 属性面板通过 provider 读写 Y.Doc 中的 frontmatter（`use-frontmatter-field.ts`），YAML 编解码是 `core/frontmatter/yaml-codec.ts`（`yaml` 包）；Huhu 有 `packages/vault/src/semantic/frontmatter.ts`（`patchFrontmatter` 等，用于 Tasks 等语义文件）。两套 YAML 逻辑并存违反 issue §2.2 / §7.2。
- 决定：S0 用 issue §14-C02 的黄金样本（`false`、`0`、空字符串、`null`、前导零文本、非完整日期、数组、嵌套、注释、未知键、BOM / CRLF）对两套实现做对拍。**若 OK 的 codec 字节级不输于 Huhu 的**：把 Huhu 的纯逻辑抽到浏览器可用的公共入口（不含 Node），让两边共用同一实现，OK 侧用别名指向它（补丁 1 个）；**若 OK 的更好**：反向，Huhu 的 `frontmatter.ts` 委托它。无论哪边，**只留一份 YAML 编解码**。

## OP-D18 `@huhu/editor` 的消费者一次迁完：notes 用富文本；tasks / inbox 用同一富文本的紧凑变体　**建议**

- 事实：消费者 = notes（`NoteDocument`、`FileCard`、`ArchivesViews`）、tasks（`TaskDetail`、`TaskEditor`、`references` 类型）、inbox（`InboxModule`）。`MarkdownPreview` 的 `stripFrontmatter` 与 marked + DOMPurify 路径只服务于“小型预览”。
- 决定：`@huhu/editor` 导出 `RichMarkdownEditor`（`variant: 'document' | 'compact'`）、`SourceEditor`（Markdown 源码）、`PlainTextEditor`、`ReadonlyMarkdown`（= 同一套 schema 的不可编辑渲染）和 `EditorPort`（focus / selection / execute / reveal / getDraft / flush / 命令可用性 / 只读）。tasks 的描述编辑与 inbox 想法编辑用 `compact`（无评论、无属性面板、无 slash 的文档级项，保留 `@` 引用）；`@` 在 compact 里仍走 `tasks/references.ts` 的候选（经 S5 抽出的共享资源适配层）。`MarkdownEditor` / `MarkdownPreview` / `wikilink` / `mention` / `vendor/atomic` / 对应样式在无消费者后删除（S8 清单）。
- 回头检查：compact 变体的每实例成本（Y.Doc、Tiptap）在 S2 用 bench 量；若任务详情打开明显变慢，tasks 改用 `PlainTextEditor`+`ReadonlyMarkdown`，并登记原因。

## OP-D19 Q1–Q10 按建议默认值采纳（2026-11-15）

用户 2026-11-15 明确指示：待决问题不再询问，从项目与来源里找答案并完整推进。据此 spec §9 的 Q1–Q10 **全部按“建议”列采纳**（Q1 无闭源 / 双许可；Q2 lint / audit / Share / OpenWithAi / presence / history 不接，模板导入与 Mermaid 块保留，Excalidraw 文档编辑器按 S0 评估；Q3 外链预览默认关闭；Q4 先量后定；Q5 不排块级合并；Q6 冻结在固定 SHA；Q7 不以实机验证为归档条件、逐项登记；Q8 无外部调用方则直接删除、有则保留一个版本并标弃用；Q9 以 S0 实测增量为记录，不设上限；Q10 分屏 / pane 评估后若与 Huhu 标签模型冲突则登记不适用）。闸门阈值（≤150 文件 / ≤1200 行 / ≥70%）同样采纳为最终值。**回头检查**：Q2、Q8 在 S8 复核实际对外影响。
