# vendor 补丁登记

规则：每个与上游不同的文件都登记一行（路径用反引号，`node scripts/ok-patches.mjs --check` 逐一比对，不一致即失败）。S2a 基线（S2c 起改动 +1）：**改动 5 / 删除 4 / 新增 26（server-bridge 11 个上游文件的复制 + 9 个替身；app 的 CSS / 声明 / 目录 7 个）**，远低于阈值 150（decisions OP-D02）。

## 改动（上游文件被改写或替换）

- P-S2a-02 `app/src/editor/DocumentContext.tsx`：上游 1868 行（标签 / 分屏 / 协作连接 / 会话恢复）→ 再导出 Huhu 宿主版 `packages/editor/src/host/document-context.tsx`（只保留 vendor 组件实际读取的 17 个成员）。
- P-S2a-03 `app/src/lib/config-provider.tsx`：上游 346 行（经协作配置文档同步）→ 只保留 `useConfigContext` 再导出；提供者见 `host/config-provider.tsx`。
- P-S2a-04 `app/src/lib/activate-locale.ts`、`app/src/lib/i18n.ts`、`app/src/lib/dev-pseudo-locale.ts`：只发布 en / zh-Hans（OP-D06），目录由 `@lingui/vite-plugin` 直接编译 `.po`；其余 locale 回退 en；pseudo 伪本地化不发布。

- P-S2c-01 `app/src/editor/editor-cache.ts`：`mountTiptapEditor` 的缓存闸门对 `compact-` 前缀的 docName 一律拒绝缓存（紧凑变体同时挂载几十个实例；不改会让超过 MAX_CACHE 的在屏实例被 LRU 驱逐销毁）。1 处、3 行。

## S4 评论（P-S4-xx）

- P-S4-01 `core/src/schemas/api/comments.ts`：`CommentThreadMetaSchema` 加可选 `scope`（body / file / property）与 `messages`（Huhu 线程是消息列表，OK 只有 `latestComment`；整篇笔记批注是 Huhu 的 `target:"file"`）。
- P-S4-02 `app/src/comments/types.ts`：`CommentThread` 加可选 `scope` / `messages`。
- P-S4-03 `app/src/comments/store.ts`、`app/src/comments/comments-client.ts`：`toThread` 携带 scope / messages；新增 `createFileThread` / `replyToThread` / `resolveThread`（对应 `/api/comment` 的 `reply` / `resolve` 动作与 `wholeFile` 创建参数）。
- P-S4-04 `app/src/comments/CommentListPanel.tsx`：不渲染 `CommentSendFooter`（AI 派发发送栏，Q2 不接）。
- P-S4-05 `app/src/comments/ThreadCard.tsx`（含 e2e 用的 data-testid：comment-thread / comment-orphaned / thread-*）：去掉“发送”勾选与点击卡片切换发送；铅笔编辑入口换成“标记为已解决”（Huhu 的消息是追加式记录，没有编辑）；回复列表与回复输入；删除两步确认；整篇笔记批注的标签。
- P-S4-06 `app/src/comments/store.ts`：`setCommentsReadOnly` / `useCommentsReadOnly`（宿主只读时隐藏写操作入口，批注仍可查看 / 定位）。
- P-S4-07 `app/src/locales/en/messages.po`、`app/src/locales/zh-Hans/messages.po`：新增上面补丁用到的 9 条消息（`zh-Hans` 译文）。
- P-S4-08 上游 app 非 dom 测试迁入（22 个，原样复制自上游 app 的 comments 目录，与被测源码同目录；`test:vendor` 经 `vitest.vendor.config.ts` 的 Lingui 宏管线与 `test/vendor-setup.ts`（激活 en）运行）：（逐文件清单见 evidence/tests-manifest.json，与上游 SHA-256 逐一相同）、、、、、、、、、、、、、、、、、、、、、。
- P-S4-09 `app/src/comments/CommentMarginRail.tsx`：宿主中将评论边缘按钮挂到编辑器的 `.ok-root`。窄屏详情浮层遮住右侧留白时使用左侧留白，保留上游的引用定位与线程打开行为。

## 删除

- P-S2a-01 `app/src/editor/provider-pool.ts`（2121 行，Hocuspocus 连接池）、`app/src/editor/branch-invalidation.ts`、`app/src/lib/auth-token.ts`、`app/src/lib/server-info-refresh.ts`：协作 / 服务器专属；由 `host/hocuspocus-provider.ts`（LocalDocProvider）取代。

