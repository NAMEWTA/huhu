# B01 复刻矩阵补证与 H07

行号对应归档 `evidence/parity-matrix.md`。测试路径均相对工作树。任务 02 的验收以真实 Electron 的可见操作和磁盘结果为准。任务 04 的壳层入口见 [shell-mounts.md](shell-mounts.md)。

82 行中已验证 78 行，由 Huhu 等价物取代且已验证 4 行，有效不适用 0 行。下表列出本行实际可见入口和范围。

| 行 | 归档项 | 状态 | 实际证据或缺口 | 缺陷及处理 |
| ---: | --- | --- | --- | --- |
| 31 | 下划线 UnderlineFidelity | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真` | — |
| 36 | 行内转义标记 EscapeMark | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真` | — |
| 37 | 文档级保真 DocFidelity | 已验证 | `packages/editor/test/markdown-parity.test.ts:文档边界保留 BOM、前置空行和尾随空行` | — |
| 39 | HTML 块 HtmlBlockFidelity | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真`；`packages/editor/test/markdown-parity.test.ts:HTML 块节点序列化保留原始标记` | — |
| 48 | 高亮 Highlight（`==text==`） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真` | — |
| 50 | 行内 JSX JsxInline；app 覆盖为 app 版 | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/JsxInlineView.dom.test.tsx:a registered componentName renders the descriptor widget` | — |
| 51 | 未知语法兜底 RawMdxFallback；app 覆盖为 app 版 | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真` | — |
| 52 | 评论标记 CommentMark 与评论块 CommentBlock | 已验证 | `packages/editor/test/markdown-parity.test.ts:行内百分号评论和独立 HTML 评论各自使用专用节点再还原`；`tests/e2e/knowledge/editor-parity-closeout.spec.ts:复制与剪切分离公开文本和评论原文，粘回后保存重开` | — |
| 56 | 编辑器注册表（app 层覆盖与追加）；`scopeExtensionsToDocument` 绑定文档名 | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/shared.dom.test.tsx:loads under the DOM test substrate without initialization cycles`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/shared.dom.test.tsx:binds document-scoped extensions without leaking options between documents` | — |
| 60 | 单元格插入闸门 CellInsertionGate | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/cell-insertion-gate.test.ts:insertContent of a component with the caret in a cell leaves the doc unchanged` | — |
| 62 | 占位符 Placeholder | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:空文档显示占位符，Shift-Tab 保留编辑焦点，键入后持久化` | — |
| 63 | 协作绑定 Collaboration | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx:one interior edit through the real ySyncPlugin path settles as exactly ONE Observer-A serialize` | — |
| 64 | 文件拖放 / 粘贴上传 FileHandler | 已验证 | `tests/e2e/knowledge/attachments.spec.ts:粘贴 / 拖入图片：落在笔记旁 attachments/，引用写进笔记，图片真的渲染；同图再粘贴不重复` | — |
| 72 | 建议菜单 IME 与触发：SuggestionCompositionEnd、suggestion-ime、suggestion-allow、suggestion-floating-ui | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-ime-triggers.dom.test.tsx:a full-width trigger composed by the IME opens no menu until the composition commits`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-floating-ui.dom.test.ts:stamps the marker when the popup is pane-clipped` | — |
| 74 | 块拖拽手柄 BlockDragHandle（@tiptap/extension-drag-handle） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/drag-handle.dom.test.ts:clears the remembered upstream target when a native drag finishes` | DOM 测试验证句柄的选择与事件，实际表格拖拽记录在 151。 |
| 77 | 末尾可写区 TrailingAffordance | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/trailing-affordance.dom.test.ts:engages when the document ends in a table` | — |
| 78 | JSX 节点方向键选择 KeyboardNav | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:原子 JSX 块可用上下键选中，Escape 退出后可继续编辑并重开` | — |
| 79 | Shift-Tab 焦点陷阱 TabFocusTrap | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:空文档显示占位符，Shift-Tab 保留编辑焦点，键入后持久化` | — |
| 82 | 查找替换 TiptapFindReplace（FindReplaceBar、FindReplaceController） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:查找替换快捷键打开查找栏、定位下一个匹配并一次替换保存` | 补接上游 FindReplaceController / FindReplaceBar，并保护 IME 组合键及关闭时的装饰清理。 |
| 83 | 选区状态 SelectionStatePlugin | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/selection-state-plugin.test.ts:returns empty chain when selection is outside any jsxComponent` | — |
| 84 | 来源 Y 绑定标识 BridgeIdPlugin | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bridge-id-plugin.test.ts:inserting a jsxComponent assigns a fresh b{N} ID` | — |
| 85 | 源码脏标记 SourceDirtyObserver | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx:one interior edit through the real ySyncPlugin path settles as exactly ONE Observer-A serialize`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-flip.dom.test.tsx:an in-place interior edit flips sourceDirty and the serializer re-derives fresh bytes` | — |
| 86 | 自主片段编辑守卫 autonomousFragmentEditAllowed | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/autonomous-fragment-edit.test.ts:blocks autonomous structural edits when the editor is source-mode-hidden` | — |
| 87 | 块包裹装饰 chunkWrapperDecoration | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/chunk-wrapper-decoration.test.ts:mixed top-level blocks — only the selection block is decorated`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/chunk-wrapper-decoration.test.ts:jsxComponent top-level block — explicit skip decoration with the exact block range` | — |
| 88 | 标记身份装饰与交互桥 mark-identity / mark-interaction-bridge | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/mark-interaction-bridge.test.tsx:registered controls.propPanel delegates to renderPropPanel with augmented ctx` | — |
| 92 | 嵌套 CM 扩展 nested-cm-extensions | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/nested-cm-extensions.test.ts:uses the caller compartment for runtime reconfiguration` | — |
| 95 | 撤销隔离 dispatchAsOwnUndoStep | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/undo-isolation.test.ts:a throwing dispatch still closes the capture (stopCapturing runs twice)` | — |
| 96 | 源码与富文本切换的撤销模式翻转 | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/source-undo-mode-flip.test.ts:a real non-editor write surface arms the reset the same way a synthetic origin does`；`packages/editor/src/vendor/open-knowledge/app/src/editor/source-undo-mode-flip.test.ts:clearing on return drops redo along with undo` | — |
| 122 | 代码预览编辑弹窗 CodePreviewEditModal（Mod-Enter） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/CodePreviewEditModal.dom.test.tsx:Cmd/Ctrl+Enter commits the draft via onSave and closes the modal` | — |
| 123 | 属性面板（JSX 节点）PropPanel | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/PropPanel.dom.test.tsx:the property picker uses preview mode from the shared provider before uploading` | — |
| 126 | 描述符占位 DescriptorPlaceholder | 已验证 | `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:Embed 占位符可打开属性，外链不发请求，编辑后关闭重开仍显示阻止状态`。从斜杠菜单插入后用占位按钮重新打开属性，填写 URL 后真实保存重开。 | — |
| 127 | 预览阻断提示 PreviewBlockedNotice | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/PreviewBlockedNotice.dom.test.tsx:names the blocked request (uri + directive)` | — |
| 130 | 图标白名单 lucide-icon-allowlist | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/lucide-icon-allowlist.test.ts:returns the component for known allowlist names` | — |
| 131 | 基础 UI 原语 components/ui（OK 用到的约 25 个） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:Callout 属性的下拉选择、高级折叠与开关在保存重开后保留效果`、`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:代码块设置弹层和预览编辑对话框响应键盘，预览修改保存重开`、`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:格式气泡显示下划线和高亮快捷键，真实按键持久化两种标记`。真实 Electron 覆盖下拉选择、可折叠区域、开关、弹层、对话框、输入、Tooltip 和快捷键标签。任务 01 记录了原语 DOM 套件。 | 稳定 CodeMirror 的挂载 ref，保留实时输入。布尔开关读取描述符默认值。 |
| 132 | 主题模式 use-app-color-mode | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/use-app-color-mode.dom.test.tsx:updates mounted previews when Huhu changes appearance` | 预览组件此前只看根类名与系统模式，现在优先读并订阅 Huhu 根元素 data-mode。 |
| 139 | 块类型选择 BlockTypeSelector（正文 / 标题 1–3 / 无序 / 有序 / 任务 / 引用 / 代码块） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:气泡块类型菜单显示完整类别，选取二级标题后保存重开` | — |
| 141 | 链接编辑 LinkEditPopover（粘贴链接、应用、新标签打开、移除） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx:prefills the current URL when editing an active collapsed link` | — |
| 142 | 图片对齐 ImageAlignButtons（左 / 中 / 右） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:本地图片气泡的左、中、右按钮更新选择并逐次保存重开`。每次点选均确认气泡按钮的按压状态、磁盘上的对齐值和重开后的图片及对齐。 | — |
| 143 | 文件块按钮 FileBubbleButtons（下载文件） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:文件块气泡下载按笔记相对路径读取真实文件并保留下载名`。从位置在子目录的笔记下载 11 MiB 本地附件，比较文件名和完整字节。 | 原链接未用当前笔记的相对目录，也没有可读的附件下载响应。改用 Vault 分段读取，复用附件 25 MiB 上限。 |
| 144 | 脚注转换按钮 FootnoteBubbleButton | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:气泡工具栏把选区转换为脚注，引用和定义保存重开后配对` | — |
| 145 | “在源码中查看”按钮 ViewInSourceBubbleButton | 已验证 | `tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts:富文本选区的源码入口保留定位与磁盘内容`。点击气泡按钮和 Ctrl+Alt+E 均切到源码并聚焦目标行。原上游 DOM 用例继续验证派发事件。 | 接入 Huhu 模式切换和可见源码滚动容器。 |
| 146 | 选区评论按钮 CommentBubbleButton | 已验证 | `tests/e2e/knowledge/comments-s4.spec.ts:D01/D02：选区批注进真实存储，取消不留伪线程；回复 / 解决 / 重开 / 删除确认；整篇笔记批注` | — |
| 147 | 编辑器工具栏 EditorToolbar（属性按钮、模式切换、面包屑、Lint 诊断入口） | 由 Huhu 等价物取代且已验证 | 由 NoteDocument 工具栏和正文前的属性面板取代，依据 design §10、ui-design §1。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:Huhu 笔记工具栏显示路径并切换编辑模式，DocTab 可聚焦和关闭，资源菜单可复制路径` 验证属性可达及源码和实时预览切换。真实 Electron 键盘探针补验属性区折叠和展开，磁盘字节不变。OP-D19 Q2 已排除服务端 Lint。 | — |
| 148 | 模式切换 EditorModeToggle（“Markdown 源码 / Visual 编辑器”） | 已验证 | `tests/e2e/knowledge/editor-s2b.spec.ts:S2b：打开—无编辑不写盘—输入—保存—重开一致；立即切换不丢最后字符；视图切换保留正文` | — |
| 149 | 面包屑 EditorBreadcrumb | 由 Huhu 等价物取代且已验证 | 由 NoteDocument 目录和文件名展示取代，依据 design §7、ui-design §1。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:Huhu 笔记工具栏显示路径并切换编辑模式，DocTab 可聚焦和关闭，资源菜单可复制路径` 验证完整路径段和标签切换。目录展示为静态文本，导航由资源树提供。 | — |
| 150 | 表格行列句柄 TableCellHandles | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:表格光标显示行列句柄，拖拽移动数据行并保存重开` | — |
| 151 | 表格拖拽重排 useTableDragReorder | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:表格光标显示行列句柄，拖拽移动数据行并保存重开`；`packages/editor/src/vendor/open-knowledge/app/src/editor/table-controls/useTableDragReorder.test.ts:move to end: from=0 to=3 → col 0 ends up last` | — |
| 179 | 列表输入规则（`- `、`1. `、`[ ] `） | 已验证 | `tests/e2e/knowledge/editor-s3-rules.spec.ts:矩阵·输入规则：逐条输入 Markdown 简写，生成对应块 / 标记` | — |
| 184 | `#` 标签触发 TagSuggestion | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:# 与 [[ 候选来自当前 Vault，插入后保存并重开` | 补接 /api/tags，通过 Huhu notes.tags 返回真实候选。点击标签的弹窗与本地索引另见第 91 行和壳层清单。 |
| 185 | `[[` 维基链接触发 WikiLinkSuggestion | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:# 与 [[ 候选来自当前 Vault，插入后保存并重开`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/wiki-link-suggestion.test.ts:degrades to the still-successful side when one endpoint errors (HTTP 500)` | 补接 /api/page-headings、/api/forward-links 与 /api/backlinks。修复输入过快时多个查询竞争同一次标题请求而导致空列表。 |
| 186 | 链接路径候选 link-path-suggestions | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/link-path-suggestions.dom.test.tsx:opens suggestions for a bare name and lists the matching page` | — |
| 188 | 拖放分派 createHandleDrop（有文件时让位给 FileHandler） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/handle-drop.test.ts:defers to FileHandler when dataTransfer.files is non-empty (returns false)` | — |
| 189 | 来源识别 detectSource（15 类：vscode、gfm、pm-origin、gdocs、word、gmail、notion、apple、slack、gsheets、github、generic、markdown-text、plaintext、local） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/detect-source.test.ts:vscode-editor-data wins over all other MIMEs` 等同文件指纹用例；`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/handle-drop.test.ts:Branch E (text/plain only with markdown signals): parses as markdown`；`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/source-clipboard.test.ts:non-empty selection writes both text/plain (raw markdown) and text/html (wrapper)` | 上游 detectSource 直接识别 13 类，markdown-text 由分派器识别，local 是源码剪贴板标记。 |
| 190 | Markdown 判定 isMarkdown | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/is-markdown.test.ts:accepts GFM table` | — |
| 192 | HTML → mdast 清洗与转换（html-to-mdast，HTML_MAX_BYTES 5 MiB） | 已验证 | `packages/editor/test/markdown-parity.test.ts:HTML 粘贴转换保留下划线形式与加粗，拒绝超过 5 MiB 的 ASCII 输入`；`packages/editor/test/markdown-parity.test.ts:HTML 粘贴限制按 UTF-8 字节接受边界值并拒绝多字节超限` | 对可能超限的字符串使用 UTF-8 字节数，继续先拒绝代码单元已超限的输入。 |
| 194 | 剪贴板清洗 clipboard-sanitize（OPT_OUT_ATTR） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-sanitize.test.ts:covers HTML-spec URL-bearing attribute set` | — |
| 195 | 浏览器 DOM 走查 clipboard-walker（样式白名单、LUCIDE 字形映射、wiki 链接还原） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-walker.test.ts:emits allowlisted properties only`；`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-walker-fallback-palette.test.ts:covers non-portable-render descriptors (Math + MermaidFence)` | — |
| 196 | 复制 / 剪切 createCopyCutHandler 与富文本序列化 serialize | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:复制与剪切分离公开文本和评论原文，粘回后保存重开` | — |
| 197 | 纯文本复制 PlainTextClipboard | 已验证 | `packages/editor/test/plain-text-clipboard.test.ts:PlainTextClipboard 通过 ProseMirror 复制纯文本且保留段间分隔` | — |
| 198 | 评论内容剥离 comment-scrub（内部剪贴板 MIME） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:复制与剪切分离公开文本和评论原文，粘回后保存重开` | — |
| 200 | 复制图片 copy-image | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/copy-image.dom.test.ts:a copy on an editor image hands its src to the copy-image service` | — |
| 202 | 转换 / 遥测 instrument（logSourceDetected、logIfSlow、logConversionFail） | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/instrument.test.ts:emitted JSON shape carries event + view + lucideClass and nothing else` | — |
| 203 | Shift 状态跟踪 shift-tracker | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/shift-tracker.test.ts:pasteShiftHeld returns true when the latch is set` | — |
| 204 | 深度防护 opendepth-guard | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/opendepth-guard.test.ts:e2. full-item-text copy keeps the task marker (splice payload preserved)` | — |
| 205 | 不可移植描述符回退 non-portable-* | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/non-portable-render-source-fallback.test.ts:emits fenced-code form with `mermaid` info string` | — |
| 206 | WYSIWYG 停止规则 wysiwyg-stop-rule | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/wysiwyg-stop-rule.test.ts:wires the ProseMirror clipboard serializer hooks` | — |
| 207 | 图片拖放插入形态 pickInsertShape / shortestImageRef | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/image-upload/pickInsertShape.test.ts:image extension emits jsx-img (canonical <img> JSX shape)`；`packages/editor/src/vendor/open-knowledge/app/src/editor/image-upload/shortestImageRef.test.ts:case 1: same directory returns bare basename` | — |
| 217 | JSX 节点 Escape / ArrowUp / ArrowDown | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:原子 JSX 块可用上下键选中，Escape 退出后可继续编辑并重开` | — |
| 218 | 原始 MDX 块 ArrowUp / ArrowDown 进入；嵌套 CM 内 Mod-z / Mod-y | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:上下方向键进入未知 MDX，嵌套 CodeMirror 撤销重做后保存重开` | — |
| 219 | Shift-Tab 焦点陷阱 | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:空文档显示占位符，Shift-Tab 保留编辑焦点，键入后持久化` | — |
| 220 | 表格行 Enter 下移 | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/table-row-enter.test.ts:caret in a non-last row navigates to the END of the cell below` | — |
| 221 | 维基链接 / 标签 Backspace | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:Backspace 整体删除行尾标签和维基链接，保存重开后邻接文本仍在` | — |
| 222 | 代码预览编辑 Mod-Enter | 已验证 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/CodePreviewEditModal.dom.test.tsx:Cmd/Ctrl+Enter commits the draft via onSave and closes the modal` | — |
| 224 | 查找快捷键（`matchesKeyboardShortcut`） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:查找替换快捷键打开查找栏、定位下一个匹配并一次替换保存` | — |
| 225 | 格式按钮快捷键 ID（format-bold / italic / underline / strike / inline-code / highlight） | 已验证 | `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:格式气泡显示下划线和高亮快捷键，真实按键持久化两种标记`。实际按键写入下划线和高亮，重开验证标记。余下四项沿用 `tests/e2e/knowledge/editor-s3-rules.spec.ts:矩阵·快捷键与粘贴：格式键、块移动、纯文本 / HTML / 裸 URL 粘贴` 与已有套件中的气泡加粗。 | — |
| 233 | 编辑器内资源右键 asset-context-menu（附件、双链、图片） | 已验证 | `tests/e2e/knowledge/editor-parity-assets-template.spec.ts:B01：在正文就地操作附件、图片和双链，支持键盘菜单`。就地复制附件路径，定位图片的树行，双链由键盘唤出并打开 DocTab。 | 复用上游目标识别，接入宿主菜单与资源树镜像。 |
| 235 | 标签页右键 EditorTabTargetMenuItems | 由 Huhu 等价物取代且已验证 | 由 DocTab 标签操作和资源树文件命令取代，依据 design §7 与 §8。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:Huhu 笔记工具栏显示路径并切换编辑模式，DocTab 可聚焦和关闭，资源菜单可复制路径` 验证标签切换、关闭和文件右键命令。 | 标签条没有独立右键入口。Share 属 OP-D19 Q2。 |
| 236 | 重命名对话框 FileTargetRenameDialog | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:文件树重命名拒绝带路径分隔符的名称，并保留 Markdown 扩展名` | — |
| 238 | 侧栏拖放打开 sidebar-drop（拖文件到编辑区） | 由 Huhu 等价物取代且已验证 | 由 ResourceTree 拖拽负载和 Huhu DocTab 导航取代，依据 design §7 与 §8。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:从文件树拖到正文打开 DocTab，外部图片拖入仍保存为附件` 验证真实文件树拖入打开另一标签、源笔记字节不改、系统文件仍按附件保存并重开。 | 编辑区接入上游拖放负载及目标解析，复用 Huhu 的 openTarget。 |
| 244 | MarkdownManager 公开方法 parse / parseToMdast / parseToEditorMdast / parseWithFallback / serialize | 已验证 | `packages/editor/test/markdown-parity.test.ts:parseToMdast 返回正文块，parseToEditorMdast 补出可编辑空行`；`tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真` | — |
| 248 | 序列化管线 createSerializeProcessor / serializeMd | 已验证 | `packages/editor/test/markdown-parity.test.ts:文档边界保留 BOM、前置空行和尾随空行`；`tests/e2e/knowledge/fidelity-local-edit.spec.ts:H07：首次与后续富文本单字替换只改变目标字节，关闭后重开仍一致` | H07 保真机制已存在，首次与后续单字替换均用完整磁盘字节比较。 |
| 251 | MDX / 自定义 toMarkdown 键：mdxJsxFlowElement、mdxJsxTextElement、mark、underline、comment、commentBlock、rawMdxFallback | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真`；`packages/editor/test/markdown-parity.test.ts:行内百分号评论和独立 HTML 评论各自使用专用节点再还原`；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-flip.dom.test.tsx:an in-place interior edit flips sourceDirty and the serializer re-derives fresh bytes` | — |

## 归档已有验证的行

以下行已有原验证记录。此处补充相邻证据，计数不纳入 82 行。

| 行 | 本次重跑或新增证据 |
| ---: | --- |
| 71 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/slash-command-atomicity.dom.test.tsx:running a slash-command item dispatches exactly one doc-changing transaction`；`tests/e2e/knowledge/editor-s3-menus.spec.ts:S3：`/` 菜单过滤并插入块；气泡菜单加粗；一次撤销撤回一个命令` |
| 91 | `tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts:正文标签弹窗列出匹配笔记并能跳转`。正文标签点击触发真实弹窗，查询本地层级标签并跳转。 |
| 89 | `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bare-html-image-decoration.test.tsx:promotes a local HTML void image while leaving its PM bytes literal` |
| 107 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/Callout.test.tsx:collapsible=true renders a chevron <svg> inside <summary>` |
| 108 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/Accordion.test.tsx:defaultOpen=true renders the open attribute on <details>` |
| 109 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:折叠块、对齐、音频、文件、数学和嵌入块保存重开后仍可渲染` |
| 110 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/Tabs.dom.test.tsx:two plain Tabs yield exactly two slots with verbatim labels and ids`；`packages/editor/src/vendor/open-knowledge/app/src/editor/components/Tab.test.tsx:user-provided id sets the panel id (deep-link anchor)` |
| 111 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/Image.dom.test.tsx:removes the placeholder after the inner <img>.load event fires`；`tests/e2e/knowledge/attachments.spec.ts:粘贴 / 拖入图片：落在笔记旁 attachments/，引用写进笔记，图片真的渲染；同图再粘贴不重复` |
| 112 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:折叠块、对齐、音频、文件、数学和嵌入块保存重开后仍可渲染`；`packages/editor/src/vendor/open-knowledge/app/src/editor/components/Video.dom.test.tsx:renders a native <video> for non-YouTube sources` |
| 113 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:折叠块、对齐、音频、文件、数学和嵌入块保存重开后仍可渲染` |
| 116 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:折叠块、对齐、音频、文件、数学和嵌入块保存重开后仍可渲染` |
| 117 | `packages/editor/src/vendor/open-knowledge/app/src/editor/components/Mermaid.dom.test.tsx:the toolbar still pans and zooms the diagram after the tab is shown again` |
| 124 | `tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts:表情选择器离线可用，键盘与鼠标插入后保存重开，Escape 归还编辑焦点`、`editor-s3-matrix.spec.ts` 的表情命令和上游 `EmojiInsertPopover.dom.test.tsx`。文档编辑面已挂载组件，键盘与鼠标插入、磁盘与重开内容、Escape 焦点和零选择器网络请求均通过。 |
| 276 | 本地模板导入已接入 Huhu 文件树，详见 [接口矩阵补充](endpoint-matrix.md) 与真实 Electron 导入、保存和重开测试。 |
| 128 | `tests/e2e/knowledge/editor-s3-large.spec.ts:S3：1 MiB 文档源码优先打开；切到实时预览才构建富文本；源码里的改动在富文本里可见` |
| 129 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:TXT 与 JSON 纯文本编辑各自保存后关闭重开，保留原格式` |
| 115 | `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:Embed 占位符可打开属性，外链不发请求，编辑后关闭重开仍显示阻止状态`。Q3 与 OP-D19 的默认不联网已落实为可见提示和源 URL。无 iframe 或外部请求。插入、更新 URL、保存关闭重开与源 Markdown 保真均通过。 |

## 上游 app 测试迁入

固定 SHA `44a2e0a` 中 `packages/app` 有 596 个已跟踪的 `*.dom.test.*` 文件，包含应用壳、设置、账户等。任务 05 全量逐文件判断，见 [DOM 测试适用性](dom-tests-applicability.md) 和 [审查修复](review-fixes.md)。下表保留任务 02–04 中已单列的迁入记录。

| 统计范围 | 总数（文件） | 原样通过 | 适配后通过 | 不适用 |
| --- | ---: | ---: | ---: | --- |
| 已记录的上游 app DOM | 46 | 40 | 6 | 0 文件。下列两条测试分别因应用壳与 AI 范围跳过。 |
| 本次已运行的上游 app 其他测试 | 77 | 61 | 16 | 0 文件。 |

- `shared.dom.test.tsx:no menu accelerator is claimed by the editor keymap` 测试 OK 桌面应用壳命令注册表。Huhu 自己注册桌面命令。
- `trailing-affordance.dom.test.ts:the composer's reserved band is not part of the zone` 测试 OK Ask AI 输入栏占用空间。Huhu 笔记编辑器无此输入栏。
- 任务 04 原样迁入 `EmojiInsertPopover.dom.test.tsx`，6 项通过，计入下表。`sidebar-drop.test.ts` 仍由第 238 行的 Huhu DocTab 真实拖放用例替代。

