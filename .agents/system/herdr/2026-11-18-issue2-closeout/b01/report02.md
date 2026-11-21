# B01 task02 执行回报

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- manifest 记录 `b01`，实际运行窗格 `w5:pB`，任务 `task02.md`
- 任务文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/b01/task02.md`
- 工作树 `/home/wta/projects/huhu-wt-b01`，分支 `closeout4/b01`，基线 `2fbe53f`
- 执行结果 `done`，本地提交 `f4180e45c42cb7eaac0639b22d10abe1a19bdb09`，未推送。

## 逐行结果

行号对应基线的归档复刻矩阵。断言文件相对工作树。


| 矩阵行 | 能力 | 原分类 | 当前状态与断言 |
| ---: | --- | --- | --- |
| 31 | 下划线 UnderlineFidelity | 缺验证 | 已验证。富文本修改后重开的文档仍有下划线节点，磁盘只变更编辑的文字。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:161`、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:159` |
| 36 | 行内转义标记 EscapeMark | 缺验证 | 已验证。富文本修改后重开，转义星号仍显示为独立转义标记，磁盘保留原有反斜杠。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:163`、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:159` |
| 37 | 文档级保真 DocFidelity | 缺验证 | 已验证。解析保留 BOM 元数据，序列化完整还原 BOM、前置和尾随空行。`packages/editor/test/markdown-parity.test.ts:22`–23 |
| 39 | HTML 块 HtmlBlockFidelity | 缺验证 | 已验证。改动相邻正文后重开，可见的 HTML 块仍为原文；HTML 块序列化保留 DOCTYPE。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:164`、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:159`、`packages/editor/test/markdown-parity.test.ts:36` |
| 48 | 高亮 Highlight（`==text==`） | 缺验证 | 已验证。改动相邻正文并重开后，标记仍渲染为 mark，磁盘仍保有原高亮语法。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:162`、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:159` |
| 50 | 行内 JSX JsxInline；app 覆盖为 app 版 | 缺验证 | 已验证。重开后识别行内 JSX 为 img；已注册的 componentName 渲染描述符控件。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:165`、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/JsxInlineView.dom.test.tsx:411` |
| 51 | 未知语法兜底 RawMdxFallback；app 覆盖为 app 版 | 缺验证 | 已验证。富文本改动后重开仍可在嵌套 CodeMirror 读取未知组件原文；畸形闭合标记保留为原始块。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:159`–166、`packages/editor/test/markdown-parity.test.ts:84`–88 |
| 52 | 评论标记 CommentMark 与评论块 CommentBlock | 缺验证 | 已验证。行内和独立语法生成不同的评论 mark 与 block 并逐字节还原；行内评论粘回后重开可见。`packages/editor/test/markdown-parity.test.ts:29`–31、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:337`–339 |
| 56 | 编辑器注册表（app 层覆盖与追加）；`scopeExtensionsToDocument` 绑定文档名 | 缺验证 | 已验证。两份文档共享注册顺序，各自的文档级扩展获得不同 docName，普通段落保留同一扩展。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/shared.dom.test.tsx:13`–18 |
| 60 | 单元格插入闸门 CellInsertionGate | 缺验证 | 已验证。在表格单元格中调用组件插入后，ProseMirror 文档与插入前相同。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/cell-insertion-gate.test.ts:145` |
| 62 | 占位符 Placeholder | 缺验证 | 已验证。空正文出现斜杠占位提示，键入后提示消失，保存重开后正文与提示状态保持。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:180`–188 |
| 63 | 协作绑定 Collaboration | 缺验证 | 已验证。真实 ySyncPlugin 内部编辑只触发一次 Observer-A 序列化，结果写回 Y.Text；Huhu 同一文档的多个视图复用本地 Y.Doc。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx:122`–124、`packages/editor/test/provider-pool.test.ts:18`–20 |
| 64 | 文件拖放 / 粘贴上传 FileHandler | 缺验证 | 已验证。真实粘贴和拖入把图片放在笔记旁，校验附件字节、笔记引用和图片解码；重复粘贴复用现有附件。`tests/e2e/knowledge/attachments.spec.ts:74`–91 |
| 72 | 建议菜单 IME 与触发：SuggestionCompositionEnd、suggestion-ime、suggestion-allow、suggestion-floating-ui | 缺验证 | 已验证。合成全角输入组合期间不弹出建议，提交后触发；被容器裁剪的弹层带裁剪标记。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-ime-triggers.dom.test.tsx:222`–237、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/suggestion-floating-ui.dom.test.ts:13` |
| 74 | 块拖拽手柄 BlockDragHandle（@tiptap/extension-drag-handle） | 缺验证 | 已验证。拖动结束后清除记忆目标并发出隐藏句柄事务；嵌套列表使用当前项的侧边和高度定位。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/drag-handle.dom.test.ts:159`–160、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/drag-handle.dom.test.ts:216` |
| 77 | 末尾可写区 TrailingAffordance | 缺验证 | 已验证。表尾写入区在鼠标进入时在文末显示；点击生成一个新空段并将光标移入。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/trailing-affordance.dom.test.ts:117`–122、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/trailing-affordance.dom.test.ts:176`–180 |
| 78 | JSX 节点方向键选择 KeyboardNav | 缺验证 | 已验证。从前后文字用方向键都可选中原子 JSX 块，Escape 解除编辑器焦点。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:432`–436、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:453`–456 |
| 79 | Shift-Tab 焦点陷阱 TabFocusTrap | 缺验证 | 已验证。空文档中按 Shift+Tab 保持编辑焦点，随后仍可输入和保存。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:182`–188 |
| 82 | 查找替换 TiptapFindReplace（FindReplaceBar、FindReplaceController） | 缺验证 | 已验证。查找显示匹配计数和当前高亮，替换全部后重开保留替换结果，Escape 清理装饰。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:40`–59 |
| 83 | 选区状态 SelectionStatePlugin | 缺验证 | 已验证。选区在 JSX 节点之外时，构建出的选区祖先链为空。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/selection-state-plugin.test.ts:98` |
| 84 | 来源 Y 绑定标识 BridgeIdPlugin | 缺验证 | 已验证。插入 JSX 节点分配 b 开头的新 ID；不修改文档的事务保留已有 ID。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bridge-id-plugin.test.ts:81`、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bridge-id-plugin.test.ts:120`–122 |
| 85 | 源码脏标记 SourceDirtyObserver | 缺验证 | 已验证。内部编辑将块置脏并从节点重新生成新字节，Yjs 绑定只消化一次序列化。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-flip.dom.test.tsx:89`–93、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/source-dirty-fold-atomicity.dom.test.tsx:122`–124 |
| 86 | 自主片段编辑守卫 autonomousFragmentEditAllowed | 缺验证 | 已验证。源码模式隐藏富文本时，禁止该富文本实例自主修改片段结构。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/autonomous-fragment-edit.test.ts:18` |
| 87 | 块包裹装饰 chunkWrapperDecoration | 缺验证 | 已验证。只有选区所在的顶层块接收包裹装饰，顶层 JSX 保留独立范围。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/chunk-wrapper-decoration.test.ts:103`、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/chunk-wrapper-decoration.test.ts:125` |
| 88 | 标记身份装饰与交互桥 mark-identity / mark-interaction-bridge | 缺验证 | 已验证。互不相邻的标记拥有不同的装饰 ID；交互桥把相应 ID 和编辑器交给属性面板。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/mark-identity-decoration.test.ts:119`–124、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/mark-interaction-bridge.test.tsx:184`–187 |
| 92 | 嵌套 CM 扩展 nested-cm-extensions | 缺验证 | 已验证。嵌套 CodeMirror 使用调用方提供的 compartment，对视图换行配置进行运行时更新。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/nested-cm-extensions.test.ts:35`–37 |
| 95 | 撤销隔离 dispatchAsOwnUndoStep | 缺验证 | 已验证。事务派发异常时仍关闭本次捕获，避免撤销历史合并到下一步。`packages/editor/src/vendor/open-knowledge/app/src/editor/undo-isolation.test.ts:24`–32 |
| 96 | 源码与富文本切换的撤销模式翻转 | 缺验证 | 已验证。非编辑器写入会在返回时清空旧撤销栈，切回富文本同时清空重做栈。`packages/editor/src/vendor/open-knowledge/app/src/editor/source-undo-mode-flip.test.ts:75`、`packages/editor/src/vendor/open-knowledge/app/src/editor/source-undo-mode-flip.test.ts:87`–98 |
| 122 | 代码预览编辑弹窗 CodePreviewEditModal（Mod-Enter） | 缺验证 | 已验证。Electron 中键盘打开预览编辑、修改代码并保存，重开后预览显示新的 HTML，切回代码仍显示同一内容。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:378`–393 |
| 123 | 属性面板（JSX 节点）PropPanel | 缺验证 | 已验证。Callout 属性面板的下拉选择、折叠区内开关写入磁盘，重开后保留；被策略阻止的属性上传显示反馈。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:418`–430、`packages/editor/src/vendor/open-knowledge/app/src/editor/components/PropPanel.dom.test.tsx:116`–120 |
| 126 | 描述符占位 DescriptorPlaceholder | 缺验证 | 已验证。空 Embed 的占位按钮可以再次打开属性面板；属性输入受焦，保存重开显示更新后的 URL。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:75`–90 |
| 127 | 预览阻断提示 PreviewBlockedNotice | 缺验证 | 已验证。阻断提示显示 URI 与限制类型；真实笔记重开时显示保留的 URL 和阻止状态，未发出外部请求。`packages/editor/src/vendor/open-knowledge/app/src/editor/components/PreviewBlockedNotice.dom.test.tsx:31`–32、`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:86`–90 |
| 130 | 图标白名单 lucide-icon-allowlist | 缺验证 | 已验证。白名单将已知名称映射到固定图标组件，未知图标名无对应组件。`packages/editor/src/vendor/open-knowledge/app/src/editor/components/lucide-icon-allowlist.test.ts:26`、`packages/editor/src/vendor/open-knowledge/app/src/editor/components/lucide-icon-allowlist.test.ts:35` |
| 131 | 基础 UI 原语 components/ui（OK 用到的约 25 个） | 缺验证 | 已验证。真实 Electron 覆盖下拉、折叠、开关、弹层、对话框、输入及快捷键提示，属性与代码编辑结果保留。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:203`–215、`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:369`–393、`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:410`–430 |
| 132 | 主题模式 use-app-color-mode | 缺验证 | 已验证。预览已挂载后，Huhu 的根主题切换使 hook 的读值由 light 更新到 dark。`packages/editor/src/vendor/open-knowledge/app/src/editor/components/use-app-color-mode.dom.test.tsx:22`–26 |
| 139 | 块类型选择 BlockTypeSelector（正文 / 标题 1–3 / 无序 / 有序 / 任务 / 引用 / 代码块） | 缺验证 | 已验证。块类型气泡列齐九种选项，选二级标题后转换当前段落，关闭重开仍为 H2。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:583`–587 |
| 141 | 链接编辑 LinkEditPopover（粘贴链接、应用、新标签打开、移除） | 缺验证 | 已验证。从选区和链接内光标分别创建和编辑链接，确认落盘；DOM 用例检查粘贴 URL 预填及提交空值移除链接。`tests/e2e/knowledge/editor-link-shortcut.spec.ts:33`–46、`packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx:176`–181、`packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/LinkEditPopover.dom.test.tsx:342`–346 |
| 142 | 图片对齐 ImageAlignButtons（左 / 中 / 右） | 缺验证 | 已验证。逐个点击左、中、右对齐，按钮按压状态、图片对齐属性及重开后的图片解码一致。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:133`–140 |
| 143 | 文件块按钮 FileBubbleButtons（下载文件） | 缺验证 | 已验证。文件气泡按笔记相对路径下载指定文件，完整字节及下载名正确，笔记原文保持。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:173`–177 |
| 144 | 脚注转换按钮 FootnoteBubbleButton | 缺验证 | 已验证。选择文字并点击脚注转换，写入同一 ID 的引用和定义；关闭重开仍配对。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:485`–497 |
| 145 | “在源码中查看”按钮 ViewInSourceBubbleButton | 缺验证 | 已验证。气泡操作及快捷键切到源码，聚焦目标行；磁盘原文不变。`tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts:138`–154 |
| 146 | 选区评论按钮 CommentBubbleButton | 缺验证 | 已验证。从选区发起批注，取消无文件，提交后生成带精确锚点的线程文件和正文标记。`tests/e2e/knowledge/comments-s4.spec.ts:84`–93 |
| 147 | 编辑器工具栏 EditorToolbar（属性按钮、模式切换、面包屑、Lint 诊断入口） | 缺验证 | 由 Huhu 等价物取代且已验证。Huhu 笔记工具栏显示路径，属性区可用且可切换源码与实时预览。服务端 Lint 由 OP-D19 Q2 排除。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:243`–253 |
| 148 | 模式切换 EditorModeToggle（“Markdown 源码 / Visual 编辑器”） | 缺验证 | 已验证。从富文本切到源码继续编辑，再切回富文本，保存字节及重开内容一致。`tests/e2e/knowledge/editor-s2b.spec.ts:49`–70 |
| 149 | 面包屑 EditorBreadcrumb | 缺验证 | 由 Huhu 等价物取代且已验证。Huhu 工具栏分别展示父路径和当前笔记名，从资源树打开目标后可切回原 DocTab。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:243`–258 |
| 150 | 表格行列句柄 TableCellHandles | 缺验证 | 已验证。进入表格单元格显示两个行列操作句柄；拖动行后，界面与保存重开后的行序一致。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:237`、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:247`–250 |
| 151 | 表格拖拽重排 useTableDragReorder | 缺验证 | 已验证。拖拽数据行修改实际表格行序并持久化；列重排将首列移至末尾。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:247`–250、`packages/editor/src/vendor/open-knowledge/app/src/editor/table-controls/useTableDragReorder.test.ts:123` |
| 179 | 列表输入规则（`- `、`1. `、`[ ] `） | 缺验证 | 已验证。在独立笔记中输列表简写，断言无序、有序和任务列表对应节点。`tests/e2e/knowledge/editor-s3-rules.spec.ts:65`–72 |
| 184 | `#` 标签触发 TagSuggestion | 缺验证 | 已验证。输入标签前缀后从真实 Vault 候选选择，生成 tag 节点并保存，重开仍可见。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:207`–209、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:216`–219 |
| 185 | `[[` 维基链接触发 WikiLinkSuggestion | 缺验证 | 已验证。输入 wiki 标题前缀从真实候选选择，生成含锚点的引用并持久化；一侧查询失败时保留另一侧结果。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:211`–220、`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/wiki-link-suggestion.test.ts:711`–716 |
| 186 | 链接路径候选 link-path-suggestions | 缺验证 | 已验证。键入不含目录的文件名时打开候选列表，并列出命中文档。`packages/editor/src/vendor/open-knowledge/app/src/editor/link-path-suggestions.dom.test.tsx:86`–87 |
| 188 | 拖放分派 createHandleDrop（有文件时让位给 FileHandler） | 缺验证 | 已验证。带文件的拖放返回 false，结构化分派将该事件交给 FileHandler。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/handle-drop.test.ts:115` |
| 189 | 来源识别 detectSource（15 类：vscode、gfm、pm-origin、gdocs、word、gmail、notion、apple、slack、gsheets、github、generic、markdown-text、plaintext、local） | 缺验证 | 已验证。多种剪贴板来源按 MIME、标记与内容定类；纯文本中的 Markdown 由拖放分派识别，源码剪贴板写本地标记。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/detect-source.test.ts:18`、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/handle-drop.test.ts:235`–239、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/source-clipboard.test.ts:191`–195 |
| 190 | Markdown 判定 isMarkdown | 缺验证 | 已验证。识别 GFM 表格为 Markdown，并对普通字符串使用纯文本判定。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/is-markdown.test.ts:20`、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/is-markdown.test.ts:6` |
| 192 | HTML → mdast 清洗与转换（html-to-mdast，HTML_MAX_BYTES 5 MiB） | 缺验证 | 已验证。HTML 转 Markdown 保留加粗和下划线，大小限制按 UTF-8 字节计算，拒绝超限输入。`packages/editor/test/markdown-parity.test.ts:41`–47 |
| 194 | 剪贴板清洗 clipboard-sanitize（OPT_OUT_ATTR） | 缺验证 | 已验证。清洗器拒绝危险地址协议，允许相对路径，分别校验 srcset 候选，并锁定剪贴板省略标记。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-sanitize.test.ts:47`–50、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-sanitize.test.ts:66`–70、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-sanitize.test.ts:101`–107、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-sanitize.test.ts:405` |
| 195 | 浏览器 DOM 走查 clipboard-walker（样式白名单、LUCIDE 字形映射、wiki 链接还原） | 缺验证 | 已验证。剪贴板 HTML 遍历保留允许的颜色样式并略去无关样式；回退调色板覆盖数学和 Mermaid 块。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-walker.test.ts:99`–103、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/clipboard-walker-fallback-palette.test.ts:28` |
| 196 | 复制 / 剪切 createCopyCutHandler 与富文本序列化 serialize | 缺验证 | 已验证。复制填充实际剪贴板，剪切后删除编辑器及磁盘中的选区内容，粘回并重开后恢复。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:315`–328、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:337`–339 |
| 197 | 纯文本复制 PlainTextClipboard | 缺验证 | 已验证。经 ProseMirror 复制处理器把富文本变成纯文本并保留段间空行。`packages/editor/test/plain-text-clipboard.test.ts:17` |
| 198 | 评论内容剥离 comment-scrub（内部剪贴板 MIME） | 缺验证 | 已验证。复制的公开纯文本和 HTML 省略评论正文，内部 MIME 保留注释原文以支持粘回。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:315`–318 |
| 200 | 复制图片 copy-image | 缺验证 | 已验证。编辑器图片复制将实际 src 传给复制服务；空图与写入失败有区分的反馈。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/copy-image.dom.test.ts:36`–37、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/copy-image.dom.test.ts:70`–71 |
| 202 | 转换 / 遥测 instrument（logSourceDetected、logIfSlow、logConversionFail） | 缺验证 | 已验证。识别来源、达到阈值的耗时、转换失败各产生对应的结构化事件；250 ms 门槛前的粘贴不记录耗时。`packages/editor/test/clipboard-instrument.test.ts:15`–20、`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/instrument.test.ts:72`–83 |
| 203 | Shift 状态跟踪 shift-tracker | 缺验证 | 已验证。粘贴时读取已经捕获的 Shift 按键状态。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/shift-tracker.test.ts:79` |
| 204 | 深度防护 opendepth-guard | 缺验证 | 已验证。复制选中的完整任务项文本保留任务勾选标记。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/opendepth-guard.test.ts:96` |
| 205 | 不可移植描述符回退 non-portable-* | 缺验证 | 已验证。不可移植 Mermaid 描述符回退为带 mermaid 语言标签的 Markdown 围栏代码。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/non-portable-render-source-fallback.test.ts:72` |
| 206 | WYSIWYG 停止规则 wysiwyg-stop-rule | 缺验证 | 已验证。WYSIWYG 停止规则把纯文本、HTML、拖放、复制和剪切交到相应处理器。`packages/editor/src/vendor/open-knowledge/app/src/editor/clipboard/wysiwyg-stop-rule.test.ts:28`–38 |
| 207 | 图片拖放插入形态 pickInsertShape / shortestImageRef | 缺验证 | 已验证。本地图片选择标准 JSX img 插入形态；同目录引用压缩为文件名。`packages/editor/src/vendor/open-knowledge/app/src/editor/image-upload/pickInsertShape.test.ts:6`、`packages/editor/src/vendor/open-knowledge/app/src/editor/image-upload/shortestImageRef.test.ts:6` |
| 217 | JSX 节点 Escape / ArrowUp / ArrowDown | 缺验证 | 已验证。ArrowDown 与 ArrowUp 分别从块前、块后选中 JSX，Escape 退出，恢复焦点后可继续写。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:432`–436、`tests/e2e/knowledge/editor-parity-closeout.spec.ts:453`–463 |
| 218 | 原始 MDX 块 ArrowUp / ArrowDown 进入；嵌套 CM 内 Mod-z / Mod-y | 缺验证 | 已验证。上下箭头均能从正文进入原始 MDX 的 CodeMirror；撤销与重做后的代码保存并重开。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:545`–562 |
| 219 | Shift-Tab 焦点陷阱 | 缺验证 | 已验证。Shift+Tab 后富文本保持焦点，可继续输入，保存重开后仍有输入内容。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:182`–188 |
| 220 | 表格行 Enter 下移 | 缺验证 | 已验证。在非末行表格内按 Enter，将光标移到下方同列单元格的末尾。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/table-row-enter.test.ts:82`–97 |
| 221 | 维基链接 / 标签 Backspace | 缺验证 | 已验证。在标签或维基链接后的 Backspace 删除完整节点，邻接文字与磁盘行保持。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:519`–526 |
| 222 | 代码预览编辑 Mod-Enter | 缺验证 | 已验证。在预览编辑弹窗中按 Mod+Enter 提交当前 CodeMirror 草稿并关闭弹窗。`packages/editor/src/vendor/open-knowledge/app/src/editor/components/CodePreviewEditModal.dom.test.tsx:267`–284 |
| 224 | 查找快捷键（`matchesKeyboardShortcut`） | 缺验证 | 已验证。Ctrl/Meta+F 聚焦查找，F3 转到下一命中，Ctrl+H 展开替换行并可将结果保存。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:35`–59 |
| 225 | 格式按钮快捷键 ID（format-bold / italic / underline / strike / inline-code / highlight） | 缺验证 | 已验证。真实按键触发格式规则，气泡展示快捷键；下划线和高亮保存重开仍渲染为各自标记。`tests/e2e/knowledge/editor-s3-rules.spec.ts:97`–129、`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:209`–216 |
| 233 | 编辑器内资源右键 asset-context-menu（asset / wiki-link / image 目标；`contextmenu` → `okDesktop.shell.showAssetMenu`） | 缺验证 | 已验证。在正文内对附件复制路径、对图片定位树行、对双链以键盘唤出菜单并打开文档。`tests/e2e/knowledge/editor-parity-assets-template.spec.ts:28`–49 |
| 235 | 标签页右键 EditorTabTargetMenuItems | 缺验证 | 由 Huhu DocTab 入口适配且已验证。Huhu DocTab 支持右键与键盘打开菜单，复制路径、定位树行；关闭脏标签按设置自动保存或保留草稿。Share 属 OP-D19 Q2。`tests/e2e/knowledge/layout-tab-menu.spec.ts:24`–46、`tests/e2e/knowledge/layout-tab-menu.spec.ts:88`–97 |
| 236 | 重命名对话框 FileTargetRenameDialog | 缺验证 | 已验证。拒绝带路径分隔符的改名；合法改名保留 Markdown 扩展名和文件原字节。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:601`–613 |
| 238 | 侧栏拖放打开 sidebar-drop（拖文件到编辑区） | 缺验证 | 由 Huhu 等价物取代且已验证。将文件树行拖入编辑区打开目标 DocTab，来源笔记原文不变；外部图片继续落盘为附件。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:290`–306 |
| 244 | MarkdownManager 公开方法 parse / parseToMdast / parseToEditorMdast / parseWithFallback / serialize | 缺验证 | 已验证。parseToMdast 返回正文块，parseToEditorMdast 保留可编辑空行，parseWithFallback 和 serialize 的输出与输入契约一致。`packages/editor/test/markdown-parity.test.ts:12`–16 |
| 248 | 序列化管线 createSerializeProcessor / serializeMd | 缺验证 | 已验证。序列化保留文档边界；首次及后续富文本单字替换只改变目标的 Git diff 和磁盘字节。`packages/editor/test/markdown-parity.test.ts:22`–23、`tests/e2e/knowledge/fidelity-local-edit.spec.ts:76`–88 |
| 251 | MDX / 自定义 toMarkdown 键：mdxJsxFlowElement、mdxJsxTextElement、mark、underline、comment、commentBlock、rawMdxFallback | 缺验证 | 已验证。MDX、下划线和高亮在富文本改动后重开保真；行内和块注释、未知块原文能反向序列化。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:161`–167、`packages/editor/test/markdown-parity.test.ts:29`–31、`packages/editor/test/markdown-parity.test.ts:84`–88 |
| 265 | 布尔字段 use-boolean-frontmatter-field | 推定范围 | 待用户决定。原矩阵 §14 第 6 项为推定，OP-D19 Q2 无幻灯片条目。固定 OK `44a2e0a:packages/app/src/components/SlidesToolbarControls.tsx:164` 读取 `slides`。 |

