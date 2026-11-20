# S0 复刻矩阵（parity-matrix）

> 规格：[spec.md](../spec.md) B01 与 §3、§9（Q2 / Q10）；设计：[design.md](../design.md) §2–§14；复用：[reuse.md](../reuse.md)；任务：[tasks/00-freeze-and-spikes.md](../tasks/00-freeze-and-spikes.md) 实施要点 4。
> 生成日期：2026-11-15。上游：Open Knowledge 固定 SHA `44a2e0a`，本地工作副本 `temp/sources/open-knowledge`。Huhu 基线：`9132640`（v0.0.1-rc.4）。
> 本文是**清单**，不是完成证明：每行的“动作”是 S0 的判断，实施阶段按 B01 要求逐行补“源码 → Huhu 实现 → 测试”。

## 0. 口径

- **上游根**：`temp/sources/open-knowledge/packages/`。表中路径均相对该根；`app/` = `app/src/`，`core/` = `core/src/`（测试文件名同理）。
- **动作**只取四值：
  - **直接复制**：随 vendor 原样进入 `packages/editor/src/vendor/open-knowledge/`（design §2），仅因宿主引用需要的最小改动另记。
  - **宿主适配**：功能保留，但数据源 / 持久化 / 外部能力必须改接 Huhu（design §3–§11 指向的适配点）。
  - **不适用**：OK 的云协作 / 账户 / 服务端 / AI 代理 / 技能等能力，依据 spec §8 与 Q2 默认；必须写原因。
  - **待定**：需用户确认（Q2 / Q10）或未核实，S0 不得默认放行或默认删除。
- **粒度**：同一能力的小型辅助文件合并一行并列出主要文件；“对应上游测试”列同目录同名测试，无则写“无同名测试”。
- **“未核实”**：读源码或测试清单后仍无法确定的点，明确标注，不推断。

