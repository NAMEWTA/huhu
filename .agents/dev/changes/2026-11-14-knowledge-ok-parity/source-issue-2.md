# 来源：GitHub issue #2（原文存档）

- 链接：https://github.com/NAMEWTA/huhu/issues/2
- 标题：[知识库完整重构] 直接移植 Open Knowledge 编辑器（允许重构技术栈），完整集成评论、文件资源、档案及多格式查看编辑
- 状态：OPEN（拉取时间 2026-11-14）
- 创建：2026-11-14T14:15:34Z；作者：NAMEWTA
- 说明：下面是 issue 正文与 1 条用户补充评论的**原文**，未改动。正文里的“Huhu 现状”以 `913264045cee`（`v0.0.1-rc.4`）为准；与后来核实不一致处见 [spec.md](spec.md)“现状证据”和 [reuse.md](reuse.md)。评论优先于正文中与之冲突的技术选型限制（见 [brief.md](brief.md)）。

---

## 正文

## 0. 调查基线、需求解释与交付边界

本 Issue 是基于真实源码核对的完整重构实施方案，不是“补几个按钮”的 UI 修复，也不表示代码已实现或测试已通过。

### 0.1 Huhu 当前节点

调查开始及提交前均复查了 `main`，基线一致：

- **`913264045cee1818497a37a57715c664aa85a1ae`**，`chore(release): 0.0.1-rc.4`。
- 提交时间：**2026-11-14 21:45:51，UTC+8**。
- 父提交：`b5a62c2dbbce48b49b6b7c608fafc6f5210c95bc`。
- 本节点已经包含设计系统收尾和 `.agents` 资料归档。实现时必须使用现行样式与目录规范，不能照搬历史 Tailwind / 原型目录方案。

源码永久链接见文末；正文中的 Huhu 代码事实均以该 SHA 为准。后续实施若 `main` 前进，应先记录差异，再按新基线实施，不能把这份静态调查误当成未来分支状态。

### 0.2 对用户意图的落实

**目标是完整复刻 OK 的本地笔记编辑、渲染、命令、菜单和评论体验，结合 ORCA 的文件打开/查看能力以及 Obsidian 虎符的档案导航交互，集成进 Huhu 现有知识库插件。**

用户提到的“ND 笔记顶部的秧庙”，按上下文解释为 **Markdown 笔记的 YAML frontmatter / 属性区**。本文不据此发明新的元数据协议。后文的“OPPO knowledge”按本次需求最先明确的 Open Knowledge（OK）及仓库已登记来源对齐，不另行假设存在一个不同项目。

本期必须覆盖：全部文件可见、仅视图隐藏、真正右键菜单、OK 主编辑器与 `/` 命令、顶部自适应、完整评论交互、正文顶部属性、档案入口/真实标签/侧栏切换、固定文件图标、JSON/TXT 编辑、PDF 查看、HTML 整页渲染、保存与外部修改可靠性。

**不保留旧编辑器兼容层、旧/新两套知识库、双写协议或“试用新版”开关。** 阶段拆分只用于实施，不可将某个阶段完成宣称为整体复刻完成。

### 0.3 本次已核对与尚未验证

已通过 GitHub 读取 Huhu 的关键调用链、现行规范、来源台账，以及下述固定上游版本的编辑器、菜单、评论、文件查看、档案导航等入口源码。静态证据足以确认多项功能缺口。

**未取得用户本机 `temp/sources` 工作副本；`temp/` 被 `.gitignore` 忽略。** 本次检查的是清单对应的上游固定提交，不声称已检查本地未提交改动。实施者必须补核本地版本与差异。

本次未启动实际 Electron / OK 界面，未执行构建、单元测试或 E2E。鼠标选区和上下行异常是用户报告的问题；本文指出相关高风险实现，但不把静态推断写成已复现的唯一根因。

---

## 1. 最终产品契约

| 主题 | 必须达到的行为 |
| --- | --- |
| 文件资源管理器 | 默认展示当前 Vault 内真实文件、目录、空目录和未知扩展名。`Tasks/` 等业务目录不能因“不属于普通笔记”被过滤。 |
| 隐藏 | 用户主动右键隐藏，只影响资源管理器可见性；不删文件、不改索引忽略规则、不影响 `@`、双链解析、搜索和已打开标签。提供查看/恢复隐藏入口。 |
| 普通目录 | 展开或选择后展示子文件；不因存在 `index.md` 就自动把普通目录当成档案详情页。 |
| Markdown 编辑 | 默认采用 OK 的富文本编辑与渲染体验；不是在旧 CodeMirror 装饰层上再模拟一套富文本。源码模式仍是明确的编辑模式，不是旧版兼容模式。 |
| `/` | 复刻 OK 的触发、过滤、分类、预览、键盘选择、执行、关闭、定位和输入法细节；不是只添加几条字符串模板。 |
| 属性 | YAML frontmatter 在笔记正文顶部正常渲染，并与详情面板共享同一份值和编辑状态。 |
| 评论 | 复刻选区发起、正文锚点、高亮、浮层/侧栏、线程、回复、解决/重开、定位、孤立锚点等完整交互；接入 Huhu 现有评论持久化。 |
| 档案 | 顶部分区顺序为“文件 / 星标 / 日记 / 标签 / 回收站 / 档案”。档案入口打开真实标签页，活动档案标签使左侧切换为档案树。 |
| 文件类型 | `.json`、`.txt` 可查看并编辑；`.pdf` 内嵌查看；`.html` 整页渲染且可切源码；不再统一退化为只读文本/元信息卡。 |
| 图标 | 按扩展名/文件种类固定映射，同一资源在树、标签、搜索、`@` 和详情里一致。 |
| 顶部布局 | 充分使用可用宽度，根据实际容器宽度收纳工具；不能人为固定两行并在第一行留下大片空白。 |
| 文件事实 | 磁盘文件仍是事实来源；不引入第二套文档数据库、富文本 JSON 真源或档案实体库。 |

“全部显示”不等于“所有内容都进入全文索引”，也不等于绕过 Vault 路径守卫、只读状态或执行权限。**可见性、可引用性、内容索引和读写权限必须分开。**

---

## 2. 已确认的源码问题与可复用基础

### 2.1 缺口与证据

| 编号 | 现有代码与真实行为 | 本次必须修改 |
| --- | --- | --- |
| F01 | [`plugins/notes/src/engine/service.ts`][h-service] 的 `SEMANTIC_DIRS`、`isNoteFile()`、`list()` 排除语义目录；非 Markdown 资源入口也有语义目录/点路径过滤。 | 文件树改用真实资源目录，不能由“普通笔记列表”拼出。业务分类不得决定文件是否存在。 |
| F02 | [`packages/kernel/src/capabilities/vault.ts`][h-vault-cap] 的 `vault.tree` 返回 `index.entries()`；[`vault-index.ts`][h-index] 从文件快照反推父目录；[`snapshot.ts`][h-snapshot] 只收集文件并忽略 `.git`、`node_modules`、`.huhu`、`.agents` 等。 | 目录列举与内容索引解耦，真实空目录也可显示；不能简单删掉索引忽略表造成全量递归、运行态回声或敏感内容索引。 |
| F03 | [`NoteExplorer.tsx`][h-explorer] 从笔记/补充文件构树；非 Markdown 行操作受限；菜单主要由按钮打开，尚非 OK 文件树交互。 | 移植 OK 树、右键、选择、重命名、拖放等交互，绑定现有文件能力。 |
| F04 | [`MarkdownEditor.tsx`][h-editor] 使用 CodeMirror + Atomic 的实时装饰/替换渲染，不是 OK 的 Tiptap/ProseMirror；当前扩展配置没有完整 OK slash-command 链。 | 替换知识库主富文本内核及相关 UI；保留成熟 CodeMirror 用于源码/纯文本，不继续扩展旧 live-preview。 |
| F05 | [`FileCard.tsx`][h-filecard] 将文本类文件交给 `readOnly` 编辑器，`onChange` 不保存；PDF 没有对应内嵌查看链，HTML 没有整页预览。 | 文件类型分派；JSON/TXT 接通已有文本读写、草稿和冲突处理。PDF/HTML 使用专用查看器。 |
| F06 | [`MarkdownPreview.tsx`][h-preview] 明确 `stripFrontmatter()`；[`NoteInspector.tsx`][h-inspector] 的属性仅有标题、目录、标签，不是通用 YAML 属性渲染。 | 正文顶部属性组件与详情共用同一数据模型；不能只去掉剥离正则，把 YAML 当正文显示。 |
| F07 | [`NoteDocument.tsx`][h-document] 存在分开的文档工具栏和编辑工具栏，格式操作仍以源码编辑为主。 | 随富文本命令统一重构工具栏与溢出策略；具体宽度/换行问题用真实渲染测量确认，不以猜 CSS 一行修复结案。 |
| F08 | [`NotesModule.tsx`][h-module] 的文档标签主要是文件路径数组，而档案首页/类型页通过独立 `folderView` 切换；档案入口在标题操作区而非指定分区。 | 档案首页、类型和记录作为真实视图标签；活动标签与侧栏上下文一致。 |
| F09 | [`CommentsPanel.tsx`][h-comments-ui] 已有回复、解决/重开、删除、重新定位，但消息主要为简单文本展示，不是完整 OK 评论界面。 | 移植 OK 评论 UI 和编辑器锚点交互，不把“已有后端评论方法”当成体验已复刻。 |
| F10 | [`NoteInspector.tsx`][h-inspector] 从原始文本逐行正则提取标题，主模块定位依赖 CodeMirror `.view`。 | 大纲来自解析结果，跳转通过编辑器公共接口；代码围栏/YAML 里的伪标题不能污染大纲。 |