## 新增（非 closure 的上游文件或 Huhu 替身）

- P-S2a-05 上游资源拷贝：`app/src/globals.css`、app/src/cmd-f.css、app/src/color-themes.generated.css（由 `scripts/ok-css-build.mjs` 生成 `packages/editor/src/ok/ok-globals.css`）、`app/src/env.d.ts`、app/src/fontsource.d.ts、`app/src/locales/en/messages.po`、`app/src/locales/zh-Hans/messages.po`。
- P-S2a-srv 上游 server 文件原样复制：`server-bridge/server-observers.ts`、`server-bridge/map-driven-splice.ts`、`server-bridge/bridge-watchdog.ts`、`server-bridge/bridge-quiescence.ts`、`server-bridge/pre-drain-discriminator.ts`、`server-bridge/bridge-intake.ts`、`server-bridge/bridge-loss-detector.ts`、`server-bridge/doc-extensions.ts`、`server-bridge/md-manager.ts`。
- P-S2a-srv 上游 server 文件裁剪 / 替身（Huhu 本地宿主不需要 OTel、日志、影子仓库、AI 会话）：`server-bridge/agent-activity.ts`（只留 `walkYTextItems` 与类型）、`server-bridge/cc1-broadcast.ts`（只留 `isSystemDoc` / `isConfigDoc`）、`server-bridge/metrics.ts`、`server-bridge/logger.ts`、`server-bridge/telemetry.ts`、`server-bridge/shadow-repo.ts`、`server-bridge/loss-capture.ts`、`server-bridge/frontmatter-telemetry.ts`、`server-bridge/server-workload-telemetry.ts`、`server-bridge/agent-sessions.ts`（均为同名同签名的空实现 / 类型）。

## HTML 代码块预览

- `app/src/editor/extensions/preview-iframe-header.ts`：通过显式构建依赖提供浏览器内页；Electron 接入专用预览协议，内页只允许内联脚本和嵌入资源。转发沙箱 iframe 的鼠标进入和离开。
- `app/src/editor/extensions/CodeBlockView.tsx`：用当前预览 iframe 的指针消息显示浮动工具栏，保持重开后可点击预览开关。
- `app/src/editor/extensions/preview-frame.html`：迁入并适配上游 public 内页，只接收可信父窗口发送的预览正文。
- `app/src/editor/extensions/preview-frame-policy.ts`：Electron 协议响应和 iframe 正文共享的安全策略。
- `app/src/editor/extensions/code-block-preview-csp.test.ts`：校验请求、子框架和表单限制。

## 构建期替换（不改 vendor 文件，tsconfig.vendor.json paths + `build/aliases.mjs` 同源）

- `@hocuspocus/provider` → `host/hocuspocus-provider.ts`（LocalDocProvider；`HocuspocusProvider` 为其别名）
- `@hocuspocus/server`（仅类型）→ `host/hocuspocus-server.ts`
- `@inkeep/open-knowledge-core`（根入口）→ `host/core-barrel.ts`（`scripts/ok-barrel-gen.mjs` 生成的精确子集）

## 依赖补丁（pnpm patchedDependencies，原样复制自上游 `patches/`）

`@handlewithcare/remark-prosemirror@0.1.5`、`@lingui/core@6.5.0`、`@pierre/trees@1.0.0-beta.4`、`@radix-ui/react-tooltip@1.2.8`、`@tiptap/extension-drag-handle@3.22.3`、`@tiptap/y-tiptap@3.0.3`、`cmdk@1.1.1`、`react-medium-image-zoom@5.4.3`、`y-indexeddb@9.0.12`。未登记：`@hocuspocus/provider`（不引入）、`y-prosemirror`（Huhu 不安装）、`react-resizable-panels`、`@pierre/diffs`（未进入闭包）。另有 `pnpm-workspace.yaml` 的 `overrides: mdast-util-mdx-jsx: 3.2.0`（模块增强要求单一实例）。

## S5（文件树 / 右键菜单 / 隐藏）补丁