## 改动摘要

- 从基线提取 82 个旧标记，核对与已合入的 `evidence/parity/parity-82.md` 行号集合相同。回填各行的具体行为与 128 个当前断言链接。§18 计为 78 行已有行为断言、4 行 Huhu 适配入口、0 行仍缺具体证据。
- 第 235 行引用当前真实 DocTab 的右键和键盘菜单，以及自动保存与手动草稿测试。早期专项表中的标签条无独立右键入口描述已过时。
- 现有遥测用例主要覆盖剪贴板遍历和错误分类。第 202 行新增宿主用例，固定时钟验证来源事件、249/250 ms 的粘贴日志边界和转换失败事件字段。该测试使用与 provider 池测试相同的宿主类型检查配置。生产代码和 vendor 字节无改动。

## 待用户决定

- 第 265 行依赖幻灯片范围。固定 OK `44a2e0a` 中的生产调用只有 `packages/app/src/components/SlidesToolbarControls.tsx:164`，读取前置字段 `slides`。原矩阵第 153 行与 §14 第 6 项（第 375 行）明确称作「推定，需用户确认」。`spec.md:120` 的 Q2 和 `decisions.md:133–135` 的 OP-D19 仅采纳已列出的默认项，主会话的 `user-decisions.md` 也未记录幻灯片决定。第 265 行登记待定。如果确认排除，可同时确立工具栏与对应 hook 的不适用口径；如果确认纳入，需明确 OK 幻灯片操作入口及其交付和验收范围。