与选区问题相关的调查方向包括：实时装饰替换、选区变化引发的装饰重算、异步保存/外部内容重载、编辑器实例与焦点生命周期。**这些是排查点，不是已完成的运行时归因。**

### 2.2 必须保留并复用的现有能力

- `NotesService.read/save` 本身已能读取/写入文本，`save()` 使用 `expectedVersion`。**JSON/TXT 不可编辑不意味着后端必须另建一套文本存储。**
- `NoteDocument` 已有自动保存、在途保存管理、冲突提示、草稿、外部变更处理、关闭/切换前 flush 等基础。应拆出复用，而不是随着 UI 替换丢掉。
- Vault 的路径规范化、单文件原子写、多文件 `OperationLog`、回收站、重命名/移动及双链重写继续使用。
- 现有 `plugins/notes/src/engine/comments/` 已吸收 OK 的部分锚点算法；评论存储与业务能力继续复用。
- [`frontmatter.ts`][h-frontmatter] 已提供 `splitDocument`、`replaceBody`、`patchFrontmatter`、`frontmatterScalarSources`、`renameFrontmatterKeys`。不能再写一套 YAML 正则解析器。
- [`plugins/tasks/src/ui/references.ts`][h-references] 已有稳定回调、候选刷新和 `scoreText` 排序。抽取确有多消费者的部分共享，不能让 notes 直接导入 tasks 私有 UI，也不另建引用后端。
- 现有档案已经归入 notes，见 [现行档案规范][h-archives-spec]。不要恢复独立 archives 插件。

---

## 3. 复用决策与固定源码清单

### 3.1 强制顺序

```text
① Huhu 当前已有实现
         ↓
② temp/sources 中的成熟实现
         ↓
③ 现有成熟开源依赖或框架
         ↓
④ GitHub 上的优秀开源项目
         ↓
⑤ 基于成熟方案的小范围适配
         ↓
⑥ 确实没有合适实现时才自行开发
```

每个新增模块必须记录“检查过的文件/符号 → 可复用部分 → 不足 → 适配边界 → 测试”。未取得工作副本只能记为未核对，不能写成没有可复用代码。

Huhu 的 [来源台账][h-ledger] 和 [原来源清单][h-reuse] 是调查入口，但历史“计划复制”不等于当前源码已经复制。此次明确发现 OK 编辑器和文件树体验尚未完整落地。

### 3.2 固定来源

| 来源 | 本方案采用的提交 | 用途 |
| --- | --- | --- |
| `inkeep/open-knowledge` | `44a2e0a6acce5952da0764746e3693fded5025b4` | 主编辑器、Markdown 保真链、命令、文件树菜单、评论；与 Huhu 登记的参考来源对齐。 |
| `stablyai/orca` | `7041ea022826ec19d627cd3a129b665822e7bf0a` | 文件查看分派、PDF 查看器、HTML 打开/flush/异步归属控制。 |
| `NAMEWTA/obsidian-huhu` | `d527f14efa523dc4e0c7d1ee4e8487bf78544679` | 档案目标驱动的页面、标题、侧栏树与文件资源关联交互。 |

这些是可复现的复刻基线，不宣称是所有上游当前最新提交。实施者若选择更新上游，必须整体更新依赖闭包、锁定版本、来源清单和验收基线，禁止混用不同提交的目录结构。

### 3.3 源码 → 复制/适配落点

以下目标目录为本方案的**拟议新增或重构位置**，不是声称当前已存在。

| 功能 | 必须读取/复制的上游入口及依赖 | Huhu 落点与适配边界 |
| --- | --- | --- |
| 富文本总装 | OK [`packages/app/src/editor/TiptapEditor.tsx`][ok-editor]、[`editor/extensions/shared.ts`][ok-app-ext]，及其实际引用的 NodeView、交互层、工具栏、剪贴板、键盘导航、表格、滚动/模式切换模块 | `packages/editor/src/vendor/open-knowledge/editor/` + `RichMarkdownEditor.tsx`；保留成熟编辑行为，替换文档获取/保存、上传、引用、宿主命令接口。 |
| Schema 与保真扩展 | OK [`packages/core/src/extensions/shared.ts`][ok-core-ext] 及其完整 import 闭包 | `packages/editor/src/vendor/open-knowledge/core/extensions/`；不能拿默认 StarterKit 替代 OK 的列表、代码、链接、表格、原始语法等保真扩展。 |
| Markdown 往返 | OK [`packages/core/src/markdown/index.ts`][ok-markdown] 的 `MarkdownManager`、同目录 `pipeline.ts`、`parse-with-fallback.ts`、`to-markdown-handlers.ts`，以及实际引用的 bridge、registry、位置和源文本保真模块 | `packages/editor/src/vendor/open-knowledge/core/`；保留 Markdown 文件真源，不用 HTML 转 Markdown 的简化链替代。 |
| `/` 完整交互 | OK [`editor/extensions/slash-command.ts`][ok-slash]；[`editor/slash-command/`][ok-slash-dir] 中 `SlashCommandMenu.tsx`、`items.tsx`、`apply-item.ts`、`component-items.tsx`、`embed-starter-items.tsx`；以及 `suggestion-allow.ts`、`suggestion-ime.ts`、`suggestion-floating-ui.ts` | 随编辑器来源模块复制；命令通过一次编辑事务执行，宿主专有项接 Huhu 能力，不另造第二个弹出菜单实现。 |
| 文件树 | OK [`components/FileTree.tsx`][ok-tree]、`file-tree-adapter.ts`、`file-tree-selection.ts`、`file-tree-operations.ts`、`file-tree-rename-validation.ts` 及相关键盘/拖放/测试依赖 | `plugins/notes/src/ui/explorer/`；复用其 `@pierre/trees` 集成，数据和操作接 Huhu。不能复制 OK 的文档列表限制作为 Huhu 的全文件规则。 |
| 右键菜单 | OK [`components/FileTargetMenuItems.tsx`][ok-menu] | `plugins/notes/src/ui/explorer/FileContextMenu.tsx`；沿用可注入菜单原语结构，接 `@huhu/ui`/现有 Radix 能力与同一操作分发。隐藏语义按本 Issue 改为仅视图。 |
| 评论面板 | OK [`comments/CommentsPanel.tsx`][ok-comments-panel]、同目录 `CommentListPanel` 及其线程、编辑器、状态依赖 | `plugins/notes/src/ui/comments/`；UI 适配 Huhu `comments.*`，不复制另一套服务端或持久化。 |
| 选区评论 | OK [`comments/CommentSelectionAffordance.tsx`][ok-comment-selection]、`selected-span.ts`、`anchor-search.ts`、`CommentMarginRail` 等实际入口依赖 | notes 评论 UI + 编辑器宿主插槽；保留选区上下文捕获、可见区域定位、焦点和取消行为。 |
| 评论高亮与定位 | OK [`comments/anchor-decorations.tsx`][ok-comment-decos]、`anchor-layers.ts`、`anchor-search.ts`、core 的评论文本提取 | 编辑器通用锚点适配 + 现有评论后端；ProseMirror 坐标不能直接当 Markdown 源码偏移。 |
| PDF | ORCA [`components/editor/PdfViewer.tsx`][orca-pdf]、同级 `PdfFind.tsx`、`pdf-document-loader.ts`、`pdf-viewer-session.ts`、缩放/位置/清理模块及实际依赖 | `plugins/notes/src/ui/viewers/pdf/`；复用 PDF.js 包装和生命周期，替换 ORCA store/i18n/资源 URL 为 Huhu。 |
| 文件分派 | ORCA [`components/editor/EditorContent.tsx`][orca-content]、`EditorEditFileSurface.tsx` | notes 文档路由/查看器分派；不复制 Git worktree/WSL/远程连接平台，也不因 ORCA 使用 Monaco 就再引入第二套源码编辑器。 |
| HTML 预览入口 | ORCA [`components/editor/open-editor-html-preview.ts`][orca-html] 及其文件预览入口依赖 | notes HTML 视图 + 现有 Engine/Desktop 边界；复用打开前 flush、请求归属检查和过期请求取消思路。 |
| 档案导航 | Obsidian 虎符 [`src/modules/archives/services/generic/workbench.ts`][obs-workbench]、[`src/modules/archives/module.ts`][obs-module] | notes `tabs/`、`archives/`；借用 target 驱动标题/页面/侧栏和文件资源关联，不搬入 Obsidian 宿主或另一套档案 schema。 |
| 文件图标 | OK [`components/file-entry-icon.tsx`][ok-icons]；Huhu 已有 Lucide；对照 Material Icon Theme 映射 | 共享 `FileIcon` + 静态扩展名表。优先已有库，不安装整个 VS Code 图标主题运行时。 |