- P-S5-01 `app/src/components/FileTree.tsx`：“隐藏”不再写 `.okignore`，改为调用宿主注册的 `hiddenPaths` 偏好（`app/src/lib/host-hidden.ts`，新增）；未注册时入口禁用，不静默写 `.okignore`。非 Markdown 文件同样可隐藏。
- P-S5-02 `app/src/components/FileTree.tsx`：移除“Open with AI”子菜单（`OpenInAgentContextSubmenu` 的 import 与 `openWithAi` 属性）——Q2 登记不适用。
- P-S5-03 `app/src/components/FileTree.tsx`：恢复“作为模板导入”，由 `/api/template/import` 在源文件同级的 `模板/` 中创建副本并保留源文件。“New from template”仍沿用原有入口。
- P-S5-04 `app/src/components/FileTargetMenuItems.tsx`、`app/src/components/FileTree.tsx`、`app/src/lib/host-hidden.ts`：宿主可追加菜单项（`setHostMenuExtras`），用于 Huhu 既有的“移动到…”“星标”“保存版本…”。
- 新增（非上游）：`app/src/lib/host-hidden.ts`；宿主侧 `host/routes/files.ts`、`host/explorer.tsx`、`host/ok-explorer.d.ts`、`harness/tree.{html,tsx}`。
- P-S5-05 `app/src/components/ui/alert-dialog.tsx`、`app/src/components/ui/dialog.tsx`、`app/src/components/ui/dropdown-menu.tsx`、`app/src/components/ui/popover.tsx`、`app/src/components/ui/select.tsx`、`app/src/components/ui/tooltip.tsx`、`app/src/lib/ok-portal.ts`（新增）：Radix Portal 统一挂到 `#ok-portal-root.ok-root`（design §12“所有 OK 渲染的根与 portal 容器都挂 .ok-root”）；否则 body 上的浮层没有作用域化的 Tailwind 工具类，菜单宽度为 0。

## S3（编辑行为对等与性能 F09）补丁

- P-S3-01（宿主，非 vendor 文件）大文档源码优先打开：`host/hocuspocus-provider.ts`（`lazyRich` / `ensureRich()` / `settleNow()`）、`host/provider-pool.ts`、`rich/RichMarkdownEditor.tsx`。源码模式只装载 `Y.Text('source')`；解析 + `Y.XmlFragment` + 桥观察者延后到切换富文本时。1 MiB 文档打开：5.4 s → 约 0.45 s。
- P-S3-02 `server-bridge/server-observers.ts`：桥结算自适应推迟——上一次结算超过 12 ms 时把后续结算合并到停顿之后（150–1500 ms，最长连续推迟 3 s）；小文档仍同步，与上游一致。返回的 dispose 函数新增 `settleNow()`；所有读取 `Y.Text` 的出口（flush / 切源码 / 卸载）先结算。原因：上游这套桥跑在服务端进程，本地模式在渲染进程主线程，5000 段文档每次按键同步整篇序列化约 1 s。
- P-S3-03 `app/src/editor/extensions/chunk-wrapper-decoration.ts`、`app/src/globals.css`：不再给每个顶层块建 `Decoration.node`（5000 段 = 5000 个装饰，约 90 ms/键）；`content-visibility:auto` 改由 CSS 子选择器 `.ProseMirror > :where(:not(...))` 匹配，装饰只留给 `jsxComponent`（跳过）与选区所在块（`data-ok-selection-block`）。5000 段输入延迟 p95 ≈ 80 ms → ≈ 13 ms。
- P-S3-06 `app/src/editor/extensions/chunk-wrapper-decoration.ts`、`app/src/globals.css`：`content-visibility:auto` 只在顶层块数 ≥ 300（`OK_CV_MIN_BLOCKS`）时启用（`.ProseMirror[data-ok-cv]`，由插件 `view()` 同步属性）。原因：CV 的 80 px 估高与真实高度不同，渲染更新里发生布局偏移，主线程繁忙时鼠标拖选 / 上下行光标落到别的段落（8 块短文档，CPU 满载下拖选异常 2/8，关闭 CV 后 0/8）。短文档本来不需要 CV；大文档性能路径（P-S3-03）不变。
- P-S3-04 `core/src/frontmatter/yaml-codec.ts`、`core/src/bridge/frontmatter-region.ts`：带前导零的数字样文本（`007`）按文本读写并原样保留（上游 `yaml` core schema 读成整数 7，改别的键时被悄悄改写）；显式加引号的 `"007"` 保持引号。spec C02。
- P-S3-05（宿主）`host/explorer.tsx`：OK 对超过 512 KiB 的文档给出 `large-file` 导航目标（不进编辑器）；Huhu 把它当普通文件打开，由 `plugins/notes/src/ui/viewers/dispatch.ts` 决定上限（Markdown 笔记 16 MiB，其它文本 1 MiB）。