| 迁入 DOM 文件（vendor 相对路径） | 分类 | 通过用例 |
| --- | --- | ---: |
| `app/src/components/ui/alert-dialog.dom.test.tsx` | 原样通过 | 22 |
| `app/src/components/ui/calendar.dom.test.tsx` | 原样通过 | 3 |
| `app/src/components/ui/command.dom.test.tsx` | 原样通过 | 8 |
| `app/src/components/ui/dialog.dom.test.tsx` | 原样通过 | 13 |
| `app/src/components/ui/dropdown-menu.dom.test.tsx` | 原样通过 | 7 |
| `app/src/components/ui/empty.dom.test.tsx` | 原样通过 | 11 |
| `app/src/components/ui/loading-image.dom.test.tsx` | 原样通过 | 8 |
| `app/src/components/ui/pane-card.dom.test.tsx` | 原样通过 | 12 |
| `app/src/components/ui/panel.dom.test.tsx` | 原样通过 | 2 |
| `app/src/components/ui/popover.dom.test.tsx` | 原样通过 | 3 |
| `app/src/components/ui/select.dom.test.tsx` | 原样通过 | 5 |
| `app/src/components/ui/sidebar.dom.test.tsx` | 原样通过 | 6 |
| `app/src/components/ui/spinner.dom.test.tsx` | 原样通过 | 7 |
| `app/src/components/ui/tooltip.dom.test.tsx` | 原样通过 | 7 |
| `app/src/editor/bubble-menu/FootnoteBubbleButton.dom.test.tsx` | 原样通过 | 5 |
| `app/src/editor/components/EmojiInsertPopover.dom.test.tsx` | 原样通过 | 6 |
| `app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx` | 原样通过 | 19 |
| `app/src/editor/bubble-menu/ViewInSourceBubbleButton.dom.test.tsx` | 原样通过 | 10 |
| `app/src/editor/clipboard/copy-image.dom.test.ts` | 原样通过 | 4 |
| `app/src/editor/components/CodePreviewEditModal.dom.test.tsx` | 原样通过 | 11 |
| `app/src/editor/components/Image.dom.test.tsx` | 原样通过 | 16 |
| `app/src/editor/components/Mermaid.dom.test.tsx` | 原样通过 | 28 |
| `app/src/editor/components/MirrorSource.dom.test.tsx` | 原样通过 | 1 |
| `app/src/editor/components/PreviewBlockedNotice.dom.test.tsx` | 原样通过 | 8 |
| `app/src/editor/components/PropPanel.dom.test.tsx` | 适配后通过 | 13 |
| `app/src/editor/components/PropPanel.mirror.dom.test.tsx` | 原样通过 | 13 |
| `app/src/editor/components/SrcAutocomplete.dom.test.tsx` | 适配后通过 | 10 |
| `app/src/editor/components/Tabs.dom.test.tsx` | 原样通过 | 11 |
| `app/src/editor/components/Video.dom.test.tsx` | 原样通过 | 59 |
| `app/src/editor/components/live-doc-pool.dom.test.tsx` | 原样通过 | 11 |
| `app/src/editor/components/snapshot-url-pool.dom.test.ts` | 原样通过 | 4 |
| `app/src/editor/components/use-mirror-source.dom.test.tsx` | 原样通过 | 4 |
| `app/src/editor/extensions/JsxInlineView.dom.test.tsx` | 适配后通过 | 21 |
| `app/src/editor/extensions/RawMdxFallbackCMView.dom.test.tsx` | 原样通过 | 4 |
| `app/src/editor/extensions/drag-handle.dom.test.ts` | 原样通过 | 12 |
| `app/src/editor/extensions/shared.dom.test.tsx` | 适配后通过 | 7 |
| `app/src/editor/extensions/slash-command-atomicity.dom.test.tsx` | 原样通过 | 2 |
| `app/src/editor/extensions/source-dirty-flip.dom.test.tsx` | 原样通过 | 2 |
| `app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx` | 适配后通过 | 2 |
| `app/src/editor/extensions/suggestion-atomicity.dom.test.tsx` | 原样通过 | 3 |
| `app/src/editor/extensions/suggestion-floating-ui.dom.test.ts` | 原样通过 | 4 |
| `app/src/editor/extensions/suggestion-ime-triggers.dom.test.tsx` | 原样通过 | 31 |
| `app/src/editor/extensions/trailing-affordance.dom.test.ts` | 适配后通过 | 59 |
| `app/src/editor/link-path-suggestions.dom.test.tsx` | 原样通过 | 20 |
| `app/src/editor/slash-command/SlashCommandMenu.dom.test.tsx` | 原样通过 | 5 |
| `app/src/editor/source-undo-mode-flip.dom.test.ts` | 原样通过 | 2 |