**复制单位是可运行的依赖闭包与测试，不是只摘一个 TSX 文件。** 表中入口已做源码核对；完整递归依赖清单和本地工作副本差异在 S0 固化。源码复制保留原声明，更新现有台账及第三方说明，不以此另起不必要的审批流程。

### 3.4 明确不采用的实现

- 不继续以 Atomic/CodeMirror 的 DOM 装饰模拟 OK 主富文本体验。
- 不仅安装 Tiptap StarterKit 后自行重写 OK 的细节。
- 不复制 OK 的整套账户、组织、协作服务和 Hocuspocus 后端来满足本地笔记需求。
- 不为文件树、评论、档案、文本保存新增并行数据库或业务总线。
- 不把 ORCA 整个浏览器/工作区系统复制进知识库。
- 不照搬 OK 的全站 Tailwind/reset 与主题，破坏 Huhu 现行设计系统。

本地编辑功能的复刻范围不得暗中缩减；账户、云协作等不属于本 Issue 的宿主产品范围。任何本地块/命令需要宿主能力时，必须完成真实适配并列入验收，不能留一个空按钮后宣称复刻完成。

---

## 4. 目标结构：一份文件、一份编辑会话、多种视图

```text
现有 Vault 文件服务 / 路径守卫 / 原子写 / 监听
               ↓
现有 Engine Dispatcher + 资源列举/读取/保存能力
               ↓
资源目录（不含用户隐藏过滤）
   ├─ 文件树：叠加用户可见性偏好
   ├─ @ / 双链 / 搜索入口：不使用文件树隐藏过滤
   └─ 打开资源 → 文档/视图标签
                      ↓
             单一 DocumentSession
      （原文、版本、草稿、保存队列、冲突）
           ├─ OK 富文本 / 同语义阅读
           ├─ CodeMirror 源码 / JSON / TXT
           ├─ 正文顶部属性 / 详情属性
           └─ 档案渲染视图（同一真实文件）

PDF / 图片 / HTML 等由类型分派进入专用查看器，仍共享资源身份与打开生命周期。
```

`DocumentSession` 是从现有 `NoteDocument` 保存逻辑拆出的薄控制层，不是新文档数据库。视图身份和文件身份分开：同一文件的富文本、源码、档案渲染可以是不同视图，但不能有互相覆盖的两个权威文本缓冲区。

新增类型名、文件名以本方案为建议，实施时可按现有相邻命名调整；职责边界和单一事实来源不能改变。

---

## 5. 文件资源管理器、隐藏、引用与操作

### 5.1 文件系统列举与搜索索引分离

1. 在现有 Vault 文件服务中补足真实目录枚举，返回实际目录、文件及必要元信息，包括空目录；复用路径守卫，不由渲染进程直接访问 `node:fs`。
2. `vault.tree` 不再把全文索引树当作完整文件系统。改造该现有能力及全部消费者，不维持“旧 tree / 新 tree”两种含义的兼容分支。
3. 根目录默认列出所有实际入口；大目录按父目录惰性展开/分页，不为了“全部可见”启动无限递归。
4. `.git`、`node_modules`、`.agents`、`.huhu` 等不能因为索引忽略就从资源列举消失。应用内部资源若受保护，应显示保护状态与具体操作限制，而不是偷偷隐藏。列出元信息不代表外部 CLI/MCP 获得秘密或内部状态的读取权限。
5. 内容索引仍按其目的限定范围。监听、全文索引、目录列表分别使用适合的过滤规则，避免 `.huhu` 写入造成循环失效。
6. 路径统一为 Vault 内规范相对路径；处理大小写、中文、空格、Unicode、重命名及路径越界。符号链接可显示为对应资源，解引用必须检查真实路径、循环和越界；拒绝时给出原因。
7. 文件系统变化、内部保存、移动/删除、目录增删都要更新目录缓存和相关查询。`ENTITY_CAPS`/事件失效一并核对，不能只刷新 React 本地数组。
8. 计数基于同一资源快照：文件与目录分开计数，隐藏后可显示“可见文件数 / 总数”；分页未完成时明确未完整统计，不能把已加载数量冒充总数。档案视图投影不能重复计算磁盘文件。

### 5.2 仅资源管理器隐藏

默认隐藏规则为空。右键文件或目录提供“在资源管理器中隐藏”。隐藏目录使其子树在该视图不可见，但不改变磁盘、文件身份、全文索引或引用有效性。

持久化优先复用现有每 Vault 的 UI 偏好设施；若现有结构缺字段，只增加类型化的 `hiddenPaths` 等必要字段。底层使用 `vault.stateDir`，不手拼 `<root>/.huhu`，也不写入每篇笔记的 YAML。

提供“显示已隐藏项目 / 管理隐藏项目 / 取消隐藏”。搜索或 `@` 打开隐藏文件时照常打开；需要定位时可以临时显露并说明其隐藏状态，不自动删用户规则。

内部重命名/移动要同步重定位隐藏路径及后代规则；外部重命名使用已有文件变更身份机制，无法可靠识别时按明确的路径规则处理，不猜测匹配。规则是路径级偏好：同一路径重新出现时仍受规则影响，用户可管理清除。

隐藏不触发关闭标签，不触发“文件不存在”，不删除收藏或评论。普通“隐藏”也不等于“移入回收站”或“从档案中删除”。

### 5.3 `@` 与双链

- 复用已有候选构建、排序和稳定回调，抽取真正共享部分至工作台公共资源适配层。
- notes、tasks 和其他现有消费者使用同一未套用视图隐藏规则的数据源；不直接跨插件导入私有实现。
- 惰性文件树不能成为 `@` 的唯一候选来源：未展开、隐藏目录下的资源也必须能查到。必要时在同一资源能力内提供查询，而不是遍历当前 DOM 节点。
- 文件引用使用完整相对路径与扩展名，目录使用明确目录形式；档案仍解析到真实目录/`index.md`。
- 同名、失效、越界目标必须明确区分；不把一个不存在的链接静默换成另一个同名文件。
- 当前笔记身份、重命名和双链更新继续复用；`Tasks/` 内业务 frontmatter 不能被笔记链接重写错误修改。

### 5.4 OK 文件树与右键菜单

移植 OK 的树选择、展开/折叠、键盘、上下文菜单、重命名验证、拖放及错误反馈，后端调用 Huhu 现有能力。

文件、目录、空白区域分别提供适用操作；至少完整接通：打开/新标签打开、新建文件/目录、模板入口、重命名、移动、复制、复制相对/完整路径、星标、隐藏、展开/折叠、回收站、恢复、永久删除确认。Huhu 现有版本操作保留。与 OK 账户或云服务有关的菜单不冒充本地功能，已有本地替代能力则绑定真实实现。

必须做到：

- 真正的 `contextmenu` 触发；右键未选中行时正确切换目标，右键已有多选时不误清空选择。
- 右键、行内更多按钮、键盘快捷键调用同一操作，权限/禁用原因一致。
- 菜单靠近窗口边缘自动翻转/约束，关闭后恢复合理焦点；Escape、方向键、子菜单和输入法正常。
- 重命名保持扩展名与合法路径规则；移动不能进入自身/后代；冲突不能覆盖目标。
- 拖放与菜单移动经过同一个业务能力和 `OperationLog`；不在 UI 直接改文件。
- 对打开且未保存的文件/后代目录执行移动、删除、复制时，先按会话规则 flush 或提示处理；失败不丢草稿。
- JSON/TXT/PDF 等非 Markdown 文件也获得适用菜单，不能因 `file` 标记而全部禁用。

---

## 6. 主编辑器完整移植，不再自制替代体验

### 6.1 以 OK 功能清单决定“完整”，而非主观挑选

S0 从固定上游版本生成复刻矩阵，逐项列出：节点/标记、扩展、NodeView、工具栏动作、slash 命令来源、输入/粘贴/拖放规则、快捷键、上下文菜单、序列化方法、测试和 Huhu 适配位置。

至少覆盖该基线已提供的标题、段落与行内格式、列表/任务列表、引用、代码、链接/双链、图片与嵌入、表格、数学、Mermaid/组件块、分隔线、脚注、原始语法保真，以及块选择、块移动、表格内导航和剪贴板行为。最终覆盖范围以源码注册清单为准，不能只完成这一行枚举后忽略其他已注册本地功能。