- P-T-01 `core/src/y-prosemirror-patch.test.ts`（测试适配）：Huhu 不安装独立 `y-prosemirror`（`@tiptap/y-tiptap` 自带同源实现，补丁登记在 pnpm-workspace.yaml）：`REPO_ROOT` 改为向上找 `pnpm-workspace.yaml`；`import.meta.resolve` 换成 `createRequire(...).resolve`（vite-node 没有它）；去掉 `y-prosemirror` 的 4 个断言与补丁文件存在性检查，只校验 `@tiptap/y-tiptap` 的两份 bundle 与补丁文件、依赖树不变量（`reachedPackages` 只要求 `y-tiptap`）。
- P-D-01 依赖对齐（无源文件改动）：编辑器行为以上游 pnpm-lock.yaml 解析的版本为基线。`pnpm-workspace.yaml` 的 `overrides` 把 tiptap 全系、`@tiptap/pm`、ProseMirror 全系、`mdast-util-gfm-*`、`mdast-util-find-and-replace`、`hast-util-*`、`hastscript`、`lib0`、`linkifyjs`、`unist-util-visit-parents`、`vfile-location` 钉到上游版本（`micromark-factory-space` 钉 2.0.1 会让 `micromark-core-commonmark` 缺 `factorySpaceMinMax`，故不钉）；`katex` 从 0.16.22 升到上游的 0.16.47（旧预览已删除，无其它消费者）。发现方式：上游 `list.test.ts` 在 `mdast-util-gfm-task-list-item@2.0.1` 下把任务项序列化成 `- [ ] [ ] x`。
- P-D-02 `pdfjs-dist` 统一为 6.3.289（`plugins/notes` 的 PDF 查看器已用，带 ORCA 局部渲染补丁 `patches/pdfjs-dist@6.3.289.patch`），上游 6.2.108 仅被 app/src/editor/components/Pdf.tsx（PDF 嵌入块）使用；`tsconfig.vendor.json` typecheck 通过。`ok-align-deps.mjs` 的 KEEP 集合跳过该依赖。

## 宿主路由补完（审计回归修复）

- P-S3-07 `app/src/editor/validation-audit-client.ts`、`app/src/editor/lint-config-client.ts`、`app/src/lib/host-features.ts`（新增）：服务端 lint / audit 在 Huhu 不可用（Q2），宿主（`OkRoot`）调用 `setHostLintAvailable(features.lint)`，vendor 的 `fetchAudit` / `fetchLintConfig` 在不可用时直接返回 `null`，不再发出 `/api/audit`、`/api/lint/config` 请求再吃 404。上游默认可用，行为不变。
- 宿主侧（非 vendor 文件）`host/host-fetch.ts`：最低优先级兜底路由 `GET /api/pages` → `{pages: []}`、`GET /api/documents` → `{documents: []}`。详情栏批注页的 `OkRoot` 只带评论路由，其 `PageListProvider` 比编辑面更早请求 `/api/pages` 时曾得到 404 与 `[PageListContext] Failed to load pages`；有数据的宿主路由仍然优先。回归用例 `tests/e2e/knowledge/host-routes.spec.ts`（旧行为下失败，修复后通过）。
- P-S3-08（宿主，非 vendor 文件）`rich/RichMarkdownEditor.tsx`：编辑器 DOM 上 `keydown`（捕获）带 Ctrl/Meta 时先 `view.domObserver.flush()`，让 ProseMirror 把待处理的 DOM 选区读进 state。原因：浏览器的 `selectionchange` 是异步事件，紧贴着选区变化之后的 Mod-i / Mod-b 先到达，命令作用在旧的（折叠）选区上，只留下一个存储标记，表现为“首次按键被忽略”。探针（无等待）：未修时 24 次按键里约 12 次选区折叠且无标记，修后 23/24 生效；剩下 1 次是 Shift+Home 自身没有扩展 DOM 选区（与快捷键无关，根因未定位）。人手速度下 selectionchange 早已到达，该 flush 是 no-op。