## 验证

- `git diff 2fbe53f HEAD --check` 通过。脚本复核 82 个原目标、128 个断言锚点和第 265 行登记。矩阵引用的 43 个上游测试文件均在本轮 Vitest JSON 中。
- `pnpm format:check`、`pnpm lint`、`pnpm knip`、`pnpm notices` 均退出 0。编辑器测试及两份类型配置额外通过 `oxfmt --check`。
- `pnpm --workspace-concurrency=2 -r typecheck` 退出 0。加入新测试后，编辑器类型检查初次退出 126，原因是默认配置没有导入上游别名。测试移入现行宿主类型检查配置后，`pnpm --filter @huhu/editor typecheck` 退出 0。日志 `/tmp/huhu-b01-t02-{typecheck,editor-typecheck,editor-typecheck-r2}.log`。
- `pnpm build` 退出 0，`check:ok-css` 的 A/B/C 均为 0。该构建使用 `2fbe53f` 的生产代码，交付提交只增加矩阵、测试及该测试的类型配置。日志 `/tmp/huhu-b01-t02-build.log`。
- `node scripts/ok-patches.mjs --check` 退出 0，545 项登记，0 未登记、0 多余。日志 `/tmp/huhu-b01-t02-vendor-check.log`。
- Node 24.22.1 的 `vitest run` 定向执行 clipboard-instrument、markdown-parity、plain-text-clipboard 和 provider-pool，单 worker，4 文件、38 项通过，退出 0。日志 `/tmp/huhu-b01-t02-target-unit.log`。
- `pnpm test:vendor --maxWorkers=2` 初次退出 126（Vitest 退出 1），529 文件、9,180 项通过，1 项失败、4 项跳过。失败是链接弹层预填 URL 后的选区起点。在 Node 24.22.1 下单 worker 只复跑该用例，1 项通过、18 项未选中，退出 0。日志与 JSON `/tmp/huhu-b01-t02-vendor.log`、`/tmp/huhu-b01-t02-vendor.json`、`/tmp/huhu-b01-t02-vendor-retry.log`。
- Linux Electron 44.9.1 定向运行 36 项，`xvfb-run -a node_modules/.bin/playwright test <文件与行号> --workers=1 --retries=0`。首轮 32 通过，4 项命中 60 秒总超时，退出 126（Playwright 报失败）。确认无其他 Electron 或 Playwright 进程且负载降到 3.88 后，仅复跑附件、选区批注、Mod+K、Embed 共 4 项，全部通过，退出 0。日志 `/tmp/huhu-b01-t02-e2e.log`、`/tmp/huhu-b01-t02-e2e-retry.log`。首轮用例参数保存在 `/tmp/b01-t02-e2e-args`。
- `pnpm test --maxWorkers=2 --reporter=dot` 首轮退出 126。CSS 碰撞测试 23 项通过，Vitest 96 文件通过、2 文件失败，1,279 项通过、13 项失败。失败发生在引擎和 Vault 的超时及 Herdr 会话连通性。待负载降到 3.69 后，按项目 Node 24.22.1 单 worker 只复跑两文件的 13 个失败项，13 项全部通过、44 项未选中，退出 0。新增测试已包含在独立通过的 38 项定向结果中。日志 `/tmp/huhu-b01-t02-unit.log`、`/tmp/huhu-b01-t02-unit-retry.log`。

## 验证边界

- 组合行的标记以列出的行为为准。任务使用 Linux Electron 与适用的上游 DOM 用例。真实输入法、Windows/macOS 实机和全量 Electron 依任务约定未运行。第 265 行的范围待决定已单独列出。

### Modern Web Guidance

- 我读取了 `accessibility` 的键盘导航与焦点验证指南，用于复核现有键盘路径的证据。新增用例只测试剪贴板日志行为。

- 2026-11-20 Lead：接受。第 265 行幻灯片范围已由用户确认排除（user-decisions.md），集成时更新矩阵该行。