每一项记录“直接复制 / 宿主适配 / 不属于本地编辑范围的具体原因”。**本地编辑功能缺项是待完成项，不是默认允许的降级。**

### 6.2 编辑器内核与宿主解耦

- 复制 OK app 编辑器与 core schema/Markdown 保真闭包，保持扩展依赖、顺序和命令事务语义。
- 将 OK 的文档上下文、上传、引用、保存、通知等依赖换成窄宿主接口；数据仍经 Huhu Engine。
- 不照搬 Hocuspocus/Yjs 网络协作运行时。特别注意上游共享 StarterKit 中 `undoRedo: false` 是其组合方式的一部分：**本地模式必须安装并验证适配后的单一撤销历史，不能原样关闭后导致撤销不可用，也不能装两份冲突历史。**
- 主阅读模式采用同一 schema/渲染语义，必要时以不可编辑视图承载；不能出现编辑和阅读各自解析一种 Markdown。
- 现有通用小型 Markdown 预览只有在仍服务其他独立场景时保留；不能让它继续成为知识库主文档的另一条不一致渲染链。
- 业务无关的编辑器接口至少覆盖 focus、selection、execute、reveal、getDraft/flush、可用命令与只读状态。调用方不再通过 `.view` 直接操纵 CodeMirror。
- 一次更新所有实际 `@huhu/editor` 消费者及测试；不保留旧 handle 兼容包装。源码/纯文本编辑保留 CodeMirror 是不同用途，不是保留旧 live-preview。

### 6.3 Markdown 保真与未知内容

磁盘仍保存 Markdown/YAML，不把 Tiptap JSON 设为第二真源。编辑器内 JSON 仅是会话表示。

采用 OK 的 `MarkdownManager`、保真扩展、源文本/位置桥接和测试，不使用简单 `getHTML()` 再转 Markdown。无编辑打开/关闭应不写盘；未修改内容不得无故重排或丢失。正文保存保留 frontmatter 原文，未知字段和不认识的语法可见且可恢复。

无法完全结构化的内容使用上游原始/回退节点或明确源码编辑入口；不能静默删除 MDX/HTML、引用定义、注释、脚注、表格细节或自定义内容。保存前后黄金样本必须验证语义、原始内容及必要位置映射。

### 6.4 `/` 命令

完整复制 `slash-command.ts`、菜单、命令项来源、执行器及 suggestion/IME/floating 依赖和相应测试。

必须覆盖：空段落与合法前缀触发、输入过滤、类别顺序、命令别名、说明/预览、鼠标悬停与点击、方向键循环、Enter/Tab 提交、Escape 关闭、无结果、滚动跟随、底部/右侧边界、编辑器被遮挡/切标签时清理。

使用上游实际触发规则处理中文组合输入和触发字符；代码、URL、表格单元格等上下文遵循相应允许条件，不能在任意 `/` 都弹出菜单。选择命令应消费正确触发范围，在一个可撤销事务中插入/转换节点，并把光标放到可继续输入的位置。

基础项之外，组件、嵌入及其他本地命令来源也进入矩阵。涉及 Huhu 文件/资源的项接现有能力，不保留 OK 工作区 API 调用或伪造成功。

### 6.5 选区、上下行、输入法与生命周期

重点复刻上游成熟处理，不另写一套按行推算光标系统：

- 鼠标跨段、跨行、反向选择，Shift+方向键，长文滚动时选择、拖放，表格和块节点边界。
- 上下行保持合理水平位置；列表缩进、空项回车、退格合并、代码块出入、表格 Tab/Enter。
- 中文拼音/注音等组合输入期间，不提交 slash、重建文档或把 Enter 当作普通命令；测试 undo/redo 和粘贴后的输入法状态。
- 不因父组件状态更新、评论刷新或自动保存重新创建编辑器；不在每次输入后用完整 `setContent` 覆盖事务结果。
- 只有首次装载、明确模式切换或接受外部版本时才走对应内容装载过程，并保持/映射选区和滚动位置。
- 异步读取/保存结果必须绑定 Vault、文件、会话代次；切标签或切 Vault 后的迟到结果不得覆盖新文档或抢焦点。
- 每个编辑器/查看器完整释放 observer、事件、定时器、worker、Object URL 等；全局快捷键仅由当前活动视图处理。

### 6.6 保存与冲突

从 `NoteDocument` 提取可靠性逻辑，保持原文、base version、dirty revision、在途保存与草稿有明确归属。

保存使用现有 `notes.save`/Vault CAS；新输入不能被旧保存回执标为已保存。外部修改：干净缓冲可刷新，脏缓冲进入现有冲突处理，不能粗暴覆盖。切换源码/富文本、标签、档案视图、关闭文件和 Vault 前统一 flush。

只读、磁盘错误、删除、重命名、保存冲突必须显示真实状态。语义文件的读取/编辑不自动启动任务或 Agent，也不改变已有执行授权边界。

---

## 7. YAML 属性区与顶部自适应

### 7.1 属性区必须可见

在正文顶部、正文内容之前展示可折叠属性区；初始有 frontmatter 时应正常渲染，不能只藏在详情抽屉。详情属性与顶部属性使用同一会话数据和动作。

支持字符串、数值、布尔、日期类文本、列表、空值、嵌套结构的合理显示；复杂结构可使用结构化/源码入口，不强行扁平化。保留未知字段、注释、顺序和原始标量意图，尤其 `false`、`0`、空字符串、`null`、前导零文本和非完整日期。

文件名、路径、大小、时间等文件信息与 YAML 属性分组，不混写为用户 frontmatter。解析错误或顶层类型异常要显示错误和原文修复入口，不能以空属性面板冒充没有内容。

### 7.2 复用已有 YAML 编解码

使用现有 `frontmatter.ts`，不在 UI 导入含 Node 的 Vault 实现。需要浏览器可用数据时，经已有 Engine 能力返回解析结果；若对草稿做属性 patch，可增加窄的“输入草稿 + 修改 → 返回新草稿/诊断”适配，并校验缓冲 revision，再交给同一保存队列。也可按依赖审计提取已有纯编解码的公共入口，但不能复制两份 YAML 逻辑。

关键约束：**编辑属性不能用磁盘旧正文覆盖当前未保存正文；编辑正文不能丢掉属性修改。** 两处 UI、源码与富文本共同操作单一 DocumentSession。属性评论关联真实属性键，删除/改名后有明确定位状态。

`replaceBody()` 已能保留 frontmatter 前缀，应直接复用；属性 patch 后的字节变化范围由黄金样本验证，不把“使用 YAML AST”当作所有格式天然零变化的保证。

### 7.3 工具栏布局

复用 OK 的命令组织与状态，不照搬其全站皮肤。标题/路径、保存状态、视图切换、主要编辑命令、更多操作明确分组；使用真实容器宽度决定收纳。

采用可伸缩中间区、`min-width: 0`、有限不换行组与溢出菜单。优先把低频动作收进“更多”，不要把整个固定宽度组提前挤到第二行。确实需要换行时连续合理排布，不人为保留一排空白。

同时测试侧栏开关、评论/详情面板展开、长中文标题、多标签、窄窗口及缩放。所有工具在收纳后仍能键盘访问；不能为视觉整齐直接删功能或缩到不可点击。

---

## 8. 评论完整复刻与现有持久化适配

### 8.1 体验范围

复制 OK 评论面板、线程、选区发起浮层、正文高亮、边缘提示/定位与相关键盘行为，接 Huhu 评论能力。

覆盖正文选区评论、整篇文件评论、属性评论；消息按约定渲染 Markdown/引用，支持真实回复、解决、重开、删除确认、待处理计数/过滤。已存在的 Huhu 能力不能因换 UI 丢失。

选中文字后出现适当动作，打开输入器时保存选区上下文；点击线程定位正文，点击高亮定位线程；滚动、切模式、切标签、面板隐藏后的焦点与浮层生命周期一致。只读模式可查看/定位评论，写操作按权限禁用。

### 8.2 坐标与锚点必须正确适配

OK `anchor-decorations.tsx` 使用 ProseMirror 文档和 quote/context 解析；当前 Huhu 评论视图含源码区间。**PM 位置、纯文本偏移、Markdown 字节/字符偏移不是同一个坐标系。**

复用上游正文文本提取、上下文搜索、分层高亮和事务映射；持久化继续进入现有评论格式，在编辑器边界做明确转换。不要把 `selection.from/to` 直接写入现有源码锚点，也不要另存一套互相矛盾的评论坐标作为真源。

发起评论时冻结 quote、prefix/suffix、对应缓冲 revision；异步保存期间继续编辑，也不能让评论落到别处。重复段落、格式变化、表格、链接和前文插入必须验证；找不到或歧义时显示孤立/待重新定位，不静默吸附到错误的相似段落。