## H03 知识库界面本地化

- `app/src/editor/registry/block-labels.ts`、`app/src/editor/registry/resolve-descriptor-placeholder.ts`、`app/src/editor/extensions/JsxComponentView.tsx`、`app/src/editor/components/PropPanel.tsx`：共用已登记的块标题、属性名称和占位消息；只翻译展示，保留 JSX 标识和属性键。
- `app/src/lib/activate-locale.ts`：允许同窗口内不指定语言的紧凑渲染继承已请求的知识库语言，防止覆盖已打开编辑器的 Lingui 目录。
- `app/src/editor/components/Accordion.tsx`、`app/src/editor/components/Tabs.tsx`、`app/src/editor/utils/validate-css-length.ts`、`app/src/editor/utils/validate-media-url.ts`：翻译内置块默认标题以及属性提示和错误。
- `app/src/editor/components/ColorPickerInput.tsx`、`app/src/editor/components/IconPickerInput.tsx`、`app/src/editor/components/componentMap.tsx`：翻译输入示例与折叠块默认标题。
- `core/src/extensions/footnote-definition.ts`、`app/src/editor/extensions/shared.ts`：由客户端注入脚注返回链接的读屏名称。
- `app/src/editor/extensions/internal-link.ts`、`app/src/editor/components/ResizeHandles.tsx`：翻译链接和预览缩放手柄的读屏名称。

- `app/src/editor/bubble-menu/InlineFormatButtons.tsx`：用 Lingui 的格式名称同时标记读屏按钮与气泡提示。
- `app/src/editor/slash-command/SlashCommandMenu.tsx`、`app/src/editor/slash-command/component-items.tsx`、`app/src/editor/slash-command/embed-starter-items.tsx`：翻译分组、内置块和预览模板名称，原英文名称保留在搜索别名中。
- `app/src/components/FileTree.tsx`：沿用文件树 Shadow DOM 的观察器，应用 Lingui 的文件操作按钮读屏名称。
- `app/src/locales/en/messages.po`、`app/src/locales/zh-Hans/messages.po`：增加对应的菜单分组、组件、文件操作选项与通知区名称。

## Issue #2 本地编辑验收补证

- `app/src/components/ui/input-group.tsx`：查找替换栏依赖的输入组，原样复制。
- `app/src/editor/components/use-app-color-mode.ts`：读取并订阅 Huhu 已解析外观，保留 OK 根类名与系统模式回退。
- `app/src/editor/components/use-app-color-mode.dom.test.tsx`：Huhu 模式覆盖与挂载后切换回归。
- `core/src/markdown/html-to-mdast.ts`：对可能超限的多字节 HTML 用 UTF-8 字节数执行上限。
- `app/src/editor/extensions/wiki-link-suggestion.ts`：同一文档的快速标题查询共用在途请求，等待返回后用各自查询词过滤。
- `app/src/editor/find-replace/FindReplaceBar.tsx`：复用 OK 查找替换栏，组合输入期间放行由输入法占用的按键。
- `app/src/editor/find-replace/FindReplaceController.tsx`：复用 OK 查找替换控制器，卸载时移除缓存编辑器中的匹配装饰。先匹配查找相关快捷键，普通输入跳过浮层查询，相关快捷键继续尊重挂载在编辑器外的浮层。

- `app/src/editor/components/Embed.tsx`、`app/src/editor/components/PreviewBlockedNotice.tsx`、`core/src/registry/built-ins.ts`：外部 Embed 按 Q3 在创建 iframe 前停止，复用预览阻止提示的呈现样式，并显示源 URL。

- `app/src/editor/bubble-menu/FileBubbleButtons.tsx`：本地下载经宿主读取笔记相对路径的附件字节，通知失败，并支持按键激活。切换选择、卸载或新的下载请求会使旧结果失效。

- `app/src/editor/components/CodePreviewEditModal.tsx`：保持 CodeMirror 的挂载 ref 稳定，输入触发渲染时不销毁正在编辑的视图。

- `app/src/editor/components/PropPanel.tsx`：布尔开关在 Markdown 省略属性时反映描述符默认值。

以下文件来自上游 `44a2e0a` 的 app 测试与夹具。为保持归档测试哈希清单原样，在此登记。接入时改用宿主闭包的测试依赖路径，并对 Huhu 本地桥结算、块装饰和应用壳差异保留对应断言。