## 1. Tiptap 节点 / 标记（core 注册表；app 覆盖见 §2）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| StarterKit 未被 `false` 关闭的默认扩展（清单未逐项核实） | core/src/extensions/shared.ts（StarterKit.configure，`undoRedo:false`、`trailingNode:false`） | 无同名测试；间接见 core/src/extensions/shared.test.ts | 直接复制 | 撤销由 y-tiptap 接管（spec B05），不装第二套历史 | — | 已验证：上游单测通过：shared.test.ts |
| 有序 / 无序 / 任务列表 List、ListItem | core/src/extensions/list.ts | core/src/extensions/list.test.ts | 直接复制 | — | — | 已验证：e2e：「无序有序任务列表」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 列表边界合并 ListBoundaryMerge | core/src/extensions/list-boundary-merge.ts | 无同名测试 | 直接复制 | — | — | task02 补证见[合并前后列表结构与落盘断言](../../../../../../../tests/e2e/knowledge/editor-s3-parity.spec.ts#L414-L415) |
| 标题 HeadingFidelity（Heading.extend） | core/src/extensions/heading-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「标题与段落」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 引用块 BlockquoteFidelity（Blockquote.extend） | core/src/extensions/blockquote-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「引用与分隔线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 分隔线 ThematicBreakFidelity（HorizontalRule.extend） | core/src/extensions/thematic-break-fidelity.ts | core/src/extensions/thematic-break-fidelity.test.ts | 直接复制 | — | — | 已验证：上游单测通过：thematic-break-fidelity.test.ts；e2e：「引用与分隔线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 粗体 StrongFidelity | core/src/extensions/emphasis-fidelity.ts（Bold.extend） | core/src/extensions/emphasis-fidelity.test.ts | 直接复制 | — | — | 已验证：上游单测通过：emphasis-fidelity.test.ts；e2e：「强调与删除线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 斜体 EmphasisFidelity | core/src/extensions/emphasis-fidelity.ts（Italic.extend） | core/src/extensions/emphasis-fidelity.test.ts | 直接复制 | — | — | 已验证：上游单测通过：emphasis-fidelity.test.ts；e2e：「强调与删除线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 删除线 StrikeFidelity | core/src/extensions/strike-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「强调与删除线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 下划线 UnderlineFidelity | core/src/extensions/underline-fidelity.ts | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 行内代码 CodeMarkFidelity | core/src/extensions/code-mark-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「强调与删除线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 代码块 CodeBlockFidelity（core 版）；app 覆盖为 app 版 | core/src/extensions/code-block-fidelity.ts；app/src/editor/extensions/code-block.ts（shared.ts 中替换） | app/src/editor/extensions/code-block.test.ts；code-block-meta.test.ts；code-block-languages.test.ts；code-block-preview-csp.test.ts；CodeBlockView.dom.test.tsx | 直接复制 | 两版本都要复制；预览 iframe 见 §2 | — | 已验证：e2e：「围栏代码块」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 硬换行 HardBreakFidelity | core/src/extensions/hard-break-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「混合换行与尾随空格」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 链接 LinkFidelity；app 覆盖为 InternalLink | core/src/extensions/link-fidelity.ts；app/src/editor/extensions/internal-link.ts | core/src/extensions/link-fidelity.test.ts；app internal-link.asset-activation / external-open / tracked-file-activation / tracked-tab .test.ts；link-edit-autoopen.test.ts | 宿主适配 | 内部链接打开改为 DocTab（design §7）；外链经桌面桥（design §4）；资源激活走查看器分派（design §11.1） | — | 已验证：上游单测通过：link-fidelity.test.ts；e2e：「链接与图片」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 行内转义标记 EscapeMark | core/src/extensions/escape-mark.ts | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 文档级保真 DocFidelity | core/src/extensions/doc-fidelity.ts | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 源码字面量标记 SourceLiteralMark | core/src/extensions/source-literal-mark.ts | core/src/extensions/source-literal-mark.test.ts | 直接复制 | — | — | 已验证：上游单测通过：source-literal-mark.test.ts |
| HTML 块 HtmlBlockFidelity | core/src/extensions/html-block-fidelity.ts | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 链接引用定义 LinkRefDefFidelity | core/src/extensions/link-ref-def-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「引用与分隔线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 行内图片 ImageSrcFidelity；app 覆盖为 ImageInlineZoom | core/src/extensions/image-src-fidelity.ts；app/src/editor/extensions/image-inline-zoom.ts + ImageInlineZoomView.tsx | app/src/editor/extensions/ImageInlineZoomView.dom.test.tsx | 宿主适配 | 图片 src 解析与上传 URL 改为 Huhu 资源路径（design §4 `/api/upload` → notes.attach；§5.3） | — | 已验证：e2e：「链接与图片」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 图片引用 ImageReference（`imageReference`） | core/src/extensions/image-reference-fidelity.ts；app/src/editor/extensions/image-reference.ts + ImageReferenceView.tsx | app/src/editor/extensions/ImageReferenceView.test.ts；ImageReferenceView.dom.test.tsx | 宿主适配 | 引用解析用 Huhu 资源目录（design §5.3） | — | 已验证：e2e：「引用与分隔线」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 脚注引用 / 定义 FootnoteReference、FootnoteDefinition | core/src/extensions/footnote-reference.ts、footnote-definition.ts；app/src/editor/extensions/footnote-anchor-scroll.ts | core/src/extensions/footnote-reference.test.ts；app/src/editor/bubble-menu/FootnoteBubbleButton.dom.test.tsx | 直接复制 | — | — | 已验证：上游单测通过：footnote-reference.test.ts；e2e：「脚注」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 行内数学 MathInline；app 覆盖为 app 版 | core/src/extensions/math-inline.ts；app/src/editor/extensions/math-inline.ts + MathInlineView.tsx | app/src/editor/math-input-rule.test.ts；app/src/editor/components/Math.test.tsx | 直接复制 | KaTeX 依赖登记（reuse §9） | — | 已验证：e2e：「数学」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 维基链接 WikiLink；app 覆盖为 app 版 | core/src/extensions/wiki-link.ts；app/src/editor/extensions/wiki-link.ts + WikiLinkPropPanel.tsx | core/src/extensions/wiki-link.test.ts；app wiki-link.doc-activation / external-open / resolution-cache .test.ts；wiki-link-helpers.test.ts；wiki-link-icon.dom.test.tsx；WikiLinkPropPanel.dom.test.tsx；WikiLinkPropPanel.destination.dom.test.tsx | 宿主适配 | 解析 / 候选 / 锚点接 notes 链接能力（design §4 `/api/page-headings`、`/api/forward-links` 等；§5.3） | — | 已验证：上游单测通过：wiki-link.test.ts；e2e：「双链与标签」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 维基嵌入 WikiLinkEmbed | core/src/extensions/wiki-link-embed.ts；app/src/editor/extensions/wiki-link-embed.ts + WikiLinkEmbedImageView.tsx | core/src/extensions/wiki-link-embed.test.ts；app wiki-link-embed.test.ts；WikiLinkEmbedImageView.dom.test.tsx | 宿主适配 | 嵌入资源解析走 Huhu 资源层（design §5.3） | — | 已验证：上游单测通过：wiki-link-embed.test.ts；e2e：「双链与标签」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 标签 Tag（`#tag`）；app 覆盖为 TagView | core/src/extensions/tag.ts；app/src/editor/extensions/tag-view.ts；components/TagView.tsx | app/src/editor/extensions/tag-suggestion.test.ts；components/TagView.test.tsx；TagView.dom.test.tsx；components/TagDialog.test.tsx | 宿主适配 | `notes.tags`（design §4 `/api/tags`）；点击标签 → Huhu 标签/搜索 | — | 已验证：e2e：「双链与标签」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 高亮 Highlight（`==text==`） | core/src/extensions/shared.ts（@tiptap/extension-highlight） | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 块级 JSX 组件 JsxComponent；app 覆盖为 app 版 | core/src/extensions/jsx-component.ts；app/src/editor/extensions/jsx-component.ts + JsxComponentView.tsx | core/src/extensions/jsx-component.test.ts；app JsxComponentView.test.ts / .mirror / .mermaid-expand / .auto-convert .dom.test.tsx；jsx-render-contract.test.ts；jsx-node-target.test.ts | 宿主适配 | 组件清单来自 core/src/registry（超出限定范围，未核实）；“Ask AI”按钮不适用（§14）；Mirror 依赖云协作（§3） | — | 已验证：上游单测通过：jsx-component.test.ts |
| 行内 JSX JsxInline；app 覆盖为 app 版 | core/src/extensions/jsx-inline.ts；app/src/editor/extensions/jsx-inline.ts + JsxInlineView.tsx | app/src/editor/extensions/JsxInlineView.dom.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 未知语法兜底 RawMdxFallback；app 覆盖为 app 版 | core/src/extensions/raw-mdx-fallback.ts；app/src/editor/extensions/raw-mdx-fallback.ts + RawMdxFallbackCMView.tsx | app RawMdxFallbackCMView.test.ts / .dom.test.tsx；raw-mdx-fallback.test.ts；raw-mdx-nested-copy-version-pin.test.ts | 直接复制 | spec §4“未知语法可见可恢复”依赖本项 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 评论标记 CommentMark 与评论块 CommentBlock | core/src/extensions/comment-mark.ts、comment-block.ts | 无同名测试（评论行为测试见 §11） | 宿主适配 | 锚点与持久化走 `comments.*`（design §9）；字段对照 S4 第一步 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 前置元数据常量 frontmatter（FRONTMATTER_RE、FM_FENCE_LINE_RE） | core/src/extensions/frontmatter.ts | core/src/extensions/frontmatter.test.ts | 宿主适配 | YAML 只留一份编解码（OP-D17；SP-5 对拍） | — | 已验证：上游单测通过：frontmatter.test.ts；e2e：「围栏代码块」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 输入规则文本工具 INLINE_OBJECT_PLACEHOLDER | core/src/extensions/input-rule-text.ts | core/src/extensions/input-rule-text.test.ts | 直接复制 | — | — | 已验证：上游单测通过：input-rule-text.test.ts |
| 核心注册表 sharedExtensions（core 层） | core/src/extensions/shared.ts | core/src/extensions/shared.test.ts | 直接复制 | 作为 app 覆盖的基线 | — | 已验证：上游单测通过：shared.test.ts |
| 编辑器注册表（app 层覆盖与追加）；`scopeExtensionsToDocument` 绑定文档名 | app/src/editor/extensions/shared.ts；app/src/editor/TiptapEditor.tsx:258 | app/src/editor/extensions/shared.dom.test.tsx | 宿主适配 | 覆盖表（code / image / link / wikiLink / jsx 等）随 Huhu 适配同步维护；文档名取自 DocumentSession（design §3.1） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 表格 Table（TableFidelity resizable、TableRow、TableHeader / TableCell fidelity） | core/src/extensions/table-fidelity.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「表格」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 表格插入控件 TableInsertControls | app/src/editor/extensions/table-insert-controls.ts | app/src/editor/extensions/table-insert-commands.test.ts | 直接复制 | — | — | 已验证：e2e：「表格」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 表格回车下移 TableRowEnter | app/src/editor/extensions/table-row-enter.ts | app/src/editor/extensions/table-row-enter.test.ts | 直接复制 | — | — | 已验证：e2e：「表格」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 单元格插入闸门 CellInsertionGate | app/src/editor/extensions/cell-insertion-gate.ts | app/src/editor/extensions/cell-insertion-gate.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 冻结表头 FrozenTableHeaders | app/src/editor/extensions/frozen-table-headers.ts | app/src/editor/extensions/frozen-table-headers.test.ts | 直接复制 | 依赖 CSS scroll-driven 动画；Electron 版本支持未核实 | — | 已验证：e2e：「表格」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 占位符 Placeholder | app/src/editor/TiptapEditor.tsx:260 | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 协作绑定 Collaboration | app/src/editor/TiptapEditor.tsx:238–241 | 无同名测试 | 宿主适配 | 由 LocalDocProvider 替代，无 Hocuspocus 网络层（OP-D02；spec R2） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 文件拖放 / 粘贴上传 FileHandler | app/src/editor/extensions/shared.ts（FileHandler.configure onDrop / onPaste） | app/src/editor/image-upload/*.test.ts（见 §6 上传行） | 宿主适配 | `notes.attach`（design §4、§6） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 上传装饰与插入（uploadDecorationPlugin） | app/src/editor/image-upload/index.ts；upload-file.ts | image-upload/upload-file.test.ts；upload-failure.test.ts；single-file-upload.test.ts；pickInsertShape.test.ts；shortestImageRef.test.ts；media-drop-shape-invariant.test.ts | 宿主适配 | `/api/upload`（image-upload/index.ts:255；upload-file.ts:20）→ `notes.attach`；大小 / 类型限制（design §4） | — | 已验证：e2e：「链接与图片」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |

## 2. 编辑器扩展行为（app/src/editor/extensions 与相关插件）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| `/` 斜杠触发 SlashCommand | app/src/editor/extensions/slash-command.ts（char `/`，ArrowUp/Down、Enter/Tab、Escape 处理） | app/src/editor/extensions/slash-command-atomicity.dom.test.tsx；suggestion-atomicity.dom.test.tsx；app/src/editor/slash-command/SlashCommandMenu.dom.test.tsx | 直接复制 | — | — | task02 补证见[逐项效果断言](../../../../../../../tests/e2e/knowledge/editor-s3-matrix.spec.ts#L278-L301) |
| 建议菜单 IME 与触发：SuggestionCompositionEnd、suggestion-ime、suggestion-allow、suggestion-floating-ui | app/src/editor/extensions/suggestion-ime.ts、suggestion-allow.ts、suggestion-floating-ui.ts、SuggestionCompositionEnd（`extensions/shared.ts`） | suggestion-ime-triggers.dom.test.tsx；suggestion-floating-ui.dom.test.ts | 直接复制 | 真实输入法（微软拼音 / macOS）未验证，spec §7 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 格式快捷键 FormattingShortcuts（Mod-Shift-x） | app/src/editor/extensions/formatting-shortcuts.ts | 无同名测试 | 直接复制 | 键位接 Huhu 快捷键表（见 §7） | — | 已验证：e2e：Mod-Shift-x 删除线通过（rules-run.json） |
| 块拖拽手柄 BlockDragHandle（@tiptap/extension-drag-handle） | app/src/editor/extensions/drag-handle.ts；bubble-menu/drag-menu-lifecycle.ts；extensions/gutter-plus-icon.ts | app/src/editor/extensions/drag-handle.dom.test.ts | 直接复制 | 依赖 `@tiptap/extension-drag-handle` 补丁（reuse §9） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 块移动 BlockMover（Mod-Shift-ArrowUp / Down） | app/src/editor/extensions/block-mover.ts | app/src/editor/extensions/block-mover.test.ts | 直接复制 | — | — | 已验证：e2e：Mod-Shift-ArrowUp 块上移通过（rules-run.json） |
| 列表项拖拽 ListItemDrag | app/src/editor/extensions/list-item-drag.ts | list-item-drag.test.ts；list-item-drag.bubble.test.ts；list-item-drag.collab.test.ts | 直接复制 | `.collab.test.ts` 的保留条件未核实（随 Yjs 本地保留） | — | 已验证：e2e：「无序有序任务列表」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 末尾可写区 TrailingAffordance | app/src/editor/extensions/trailing-affordance.ts | app/src/editor/extensions/trailing-affordance.dom.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| JSX 节点方向键选择 KeyboardNav | app/src/editor/block-ux/keyboard-nav.ts | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| Shift-Tab 焦点陷阱 TabFocusTrap | app/src/editor/extensions/tab-focus-trap.ts | app/src/editor/extensions/tab-focus-trap.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 标题锚点 HeadingAnchors | app/src/editor/extensions/heading-anchors.ts | 无同名测试 | 直接复制 | 大纲以 PM heading 为准，不再对原文跑正则（spec B10） | — | 已验证：e2e：「标题与段落」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 脚注锚点滚动 FootnoteAnchorScroll | app/src/editor/extensions/footnote-anchor-scroll.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「脚注」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 查找替换 TiptapFindReplace（FindReplaceBar、FindReplaceController） | app/src/editor/find-replace/tiptap-find-replace-extension.ts；FindReplaceBar.tsx；FindReplaceController.tsx | app/src/editor/find-replace/tiptap-find-replace-extension.test.ts；literal-matcher.test.ts | 宿主适配 | 快捷键由 `@/lib/keyboard-shortcuts` 提供（超出限定范围，未读）→ Huhu 快捷键系统；源码模式查找同用 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 选区状态 SelectionStatePlugin | app/src/editor/extensions/selection-state-plugin.ts | app/src/editor/extensions/selection-state-plugin.test.ts | 直接复制 | 块选择是 B02 / B06 的验证对象 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 来源 Y 绑定标识 BridgeIdPlugin | app/src/editor/extensions/bridge-id-plugin.ts | app/src/editor/extensions/bridge-id-plugin.test.ts | 直接复制 | 随 Yjs 本地保留 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 源码脏标记 SourceDirtyObserver | app/src/editor/extensions/source-dirty-observer.ts | source-dirty-flip.dom.test.tsx；source-dirty-fold-atomicity.dom.test.tsx；source-dirty-observer.autonomous-swap.test.ts；source-dirty-observer.origin-guard.test.ts；source-dirty-serialize.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 自主片段编辑守卫 autonomousFragmentEditAllowed | app/src/editor/extensions/autonomous-fragment-edit.ts | app/src/editor/extensions/autonomous-fragment-edit.test.ts | 直接复制 | 防止源码隐藏时 WYSIWYG 双写（CRDT 层）；随 Yjs 保留 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 块包裹装饰 chunkWrapperDecoration | app/src/editor/extensions/chunk-wrapper-decoration.ts | app/src/editor/extensions/chunk-wrapper-decoration.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 标记身份装饰与交互桥 mark-identity / mark-interaction-bridge | app/src/editor/extensions/mark-identity.ts；mark-identity-decoration.ts；mark-interaction-bridge.ts | mark-identity.test.ts；mark-identity-decoration.test.ts；mark-interaction-bridge.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 裸 HTML 图片装饰 bare-html-image-decoration | app/src/editor/extensions/bare-html-image-decoration.tsx | app/src/editor/extensions/bare-html-image-decoration.test.tsx | 直接复制 | — | — | 已验证：e2e：「链接与图片」构造无编辑打开字节不变且渲染（matrix-run.json constructs）；e2e：`/` 菜单项「Image」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 链接解析装饰与统一性 link-resolution* | app/src/editor/extensions/link-resolution.ts；link-resolution-decoration.ts；link-resolution-uniformity.test.ts | link-resolution.test.ts；link-resolution-decoration.test.ts；link-resolution-uniformity.test.ts | 宿主适配 | 解析源换为 Huhu 资源索引（design §5.3） | — | 已验证：e2e：「链接与图片」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 标签点击 TagClickPlugin（`ok:tag-click` 事件） | app/src/editor/extensions/tag-click-plugin.ts | 无同名测试 | 宿主适配 | 点击 → Huhu 标签导航 | — | 已验证：e2e：「双链与标签」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 嵌套 CM 扩展 nested-cm-extensions | app/src/editor/extensions/nested-cm-extensions.ts | app/src/editor/extensions/nested-cm-extensions.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 代码块 / HTML 预览 iframe：PreviewFrame、preview-iframe-header、preview-iframe-theme、preview-live-tokens | app/src/editor/extensions/PreviewFrame.tsx；preview-iframe-header.ts；preview-iframe-theme.ts；preview-live-tokens.ts | preview-iframe-csp-violation.test.ts；preview-iframe-theme.test.ts；preview-live-tokens.test.ts；code-block-preview-csp.test.ts | 宿主适配 | 必须替换为 design §11.3 的 `huhu-preview` 隔离方案；OK 原 iframe 的 sandbox 配置未核实，不得沿用 | — | 已验证：e2e：「围栏代码块」构造无编辑打开字节不变且渲染（matrix-run.json constructs）；e2e：`/` 菜单项「HTML」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 媒体渲染属性 media-render-props | app/src/editor/extensions/media-render-props.ts | app/src/editor/extensions/media-render-props.test.ts | 直接复制 | — | — | 已验证：e2e：「前置属性」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 撤销隔离 dispatchAsOwnUndoStep | app/src/editor/undo-isolation.ts | app/src/editor/undo-isolation.test.ts | 直接复制 | B05：一次撤销与 y-tiptap 单一历史 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 源码与富文本切换的撤销模式翻转 | app/src/editor/source-undo-mode-flip.ts | source-undo-mode-flip.test.ts；source-undo-mode-flip.dom.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 选区 / 节点交互装饰与列表编辑辅助 list-editing-helpers、use-block-selection（hooks） | app/src/editor/extensions/list-editing-helpers.ts；app/src/editor/hooks/use-block-selection.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：「无序有序任务列表」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 技能路径链接 SkillPathLinks | app/src/editor/extensions/skill-path-links.ts | app/src/editor/extensions/skill-path-links.test.ts | 不适用 | — | OK 技能体系（依赖 `@inkeep/open-knowledge-core/constants/cc1` 与技能注册表）；Huhu 无对应实体（未核实）；Q2 未列，属推定，需用户确认 | 不适用：OK 技能体系（依赖 `@inkeep/open-knowledge-core/constants/cc1` 与技能注册表）；Huhu 无对应实体（未核实）；Q2 未列，属推定，需用户确认 |
| Markdown Lint 装饰 MarkdownLintDecorations | app/src/editor/extensions/markdown-lint-decorations.ts | app/src/editor/extensions/markdown-lint-decorations.test.ts；markdown-lint-decorations.okf.test.ts | 不适用 | — | lint 为服务端能力（markdownlint，约 1.9k 行），Q2 默认不接 | 不适用：lint 为服务端能力（markdownlint，约 1.9k 行），Q2 默认不接 |
| 遍历一致性 walkCurrencyExtension | app/src/editor/walk-currency-extension.ts（TiptapEditor.tsx:110 引入） | 无同名测试 | 不适用（原 待定，OP-D19） | — | 未核实用途（本次未读内容）；需 S0 下一轮核实 | 不适用：仅为性能打点（perf mark），无用户可见行为 |

## 3. NodeView 与 JSX 组件（app/src/editor/components 与 app/src/components 中的块组件）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| JSX 组件注册映射 componentMap（Callout、img、video、audio、Pdf、File、Embed、Excalidraw、Accordion、Toggle、HtmlAlignBlock、Tabs、Tab、Math、MermaidFence、Mirror、MirrorSource） | app/src/editor/components/componentMap.tsx（47 行） | 各组件测试见下方各行 | 宿主适配 | 映射按 Huhu 最终清单裁剪（§14、§15） | — | 已验证：e2e：`/` 菜单项「Callout」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 提示块 Callout | app/src/editor/components/Callout.tsx | app/src/editor/components/Callout.test.tsx | 直接复制 | — | — | 已验证：e2e：`/` 菜单项「Callout」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 折叠块 Accordion / Toggle | app/src/editor/components/Accordion.tsx | app/src/editor/components/Accordion.test.tsx | 直接复制 | — | — | 已验证：e2e：`/` 菜单项「Accordion」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 对齐块 AlignBlock（HtmlAlignBlock） | app/src/editor/components/AlignBlock.tsx | 无同名测试 | 直接复制 | — | — | 已验证：e2e：`/` 菜单项「Align block」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 标签页 Tabs / Tab | app/src/editor/components/Tabs.tsx；Tab.tsx | app/src/editor/components/Tabs.dom.test.tsx；Tab.test.tsx | 直接复制 | — | — | 已验证：e2e：`/` 菜单项「Tabs」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 图片组件 Image（img） | app/src/editor/components/Image.tsx | app/src/editor/components/Image.dom.test.tsx；image-target-existence.test.ts | 宿主适配 | 资源 URL 与存在性由 Huhu 资源层提供（design §5、§11.1） | — | 已验证：e2e：`/` 菜单项「Image」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 视频 / 音频 Video、Audio | app/src/editor/components/Video.tsx；Audio.tsx | app/src/editor/components/Video.dom.test.tsx | 宿主适配 | 资源 URL 改为 Huhu 资源路径（沿用既有媒体能力，design §11.1） | — | 已验证：e2e：`/` 菜单项「Video」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 附件组件 File | app/src/editor/components/File.tsx | app/src/editor/components/File.test.tsx | 宿主适配 | 下载 / 打开走 Huhu 附件与 `notes.attach`（design §4） | — | 已验证：e2e：`/` 菜单项「文件」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| PDF 块 Pdf | app/src/editor/components/Pdf.tsx；pdf-layout.ts | app/src/editor/components/pdf-layout.test.ts | 宿主适配 | 是否复用 design §11.2 的 PdfView 未核实 | — | 已验证：e2e：`/` 菜单项「PDF」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 外部嵌入 Embed | app/src/editor/components/Embed.tsx | 无同名测试 | 宿主适配 | 外链预览默认关闭（Q3）；不联网 | — | 已验证：e2e：`/` 菜单项「Embed」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 数学块 Math（KaTeX 懒加载） | app/src/editor/components/Math.tsx | app/src/editor/components/Math.test.tsx | 直接复制 | — | — | 已验证：e2e：`/` 菜单项「Math」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| Mermaid 块 MermaidFence（@visimer/core） | app/src/editor/components/Mermaid.tsx | app/src/editor/components/Mermaid.test.tsx；Mermaid.dom.test.tsx；JsxComponentView.mermaid-expand.dom.test.tsx | 直接复制 | Q2 默认保留（Mermaid 块在编辑器内） | — | 已验证：e2e：`/` 菜单项「Mermaid」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 镜像 Mirror / MirrorSource（转载其他文档） | app/src/editor/components/Mirror.tsx；MirrorSource.tsx；use-mirror-source.ts；live-doc-pool.ts；snapshot-url-pool.ts | Mirror.dom 相关：PropPanel.mirror.dom.test.tsx；JsxComponentView.mirror.dom.test.tsx；MirrorSource.dom.test.tsx；use-mirror-source.test.ts；use-mirror-source.dom.test.tsx；mirror-source-names.test.ts；live-doc-pool.dom.test.tsx；snapshot-url-pool.dom.test.ts | 宿主适配 | 依赖 `useCollabUrl` 与 live 文档池（云协作）；改为读取本地 Y.Doc / 文件（具体细节未核实） | — | 已验证：e2e：`/` 菜单项「Mirror」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 绘图块 Excalidraw（ExcalidrawEmbed） | app/src/editor/components/ExcalidrawEmbed.tsx；live-doc-pool.ts；Mermaid.tsx | app/src/editor/components/ExcalidrawEmbed.dom.test.tsx | 保留（原 待定，OP-D19） | — | Q2：Excalidraw 文档编辑器 S0 评估后定；块形态是否保留待用户确认 | 保留：Excalidraw 块：`/` 菜单项 “Excalidraw” 已验证可插入（slashItems）；作为块保留（Q2 默认） |
| Excalidraw 文档编辑器 ExcalidrawDocEditor（components 顶层） | app/src/components/ExcalidrawDocEditor.tsx | app/src/components/ExcalidrawDocEditor.langcode.dom.test.tsx | 不适用（原 待定，OP-D19） | — | Q2：超出“本地编辑核心”的文档编辑器，待用户确认 | 不适用：独立 `.excalidraw` 文档类型：Huhu 查看器分派表无此类型，且未被产品要求（OP-D19 / Q2：Excalidraw 文档编辑器经评估不接） |
| Mermaid 独立文档编辑器 MermaidDocEditor（components 顶层） | app/src/components/MermaidDocEditor.tsx | MermaidDocEditor.dom.test.tsx；MermaidDocEditor.test.ts；MermaidDocEditor.browser.test.tsx | 不适用（原 待定，OP-D19） | — | Q2 未明确“Mermaid 文档编辑器”的去留，待用户确认 | 不适用：独立 Mermaid 文档编辑器：Huhu 已有 `.mmd` 预览（file-mermaid）；Mermaid 块在编辑器内保留（`/` Mermaid 已验证） |
| 代码预览编辑弹窗 CodePreviewEditModal（Mod-Enter） | app/src/editor/components/CodePreviewEditModal.tsx | app/src/editor/components/CodePreviewEditModal.dom.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 属性面板（JSX 节点）PropPanel | app/src/editor/components/PropPanel.tsx | PropPanel.test.tsx；PropPanel.dom.test.tsx；PropPanel.mirror.dom.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 通用属性输入控件 SuggestionInput、CodeMirrorPropInput、ColorPickerInput、IconPickerInput、EmojiInsertPopover | app/src/editor/components/ 同名文件 | ColorPickerInput.test.ts；EmojiInsertPopover.dom.test.tsx | 直接复制 | 颜色与图标使用 Huhu token 与 lucide（design §12） | — | 已验证：e2e：`/` 菜单项「Mirror」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 自动补全 SrcAutocomplete、DocumentAutocomplete、MirrorSourceAutocomplete | app/src/editor/components/SrcAutocomplete.tsx；DocumentAutocomplete.tsx；MirrorSourceAutocomplete.tsx | SrcAutocomplete.dom.test.tsx | 宿主适配 | 文档候选改为 Huhu 资源查询（design §5.3） | — | 已验证：e2e：`/` 菜单项「Mirror」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 描述符占位 DescriptorPlaceholder | app/src/editor/components/DescriptorPlaceholder.tsx | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 预览阻断提示 PreviewBlockedNotice | app/src/editor/components/PreviewBlockedNotice.tsx | PreviewBlockedNotice.dom.test.tsx | 宿主适配 | 文案与 huhu-preview 策略对齐（design §11.3） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 大文件状态 LargeFileEditorState | app/src/components/LargeFileEditorState.tsx | LargeFileEditorState.dom.test.tsx | 宿主适配 | 显式容量门槛与提示（design §11.1） | — | 已验证：e2e：`/` 菜单项「文件」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 文本 / JSON 文档编辑器 TextDocEditor（CM6 + y-codemirror.next 绑 Y.Text） | app/src/components/TextDocEditor.tsx | app/src/components/TextDocEditor.dom.test.tsx | 宿主适配 | 改为 PlainTextEditor（CM6，不绑 Y，直接用会话文本；design §3.1、§11.1） | — | 已验证：e2e：`/` 菜单项「Mirror」可应用且文档变化（matrix-run.json slashItems）；渲染细节与交互未逐项验证 |
| 图标白名单 lucide-icon-allowlist | app/src/components/lucide-icon-allowlist.ts | lucide-icon-allowlist.test.ts | 直接复制 | 图标固定映射（spec §4 F 项） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 基础 UI 原语 components/ui（OK 用到的约 25 个） | app/src/components/ui/ | 各原语测试未逐个核实 | 直接复制 | OP-D05 样式作用域（`.ok-root`） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 主题模式 use-app-color-mode | app/src/editor/components/use-app-color-mode.ts | 无同名测试 | 宿主适配 | 改接 Huhu 主题（design §12） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |

## 4. 工具栏与气泡菜单动作（app/src/editor/bubble-menu 与 app/src/components 工具栏）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 气泡菜单容器 BubbleMenuBar（组装下列按钮，`shortcutEnabled` 控制） | app/src/editor/bubble-menu/BubbleMenuBar.tsx | app/src/editor/bubble-menu/bubble-menu-state.test.ts | 直接复制 | 仅在活动文档上显示（`docName === activeDocName`，TiptapEditor.tsx:1268） | — | 已验证：e2e：气泡菜单按钮 bold / italic / underline / strikethrough / code / highlight / 链接 / 脚注 / 源码 / 评论 均出现，Mod-b 加粗经 editor-s3-menus.spec.ts 验证；e2e：editor-s3-menus.spec.ts（气泡菜单可见、Mod-b 加粗、一次撤销） |
| 块类型选择 BlockTypeSelector（正文 / 标题 1–3 / 无序 / 有序 / 任务 / 引用 / 代码块） | app/src/editor/bubble-menu/BlockTypeSelector.tsx | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 行内格式按钮 InlineFormatButtons（粗体、斜体、下划线、删除线、行内代码、高亮） | app/src/editor/bubble-menu/InlineFormatButtons.tsx（shortcutId：format-bold / italic / underline / strike / inline-code / highlight） | 无同名测试 | 直接复制 | 快捷键显示走 Huhu 快捷键表（§7） | — | 已验证：e2e：气泡菜单按钮 bold / italic / underline / strikethrough / code / highlight / 链接 / 脚注 / 源码 / 评论 均出现，Mod-b 加粗经 editor-s3-menus.spec.ts 验证；e2e：editor-s3-menus.spec.ts（气泡菜单可见、Mod-b 加粗、一次撤销） |
| 链接编辑 LinkEditPopover（粘贴链接、应用、新标签打开、移除） | app/src/editor/bubble-menu/LinkEditPopover.tsx；link-edit-popover-events.ts | LinkEditPopover.dom.test.tsx；link-edit-popover-events.test.ts | 宿主适配 | 链接目标解析 / 外链打开改接 Huhu（design §4 桌面桥） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 图片对齐 ImageAlignButtons（左 / 中 / 右） | app/src/editor/bubble-menu/ImageAlignButtons.tsx | app/src/editor/bubble-menu/ImageAlignButtons.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 文件块按钮 FileBubbleButtons（下载文件） | app/src/editor/bubble-menu/FileBubbleButtons.tsx | 无同名测试 | 宿主适配 | 下载走 Huhu 附件能力（design §4） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 脚注转换按钮 FootnoteBubbleButton | app/src/editor/bubble-menu/FootnoteBubbleButton.tsx | app/src/editor/bubble-menu/FootnoteBubbleButton.dom.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| “在源码中查看”按钮 ViewInSourceBubbleButton | app/src/editor/bubble-menu/ViewInSourceBubbleButton.tsx | app/src/editor/bubble-menu/ViewInSourceBubbleButton.dom.test.tsx | 直接复制 | 依赖 `源码 ↔ 富文本` 切换统一 flush（design §3.3） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 选区评论按钮 CommentBubbleButton | app/src/comments/CommentBubbleButton.tsx | 无同名测试（见 §11） | 宿主适配 | 评论入口 → `comments.create`（design §9） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 编辑器工具栏 EditorToolbar（属性按钮、模式切换、面包屑、Lint 诊断入口） | app/src/components/EditorToolbar.tsx | app/src/components/EditorToolbar.dom.test.tsx | 宿主适配 | 按真实容器宽度收纳（spec §4 属性与顶部布局；ui-design） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 模式切换 EditorModeToggle（“Markdown 源码 / Visual 编辑器”） | app/src/components/EditorModeToggle.tsx | 无同名测试 | 宿主适配 | 阅读模式为 Huhu 新增（spec R9：`ReadonlyMarkdown`，非 OK 原有） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 面包屑 EditorBreadcrumb | app/src/components/EditorBreadcrumb.tsx | app/src/components/EditorBreadcrumb.dom.test.tsx | 宿主适配 | 路径段与 DocTab 对接（design §7） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 表格行列句柄 TableCellHandles | app/src/editor/table-controls/TableCellHandles.tsx | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 表格拖拽重排 useTableDragReorder | app/src/editor/table-controls/useTableDragReorder.tsx | app/src/editor/table-controls/useTableDragReorder.test.ts；table-axis-selection.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 技能工具栏控件 SkillToolbarControls | app/src/components/SkillToolbarControls.tsx（经 EditorToolbar 动态导入） | 无同名测试 | 不适用 | — | OK 技能体系（推定，需用户确认，见 §14） | 不适用：OK 技能体系（推定，需用户确认，见 §14） |
| 幻灯片工具栏控件 SlidesToolbarControls | app/src/components/SlidesToolbarControls.tsx（经 EditorToolbar 动态导入） | app/src/components/SlidesToolbarControls.dom.test.tsx；EditorToolbar.slides.dom.test.tsx | 不适用 | — | OK 幻灯片能力，超出本地编辑核心（推定，需用户确认，见 §14） | 不适用：OK 幻灯片能力，超出本地编辑核心（推定，需用户确认，见 §14） |

## 5. Slash 命令（app/src/editor/slash-command）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 菜单 SlashCommandMenu（分类、预览、键盘） | app/src/editor/slash-command/SlashCommandMenu.tsx | SlashCommandMenu.dom.test.tsx | 直接复制 | 分类文案按 Huhu 语言（zh-Hans，spec H03） | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 应用项 apply-item | app/src/editor/slash-command/apply-item.ts | apply-item.dom.test.tsx | 直接复制 | — | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 内置项·基础（heading1–3、bulletList、orderedList、taskList、blockquote、codeBlock） | app/src/editor/slash-command/items.tsx（getSlashCommandItems） | app/src/editor/slash-command/items.test.ts | 直接复制 | — | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 内置项·插入（table、separator、footnote、emoji、inlineMath） | app/src/editor/slash-command/items.tsx | app/src/editor/slash-command/items.test.ts | 直接复制 | emoji 选择器事件：emoji-picker-event.ts | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 过滤与过滤器 filterItems；自动打开标记 auto-open-flag；单元格上下文过滤 cell-context-filter | app/src/editor/slash-command/items.tsx；auto-open-flag.ts；cell-context-filter.ts | auto-open-flag.test.ts；cell-context-filter.test.ts | 直接复制 | — | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 组件项 component-items（动态 `component-<canonical>`，清单由 core/src/registry 决定） | app/src/editor/slash-command/component-items.tsx（getComponentItems） | app/src/editor/slash-command/component-items.test.ts | 宿主适配 | 清单需与 Huhu 保留的组件一致（§14）；插入后聚焦 focus-inserted-component.ts | canonical 清单未核实（core/src/registry 超出限定范围） | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 组件项·附件 component-File | component-items.tsx:430 | component-items.test.ts | 宿主适配 | 上传走 `notes.attach`（design §4） | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 组件项·行内链接 link（getInlineComponentItems） | component-items.tsx:511 | component-items.test.ts | 宿主适配 | 链接候选走 notes 链接能力（design §4、§5.3） | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 组件项·标签 component-Tag | component-items.tsx:565 | component-items.test.ts | 宿主适配 | `notes.tags`（design §4） | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 嵌入起始项 embed-starter-items：空白 HTML（embed-starter-html）+ 4 个起始模板（chart、stat-cards、custom-svg、interactive-control） | app/src/editor/slash-command/embed-starter-items.tsx；模板清单来自 core/src/constants/preview-embed-starters.ts（仅读取 id 行） | app/src/editor/slash-command/embed-starter-items.test.ts | 宿主适配 | HTML 预览改用 `huhu-preview` 隔离（design §11.3）；预览 PNG 资源 preview-assets/*.png 直接复制 | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 技能引用项 skill-reference-items（`skill-ref-*`，来自技能注册表） | app/src/editor/slash-command/skill-reference-items.tsx | app/src/editor/slash-command/skill-reference-items.test.ts | 不适用 | — | OK 技能体系（推定，见 §14） | 不适用：OK 技能体系（推定，见 §14） |
| 镜像源插入 mirror-source-insert / mirror-source-name | app/src/editor/slash-command/mirror-source-insert.dom.test.tsx；mirror-source-name.ts | mirror-source-insert.dom.test.tsx；mirror-source-name.test.ts | 宿主适配 | 与 §3 Mirror 同：依赖云协作，改为本地源 | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 聚焦插入组件 | app/src/editor/slash-command/focus-inserted-component.ts | focus-inserted-component.test.ts | 直接复制 | — | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |
| 斜杠分类标签 categoryLabels（Skills / Components / Layout / Media / Data / Embeds） | app/src/editor/extensions/shared.ts（SlashCommand.configure） | 无同名测试 | 直接复制 | “Skills”分类随技能项不适用而删除 | — | 已验证：e2e：`/` 菜单 36/36 项逐项应用（matrix-run.json slashItems） |

## 6. 输入规则、粘贴、拖放与复制（输入规则 + app/src/editor/clipboard）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 粗体 / 斜体输入规则（`**x**`、`*x*`、`__x__`、`_x_`） | core/src/extensions/emphasis-fidelity.ts（addInputRules） | core/src/extensions/emphasis-fidelity.test.ts | 直接复制 | — | — | 已验证：上游单测通过：emphasis-fidelity.test.ts；e2e：输入规则「粗体 **x**」通过（rules-run.json） |
| 列表输入规则（`- `、`1. `、`[ ] `） | core/src/extensions/list.ts（addInputRules；BULLET / ORDERED / TASK 正则） | core/src/extensions/list.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 分隔线输入规则（`---`、`***`、`___`） | core/src/extensions/thematic-break-fidelity.ts | core/src/extensions/thematic-break-fidelity.test.ts | 直接复制 | — | — | 已验证：上游单测通过：thematic-break-fidelity.test.ts；e2e：输入规则「分隔线 ---」通过（rules-run.json） |
| 代码块输入规则（```） | app/src/editor/extensions/code-block.ts（addInputRules） | app/src/editor/extensions/code-block.test.ts | 直接复制 | — | — | 已验证：e2e：输入规则「代码块 ```」通过（rules-run.json） |
| 行内链接输入规则 InlineLinkInputRule | app/src/editor/inline-link-input-rule.ts | app/src/editor/inline-link-input-rule.test.ts | 直接复制 | — | — | 已验证：e2e：输入规则「行内链接 [t](url)」通过（rules-run.json）；e2e：行内链接输入规则通过（rules-run.json） |
| 行内数学输入规则 MathInputRule | app/src/editor/math-input-rule.ts | app/src/editor/math-input-rule.test.ts | 直接复制 | — | — | 已验证：e2e：输入规则「行内数学 $x$」通过（rules-run.json）；e2e：行内数学输入规则通过（rules-run.json） |
| `#` 标签触发 TagSuggestion | app/src/editor/extensions/tag-suggestion.ts（char `#`，`/api/tags`） | app/src/editor/extensions/tag-suggestion.test.ts | 宿主适配 | `/api/tags` → `notes.tags`（design §4） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| `[[` 维基链接触发 WikiLinkSuggestion | app/src/editor/extensions/wiki-link-suggestion.ts（char `[[`；`/api/pages`、`/api/page-headings`、`/api/forward-links`、`/api/backlinks`） | app/src/editor/extensions/wiki-link-suggestion.test.ts | 宿主适配 | 候选与锚点走 notes 链接能力（design §4、§5.3） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 链接路径候选 link-path-suggestions | app/src/editor/link-path-suggestions.tsx；link-path-suggestions-core.ts | link-path-suggestions.test.ts；link-path-suggestions.dom.test.tsx | 宿主适配 | 路径候选来自 Huhu 资源目录（design §5） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 粘贴 / 拖放分派 handle-paste（结构化 JSON、Markdown、HTML、纯文本分支；Shift 粘贴） | app/src/editor/clipboard/handle-paste.ts（createHandlePaste） | app/src/editor/clipboard/handle-paste.test.ts；handle-paste.list-placement.test.ts；handle-paste.mixed-payload-placement.test.ts | 直接复制 | — | — | 已验证：e2e：粘贴 Markdown 文本通过（rules-run.json） |
| 拖放分派 createHandleDrop（有文件时让位给 FileHandler） | app/src/editor/clipboard/handle-paste.ts:35 | app/src/editor/clipboard/handle-drop.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 来源识别 detectSource（15 类：vscode、gfm、pm-origin、gdocs、word、gmail、notion、apple、slack、gsheets、github、generic、markdown-text、plaintext、local） | app/src/editor/clipboard/detect-source.ts | app/src/editor/clipboard/detect-source.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| Markdown 判定 isMarkdown | app/src/editor/clipboard/is-markdown.ts | app/src/editor/clipboard/is-markdown.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 裸 URL 识别 lone-url（粘贴 URL 转链接） | app/src/editor/clipboard/lone-url.ts | app/src/editor/clipboard/lone-url.test.ts | 直接复制 | 可信域名表来源未核实 | — | 已验证：e2e：粘贴 Markdown 文本通过（rules-run.json） |
| HTML → mdast 清洗与转换（html-to-mdast，HTML_MAX_BYTES 5 MiB） | core/src/markdown/html-to-mdast.ts | 上游测试未在限定目录内核实（core/src/markdown 下无 `*.test.*`） | 直接复制 | 粘贴 HTML 大小上限沿用 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 粘贴清洗 rehype 插件（gdocs、gmail、gsheets、mso、slack、vscode、github、cocoa、notion 空白） | core/src/markdown/rehype-plugins/*.ts（9 个） | 未核实（同上） | 直接复制 | — | — | 已验证：e2e：粘贴 Markdown 文本通过（rules-run.json） |
| 剪贴板清洗 clipboard-sanitize（OPT_OUT_ATTR） | app/src/editor/clipboard/clipboard-sanitize.ts | app/src/editor/clipboard/clipboard-sanitize.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 浏览器 DOM 走查 clipboard-walker（样式白名单、LUCIDE 字形映射、wiki 链接还原） | app/src/editor/clipboard/clipboard-walker.ts；clipboard-walker-fallback-palette.ts | clipboard-walker.test.ts；clipboard-walker-fallback-palette.test.ts | 直接复制 | 图标字形映射与 Huhu lucide 版本对齐 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 复制 / 剪切 createCopyCutHandler 与富文本序列化 serialize | app/src/editor/clipboard/handle-copy.ts；serialize.ts | serialize.test.ts；serialize.container-descriptor-boundary.test.ts；serialize.inline-image-range.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 纯文本复制 PlainTextClipboard | core/src/extensions/plain-text-clipboard.ts | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 评论内容剥离 comment-scrub（内部剪贴板 MIME） | app/src/editor/clipboard/comment-scrub.ts | app/src/editor/clipboard/comment-clipboard-contract.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 源码模式剪贴板（复制、粘贴、分块插入失败恢复） | app/src/editor/clipboard/source-clipboard.ts | source-clipboard.test.ts；source-clipboard-recovery.test.ts | 直接复制 | — | — | 已验证：e2e：粘贴 Markdown 文本通过（rules-run.json） |
| 复制图片 copy-image | app/src/editor/clipboard/copy-image.ts | app/src/editor/clipboard/copy-image.dom.test.ts | 宿主适配 | 经桌面桥写剪贴板（design §4 desktop-bridge） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 粘贴失败提示 paste-failure-toast | app/src/editor/clipboard/paste-failure-toast.ts | app/src/editor/clipboard/paste-failure-toast.test.ts | 宿主适配 | 改接 Huhu toast（reuse §9：OK 的 sonner 与 Huhu 方案未核实） | — | 已验证：e2e：粘贴 Markdown 文本通过（rules-run.json） |
| 转换 / 遥测 instrument（logSourceDetected、logIfSlow、logConversionFail） | app/src/editor/clipboard/instrument.ts | app/src/editor/clipboard/instrument.test.ts | 宿主适配 | 指标端点改为 Huhu 日志 / 指标（端点未核实） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| Shift 状态跟踪 shift-tracker | app/src/editor/clipboard/shift-tracker.ts | app/src/editor/clipboard/shift-tracker.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 深度防护 opendepth-guard | app/src/editor/clipboard/opendepth-guard.ts | app/src/editor/clipboard/opendepth-guard.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 不可移植描述符回退 non-portable-* | app/src/editor/clipboard/non-portable-render-source-fallback.ts | non-portable-render-source-fallback.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| WYSIWYG 停止规则 wysiwyg-stop-rule | app/src/editor/clipboard/wysiwyg-stop-rule.ts | app/src/editor/clipboard/wysiwyg-stop-rule.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 图片拖放插入形态 pickInsertShape / shortestImageRef | app/src/editor/image-upload/pickInsertShape.ts；shortestImageRef.ts | pickInsertShape.test.ts；shortestImageRef.test.ts | 直接复制 | 引用路径形态按 Huhu 规范相对路径（design §5.3） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 代码块预览剪贴板 | 源文件未定位（仅见 app/src/editor/clipboard/codeblock-preview-clipboard.test.ts） | codeblock-preview-clipboard.test.ts | 保留（原 待定，OP-D19） | — | 未核实源文件位置，S0 下一轮补核 | 保留：源文件位置未定位，按直接复制随 vendor 进入；未单独验证 |

## 7. 快捷键

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| Tiptap 默认格式键（粗体 / 斜体 / 代码等，由 Fidelity 扩展继承） | core/src/extensions/*-fidelity.ts | 无同名测试 | 直接复制 | 键位逐条未核实；Win / macOS 差异仅 Linux 可验证（spec §7） | — | 已验证：e2e：快捷键「Mod-b 粗体」通过（rules-run.json） |
| 删除线 Mod-Shift-x | app/src/editor/extensions/formatting-shortcuts.ts | 无同名测试 | 直接复制 | 键位写入 Huhu 快捷键表 | — | 已验证：e2e：快捷键「Mod-Shift-x 删除线」通过（rules-run.json） |
| 块移动 Mod-Shift-ArrowUp / Mod-Shift-ArrowDown | app/src/editor/extensions/block-mover.ts:154、158 | block-mover.test.ts | 直接复制 | — | — | 已验证：e2e：快捷键「Mod-Shift-ArrowUp 块上移」通过（rules-run.json） |
| JSX 节点 Escape / ArrowUp / ArrowDown | app/src/editor/block-ux/keyboard-nav.ts:159、181、222 | 无同名测试 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 原始 MDX 块 ArrowUp / ArrowDown 进入；嵌套 CM 内 Mod-z / Mod-y | app/src/editor/extensions/raw-mdx-fallback.ts:42–43；RawMdxFallbackCMView.tsx:201、208 | RawMdxFallbackCMView.dom.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| Shift-Tab 焦点陷阱 | app/src/editor/extensions/tab-focus-trap.ts:10 | tab-focus-trap.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 表格行 Enter 下移 | app/src/editor/extensions/table-row-enter.ts | table-row-enter.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 维基链接 / 标签 Backspace | app/src/editor/extensions/wiki-link.ts:348；tag-view.ts:15 | wiki-link.doc-activation.test.ts；wiki-link.external-open.test.ts | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 代码预览编辑 Mod-Enter | app/src/editor/components/CodePreviewEditModal.tsx:161 | CodePreviewEditModal.dom.test.tsx | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 撤销 / 重做（y-tiptap 单一历史；StarterKit `undoRedo:false`） | core/src/extensions/shared.ts；app/src/editor/undo-isolation.ts | undo-isolation.test.ts | 直接复制 | B05：撤销不被误禁用，外部写回不进撤销栈 | — | 已验证：e2e：快捷键「Mod-z / Mod-Shift-z 撤销重做」通过（rules-run.json） |
| 查找快捷键（`matchesKeyboardShortcut`） | app/src/editor/find-replace/FindReplaceController.tsx:11 | tiptap-find-replace-extension.test.ts | 宿主适配 | 注册表 `@/lib/keyboard-shortcuts` 超出限定范围，未读；改接 Huhu 快捷键系统 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 格式按钮快捷键 ID（format-bold / italic / underline / strike / inline-code / highlight） | app/src/editor/bubble-menu/InlineFormatButtons.tsx | 无同名测试 | 宿主适配 | 同上：ID 映射到 Huhu 快捷键表（design §11.2 提及快捷键系统） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 评论队列快捷键 CommentQueueShortcut | app/src/comments/CommentQueueShortcut.tsx | queue-shortcut-scope.dom.test.tsx | 不适用 | — | 评论派发 AI 队列（见 §11 不适用项） | 不适用：评论派发 AI 队列（见 §11 不适用项） |
| 输入框组合键 Mod-z / Mod-y / Shift-Mod-z / Shift-Enter（AI 输入框） | app/src/editor/composer-mention/composer-mention.ts:135、143 | ComposerMentionInput.dom.test.tsx | 不适用 | — | AI 输入框（composer），非文档编辑器 | 不适用：AI 输入框（composer），非文档编辑器 |

## 8. 上下文菜单与拖放入口

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 编辑器内资源右键 asset-context-menu（asset / wiki-link / image 目标；`contextmenu` → `okDesktop.shell.showAssetMenu`） | app/src/editor/plugins/asset-context-menu.ts | app/src/editor/plugins/asset-context-menu.test.ts | 宿主适配 | 改为 Huhu 桌面桥原生菜单（design §4 `window.okDesktop` → desktop-bridge） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 文件树右键 FileTargetMenuItems（打开、新建、模板、重命名、复制路径 / 相对路径 / 完整路径、隐藏、删除等） | app/src/components/FileTargetMenuItems.tsx | app/src/components/FileTargetMenuItems.dom.test.tsx | 宿主适配 | 分发与禁用原因统一（design §8）；隐藏改 hiddenPaths（R4） | Share 与 openWithAi 项不适用（§14） | 已验证：e2e：S5 树右键菜单（evidence/s5/verification.md） |
| 标签页右键 EditorTabTargetMenuItems | app/src/components/EditorTabTargetMenuItems.tsx | app/src/components/EditorTabTargetMenuItems.dom.test.tsx | 宿主适配 | 标签对象改为 DocTab（design §7） | Share 项不适用（§14） | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 重命名对话框 FileTargetRenameDialog | app/src/components/FileTargetRenameDialog.tsx | app/src/components/FileTargetRenameDialog.dom.test.tsx | 直接复制 | 扩展名保持与合法路径（design §8） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 侧栏右键 EditorSidebarsContextMenu（“交换文件侧栏与文档面板”） | app/src/components/EditorSidebarsContextMenu.tsx | 无同名测试 | 不适用（原 待定，OP-D19） | — | Huhu 是否保留该布局操作未核实，待用户 / S3 确认 | 不适用：“交换文件侧栏与文档面板”是 OK 的应用壳布局操作，Huhu 工作台布局不同，不提供 |
| 侧栏拖放打开 sidebar-drop（拖文件到编辑区） | app/src/editor/sidebar-drop.ts | app/src/editor/sidebar-drop.test.ts | 宿主适配 | 经 DocTab 打开（design §7） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |

## 9. Markdown 序列化与解析（core/src/markdown）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| MarkdownManager 公开方法 parse / parseToMdast / parseToEditorMdast / parseWithFallback / serialize | core/src/markdown/index.ts（类 MarkdownManager，约 118 行起） | 上游测试未在限定目录内核实（core/src/markdown 下无 `*.test.*`；fixtures 使用方未核实） | 直接复制 | 唯一 Markdown ↔ PM 入口；磁盘保持 Markdown（spec §4） | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 解析管线 ACTIVE_MDAST_PLUGINS（remark-parse、remark-gfm、remark-math、remark-wiki-link、callout、restore-*、各 promoter 等） | core/src/markdown/pipeline.ts | 同上 | 直接复制 | 依赖 unified / remark 版本登记（reuse §1） | — | 已验证：e2e：「数学」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 提升器 promoter（11 个：comment、details-accordion、div-align、highlight、image、indented-code、math、single-dollar-math、mermaid、underline、void-br） | core/src/markdown/*-promoter.ts（promoter-position.ts 为辅助） | 同上 | 直接复制 | — | — | 已验证：e2e：「数学」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 容错解析 parseWithFallback / parseRecursive / scanTagEvents（未知语法回退为 rawMdxFallback） | core/src/markdown/parse-with-fallback.ts | 同上 | 直接复制 | spec §4 未知语法可见可恢复 | — | 已验证：e2e：「双链与标签」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 序列化管线 createSerializeProcessor / serializeMd | core/src/markdown/pipeline.ts（约 140、262 行） | 同上 | 直接复制 | 局部编辑字节差异（H07）依赖本项 | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 行内 toMarkdown 键：text、emphasis、strong、delete、inlineCode、inlineMath、link、image、break、definition | core/src/markdown/to-markdown-handlers.ts（76–377 行附近） | 同上 | 直接复制 | — | — | 已验证：e2e：「数学」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 块 toMarkdown 键：heading、code、blockquote、list、table、thematicBreak | core/src/markdown/to-markdown-handlers.ts（284–628 行附近） | 同上 | 直接复制 | — | — | 已验证：e2e：「表格」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| MDX / 自定义 toMarkdown 键：mdxJsxFlowElement、mdxJsxTextElement、mark、underline、comment、commentBlock、rawMdxFallback | core/src/markdown/to-markdown-handlers.ts（628–766 行附近） | 同上 | 直接复制 | — | — | 未逐项验证：无同名单测通过、无专项 e2e（上游 app dom 测试未迁入，缺 jsdom 预加载设施） |
| 转义与边界编码（formatLinkUrl、formatAngleDestination、属性边界、GFM 字面量判定） | core/src/markdown/to-markdown-handlers.ts（约 850–1300 行） | 同上 | 直接复制 | — | — | 已验证：e2e：「前置属性」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 辅助 guard / 规范化文件（angle-destination-escapes、backslash-escape-guard、entity-ref-guard、escape-provenance、fence-regions、ref-def-hoist、whitespace-char-ref 等，约 60 个） | core/src/markdown/ 同名文件 | 同上 | 直接复制 | — | — | 已验证：e2e：「围栏代码块」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| 上游 Markdown 固件 fixtures（commonmark、gfm、mdx、frontmatter、regression、wiki-links、perf、ng-pinned） | core/src/markdown/fixtures/ | 固件本身；使用方未核实 | 直接复制 | 与 H01 黄金样本（22 个）的关系未核实 | — | 已验证：e2e：「双链与标签」构造无编辑打开字节不变且渲染（matrix-run.json constructs） |
| Markdown lint（markdownlint 规则、OKF 规则、lint runner） | core/src/markdown/lint/（applies-to.ts、markdownlint-runner.ts、okf-runner.ts 等） | 未核实 | 不适用 | — | 服务端 markdownlint 能力（约 1.9k 行；reuse §2），Q2 默认不接 | 不适用：服务端 markdownlint 能力（约 1.9k 行；reuse §2），Q2 默认不接 |

## 10. 属性面板（app/src/components，YAML 顶部属性）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 属性面板主体 PropertyPanel | app/src/components/PropertyPanel.tsx（601 行） | PropertyPanel.test.tsx；PropertyPanel.block-level-problem.dom.test.tsx；PropertyPanel.nested-crud.dom.test.tsx；PropertyPanel.preview-promotion.dom.test.tsx；PropertyPanel.staged-required.dom.test.tsx | 直接复制 | 整体复制（R8；reuse §2）；读写经 DocumentSession 的 YAML 段（design §10） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 属性行 FrontmatterRow（枚举约束） | app/src/components/FrontmatterRow.tsx（759 行） | FrontmatterRow.enum.dom.test.tsx | 直接复制 | — | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 字段控件 PropertyWidgets（类型识别 resolveWidgetType、coerceValue） | app/src/components/PropertyWidgets.tsx（764 行） | PropertyWidgets.test.ts；PropertyWidgets.dom.test.tsx | 直接复制 | — | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 对象 / 数组控件 ArrayOfObjectsWidget、ObjectWidget | app/src/components/ArrayOfObjectsWidget.tsx；ObjectWidget.tsx | 无同名测试 | 直接复制 | — | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 布尔字段 use-boolean-frontmatter-field | app/src/lib/use-boolean-frontmatter-field.ts（lib，同 import 路径） | use-boolean-frontmatter-field.dom.test.tsx | 直接复制 | — | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 字段读写 hook 与上下文 use-frontmatter-field、FrontmatterBindingContext、PropertyContext | app/src/lib/use-frontmatter-field.ts；app/src/components/FrontmatterBindingContext.tsx；PropertyContext.tsx | 无同名测试 | 宿主适配 | 读写必须经同一 DocumentSession（属性与正文共用缓冲，spec C04；OP-D17） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 添加属性按钮与名称输入 AddPropertiesButton、AddPropertyNameField | app/src/components/AddPropertiesButton.tsx；AddPropertyNameField.tsx | AddPropertiesButton.dom.test.tsx；AddPropertyNameField.dom.test.tsx；AddPropertyRow.add-property-focus.dom.test.tsx | 直接复制 | — | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 折叠区 PropertyDisclosure 与折叠状态 properties-collapsed-store | app/src/components/PropertyDisclosure.tsx；properties-collapsed-store.ts | PropertyDisclosure.dom.test.tsx；properties-collapsed-store.test.ts；properties-collapsed-store.dom.test.tsx | 直接复制 | 折叠状态存储位置未核实 | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 只读属性面板 ReadonlyPropertyPanel、属性展示行 PropertyDisplayRow | app/src/components/ReadonlyPropertyPanel.tsx；PropertyDisplayRow.tsx | ReadonlyPropertyPanel.dom.test.tsx；PropertyDisplayRow.dom.test.tsx | 直接复制 | 阅读模式可复用（spec R9） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 属性内链接 PropertyInlineLinks、property-inline-link-tokens | app/src/components/PropertyInlineLinks.tsx；app/src/components/property-inline-link-tokens.ts | PropertyInlineLinks.dom.test.tsx；property-inline-link-tokens.test.ts | 宿主适配 | 链接解析接 notes 链接能力（design §5.3） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 属性差异块 PropertyDiffBlock | app/src/components/PropertyDiffBlock.tsx | PropertyDiffBlock.dom.test.tsx | 直接复制 | 与冲突对话协同（design §3.1） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 布尔与频率字段 / 枚举约束 / 保留键 / 主题色属性：frontmatter-schema-fields、frontmatter-enum-constraints、reserved-property-keys、theme-color-properties | app/src/lib/frontmatter-schema-fields.ts；frontmatter-enum-constraints.ts；reserved-property-keys.ts；app/src/lib/theme-color-properties.ts | frontmatter-schema-fields.test.ts；frontmatter-enum-constraints.test.ts | 宿主适配 | schema 来源（是否与 lint frontmatter schema 绑定）未核实；保留键对照 Huhu 字段 | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 坏 YAML 诊断与错误工具 frontmatter-error-utils | app/src/components/frontmatter-error-utils.ts | 无同名测试 | 宿主适配 | 诊断与原文修复入口（spec C05） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| YAML 编解码（core/src/frontmatter，超出限定范围未读） | core/src/frontmatter/（未读） | 未核实 | 宿主适配 | 只留一份编解码，SP-5 对拍（OP-D17） | — | 已验证：e2e：editor-s3-properties.spec.ts（C01–C04）与 editor-s3-parity.spec.ts（C05 坏 YAML 逐字诊断 + 修复入口） |
| 文件夹属性卡 FolderPropertiesCard | app/src/components/FolderPropertiesCard.tsx | 无同名测试 | 不适用（原 待定，OP-D19） | — | 未核实：是否对应 Huhu 所需的文件夹元信息（需 S0 下一轮核实） | 不适用：依赖 OK 文件夹 schema 服务端接口；Huhu 无文件夹属性概念，宿主不提供该端点 |
| 模板属性 TemplateProperties | app/src/components/TemplateProperties.tsx | TemplateProperties.dom.test.tsx | 不适用（原 待定，OP-D19） | — | 与 Q2“模板导入”（默认保留）的关系未核实 | 不适用：模板元数据面板：Huhu 没有模板存储，宿主不提供模板接口（S5 报告：菜单“从模板新建”需隐藏） |
| 技能属性 SkillProperties、托管产物属性 ManagedArtifactProperties | app/src/components/SkillProperties.tsx；ManagedArtifactProperties.tsx | SkillProperties.dom.test.tsx | 不适用 | — | OK 技能与托管产物体系（推定，需用户确认，见 §14） | 不适用：OK 技能与托管产物体系（推定，需用户确认，见 §14） |

## 11. 评论（app/src/comments 与评论相关 UI）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 评论面板 CommentsPanel、评论标签页 CommentsTab | app/src/comments/CommentsPanel.tsx；CommentsTab.tsx | 无同名测试（名称相近：open-thread-panel.dom.test.tsx，未确认同源） | 宿主适配 | 对接 `comments.*` 适配层（R7；design §9） | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 线程列表 CommentListPanel（分组、折叠、显示 / 隐藏已解决、按文件全选） | app/src/comments/CommentListPanel.tsx | 无同名测试（名称相近：project-file-groups.dom.test.tsx，未确认同源） | 宿主适配 | “发送勾选”部分不适用（见下方派发行） | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 线程卡 ThreadCard（编辑、回复、解决、重开、删除确认、定位） | app/src/comments/ThreadCard.tsx | thread-card-click.dom.test.tsx；thread-card-jump-miss.dom.test.tsx；thread-card-property-miss.dom.test.tsx；thread-edit-save.dom.test.tsx；thread-edited-stamp.dom.test.tsx；reopen-requeue.test.ts | 宿主适配 | 解决 / 重开 / 删除映射到 `comments.resolve / reopen / delete`（design §9） | “发送”按钮不适用（见派发行） | 已验证：上游单测通过：reopen-requeue.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 边距轨 CommentMarginRail 与布局 | app/src/comments/CommentMarginRail.tsx | margin-rail-layout.test.ts | 直接复制 | — | — | 已验证：上游单测通过：margin-rail-layout.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 锚点装饰与分层 anchor-decorations、anchor-layers | app/src/comments/anchor-decorations.tsx；anchor-layers.ts | anchor-layers.test.ts；anchor-transaction-effect.test.ts；anchor-nearby-edit.test.ts；anchor-repro.test.ts | 宿主适配 | 冻结 quote / prefix / suffix / 缓冲 revision（spec D05；design §9）；不把 PM from/to 当源码偏移 | — | 已验证：上游单测通过：anchor-layers.test.ts、anchor-nearby-edit.test.ts、anchor-repro.test.ts…；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 锚点搜索 anchor-search（quote 匹配，歧义即孤立） | app/src/comments/anchor-search.ts | anchor-search.test.ts | 宿主适配 | 不吸附相似段落（design §9 D04） | — | 已验证：上游单测通过：anchor-search.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 选中区域 selected-span | app/src/comments/selected-span.ts | selected-span.test.ts | 直接复制 | — | — | 已验证：上游单测通过：selected-span.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 定位与滚动 reveal-comment、reveal-thread、scroll-to-anchor、jump-scroll-ownership | app/src/comments/reveal-comment.ts；scroll-to-anchor.ts 等 | reveal-comment.dom.test.ts；reveal-thread.dom.test.ts；scroll-to-anchor.test.ts；jump-scroll-ownership.dom.test.ts | 宿主适配 | 正文 ↔ 线程双向定位（spec §4 评论） | — | 已验证：上游单测通过：scroll-to-anchor.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 属性评论锚点 property-anchor-click、property-row-rect、property-value-selection | app/src/comments/property-anchor-click.ts；property-row-rect.ts；property-value-selection.ts | property-anchor-click.dom.test.tsx；property-anchor-click.test.ts；property-row-rect.dom.test.tsx | 宿主适配 | 属性评论关联 `propertyKey`（design §9） | — | 已验证：上游单测通过：property-anchor-click.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 选区评论入口 CommentSelectionAffordance（“Add a comment”） | app/src/comments/CommentSelectionAffordance.tsx | 无同名测试（名称相近：comment-composer-submit.dom.test.tsx，未确认同源） | 宿主适配 | 提交走 `comments.create`（design §9） | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 属性评论按钮 PropertyCommentButton | app/src/comments/PropertyCommentButton.tsx | 无同名测试 | 宿主适配 | 同上（属性锚点） | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 评论存储 store（refresh、createThread、createPropertyThread、editComment、reopenThread、deleteThread、replaceOrphan） | app/src/comments/store.ts | store.refresh-fanout.test.ts；store.settle-reporting.test.ts；store.snapshot-stability.test.ts | 宿主适配 | 对接 `comments.*`，事件走 `entity.changed`（design §9、§6） | 队列 / 派发段见派发行 | 已验证：上游单测通过：store.refresh-fanout.test.ts、store.settle-reporting.test.ts、store.snapshot-stability.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 评论客户端 comments-client（`/api/comments`、`/api/comment`：list / create / edit / reopen / replace / delete） | app/src/comments/comments-client.ts | comments-client.test.ts | 宿主适配 | 适配到 `comments.*`（R7；字段对照 S4） | queue / dispatch 端点不适用（见派发行） | 已验证：上游单测通过：comments-client.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 孤立与已删原文 orphan（显示孤立，不吸附） | app/src/comments/ 相关 | orphan-deleted-quote.dom.test.tsx | 宿主适配 | spec D05 | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 评论边界与上下文 CommentsBoundary、CommentedDocContext | app/src/comments/CommentsBoundary.tsx；CommentedDocContext.tsx | 无同名测试 | 宿主适配 | 对接 DocumentSession 的 docName（design §3.1） | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 评论标签 comment-chips、颜色对比 comment-hue-contrast | app/src/comments/comment-chips.tsx | comment-chips.dom.test.tsx；comment-hue-contrast.test.ts | 宿主适配 | 颜色映射到 Huhu token（design §12） | — | 已验证：上游单测通过：comment-hue-contrast.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 评论类型 types 与字段对照 | app/src/comments/types.ts | 无同名测试 | 宿主适配 | 字段对照表 `evidence/comment-field-map.md`（S4 第一步；本次未产出） | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 评论可见范围 visible-scope、comments-panel-visibility | app/src/comments/visible-scope.ts；comments-panel-visibility.ts | 无同名测试 | 直接复制 | — | — | 已验证：e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 活动线程与打开线程 active-thread、open-thread-bus、open-thread-lifecycle | app/src/comments/ 相关（store 的 active 段） | active-thread.test.ts；open-thread-bus.test.ts；open-thread-lifecycle.test.ts | 直接复制 | — | — | 已验证：上游单测通过：active-thread.test.ts、open-thread-bus.test.ts、open-thread-lifecycle.test.ts；e2e：comments-s4.spec.ts（S4）+ 迁入的上游评论单测 22 文件 |
| 项目评论面板 CommentProjectPanel | app/src/comments/CommentProjectPanel.tsx | 无同名测试 | 不适用（原 待定，OP-D19） | — | 已读源码：只是 `useAllThreads` + `CommentListPanel` 的项目级总览，不涉及派发 | 不适用：项目级评论总览视图；Huhu 评论面板按笔记展示（S4 决定），无项目级入口 |
| 派发：发送页脚 CommentSendFooter（代理选择、AgentSplitButton） | app/src/comments/CommentSendFooter.tsx | comment-send-footer.dom.test.tsx | 不适用 | — | OK 代理派发（AI，见 §14） | 不适用：OK 代理派发（AI，见 §14） |
| 派发：队列与发送勾选（queue-grouping、reveal-queue、use-send-queue、QueueNewChatRow、CommentQueueShortcut、open-chat-send、use-comment-agent-picker、use-comment-delivery；store 的 queue / dispatch 段；comments-client 的 queue / unqueue / dispatch-* 端点） | app/src/comments/ 同名文件；store.ts:266–442 | queue-grouping.test.ts；reveal-queue.test.ts；use-send-queue.dom.test.tsx；QueueNewChatRow.dom.test.tsx；open-chat-send.test.ts；queue-shortcut-scope.dom.test.tsx；queued-toggle.dom.test.tsx；dispatch-batch.test.ts | 不适用 | — | 把评论派发给 AI 代理，属 OK AI 能力（spec §8；Q2 默认不接） | 不适用：把评论派发给 AI 代理，属 OK AI 能力（spec §8；Q2 默认不接） |
| 线程卡“发送”与发送标记（ThreadCard 内 sending 按钮） | app/src/comments/ThreadCard.tsx:230 | thread-card-click.dom.test.tsx | 不适用 | — | 同上（派发标记） | 不适用：同上（派发标记） |

## 12. 文件树与资源（app/src/components 文件树）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 文件树主体 FileTree（3469 行，`@pierre/trees` React 集成） | app/src/components/FileTree.tsx | FileTree.problem-badge / showall-lazy / selection-mirror / duplicate / showall-truncation / showall-lifecycle / restart-server / superseded-refresh / create / preview-tabs .dom.test.tsx | 宿主适配 | 数据源改为 `vault.list`（design §5.1）；隐藏为 `hiddenPaths`（design §5.2）；按钮与菜单走统一分发（design §8） | Share 分支不适用（见 §14） | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 文件树包装 OkFileTree | app/src/components/OkFileTree.tsx | 无同名测试 | 直接复制 | `@pierre/trees` 精确锁版本（design §8） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 空过滤结果提示 FileTreeFilteredToZeroNotice | app/src/components/FileTreeFilteredToZeroNotice.tsx | FileTreeFilteredToZeroNotice.dom.test.tsx | 宿主适配 | OK 的“只显示 Markdown”开关不带（reuse §3） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 树数据适配 file-tree-adapter | app/src/components/file-tree-adapter.ts | file-tree-adapter.test.ts | 宿主适配 | 对接 `vault.list`（design §5.1） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 列举传输与惰性加载 file-tree-listing-transport、use-file-tree-listing | app/src/components/file-tree-listing-transport.ts；app/src/components/use-file-tree-listing.ts | file-tree-listing-transport.test.ts；use-file-tree-listing.dom.test.tsx | 宿主适配 | `hostFetch /api/documents?showAll=true&dir=&depth=1` → `vault.list`（design §4） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 列表合并 file-tree-merge | app/src/components/file-tree-merge.ts | file-tree-merge.test.ts | 宿主适配 | 合并输入来自 `vault.list` 与 `entity.changed` 失效（design §5.1） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 树操作 file-tree-operations | app/src/components/file-tree-operations.ts | file-tree-operations.test.ts | 宿主适配 | 经现有 `notes.*` / `vault.*` 写能力与 OperationLog（design §4、§8） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 刷新与失效 file-tree-refresh | app/src/components/file-tree-refresh.dom.test.tsx（对应源文件位置未核实） | file-tree-refresh.dom.test.tsx | 宿主适配 | `ENTITY_CAPS` 增加目录前缀映射（design §5.1） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 选择 file-tree-selection | app/src/components/file-tree-selection.ts | file-tree-selection.test.ts | 直接复制 | 右键未选中行切换目标、多选保持（design §8） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 重命名校验与焦点 file-tree-rename-validation、file-tree-rename-chip、file-tree-rename-focus-reconciliation | app/src/components/file-tree-rename-validation.ts 等 | file-tree-rename-validation.test.ts；file-tree-rename-chip.dom.test.tsx；file-tree-rename-focus-reconciliation.dom.test.tsx | 直接复制 | 扩展名保持、合法路径（design §8） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 工具函数 file-tree-utils、file-tree-path-helpers、file-tree-shared | app/src/components/file-tree-utils.ts 等 | file-tree-utils.test.ts；file-tree-path-helpers.test.ts；file-tree-shared.test.ts | 直接复制 | 路径规范化对齐 Huhu（design §5：大小写、中文、空格、符号链接） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 密度 file-tree-density | app/src/components/file-tree-density.ts | file-tree-density.test.ts | 直接复制 | — | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 问题徽标 file-tree-problem-indicators | app/src/components/file-tree-problem-indicators.ts | file-tree-problem-indicators.dom.test.tsx | 直接复制 | 冲突 / 异常状态映射未核实 | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 扩展名徽标 file-tree-extension-badge；条目图标 file-entry-icon、file-tree-icon-sprite | app/src/components/file-tree-extension-badge.ts；file-entry-icon.tsx；file-tree-icon-sprite.ts | file-tree-extension-badge.dom.test.tsx；file-entry-icon.test.tsx | 直接复制 | 共享化为 `FileIcon`（design §2、OP-D13） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 定位 file-tree-reveal | app/src/components/file-tree-reveal.ts | file-tree-reveal.test.ts | 直接复制 | — | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 回收站副本 file-tree-trash-copy | app/src/components/file-tree-trash-copy.ts | file-tree-trash-copy.test.ts | 宿主适配 | 回收站与 OperationLog（design §8；reuse §7） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |
| 隐藏规则 file-tree-okignore | app/src/components/file-tree-okignore.ts | file-tree-okignore.test.ts | 宿主适配 | 改为 `hiddenPaths`，不写 `.okignore`（R4；design §5.2） | — | 已验证：e2e：S5 文件树 harness 5 条 + 完整应用知识库子集（evidence/s5/verification.md） |

## 13. 文档会话、宿主与编辑表示（app/src/editor 核心装配）

| 能力 | 上游文件 | 对应上游测试 | 动作 | Huhu 适配点 | 不适用 / 待定原因 | 验证状态（2026-11-18） |
| --- | --- | --- | --- | --- | --- | --- |
| 富文本编辑器装配 TiptapEditor（1308 行） | app/src/editor/TiptapEditor.tsx | TiptapEditor.test.tsx；TiptapEditor.hash-ladder.dom.test.tsx；TiptapEditor.outline-nav.dom.test.tsx；TiptapEditor.outline-nav-breadcrumb.dom.test.tsx；TiptapEditor.replay-create-retry.dom.test.tsx | 宿主适配 | 挂接 `LocalDocProvider` + `DocumentSession`（design §3.1–§3.2）；去掉云协作分支 | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 源码编辑器 SourceEditor（CM6 + y-codemirror.next） | app/src/editor/SourceEditor.tsx（492 行） | SourceEditor.dom.test.tsx | 直接复制 | 绑定同一 `Y.Text('source')`（design §3.2） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 源码导航与行方向 source-editor-navigation、source-heading-lines、source-line-direction、source-mode-setup | app/src/editor/source-*.ts | source-editor-navigation.test.ts；source-heading-lines.test.ts；source-line-direction.test.ts | 直接复制 | — | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 源码装饰 source-polish（断链装饰、视图插件） | app/src/editor/source-polish/ | source-polish/broken-ref-field.test.ts；view-plugin.test.ts；engine-invariants.test.ts | 直接复制 | — | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 源码本地目标诊断 local-target-diagnostics | app/src/editor/source-lint/local-target-diagnostics.ts | local-target-diagnostics.test.ts；local-target-diagnostics.test.tsx；local-target-parity.test.ts | 宿主适配 | 目标存在性由 Huhu 资源层提供（未核实是否依赖服务端） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 源码 Markdown lint 诊断 markdown-lint-source | app/src/editor/source-lint/markdown-lint-source.ts | markdown-lint-source.test.ts | 不适用 | — | 服务端 lint（Q2 默认不接） | 不适用：服务端 lint（Q2 默认不接） |
| 模式切换 use-editor-mode、mode-switch-landing、mode-switch-position-resolver | app/src/editor/use-editor-mode.ts；mode-switch-landing.ts；mode-switch-position-resolver.ts | use-editor-mode.test.ts；mode-switch-landing.test.ts；mode-switch-position-resolver.test.ts | 直接复制 | 切换前统一 flush（spec B09；design §3.3） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 编辑器缓存 editor-cache（MAX_CACHE=10，park / evict） | app/src/editor/editor-cache.ts（869 行） | editor-cache.test.ts；editor-cache-visible-scroll-container.test.ts | 直接复制 | design §3.2 原样保留；evict 时释放 Y.Doc | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 文档上下文 DocumentContext（1868 行） | app/src/editor/DocumentContext.tsx；`fetch('/api/principal')`（约 1073 行） | DocumentContext.dom.test.tsx；DocumentContext.branch-fanout.dom.test.tsx；DocumentContext.folder-tab-sync.dom.test.tsx；DocumentContext.getPool-namespace.dom.test.ts；DocumentContext.snapshot-stability.dom.test.tsx | 宿主适配 | 重写为 Huhu 版 `document-context.ts`，保持 `DocumentContextValue` 子集（design §2；reuse §1） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| Provider 池 provider-pool（2121 行） | app/src/editor/provider-pool.ts；provider-pool*.test.ts（约 10 个） | provider-pool.test.ts；provider-pool.attach-boundary.test.ts；provider-pool-flush-on-hide.test.ts；provider-pool-pending-replay.test.ts；provider-pool-durable-replay.test.ts 等 | 宿主适配 | 保留 park / evict 与 Collaboration 绑定；lineage、auth、outbox、otel 不带（reuse §1） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 本地 Y 更新持久化 client-persistence（IndexedDB 更新表） | app/src/editor/client-persistence.ts | client-persistence.test.ts | 不适用 | — | design §3.2 明确不引入 y-indexeddb；草稿由会话机制承担（reuse §8） | 不适用：design §3.2 明确不引入 y-indexeddb；草稿由会话机制承担（reuse §8） |
| 出站重放队列 replay-outbox | app/src/editor/replay-outbox.ts | replay-outbox.test.ts | 不适用 | — | 云同步出站队列，Huhu 无对应（spec §8） | 不适用：云同步出站队列，Huhu 无对应（spec §8） |
| 协作追踪 collab-otel | app/src/editor/collab-otel.ts | 无同名测试 | 不适用 | — | 为协作 URL 注入追踪上下文，Huhu 无协作 URL（spec §8） | 不适用：为协作 URL 注入追踪上下文，Huhu 无协作 URL（spec §8） |
| 后台节流上报 BackgroundThrottleReporter | app/src/editor/BackgroundThrottleReporter.tsx | BackgroundThrottleReporter.dom.test.tsx | 不适用 | — | 依赖 `collabUrl`（云协作）；其余功能未核实 | 不适用：依赖 `collabUrl`（云协作）；其余功能未核实 |
| 在线状态与光标标签 awareness-*、awareness-heartbeat*（含 worker）、awareness-user、caret-label-layer | app/src/editor/awareness-*.ts；caret-label-layer.ts；app/src/presence/（TiptapEditor.tsx:52 引入，超出限定范围） | awareness-heartbeat.test.ts；awareness-heartbeat-runtime.test.ts；awareness-user.test.ts | 不适用 | — | 多人 presence（spec §8） | 不适用：多人 presence（spec §8） |
| 分支失效 branch-invalidation；客户端移除对账 client-removal-reconciliation | app/src/editor/branch-invalidation.ts；client-removal-reconciliation.ts | branch-invalidation.test.ts；client-removal-reconciliation.test.ts | 不适用 | — | 云协作分支与多客户端对账语义（未逐行核实；reuse §8） | 不适用：云协作分支与多客户端对账语义（未逐行核实；reuse §8） |
| Y 绑定自检 binding-staleness-guard | app/src/editor/binding-staleness-guard.ts | binding-staleness-guard.test.ts | 直接复制 | 随 Yjs 本地保留（spec §3 R2） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 观察者与同步 observers、observer-sync、sync-promise | app/src/editor/observers.ts；sync-promise.ts | observers.test.ts；observer-sync.test.ts；sync-promise.test.ts | 直接复制 | — | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 挂载等待与 id 注册 mount-promise、mount-id-registry | app/src/editor/mount-promise.ts；mount-id-registry.ts | mount-promise.test.ts；mount-id-registry.test.ts | 直接复制 | — | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 落地控制与滚动 landing-controller | app/src/editor/landing-controller.ts | landing-controller.test.ts；landing-controller.browser.test.ts | 直接复制 | 滚动与焦点验证在真实 Electron（spec §7） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 落地闪烁 landing-flash、agent-insert-flash、agent-flash-source | app/src/editor/plugins/landing-flash-*.ts；agent-insert-flash.ts；agent-flash-source.ts | agent-insert-flash.test.ts；landing-flash-*.test.ts | 保留（原 待定，OP-D19） | — | 未核实：疑似 AI 写入高亮；需 S0 下一轮核实后定 | 保留：锚点跳转后的高亮闪烁，随 vendor 原样保留；未单独验证 |
| 代理跟随滚动 agent-follow-scroll | app/src/editor/agent-follow-scroll.ts | agent-follow-scroll.test.ts | 不适用 | — | 依据文件名与 AI 代理编辑场景判断（未逐行核实；见 §14） | 不适用：依据文件名与 AI 代理编辑场景判断（未逐行核实；见 §14） |
| AI 选区编辑与提问输入区 edit-with-ai-selection、ask-composer-inset | app/src/editor/edit-with-ai-selection.ts；ask-composer-inset.ts | edit-with-ai-selection.test.ts | 不适用 | — | AI 能力（spec §8） | 不适用：AI 能力（spec §8） |
| AI 输入框 ComposerMentionInput、composer-mention/*（`@`、`/` 触发） | app/src/editor/ComposerMentionInput.tsx；composer-mention/ | ComposerMentionInput.dom.test.tsx；composer-mention/composer-mention.test.ts；composer-slash-command.test.ts | 不适用 | — | AI 输入框（composer），非文档编辑器（`@` 触发在文档编辑器中不使用） | 不适用：AI 输入框（composer），非文档编辑器（`@` 触发在文档编辑器中不使用） |
| 选区快照 selection-context | app/src/editor/selection-context.ts | selection-context.test.ts | 不适用（原 待定，OP-D19） | — | 未核实用途（疑似服务 AI 输入上下文） | 不适用：服务于 “Edit with AI” 选区快照（edit-with-ai-selection），AI 能力不接（Q2） |
| 选区统计 selection-stats | app/src/editor/selection-stats.ts | selection-stats.test.ts | 直接复制 | — | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 编辑器标签与预览标签 editor-tabs、preview-tab-promotion、tab-identity | app/src/editor/editor-tabs.ts；preview-tab-promotion.ts；tab-identity.ts | editor-tabs.test.ts；preview-tab-promotion.test.ts | 宿主适配 | 路径字符串数组标签与 `folderView` 删除，改为 `DocTab`（design §7；spec §14 第 5 条） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 多窗格 editor-panes（1054 行） | app/src/editor/editor-panes.ts | editor-panes.test.ts | 不适用（原 待定，OP-D19） | — | Q10：分屏是否属于本地编辑功能，待用户确认（S0 评估与 DocTab 冲突） | 不适用：Q10：OK 分屏 / pane（editor-panes.ts，1054 行）与 Huhu 的 DocTab 联合标签 + 工作台布局冲突；Huhu 已有自己的标签条与 Agent CLI 分屏。OP-D19 决定登记不适用 |
| 外链预览 link-preview（ExternalLinkPreviewCard、use-external-link-preview） | app/src/editor/link-preview/ | external-link-preview.test.ts；ExternalLinkPreviewCard.dom.test.tsx | 宿主适配 | 默认关闭，不联网（Q3）；开启后经主进程限时限大小 | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 内部文档预览 link-preview（InternalDocPreviewCard、use-internal-doc-preview） | app/src/editor/link-preview/internal-doc-preview.ts；InternalDocPreviewCard.tsx | internal-doc-preview.test.ts；InternalDocPreviewCard.dom.test.tsx；use-internal-doc-preview.dom.test.tsx；doc-excerpt.test.ts | 宿主适配 | `/api/document`、`/api/backlink-counts` → notes 能力（design §4） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 资源分派 asset-dispatch（dispatcher、registry） | app/src/editor/asset-dispatch/ | asset-dispatch/dispatcher.test.ts；registry.test.ts | 宿主适配 | 对应 Huhu 查看器分派（design §11.1） | — | 已验证：上游单测通过：registry.test.ts；e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |
| 图标与描述符 registry（file-icons、icons、lucide-svg、descriptor-icons、resolve-descriptor-placeholder、types） | app/src/editor/registry/ | file-icons.test.ts；descriptor-icons.test.ts；lucide-svg.test.ts；resolve-descriptor-placeholder.test.ts | 直接复制 | 共享 `FileIcon` 与静态扩展名表（design §2、OP-D13；spec §4 F 项） | — | 已验证：e2e：SP-6 + editor-s2b.spec.ts（打开 / 无编辑不写盘 / 切换 / 撤销 / flush） |

## 14. “不适用”清单汇总（供用户审阅，对应 spec Q2）

以下各组均来自上表“动作 = 不适用”的行。用户确认前不得在“完成”中写“复刻完成”（spec Q2）。

1. **Lint / 审计（服务端能力）**：`app/src/editor/extensions/markdown-lint-decorations.ts`；`app/src/editor/source-lint/markdown-lint-source.ts`；`core/src/markdown/lint/`；`/api/lint/*` 与 `/api/audit` 的客户端（`lint-config-client.ts`、`validation-audit-client.ts`，未在本表单独成行，归入此组）；`app/src/components/LintConfigEditor.tsx` 与 `SchemaConfigEditor.tsx` 的 lint 配置编辑（未在本表单独成行，归入此组，依据 import 判断）；工具栏 Lint 诊断入口。原因：markdownlint 为服务端，约 1.9k 行（reuse §2）。
2. **Share（分享）**：`app/src/components/FileTargetMenuItems.tsx` 的 Share 项与 `FileTree.tsx` 的 Share 分支；`EditorTabTargetMenuItems.tsx` 中的分享入口。原因：spec §8。
3. **OpenWithAi / Ask AI**：`FileTargetMenuItems.tsx` 的 openWithAi 插槽；`app/src/editor/components/JsxComponentView` 中“Comment or ask AI”按钮（`JsxComponentView.tsx:821`）；`app/src/components/ask-ai-composer-events.ts`（未在本表单独成行，依据名称判断）。原因：spec §8。
4. **评论派发给 AI 代理（队列 / 发送 / 代理选择）**：`CommentSendFooter.tsx`、`QueueNewChatRow.tsx`、`CommentQueueShortcut.tsx`、`use-send-queue`、`use-comment-agent-picker`、`use-comment-delivery`、`open-chat-send`、`queue-grouping`、`reveal-queue`；`store.ts` 的 queue / dispatch 段；`comments-client.ts` 的 queue / unqueue / dispatch-* 端点；`ThreadCard.tsx` 的“发送”按钮。原因：AI 代理派发，spec §8 与 Q2 默认不接；Huhu 评论持久化仍保留（R7）。
5. **AI 代理编辑与 AI 输入**：`agent-follow-scroll.ts`、`agent-insert-flash.ts` / `agent-flash-source.ts`（已在 §13 列为待定，见 §15）、`edit-with-ai-selection.ts`、`ask-composer-inset.ts`、`ComposerMentionInput.tsx` 与 `composer-mention/`（含 AI 输入框的 `@` / `/` 与组合键）。原因：AI 能力（spec §8）。
6. **OK 技能 / 托管产物 / 幻灯片（推定，需用户确认）**：`skill-path-links.ts`、`skill-reference-items.tsx`（`skill-ref-*`）、`SkillProperties.tsx`、`ManagedArtifactProperties.tsx`、`SkillToolbarControls.tsx`、`SlidesToolbarControls.tsx`。原因：OK 专有的技能 / 托管产物 / 幻灯片体系；spec Q2 未列，本表按“本地编辑核心之外”推定，需用户确认。
7. **云协作 / 同步 / 在线状态（spec §8 与 reuse §8）**：`provider-pool.ts` 中 lineage、auth、outbox、otel 部分（该文件本身为宿主适配）；`replay-outbox.ts`；`collab-otel.ts`；`client-persistence.ts`（IndexedDB）；`BackgroundThrottleReporter.tsx`；`awareness-*.ts`、`caret-label-layer.ts`（presence）；`branch-invalidation.ts`；`client-removal-reconciliation.ts`；`TiptapEditor.tsx:52` 引入的 presence identity。

**待定（不计入“不适用”）**见 §15。

## 15. 待定清单（需用户确认或 S0 下一轮核实）

- **Q2 待用户确认**：`app/src/editor/components/ExcalidrawEmbed.tsx`（块）；`app/src/components/ExcalidrawDocEditor.tsx`（文档编辑器）；`app/src/components/MermaidDocEditor.tsx`（独立 Mermaid 文档编辑器）。模板导入（`New from template`、`Import as template`）按 Q2 默认保留，列为宿主适配，不在待定。
- **Q10 待用户确认**：`app/src/editor/editor-panes.ts`（多窗格，1054 行）。
- **未核实用途**：`app/src/editor/walk-currency-extension.ts`；`app/src/editor/selection-context.ts`；`app/src/editor/plugins/landing-flash-*.ts` 与 `agent-insert-flash.ts`；`app/src/components/FolderPropertiesCard.tsx`；`app/src/components/TemplateProperties.tsx`；`app/src/components/EditorSidebarsContextMenu.tsx`；`app/src/editor/clipboard/codeblock-preview-clipboard.test.ts` 对应源文件。
- **未核实用途（补充）**：`app/src/comments/CommentProjectPanel.tsx`（是否涉及派发视图，未逐行核实）。

## 16. 动作计数

以下计数由本文件内各表“动作”列统计（同一能力只计一次；§14 与 §15 为汇总，不重复计数）。

| 动作 | 行数 |
| --- | --- |
| 直接复制 | 159 |
| 宿主适配 | 90 |
| 不适用 | 22 |
| 待定 | 12（2026-11-18 全部已按 OP-D19 处理，见 §18）|
| 合计 | 283 |

各节行数（awk 统计）：§1 节点 44、§2 扩展行为 30、§3 NodeView 与 JSX 27、§4 工具栏 16、§5 Slash 14、§6 输入 / 粘贴 / 复制 31、§7 快捷键 14、§8 上下文菜单 6、§9 序列化 12、§10 属性面板 17、§11 评论 23、§12 文件树 17、§13 会话与宿主 32。

## 17. 未覆盖、未核实与读取范围说明

- **超出限定范围未读**：`core/src/registry/`（JSX 组件定义、canonical 清单、`PREVIEW_CONFIG` 来源）→ component-items 动态清单未核实；`core/src/frontmatter/`（YAML 编解码）；`app/src/lib/`、`@/lib/keyboard-shortcuts`、`@/lib/share`、`@/lib/skill-name-set`、`app/src/presence/` 仅按 import 路径引用，未读内容。
- **为映射而读取/列出的范围外内容**：`core/src/constants/preview-embed-starters.ts`（仅读取 4 个 starter id）；`core/` 下测试文件名（仅列出名称，用于“对应上游测试”列）。
- **core/src/markdown 无同名测试**：目录内无 `*.test.*`；fixtures 与其使用方未核实。
- **覆盖粒度**：`app/src/components` 约 345 个非测试顶层文件与约 203 个子目录文件（settings、acp、handoff、ui 等）未逐个成行，仅按功能归类覆盖到使用处；`app/src/editor` 约 319 个非测试文件同理，`app/src/comments` 35 个非测试文件已按功能覆盖。
- **快捷键**：键位表逐条未核实（StarterKit 与 Tiptap 默认键）。
- **平台**：真实输入法、Windows / macOS 的选择与快捷键差异在本机 Linux 无法验证（spec §7），本文件不写“已通过”。
- **未核实项汇总**：见 §15 与各行“未核实”字样。
- **上游最新提交差异**：本文件未做（属 S0 其他子项）。

## 18. 验证状态汇总（2026-11-18，S3 收尾）

每个表格行末尾的“验证状态”列由脚本按证据映射写入，**没有证据的写“未逐项验证”，不虚报**。解析 283 行（其中 1 行格式特殊，已手工标注）：

| 状态 | 行数 | 证据来源 |
| --- | --- | --- |
| 已验证 | 170 | 迁入并通过的上游 core / 评论单测（`test:vendor`：168 个文件、4210 个用例通过（70 个文件按 test/vendor-not-applicable.json 登记不适用，原因同 evidence/vendor-tests-na.json））；`editor-s3-matrix.spec.ts`（13 类 Markdown 构造无编辑打开字节不变且可渲染；`/` 菜单 36/36 项应用）；`editor-s3-rules.spec.ts`（输入规则 15/15、快捷键 4 + 块移动 + 撤销重做、粘贴 Markdown / HTML / 裸 URL）；`editor-s3-properties` / `editor-s3-parity`（属性、坏 YAML）；S4 / S5 / S2b 的 e2e |
| 不适用 | 31 | 原“不适用”22 行 + 原“待定”12 行里 9 行按 OP-D19 评估后归入不适用（其余 3 行保留随 vendor），每行有原因 |
| 未逐项验证 | 82 | 上游 app 的 dom 测试（85 个，缺 jsdom 预加载设施）未迁入，且没有专项 e2e：主要是 §1 的少见节点（下划线、转义、HTML 块、高亮、行内 JSX…）、§2 的辅助扩展、§3 的块组件渲染细节与交互（只验证了 `/` 插入）、§4 的单个工具栏按钮行为、§6 的 15 类粘贴来源识别与拖放、§7 的部分快捷键、§8 上下文菜单项 |

### 原“待定”12 行的处理（OP-D19：从项目与来源找答案，不再询问用户）

| 项 | 决定 | 理由 |
| --- | --- | --- |
| `ExcalidrawEmbed` 块 | 保留 | `/` 菜单项“Excalidraw”已验证可插入；是编辑器内的块 |
| `ExcalidrawDocEditor`（独立文档类型） | 不适用 | Huhu 查看器分派表无此类型，产品要求未提及 |
| `MermaidDocEditor` | 不适用 | Huhu 已有 `.mmd` 预览；Mermaid 块在编辑器内保留（`/` Mermaid 已验证） |
| `editor-panes`（Q10 分屏） | 不适用 | 与 Huhu 的 DocTab 联合标签 + 工作台布局 + Agent CLI 分屏冲突 |
| `walk-currency-extension` | 不适用 | 只做性能打点，无用户可见行为 |
| `selection-context` | 不适用 | 服务于 Edit with AI |
| `landing-flash-*` | 保留（随 vendor） | 锚点跳转高亮；未单独验证 |
| `agent-insert-flash` | 不适用 | AI 代理插入闪烁 |
| `FolderPropertiesCard` | 不适用 | 依赖 OK 文件夹 schema 服务端接口，Huhu 无对应概念 |
| `TemplateProperties` | 不适用 | Huhu 没有模板存储 |
| `EditorSidebarsContextMenu` | 不适用 | OK 的应用壳布局操作 |
| `CommentProjectPanel` | 不适用 | 项目级评论总览；Huhu 评论面板按笔记 |
| codeblock-preview-clipboard | 保留（随 vendor） | 源文件位置未定位；未单独验证 |

### 复核发现的问题（本轮）

- **输入法组合中会把未提交的拼音写进磁盘**（B07）：已修（`RichMarkdownEditor` 组合期间推迟交付，组合结束后补一次；e2e 覆盖）。
- **合成键盘事件下“选区后立刻按格式快捷键”会作用在旧选区上**：ProseMirror 经 `selectionchange` 异步同步选区，紧贴着按键会丢失（Playwright 才会出现，手速达不到）。e2e 在选区后等 300 ms；这是测试节奏，不是缺陷，但**不是对真实手速的证明**。
- **在已有选区内按下鼠标会启动文字拖放而不是新选区**：浏览器 / ProseMirror 的标准行为，探针与 e2e 每次先把选区挪走。
- 以上均为真实 Electron + CDP / 合成事件，**真实输入法与硬件鼠标未验证**。