未修改正文仅切换选区时不要重算全部锚点；利用上游事务分类/映射，避免批注刷新反过来破坏选区。跨模式定位使用同一源文本桥接和资源身份。

### 8.3 不新建评论后端

复用 `plugins/notes/src/engine/comments/` 和已有 `comments.*` 的创建、回复、解决、删除、重定位能力。只扩展确实缺失的契约，统一验证、冲突和失效事件，不绕过 Dispatcher。

删除/移动文件、回收站恢复、档案视图打开同一文件时，评论仍绑定同一资源。任务评论等其他消费者须回归；与 #1 相关的任务讨论能力不因知识库 UI 替换退化。

---

## 9. 档案：真实文件资源上的视图，不再是旁路页面

### 9.1 保留现行档案模型

遵守 [现行档案规范][h-archives-spec]：

```text
Archives/<类型>/<名称>/index.md
```

类型是目录，字段定义保存在现有约定位置；档案标题来自目录；关系继续使用正文双链/反链。保留 `plugins/notes/src/engine/archives/`、`ui/archives/` 的可复用实现。

不复制 Obsidian 虎符的整套历史 schema/实体迁移系统，不恢复独立档案插件，不为同一记录再造数据库 ID 真源。参考的是其“导航目标决定页面及侧栏”的交互组织。

### 9.2 入口、标签与树

顶部入口严格为：**文件 / 星标 / 日记 / 标签 / 回收站 / 档案**。

点击档案：创建真正的档案首页标签并激活；已有同一首页标签时可聚焦该标签，避免重复堆叠。该标签出现在统一标签条，可关闭、切回、恢复。类型页和记录页也采用同一视图标签模型，不再使用游离的 `folderView`。

标签用判别联合表达视图类型，例如 `file / archives-home / archive-type / archive-record`；带 Vault、真实路径/目标及视图种类。档案首页是绑定 `Archives/` 的视图，不为它伪造一篇磁盘文件。

活动档案标签驱动侧栏显示类型/记录树及对应选中项；切回普通文件标签恢复文件树状态。文件树展开位置与档案树展开位置分别记忆。用户显式点击“文件”入口时允许切换资源浏览上下文，不应立即被一个 effect 强制弹回档案；再次激活档案标签时按其上下文恢复。

### 9.3 普通目录与档案视图区分

在“文件”中，`Archives/` 也首先是实际目录，能展开看到类型目录、记录目录、`index.md`、字段文件和附件，不隐藏文件来假装一个对象系统。

普通目录点击不自动打开档案渲染。档案专门入口/档案树记录项打开渲染视图；文件树中 `index.md` 可作为 Markdown 打开，也提供明确的“以档案视图打开”。两种视图操作的是同一文件缓冲，不复制内容。

新建/编辑/重命名/移动/删除档案继续调用已有能力；目录与详情、文件树、搜索、`@`、双链同步变化。外部修改文件后渲染刷新；损坏字段显示错误与源码修复入口，而不是让资源消失。

档案附件使用统一文件查看器，JSON/TXT/PDF/HTML 不因位于档案目录而退回元信息卡。文件数按真实资源计数，渲染入口不重复计数。

---

## 10. 多格式文件打开与固定图标

### 10.1 类型分派

| 类型 | 默认行为 | 编辑/生命周期要求 |
| --- | --- | --- |
| `.md` / 已支持 Markdown 扩展名 | OK 富文本，可切源码/阅读 | 同一 Markdown/YAML 会话，完整评论和属性。 |
| `.txt` | CodeMirror 纯文本编辑 | 可输入、撤销、保存、草稿、冲突、外部修改与重开。 |
| `.json` | CodeMirror JSON 编辑 | 语法高亮与诊断；不能设为只读。无效 JSON 仍可编辑，不能擅自清空或 `JSON.stringify` 全文重写。格式化是显式动作。 |
| `.html` / `.htm` | 隔离的完整页面预览 | 保留 HTML/head/style/body 结构与相对资源；可切源码编辑，预览使用当前已确认的缓冲版本。 |
| `.pdf` | ORCA/PDF.js 内嵌查看器 | 页面浏览、查找、缩放、文本选择、滚动/缩放状态、加载错误及资源释放。 |
| 图片/音视频等 | 优先保留已有可用查看能力，按需要复用成熟查看器 | 不当 UTF-8 文本解码；在统一标签与资源归属下工作。 |
| 未知格式 | 资源仍可见；明确元信息/打开方式 | 不伪装成功渲染，不阻止重命名/移动等适用操作。 |

JSON/TXT 使用现有读写能力，不另建后端。编码、BOM、换行和最终换行应保留；无法无损处理的编码明确提示并提供显式转换，不能先错误解码后自动保存。

大文件不能无提示地卡死或变成空白。沿用/完善显式容量门槛与可用操作，门槛不是隐藏资源的理由。

### 10.2 PDF

直接移植固定 ORCA 版本的 `PdfViewer`/`PdfFind` 及 loader/session/缩放位置模块，使用其 PDF.js 依赖和本地打包 worker。

Huhu 当前 `vault.readBinary` 为全量 base64 且有 10 MiB 限制。小文件可复用该通道，但不能把它当作通用大型 PDF 方案。先核对现有 Engine 资源传输能力，在同一受控传输边界内补充必要的范围读取/流式能力，绑定 Vault、路径与权限；不再造独立文件服务器。

查看状态以 Vault + 文件/视图身份隔离；更换文件、关闭标签、取消加载后清理 worker、监听、observer、Object URL 与过期结果。异常 PDF、受密码保护 PDF、超限和外部修改有明确反馈。

### 10.3 HTML

参考 ORCA 打开前 flush、捕获来源标签、检查请求归属与取消迟到结果的做法。完整页面在隔离 iframe/专用无特权预览容器中渲染，不能把原始 HTML 注入工作台 React 根。

相对 CSS/图片等以当前文档目录解析，并经 Vault 路径守卫获取。HTML 不能拿到 Node、preload、Engine 凭据或工作台桥接；不能与受信的应用资源混用特权源。脚本支持遵循明确的隔离策略，包含脚本的代表页面要实际验收，不能把“删掉所有 HTML/脚本后只剩文本”称为完整预览。

限制跨源访问、危险导航、越界文件和不受控弹窗；外部链接通过现有打开策略。显示与权限边界分别验证，不以沙箱为由只提供源码，也不以“完整渲染”为由开放宿主权限。

### 10.4 文件图标

调研候选为 [Lucide React][lucide] 和 [Material Icon Theme 的文件映射][material-icons]。结合复用顺序，**本期优先 Huhu 已有 Lucide + OK Markdown 文件图形 + 一张静态扩展名表**，而不是引入一整套新图标运行时。

固定映射覆盖 Markdown、PDF、TXT、JSON、HTML/代码、图片、音频、视频、压缩包、目录和未知文件；可用固定 PDF/扩展名标记增强识别。不按正文内容、模型判断、在线请求或随机颜色生成图标。

大小写扩展名统一处理；同一映射供文件树、标签、`@`、搜索和详情复用。图标颜色走主题 token，未知类型回退稳定的通用文件图标。若采用 Material 的个别 SVG，记录具体文件和版本，不加载其 VS Code 扩展逻辑。

---

## 11. 目录、接口与样式落点

### 11.1 目录规划

下面为建议落点；同职责已有文件优先原地重构，不机械新增所有示例文件。

```text
packages/contracts/src/
  现有能力/资源 DTO 与校验（仅补必要契约）

packages/vault/src/
  现有文件服务、目录列举、路径守卫
  watch/ 与 index/：区分目录列举/监听/内容索引过滤
  semantic/frontmatter.ts：保留唯一 YAML 编解码

packages/kernel/src/capabilities/vault.ts
  改造资源列举；按需补受控资源范围读取

packages/editor/src/
  RichMarkdownEditor.tsx          # OK 富文本入口
  SourceEditor.tsx                # 现有 CodeMirror 源码/文本能力整理
  ReadonlyMarkdown.tsx            # 与主编辑器同语义的文档阅读
  editor-port.ts                 # 通用接口，不暴露业务/裸 CM view
  vendor/open-knowledge/
    core/                        # schema/markdown/bridge/registry 依赖闭包
    editor/                      # 编辑行为/命令/NodeView 及必要适配
  editor.css                     # modules 层，自有 editor- 类
  editor-cm.css                  # 只保留源码编辑器所需第三方覆盖
  index.ts                       # 公共导出
packages/editor/test/
  上游迁入回归、保真样本、宿主适配测试

packages/workbench/src/
  resources/                     # 仅确有多消费者的候选/引用/打开适配
  engine-client/query.ts         # 查询失效联动
  现有 dirty-doc / 导航贡献设施  # 复用，不平行重建

packages/ui/src/
  components/FileIcon.tsx         # 共享图标入口（按现有组织放置）
  现有组件样式                   # 不把插件业务样式堆入共享 core

plugins/notes/src/
  engine/service.ts              # 现有文本/文件操作复用与修正
  engine/comments/               # 原评论持久化和锚点适配
  engine/archives/               # 保留当前档案资源模型
  shared/                        # 本插件纯类型/规则
  ui/NotesModule.tsx             # 组合，不再承载全部状态和菜单
  ui/documents/                  # 会话、打开分派、属性、工具栏
  ui/explorer/                   # OK 文件树、菜单、可见性偏好
  ui/tabs/                       # 文件/档案视图标签与上下文
  ui/comments/                   # OK 评论 UI 的 Huhu 适配
  ui/viewers/                    # JSON/TXT/HTML/PDF/未知文件分派
  ui/archives/                   # 已有档案 UI 与导航重构
  ui/notes.css                   # notes- 类及模块样式入口
plugins/notes/test/
  文件/隐藏/档案/评论/会话测试与 fixtures

tests/e2e/                       # 真实 Electron 功能与交互回归
tests/visual/                    # 现有视觉设施扩展
.agents/dev/changes/2026-11-14-knowledge-ok-parity/
  brief.md / plan.md / reuse.md / tasks.md / acceptance.md / evidence/
```