- `app/src/components/ui/alert-dialog.dom.test.tsx`
- `app/src/components/ui/calendar.dom.test.tsx`
- `app/src/components/ui/command.dom.test.tsx`
- `app/src/components/ui/dialog.dom.test.tsx`
- `app/src/components/ui/dropdown-menu.dom.test.tsx`
- `app/src/components/ui/empty.dom.test.tsx`
- `app/src/components/ui/loading-image.dom.test.tsx`
- `app/src/components/ui/pane-card.dom.test.tsx`
- `app/src/components/ui/panel.dom.test.tsx`
- `app/src/components/ui/popover.dom.test.tsx`
- `app/src/components/ui/select.dom.test.tsx`
- `app/src/components/ui/sidebar.dom.test.tsx`
- `app/src/components/ui/spinner.dom.test.tsx`
- `app/src/components/ui/toast-outside-guard.test.ts`
- `app/src/components/ui/tooltip.dom.test.tsx`
- `app/src/editor/bubble-menu/FootnoteBubbleButton.dom.test.tsx`
- `app/src/editor/bubble-menu/ImageAlignButtons.test.ts`
- `app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx`
- `app/src/editor/bubble-menu/ViewInSourceBubbleButton.dom.test.tsx`
- `app/src/editor/bubble-menu/link-edit-popover-events.test.ts`
- `app/src/editor/clipboard/clipboard-line-structure.test.ts`
- `app/src/editor/clipboard/clipboard-sanitize.test.ts`
- `app/src/editor/clipboard/clipboard-walker-fallback-palette.dom-shape.test.ts`
- `app/src/editor/clipboard/clipboard-walker-fallback-palette.test.ts`
- `app/src/editor/clipboard/clipboard-walker.test.ts`
- `app/src/editor/clipboard/codeblock-preview-clipboard.test.ts`
- `app/src/editor/clipboard/comment-clipboard-contract.test.ts`
- `app/src/editor/clipboard/copy-image.dom.test.ts`
- `app/src/editor/clipboard/detect-source.test.ts`
- `app/src/editor/clipboard/handle-drop.test.ts`
- `app/src/editor/clipboard/handle-paste.list-placement.test.ts`
- `app/src/editor/clipboard/handle-paste.mixed-payload-placement.test.ts`
- `app/src/editor/clipboard/handle-paste.test.ts`
- `app/src/editor/clipboard/instrument.test.ts`
- `app/src/editor/clipboard/is-markdown.test.ts`
- `app/src/editor/clipboard/lone-url.test.ts`
- `app/src/editor/clipboard/non-portable-descriptors.test-helper.ts`
- `app/src/editor/clipboard/non-portable-render-source-fallback.test.ts`
- `app/src/editor/clipboard/opendepth-guard.test.ts`
- `app/src/editor/clipboard/paste-failure-toast.test.ts`
- `app/src/editor/clipboard/serialize.container-descriptor-boundary.test.ts`
- `app/src/editor/clipboard/serialize.inline-image-range.test.ts`
- `app/src/editor/clipboard/serialize.test.ts`
- `app/src/editor/clipboard/shift-tracker.test.ts`
- `app/src/editor/clipboard/source-clipboard-recovery.test.ts`
- `app/src/editor/clipboard/source-clipboard.test.ts`
- `app/src/editor/clipboard/wysiwyg-stop-rule.test.ts`
- `app/src/editor/components/Accordion.test.tsx`
- `app/src/editor/components/Callout.test.tsx`
- `app/src/editor/components/CodePreviewEditModal.dom.test.tsx`
- `app/src/editor/components/ColorPickerInput.test.ts`
- `app/src/editor/components/File.test.tsx`
- `app/src/editor/components/Image.dom.test.tsx`
- `app/src/editor/components/Math.test.tsx`
- `app/src/editor/components/Mermaid.dom.test.tsx`
- `app/src/editor/components/Mermaid.test.tsx`
- `app/src/editor/components/MirrorSource.dom.test.tsx`
- `app/src/editor/components/PreviewBlockedNotice.dom.test.tsx`
- `app/src/editor/components/PropPanel.dom.test.tsx`
- `app/src/editor/components/PropPanel.mirror.dom.test.tsx`
- `app/src/editor/components/PropPanel.test.tsx`
- `app/src/editor/components/SrcAutocomplete.dom.test.tsx`
- `app/src/editor/components/Tab.test.tsx`
- `app/src/editor/components/Tabs.dom.test.tsx`
- `app/src/editor/components/Video.dom.test.tsx`
- `app/src/editor/components/image-target-existence.test.ts`
- `app/src/editor/components/live-doc-pool.dom.test.tsx`
- `app/src/editor/components/mirror-source-names.test.ts`
- `app/src/editor/components/pdf-layout.test.ts`
- `app/src/editor/components/snapshot-url-pool.dom.test.ts`
- `app/src/editor/components/use-mirror-source.dom.test.tsx`
- `app/src/editor/components/use-mirror-source.test.ts`
- `app/src/editor/editor-rig.test-helper.ts`
- `app/src/editor/extensions/JsxInlineView.dom.test.tsx`
- `app/src/editor/extensions/RawMdxFallbackCMView.dom.test.tsx`
- `app/src/editor/extensions/RawMdxFallbackCMView.test.ts`
- `app/src/editor/extensions/autonomous-fragment-edit.test.ts`
- `app/src/editor/extensions/bare-html-image-decoration.test.tsx`
- `app/src/editor/extensions/bridge-id-plugin.test.ts`
- `app/src/editor/extensions/cell-insertion-gate.test.ts`
- `app/src/editor/extensions/chunk-wrapper-decoration.test.ts`
- `app/src/editor/extensions/code-block-preview-csp.test.ts`
- `app/src/editor/extensions/drag-handle.dom.test.ts`
- `app/src/editor/extensions/mark-identity-decoration.test.ts`
- `app/src/editor/extensions/mark-identity.test.ts`
- `app/src/editor/extensions/mark-interaction-bridge.test.tsx`
- `app/src/editor/extensions/nested-cm-extensions.test.ts`
- `app/src/editor/extensions/raw-mdx-fallback.test.ts`
- `app/src/editor/extensions/raw-mdx-nested-copy-version-pin.test.ts`
- `app/src/editor/extensions/selection-state-plugin.test.ts`
- `app/src/editor/extensions/shared.dom.test.tsx`
- `app/src/editor/extensions/slash-command-atomicity.dom.test.tsx`
- `app/src/editor/extensions/source-dirty-flip.dom.test.tsx`
- `app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx`
- `app/src/editor/extensions/source-dirty-observer.autonomous-swap.test.ts`
- `app/src/editor/extensions/source-dirty-observer.origin-guard.test.ts`
- `app/src/editor/extensions/source-dirty-observer.test-helper.ts`
- `app/src/editor/extensions/source-dirty-serialize.test.ts`
- `app/src/editor/extensions/suggestion-atomicity.dom.test.tsx`
- `app/src/editor/extensions/suggestion-floating-ui.dom.test.ts`
- `app/src/editor/extensions/suggestion-ime-triggers.dom.test.tsx`
- `app/src/editor/extensions/tab-focus-trap.test.ts`
- `app/src/editor/extensions/table-row-enter.test.ts`
- `app/src/editor/extensions/tag-suggestion.test.ts`
- `app/src/editor/extensions/trailing-affordance.dom.test.ts`
- `app/src/editor/extensions/wiki-link-suggestion.test.ts`
- `app/src/editor/extensions/wiki-link.doc-activation.test.ts`
- `app/src/editor/extensions/wiki-link.external-open.test.ts`
- `app/src/editor/find-replace/literal-matcher.test.ts`
- `app/src/editor/find-replace/tiptap-find-replace-extension.test.ts`
- `app/src/editor/image-upload/pickInsertShape.test.ts`
- `app/src/editor/image-upload/shortestImageRef.test.ts`
- `app/src/editor/link-path-suggestions.dom.test.tsx`
- `app/src/editor/link-path-suggestions.test.ts`
- `app/src/editor/plugins/asset-context-menu.test.ts`
- `app/src/editor/slash-command/SlashCommandMenu.dom.test.tsx`
- `app/src/editor/source-undo-mode-flip.dom.test.ts`
- `app/src/editor/source-undo-mode-flip.test.ts`
- `app/src/editor/table-controls/table-axis-selection.test.ts`
- `app/src/editor/table-controls/useTableDragReorder.test.ts`
- `app/src/editor/undo-isolation.test.ts`
- `app/src/editor/walk-currency.test-helper.ts`
- `app/src/test-utils/lingui-mock.ts`
- `app/src/test-utils/served-binding.test-helper.ts`
- `app/src/test-utils/visual-contract.ts`
- `app/tests/lingui-macro-shim.tsx`
- `app/src/editor/components/lucide-icon-allowlist.test.ts`
- `app/src/editor/extensions/preview-iframe-csp-violation.test.ts`
- `app/src/editor/extensions/preview-iframe-theme.test.ts`
- `app/src/editor/extensions/preview-live-tokens.test.ts`
- `app/src/editor/extensions/CodeBlockView.dom.test.tsx`：测试改动，按共享预览内页 URL 和隔离 CSP 校验发出的正文，继续断言无 `srcdoc`。