新 change 路径是实施建议。遵守 [.agents/dev/AGENTS.md][h-dev]：活跃工作放 `changes/`，长期事实更新 `notes/`，历史 `archive/` 不当作现行权威，更不能为本次工作直接改写历史记录。

### 11.2 能力边界

| 能力 | 处理方式 |
| --- | --- |
| `notes.read/save` | 复用；统一会话使用版本校验与现有写入路径。 |
| `notes.list` | 可保留笔记/星标/日记等语义查询职责，但不得再作为全文件树真源。 |
| `notes.files` 一类补充列表 | 删除其“非 Markdown + 人工排除”的平行资源目录职责；消费者切到统一资源目录。 |
| `vault.tree` | 改成真实资源列举契约，处理空目录和分页/惰性；一次更新所有消费者。 |
| `vault.readFile/readBinary` | 复用现有安全边界；按需要补受控大文件读取，不将资源读取变为任意本机文件读取。 |
| 可见性偏好 | 优先现有每 Vault UI 状态，只补缺少字段；不改变索引 API。 |
| `comments.*` | 保留持久化与生命周期，补编辑器坐标适配及确有缺失的能力。 |
| `archives.*` | 保留当前路径型档案业务；变化集中在打开目标和 UI。 |
| 文件打开/引用 | 复用工作台贡献/导航入口；不是新增一个通用插件平台。 |

所有写操作继续经过现有 Dispatcher 的鉴权、校验、幂等/冲突与事件路径；UI 不直接写文件，内核不依赖 React，编辑器包不导入 notes 业务服务。公开包入口统一更新，不通过跨包 `/src` 私有路径拼装。

### 11.3 现行样式规范

以 [design-system.md][h-design] 为准：

```css
@layer theme, tokens, base, vendor, components, shell, modules;
```

静态 PDF.js/KaTeX 等第三方 CSS 进入 `vendor`；共享组件进入 `components`；工作台进入 `shell`；notes 与 editor 自有样式进入 `modules`。

OK 的 utility classes 转为 Huhu 的局部语义类和 token，保留布局/排版/交互效果，不引入全局 Tailwind/reset。类名前缀遵守 `hu-`、`shell-`、`notes-`、`editor-`。第三方 ProseMirror/Pierre 等选择器只登记实际必要边界，不扩大任意白名单。

当前无层白名单仅 `vendor-overrides.css` 与 `editor-cm.css`，不能为修一个顶部栏就新增全局无层覆盖或滥用 `!important`。上游依赖及动态类需要如实补入 lint/样式守护配置，不能关闭守护。

---

## 12. 实施顺序与逐阶段交付物

- [ ] **S0：冻结来源与完整复刻矩阵。** 核对最新 main、本地 `temp/sources` 的 SHA/dirty 差异；建立上游文件依赖闭包和功能/测试矩阵；记录当前用户问题的真实复现。保留只读参考，不覆盖用户本地来源改动。
- [ ] **S1：资源目录与会话基础。** 复用 Vault 改造真实目录列举；从 `NoteDocument` 提取单一会话和 flush/保存队列；定义视图标签及公共编辑接口；先写空目录、Tasks 可见、保存冲突回归。
- [ ] **S2：OK core 与主编辑器。** 移入 schema、MarkdownManager、保真扩展和依赖；接本地会话与撤销；完成富文本/源码/阅读的内容往返，迁移全部共享编辑器消费者。
- [ ] **S3：完整编辑行为。** 迁入 slash 所有来源、工具栏、NodeView、块/表格/剪贴板/导航/输入法/滚动行为；完成顶部属性与统一草稿 patch；不得仅交付 StarterKit。
- [ ] **S4：评论。** 迁入 OK 评论 UI/选区/高亮/定位，适配现有存储和坐标；完成重复段落、正文变更、跨模式与属性评论回归。
- [ ] **S5：文件树与菜单。** 迁入 OK 树和右键；接统一资源目录、仅视图隐藏、恢复入口、所有类型操作、共享 `@`；联动计数和事件失效。
- [ ] **S6：档案标签与导航。** 调整入口位置；消除 `folderView` 旁路；档案首页/类型/记录成为真实标签，活动目标与侧栏树一致，普通目录保持文件浏览。
- [ ] **S7：格式查看、图标与自适应。** JSON/TXT 可编辑、ORCA PDF、隔离 HTML、附件统一打开、固定图标；顶部/菜单/评论在全部宽度与主题下验收。
- [ ] **S8：删除旧链、全回归与证据。** 删除被替换实现、更新示例/契约/文档/来源台账；执行完整门禁和真实 Electron 对照，记录未通过项。没有兼容分支或待补的本地编辑项才可关闭 Issue。

这些切片可以并行处理不相互冲突的适配，但最终只合成一套产品模型。不得让阶段代码长期变成两套编辑器并存。

---

## 13. 必须删除/替换的旧路径

最终交付中必须核对引用后清理，不只是 UI 隐藏：

1. 知识库主编辑器的 Atomic live-preview、相应 `Decoration.replace` 交互分支、重复格式命令与旧工具栏。无其他真实消费者后删除对应 vendor 代码和样式；仍用于源码的通用能力整理到其明确职责，而非保留旧编辑体验。
2. `FileCard` 对 JSON/TXT 的强制只读分支，以及用纯文本替代 HTML/PDF 渲染的分支；未知类型元信息回退仍可保留。
3. 由普通笔记列表 + `otherFiles` 拼装全资源树的逻辑，以及只为弥补不完整索引而维护的虚拟目录真源。新建空目录必须在文件系统中真实存在。
4. 限制非 Markdown 文件菜单/拖放的无依据分支，以及独立于右键的另一套行内操作实现。
5. 文件路径字符串标签与独立 `folderView` 的竞争状态；所有文件/档案视图使用统一标签契约。
6. 旧的简单评论 UI 在替换后的重复入口，原始源码偏移直接当 PM 位置的适配捷径。
7. 顶部和详情两份可独立修改的属性状态；任何保存时重建整个 YAML 丢未知字段的逻辑。
8. 无消费者的旧类型、导出、CSS、测试夹具和文案；把测试改成新契约，不删除测试来掩盖回归。

**不做历史格式迁移框架、旧接口适配层或双写。** 一次更新代码、消费者、demo Vault 与测试。无兼容要求不等于允许静默清空真实用户文件；数据安全、草稿和备份边界仍必须保留。

---

## 14. 验收矩阵（全部是交付条件，不是本次已执行结果）

### A. 资源、隐藏、操作

- [ ] A01：根目录同时放普通笔记、`Tasks/`、`Comments/`、JSON、TXT、PDF、HTML、未知扩展名、点目录及空目录；文件视图按真实文件系统展示，不因业务分类消失。
- [ ] A02：默认隐藏列表为空；隐藏目录后子树不可见，重启仍生效；管理入口可恢复。
- [ ] A03：隐藏后 `@`、双链、搜索和原标签仍可用；打开隐藏资源不报不存在、不擅自取消隐藏。
- [ ] A04：未展开的大目录中的文件仍能被 `@` 找到；分页文件树不截断引用候选。
- [ ] A05：真实新建/删除空目录即时出现/消失；外部修改和自写操作都正确失效缓存。
- [ ] A06：文件、目录、空白处右键菜单正确；键盘、行内按钮和菜单的目标/权限一致；窗口边缘菜单不溢出。
- [ ] A07：重命名、移动、复制、拖放、回收站/恢复覆盖 Markdown 与非 Markdown；冲突、移动入自身、越界均不破坏文件。
- [ ] A08：操作打开的脏文档或其父目录时不丢草稿；完成后标签、引用、隐藏规则和评论同步定位。
- [ ] A09：计数区分真实文件/目录、可见/总数；未完成分页不冒充总数；档案投影不重复计数。
- [ ] A10：内部受保护文件元信息可见但权限限制明确；索引忽略与 UI 隐藏不混用；外部调用不获得额外秘密/执行权限。

### B. 编辑器与渲染

- [ ] B01：上游本地功能矩阵逐项对应源码、Huhu实现和测试；不得以“已有 Tiptap”替代完整覆盖。
- [ ] B02：标题、行内格式、嵌套列表/任务列表、引用、代码、链接/双链、图片、表格、数学、图表/组件、脚注等在编辑/阅读/重开后语义一致。
- [ ] B03：`/` 分类、过滤、别名、预览、方向键、Enter/Tab、Escape、鼠标、无结果和定位与固定 OK 基线对照通过。
- [ ] B04：中文组合输入、全角/触发字符相关场景按上游规则正确；代码、URL、表格等上下文不误触发。
- [ ] B05：命令执行消费正确范围，光标可继续输入，一次撤销正确撤回；撤销/重做不被协作配置误禁用。
- [ ] B06：鼠标正向/反向跨段选区、Shift 选择、上下行、长文滚动、块和表格边界，在真实 Electron 中无选区跳失或错误替换。
- [ ] B07：列表回车/退格/缩进、代码块出入、表格 Tab/Enter、块移动、复制/剪切/粘贴/拖放使用成熟上游行为并通过回归。
- [ ] B08：自动保存、评论刷新、属性变更、父组件渲染不重建活动编辑器、不打断输入法、不抢焦点。
- [ ] B09：源码/富文本/阅读切换保留正文、属性、草稿与合理位置；迟到加载结果不能覆盖其他文件或 Vault。
- [ ] B10：无修改打开/关闭不写盘；未知语法、引用定义、注释和原始块不在往返后丢失；大纲不收录代码围栏/YAML 内伪标题。

### C. 属性与保存

- [ ] C01：有 YAML 的 Markdown 在正文顶部显示属性，详情面板显示同一份值；不是只在抽屉里可见。
- [ ] C02：`false`、`0`、空值、前导零文本、数组、嵌套结构、日期类文本、未知键与注释均有黄金样本。
- [ ] C03：只改正文保留 frontmatter 原文；只改指定属性不丢其他属性和正文；BOM/CRLF 等不被无意改变。
- [ ] C04：正文有未保存修改时编辑属性，或相反顺序，最终都保存到同一文件，不互相覆盖。
- [ ] C05：坏 YAML 显示诊断和原文修复入口，不清空属性、不隐藏文件、不静默重写。
- [ ] C06：保存冲突、只读、磁盘失败、外部修改、删除、重命名、切 Vault/关闭前 flush 和草稿恢复均有测试；旧保存回执不能清除新 dirty 状态。

### D. 评论

- [ ] D01：选区创建评论、整篇评论、属性评论均进入同一真实存储；取消输入不留伪线程或错误高亮。
- [ ] D02：正文高亮、边缘提示、线程、回复、Markdown 内容、解决/重开、过滤、删除确认与 OK 对照验收。
- [ ] D03：点正文定位线程、点线程定位正文；切标签/模式/面板后无焦点劫持和遗留浮层。
- [ ] D04：原文前插入、格式变化、表格/链接及重复段落的锚点定位正确；歧义和删除原文显示孤立，不吸附错误文本。
- [ ] D05：发起评论后异步 flush 期间继续编辑，锚点仍对应正确缓冲版本；PM 坐标未被直接写成源码偏移。
- [ ] D06：重命名/移动/回收站恢复及档案视图不丢评论；任务评论等现有消费者没有回归。

### E. 档案

- [ ] E01：“档案”位于指定分区最右；点击后标签条出现可关闭、可切换的真实档案页面标签。
- [ ] E02：档案标签激活时切换档案树；普通文件标签恢复文件树；两种展开状态独立，手动切入口不产生 effect 循环。
- [ ] E03：普通目录只浏览子资源，不自动渲染；`Archives/` 在文件视图内仍展示真实目录和文件，包括 `index.md`、定义和附件。
- [ ] E04：同一 `index.md` 的 Markdown 与档案视图使用同一会话；编辑、外部修改、重命名、删除后两边一致，无第二份记录。
- [ ] E05：档案附件通过统一查看器打开，双链/`@`/反链保持真实文件资源语义；没有新增独立档案插件/数据库。

### F. 文件格式、图标、布局与性能

- [ ] F01：JSON/TXT 实际编辑后写回原文件，重开一致；JSON 语法错误不导致内容被清空，格式化为显式行为。
- [ ] F02：编码异常、大文件、BOM/换行、外部修改/冲突有真实结果，不把未知文件当 UTF-8 自动覆盖。
- [ ] F03：PDF 可内嵌浏览/查找/缩放/选择；大于当前 10 MiB 通道限制的样本有受控读取方案或明确可操作提示；无空白假成功。
- [ ] F04：HTML 的 head/style/body、相对 CSS/图片、代表性脚本页面按隔离策略真实渲染；源码修改后预览更新且不被迟到请求抢占。
- [ ] F05：恶意 HTML/链接无法取得 Node、Engine 凭据、工作台桥接或越界文件；普通页面预览不与特权应用源混用。
- [ ] F06：扩展名大小写、无扩展名、未知格式和目录图标稳定；树/标签/`@`/搜索一致，不发在线图标请求。
- [ ] F07：长中文标题、侧栏/详情/评论展开、多标签、窄窗口及 125%/150%/200% 缩放下，工具栏合理收纳；不存在第一行大片闲置却强制第二行的布局。
- [ ] F08：四套现有主题的明暗模式、compact、reduced-motion、键盘和可访问性通过；未涉区域没有样式污染。
- [ ] F09：大 Vault、长文和多评论分别测冷开、热切换、输入延迟、保存耗时和内存；记录机器、样本、p50/p95，不把静态截图当性能证据。
- [ ] F10：反复打开/关闭/切换文件后，编辑器实例、事件、observer、PDF worker、Object URL 无持续增长；取消/迟到请求不修改已失效视图。

---

## 15. 测试执行、来源记录与完成定义

### 15.1 测试组织

先把用户场景做成复现，再移植上游用例和黄金样本。单元测试负责解析/序列化、状态、隐藏、路径、锚点、事务；集成测试负责能力、文件系统、草稿、冲突和事件失效；**真实 Electron E2E** 负责选区、IME、键盘、菜单、滚动、HTML/PDF、标签与焦点。

以相同样本文档、相同操作序列对照固定 OK 基线。实际输入法、Windows/macOS 的选择/快捷键等不能只靠模拟 DOM 通过来代替。无法在执行环境完成的真机验证必须标成未验证，不写已通过。