## 编辑器宿主浮层

- `app/src/components/emoji-picker.tsx`：按编辑器语言加载离线表情名称和分类，中文数据保留英文搜索别名。依赖是现有 Frimousse 0.3.0，数据钉在其上游开发包版本 emojibase-data 16.0.2。
- `app/src/editor/components/EmojiInsertPopover.tsx`：允许按编辑区限制事件归属，Radix 关闭时沿用选中或取消分支各自的焦点行为。
- `app/src/editor/components/EmojiInsertPopover.dom.test.tsx`：原样迁入上游组件测试。
- `app/src/editor/components/TagDialog.tsx`：迁入上游标签弹窗，按当前编辑面接收事件，通过宿主本地标签索引查询与打开笔记。
- `app/src/editor/extensions/tag-click-plugin.ts`、`app/src/components/PropertyWidgets.tsx`：随标签事件携带点击元素，隔离多个编辑面并支持关闭后焦点恢复。

### Task05 本地编辑器右键与模板导入

- `app/src/editor/plugins/asset-context-menu.ts`：识别 File 组件的本地文件目标（包括 .txt）及已带扩展名的双链，供宿主编辑器菜单复用。
- `app/src/components/FileTargetMenuItems.tsx`：宿主可把模板导入显示为仅保留原文件的单项操作。
- `app/src/components/FileTargetMenuItems.dom.test.tsx`：迁入菜单行为测试。
- `app/src/components/PropertyDisclosure.dom.test.tsx`：迁入属性折叠测试。