沿用 [根 package.json][h-package] 的门禁，按实际脚本执行并保存结果：

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm e2e:packaged
pnpm knip
pnpm notices
```

性能按 `pnpm bench` 和专项真实宿主场景记录；视觉使用现有 `pnpm visual:baseline <name>` / `pnpm visual:compare <name>` 流程。新体验允许有明确、审查过的预期变化；未涉及的界面应无回归，不以冻结旧坏界面限制本次修复。

每次交付记录实际命令、退出结果、通过/失败/未执行项、截图/录屏和数据。**以上是要求，不是本 Issue 调查时已执行的结果。**

### 15.2 来源与文档

更新 `docs/upstream/ledger.md`：仓库、SHA、原路径、目标路径、复制/适配性质、保留的声明、宿主差异、上游测试和本地回归。对 import 闭包生成文件级清单，避免后续只知道“来自 OK”却无法比对。

活跃 change 保存需求、方案、复用表、阶段清单和证据；长期事实更新 `.agents/dev/notes/context/`。同步更新 demo Vault、能力说明、资源/编辑器公共接口和受影响测试，清除与本 Issue 冲突的现行说明；历史 archive 只作为来源，不改写成当下规格。

### 15.3 完成定义

用户应能连续完成：

**打开全部真实文件 → 自行隐藏目录但仍能 `@` 引用 → 在 OK 式编辑器中选择、输入、用 `/` 插块、编辑属性和评论 → 正确保存并重开 → 在同一资源系统里编辑 JSON/TXT、查看 PDF/HTML → 打开真实档案标签并切换侧栏 → 切回普通文件继续编辑。**

只有本地编辑功能复刻矩阵、全部验收项、数据保真与真实交互证据完成，旧链路清理到位，才可关闭本 Issue。仅新增 slash 菜单、只换截图外观、继续把非 Markdown 当只读卡片、或保留旁路档案页面，均不满足完成定义。

---

## 固定提交源码与现行规范引用

[h-service]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/engine/service.ts
[h-vault-cap]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/capabilities/vault.ts
[h-index]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/vault/src/index/vault-index.ts
[h-snapshot]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/vault/src/watch/snapshot.ts
[h-explorer]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/ui/NoteExplorer.tsx
[h-editor]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/editor/src/MarkdownEditor.tsx
[h-filecard]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/ui/FileCard.tsx
[h-preview]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/editor/src/MarkdownPreview.tsx
[h-inspector]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/ui/NoteInspector.tsx
[h-document]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/ui/NoteDocument.tsx
[h-module]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/ui/NotesModule.tsx
[h-comments-ui]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/notes/src/ui/CommentsPanel.tsx
[h-frontmatter]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/vault/src/semantic/frontmatter.ts
[h-references]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/tasks/src/ui/references.ts
[h-archives-spec]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/archives.md
[h-design]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/design-system.md
[h-dev]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/AGENTS.md
[h-ledger]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/docs/upstream/ledger.md
[h-reuse]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/reuse.md
[h-package]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/package.json
[ok-editor]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/editor/TiptapEditor.tsx
[ok-app-ext]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/editor/extensions/shared.ts
[ok-core-ext]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/core/src/extensions/shared.ts
[ok-markdown]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/core/src/markdown/index.ts
[ok-slash]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/editor/extensions/slash-command.ts
[ok-slash-dir]: https://github.com/inkeep/open-knowledge/tree/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/editor/slash-command
[ok-tree]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/components/FileTree.tsx
[ok-menu]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/components/FileTargetMenuItems.tsx
[ok-comments-panel]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/comments/CommentsPanel.tsx
[ok-comment-selection]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/comments/CommentSelectionAffordance.tsx
[ok-comment-decos]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/comments/anchor-decorations.tsx
[ok-icons]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/components/file-entry-icon.tsx
[orca-pdf]: https://github.com/stablyai/orca/blob/7041ea022826ec19d627cd3a129b665822e7bf0a/src/renderer/src/components/editor/PdfViewer.tsx
[orca-content]: https://github.com/stablyai/orca/blob/7041ea022826ec19d627cd3a129b665822e7bf0a/src/renderer/src/components/editor/EditorContent.tsx
[orca-html]: https://github.com/stablyai/orca/blob/7041ea022826ec19d627cd3a129b665822e7bf0a/src/renderer/src/components/editor/open-editor-html-preview.ts
[obs-workbench]: https://github.com/NAMEWTA/obsidian-huhu/blob/d527f14efa523dc4e0c7d1ee4e8487bf78544679/src/modules/archives/services/generic/workbench.ts
[obs-module]: https://github.com/NAMEWTA/obsidian-huhu/blob/d527f14efa523dc4e0c7d1ee4e8487bf78544679/src/modules/archives/module.ts
[lucide]: https://lucide.dev/guide/react/
[material-icons]: https://github.com/material-extensions/vscode-material-icon-theme/blob/main/src/core/icons/fileIcons.ts

---

## 评论 1（NAMEWTA，2026-11-14T14:25:27Z）

## 用户补充决定：直接复制 Open Knowledge 编辑器，允许重构技术栈

用户最新明确要求：

> https://github.com/inkeep/open-knowledge 编辑，直接复制他的，重构，技术栈也可以重构。

**本补充是本 Issue 的最新实施约束，优先于正文中与之冲突的技术选型限制。正文的功能需求、源码调查、文件模型、目录职责和验收要求继续有效；不因为放开技术栈而缩减功能。**

### 1. 不是“参考后重新开发”，而是直接移植源码

编辑器以 `inkeep/open-knowledge` 的实际实现为权威来源。直接复制其编辑器及完成目标体验所必需的依赖文件、扩展、组件、样式和测试，按依赖关系成套移植到 Huhu，而不是只复制外观、安装一个 Tiptap StarterKit，或再自行实现一个相似编辑器。

复制范围必须沿实际 import 和运行时依赖展开，至少核对正文已定位的：

- `packages/app/src/editor/`：主编辑器、源码编辑、扩展、slash-command、bubble-menu、block-ux、剪贴板、表格、选区、键盘、输入法及相关生命周期。
- `packages/core/src/extensions/`、`packages/core/src/markdown/` 及其实际依赖：schema、节点与标记、解析/序列化、Markdown 保真和位置映射。
- `packages/app/src/comments/` 及相应 core/server 算法：选区评论、正文锚点、浮层、侧栏、线程、回复、定位与重定位。
- 上述功能依赖的 UI、样式、资源、注册表及回归测试。不能只搬入口文件，缺少依赖后用临时简化实现替代。

正文固定提交是已调查的参考基线，不冒充此后上游的最新版本。实施时核对 `temp/sources/open-knowledge` 与上游，记录最终采用的完整 SHA 和本地差异；复制和测试使用同一基线，不能混用不同提交的目录。

### 2. 技术栈可以重构，不以旧实现为边界

**Huhu 应为直接接入 OK 编辑器调整自身，而不是强迫 OK 编辑器适应旧 CodeMirror/Atomic 架构。**

允许按实际依赖重构 `packages/editor`、notes 的编辑器装配与文档状态、公开接口、必要的共享组件、依赖和构建配置。旧接口、组件组织、库选择和样式实现都不是不可改变的约束。相关目录仍按职责归属，跨包公开入口和调用方同步更新。

具体修正正文中的限制：

1. **CodeMirror 不再是必须保留的选型。** 主编辑、源码模式和纯文本编辑采用什么实现，以 OK 对应源码及目标功能为依据；有合适实现就直接复用。可以保留有独立用途的成熟组件，但不能为保留旧代码强制增加转换层或维护两套主编辑器。
2. **不预先禁止编辑器确实依赖的文档状态、协作基础库或撤销机制。** 如果移植闭包需要 Yjs 或其他上游依赖，可以保留/引入并完成本地集成；不能仅为回避依赖，重新发明文档同步、选区映射或撤销历史。是否需要 Hocuspocus 等服务，应按实际耦合核对后决定，不能在未核对前一刀切。采用这些依赖不等于自动扩展为云端账户、组织或多人协作产品。
3. **编辑器必要样式、布局和组件可以随源码移植。** 现行样式技术选择不是拒绝移植、改写关键交互或降低保真度的理由；需要调整工程规则时，在同一变更中更新规范、构建和检查。通过作用域隔离与必要的主题映射接入 Huhu，避免无关页面受到全局样式污染。
4. **不保留旧编辑器兼容层、旧/新双运行链路、双写或“新版试用”开关。** 替换时一次性更新实际消费者，删除失去用途的实现、依赖、样式和测试。其他模块仍使用编辑器时，一并适配，而不是把不适用的旧接口长期包起来。

技术栈放开不取消文件安全与可靠性要求：磁盘文件仍是持久内容的事实来源；编辑器的内存文档状态不是第二份持久真源；版本冲突、草稿、保存失败、关闭/切换落盘和只读权限必须正确处理。已有可靠能力优先复用，其具体接口可为正确集成重构。不相关的任务、终端、调度等业务不为此无目的地重写。

### 3. 移植后必须达到完整体验，不能降格交付

以 OK 实际交互为对照，完整覆盖编辑/阅读渲染、`/` 命令的触发/过滤/分类/预览/键盘操作、浮动工具栏、块操作、表格、链接与附件、鼠标选区、上下行移动、中文输入法、复制粘贴、撤销重做、模式切换，以及完整评论体验。正文要求的 YAML 顶部属性、工具栏自适应、全部文件与仅视图隐藏、档案真实标签和侧栏切换、JSON/TXT 编辑、PDF/HTML 查看仍必须完成。

ORCA 继续作为文件查看等补充来源；Obsidian 虎符继续作为档案交互参考。**主笔记编辑器不再以 ORCA 或自研方案替换 OK 作为基准。**

适配重点是 Huhu 的文件/资源访问、保存、身份、公共能力、标签导航和插件生命周期。上游已实现的编辑行为不自行另起一套。任何必要差异须逐项记录原因、源文件、目标文件及验证证据，不能以“本地化”“架构简化”笼统删减。

### 4. 对复用原则和完成定义的补充

复用优先仍然适用，但“先检查现有实现”不等于“必须保留不符合需求的旧实现”。确认不足后，优先整体复制成熟的 OK 源码，技术栈可随之调整；不是先设计一个新底座再挑几段上游代码装饰。

交付必须包含文件级来源清单、固定 SHA、必要来源声明、移植/适配差异、旧实现删除清单、上游相关测试的接入结果，以及实际 Electron 中的交互回归证据。不能以组件能挂载、界面相似或单元测试通过代替真实编辑验收。

**最终决策：直接移植 OK 编辑器，必要时重构 Huhu 的相关技术栈；不再围绕旧编辑器打补丁，也不把完整移植改成自行开发近似品。**

本评论记录需求和实施方向的更新，不表示本轮已经提交代码或完成运行验证。