### Task05 固定上游 DOM 测试核对

- `app/src/comments/comment-chips.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/comments/property-anchor-click.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/comments/property-row-rect.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/comments/reveal-comment.dom.test.ts`：原样迁入固定上游 DOM 用例。
- `app/src/components/AddPropertyNameField.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/CopyButton.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/FileTreeFilteredToZeroNotice.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/PropertyInlineLinks.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/PropertyWidgets.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/TrashFailureModal.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/UserText.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/editor/SelectionAnnouncer.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/file-tree-extension-badge.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/file-tree-rename-chip.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/components/properties-collapsed-store.dom.test.tsx`：为 Node/jsdom 测试注入隔离 Storage，保留持久化断言。
- `app/src/components/use-file-tree-listing.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/EditorContent.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/SourceEditor.dom.test.tsx`：移除 OK 专属 Ask AI 与 Problems 组，保留源码行为。
- `app/src/editor/anchor-target.dom.test.ts`：原样迁入固定上游 DOM 用例。
- `app/src/editor/components/TagView.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/document-scrollports.dom.test.ts`：原样迁入固定上游 DOM 用例。
- `app/src/editor/extensions/ImageInlineZoomView.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/extensions/ImageReferenceView.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/extensions/InternalLinkPropPanel.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/extensions/WikiLinkEmbedImageView.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/extensions/WikiLinkPropPanel.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/interaction-layer.dom.test.ts`：原样迁入固定上游 DOM 用例。
- `app/src/editor/link-preview/InternalDocPreviewCard.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/link-preview/use-internal-doc-preview.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/selection/place-caret.dom.test.ts`：原样迁入固定上游 DOM 用例。
- `app/src/editor/slash-command/apply-item.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/utils/editor-visible-region.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/lib/editor-toolbar-overlap.dom.test.ts`：原样迁入固定上游 DOM 用例。
- `app/src/lib/ime-composition.dom.test.tsx`：原样迁入固定上游 DOM 用例。
- `app/src/lib/overlay-layers.dom.test.tsx`：原样迁入固定上游 DOM 用例。
