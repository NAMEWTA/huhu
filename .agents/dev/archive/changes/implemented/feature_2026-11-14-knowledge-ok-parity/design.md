# 设计：一份文件、一个会话、多种视图（架构与接口）

> 规格：[spec.md](spec.md)。决定与替代方案：[decisions.md](decisions.md)（本文引用 OP-Dxx）。界面设计记录：[ui-design.md](ui-design.md)。
> **类型、文件名、能力名是拟议值**，实施时按相邻命名调整；**职责边界与单一事实来源不变**。标注“未核实”的是需要 S0 在代码里确认的点。

## 1. 总览

```text
Vault 文件（Markdown / YAML / 任意文件）  ← 唯一持久真源
   ↑ 原子写 / OperationLog / 回收站 / 监听（现有）
Engine Dispatcher（鉴权 · 校验 · 幂等 · 事件）
   ├─ notes.read / notes.save(expectedVersion) / notes.draft.* / comments.* / archives.*   （现有，复用）
   ├─ vault.list(dir,cursor)  vault.readRange   （新增）   vault.tree/notes.files（消费者迁完后删除或改名）
   └─ entity.changed → engine-client/query.ts ENTITY_CAPS（扩展失效键）
            ↓
渲染进程
   ├─ 资源目录查询（含 hiddenPaths 叠加，仅文件树使用）
   ├─ DocTab 联合标签（file | archives-home | archive-type | archive-record）
   └─ DocumentSession（每个打开的文件一个；唯一写盘 / 冲突 / flush 权威）
          ├─ RichMarkdownEditor ──┐  LocalDocProvider（Y.Doc：Y.Text('source') + Y.XmlFragment）
          ├─ SourceEditor ────────┘  ← OK 的 CM6 + y-codemirror.next，绑同一 Y.Doc
          ├─ ReadonlyMarkdown（同 schema，editable:false）
          ├─ PropertyPanel（同 Y.Text('source') 里的 YAML）
          ├─ PlainTextEditor（.txt / .json，CM6，不绑 Y，直接用会话文本）
          └─ 专用查看器：PDF（ORCA 摘取）· HTML（huhu-preview 隔离）· 图片 / 未知元信息
```

要点：**Y.Doc 是编辑表示，不是第二份真源**（OP-D03）；富文本 / 源码 / 属性 / 档案渲染共享同一会话，切换视图前统一 flush；非 Markdown 文本直接由会话持有文本。

## 2. 包与目录布局（建议；同职责已有文件原地重构）

```text
packages/editor/src/
  vendor/open-knowledge/            # 上游原样（保持相对目录结构）+ UPSTREAM.md / PATCHES.md / LICENSE
    core/    (extensions, markdown, bridge, registry, frontmatter, comments, schemas …)
    app/     (editor, comments, components(FileTree*/FileTarget*/file-entry-icon/…), components/ui(用到的25个), lib(用到的), locales(en,zh-Hans))   # 子树归属：editor/ 与 lib 归 S2a，comments/ 归 S4，components/FileTree* 与 FileTarget* 归 S5；**全部 OK vendor 都在 packages/editor 下**（单一 @source、单一 UPSTREAM / PATCHES）
    server-bridge/  (从 OK server 摘取的 bridge-intake、disk-content-intake、markdownSemanticallyUnchanged 等，见 decisions OP-D02)
  host/                             # 适配层：受全部规则约束
    ok-host.ts                      # OkHost 接口
    host-fetch.ts                   # 只负责组合路由表（§4）；路由分文件，各切片各写各的：
    routes/core.ts                  # 编辑器本身 / 页面 / 标签 / 上传 / 链接（S2a）
    routes/comments.ts              # 评论（S4）
    routes/files.ts                 # 文件树与文件操作（S5）
    local-doc-provider.ts           # LocalDocProvider
    document-context.ts             # 重写的 DocumentContext（Huhu 版，保持 DocumentContextValue 子集）
    desktop-bridge.ts               # window.okDesktop 的 Huhu 等价物
    i18n.ts                         # Lingui 初始化：en / zh-Hans，locale 来自 Huhu 设置
  rich/RichMarkdownEditor.tsx       # variant: 'document' | 'compact'，封装 vendor 的 TiptapEditor
  rich/ReadonlyMarkdown.tsx
  source/SourceEditor.tsx           # 封装 vendor 的 SourceEditor
  plain/PlainTextEditor.tsx         # .txt / .json（CM6）
  editor-port.ts                    # 通用接口：focus / selection / execute / reveal / getDraft / flush / canExecute / readOnly
  ok/ok-globals.css                 # 拆分后的 OK globals（ok-theme / ok-utilities 层）+ token 映射
  editor.css                        # modules 层，自有 editor- 类
  index.ts                          # 公共导出（不暴露 CM view / PM view）
packages/editor/test/{vendor,host,fixtures}/    # 迁入的上游测试、适配层测试、黄金样本

plugins/notes/src/
  engine/service.ts  engine/index.ts            # 去掉“全资源树”职责；notes.files 删除
  engine/comments/  engine/archives/            # 保留
  ui/NotesModule.tsx                            # 只做组合
  ui/documents/{DocumentSession.ts,openDocument.tsx,ToolbarLayout.tsx,PropertyHost.tsx}
  ui/tabs/{docTabs.ts,TabStrip.tsx,sidebarContext.ts}
  ui/explorer/{ResourceTree.tsx,FileContextMenu.tsx,hiddenPaths.ts,counts.ts}   # 适配层；复用 packages/editor 里 vendor 的 FileTree / 菜单原语（跨包只走 @huhu/editor 的公共导出）
  ui/comments/{CommentsHost.tsx,commentAdapter.ts}                              # 适配 vendor 评论 UI ↔ comments.*
  ui/viewers/{dispatch.ts,PdfView.tsx,HtmlPreview.tsx,ImageView.tsx,UnknownView.tsx}
  ui/archives/                                                                   # 保留，导航改为 DocTab
  vendor/orca/pdf/                                                               # ORCA PDF 摘取 + UPSTREAM.md / PATCHES.md / LICENSE（不用 Tailwind，不在 @source 内）
  ui/notes.css                                                                   # notes- 类

packages/ui/src/components/FileIcon.tsx          # 共享图标 + 扩展名表（**S1 交付**：共享小组件，S5 / S7 / 标签条都消费它）
packages/kernel/src/capabilities/vault.ts        # vault.list / vault.readRange
packages/vault/src/…                             # listDir（读文件系统）、路径守卫复用
apps/desktop/src/main/preview-protocol.ts        # huhu-preview 协议或隔离视图（SP-7 定；与现有 huhu-app 的 registerSchemesAsPrivileged 同一次调用合并，`apps/desktop/src/main/index.ts:31` 附近）
scripts/                                         # check-ok-class-collisions.mjs、ok-patches.mjs（重放）、ok-closure.mjs（生成清单）
```

## 3. 文档管线

### 3.1 `DocumentSession`（从 `NoteDocument.tsx` 抽出）

```ts
// 会话由 DocumentSessionRegistry 按 (vaultId, path) 登记并引用计数，生命周期长于组件（OP-D03）
interface DocumentSession {
  readonly id: { vaultId: string; path: string; epoch: number }   // epoch：每次打开 / 切 Vault 递增，迟到结果按它丢弃
  readonly kind: 'markdown' | 'text' | 'json'
  text(): string                       // 当前缓冲（Markdown 含 frontmatter）
  setText(next: string, origin: 'editor' | 'source' | 'plain' | 'property' | 'external'): void
  state: { save: 'saved'|'dirty'|'saving'|'conflict'|'error'; baseVersion: number; dirtyRevision: number; readOnly?: Reason; protectedPath?: boolean }
  flush(): Promise<void>               // 注册到 workbench flushers；切视图 / 切标签 / 关闭 / 切 Vault 前调用
  acceptExternal(text: string, version: number): void   // 干净缓冲或用户选了“用磁盘版本”
  keepMine(): void                      // 保留我的修改 → 以磁盘最新 version 为 base 重新保存
  subscribe(fn): Unsubscribe
}
```

- `flush()` 先排空编辑 → 会话的 300 ms 防抖，再保存（断言：输入后立刻关闭，磁盘内容含最后一个字符）。
- 保存沿用现有 `notes.save({path, text, expectedVersion})`；`VERSION_CONFLICT` → `state.save='conflict'`，进入现有差异 / 保留对话。**保存回执只清除回执对应的 `dirtyRevision`**（C06）。
- 草稿（`notes.draft.*`）、`AUTOSAVE_MS=800`、关闭 / 切换 flush（`registerFlush`、`settleDirtyDocs`）原样迁移。
- 非 Markdown 文本（`.txt/.json`）：同一个 `DocumentSession`，`kind` 不同，`setText` 来自 `PlainTextEditor`；JSON 格式化是显式动作（调用 `session.setText(format(text),'plain')`），**永不**在保存路径里 `JSON.stringify`。
- 编码 / BOM / 换行：读取时记录 `{bom, eol, finalNewline, encoding}`，保存时还原；检测到非 UTF-8 → 只读 + “转换编码”显式动作（`F02`）。

### 3.2 `LocalDocProvider` 与编辑适配（OP-D02 / D03）

```ts
class LocalDocProvider {
  document: Y.Doc                       // Y.Text('source') + Y.XmlFragment('default')（PM 视图）+ lifecycle Y.Map
  configuration: { name: string }       // = `${vaultId}:${path}`
  awareness: Awareness                  // y-protocols，本地孤立实例
  status: 'connected'
  on/off('synced'), destroy(), forceSync() { /* 空 */ }
}
bindSession(session, provider): Unbind
```

装载（打开文件）：`session.text()` → `composeAndWriteRawBody`（来自 `bridge-intake`）→ `applyFastDiff` 写 `Y.Text('source')`，`parseWithFallback → schema.nodeFromJSON → updateYFragment` 写 PM 视图，`FILE_WATCHER_ORIGIN` 包裹（不进撤销栈），然后触发 `synced`。

编辑 → 会话：观察 `Y.Text('source')`（OK 的 bridge 保证 PM 视图的变化会回写 `source`），**防抖 300 ms** 后 `session.setText(source,'editor')`；会话自己的 800 ms 触发保存；保存前 `markdownSemanticallyUnchanged(lastSaved, source)` 命中则跳过（无编辑不写盘，B10）。

会话 → 编辑：只有 `acceptExternal` / 恢复历史版本才 `replaceRawBody`（`FILE_WATCHER_ORIGIN`）；脏缓冲遇外部修改不自动合并，走现有冲突 UI（OP-D03）。选区与滚动位置保持由 OK 的 `replaceRawBody` 路径与 `editor-cache` 处理（S2 验证 B09）。

生命周期：`editor-cache`（OK 原样，`MAX_CACHE=10`）管理 park / evict；evict 时 `destroy()` provider 并释放该编辑器的 Y.Doc，**会话本身由 `DocumentSessionRegistry` 引用计数，park 中的编辑器仍持有引用**；关闭标签 / 切 Vault → `session.flush()`（先排空防抖）后释放引用。**不引入 `y-indexeddb`**：草稿由会话的现有草稿机制保存。

### 3.3 视图切换与迟到结果

`setView('rich'|'source'|'read')`：先 `session.flush()`；三种视图读同一 `Y.Text('source')`（阅读 = `editable:false` 的 Tiptap）。异步读取 / 保存 / 评论刷新结果都带 `(vaultId, path, epoch)`，`epoch` 不匹配直接丢弃，**不得抢焦点或重建编辑器**（B08）。评论刷新、属性变更、自动保存都不触发编辑器重建；`setContent` 只在装载、明确模式切换、接受外部版本三种情况出现（issue §6.5）。

### 3.4 `EditorPort`（消费者看到的唯一接口）

```ts
interface EditorPort {
  focus(): void
  getSelection(): { text: string; from?: number; to?: number } | null     // from/to 为编辑器内部坐标，不得持久化
  execute(command: string, args?: unknown): boolean
  canExecute(command: string): boolean
  reveal(target: { line?: number; heading?: string; commentId?: string; propertyKey?: string }): void
  getDraft(): string
  flush(): Promise<void>
  readonly readOnly: boolean
}
```

大纲（`NoteInspector`）来自解析结果（PM 文档里的 heading 节点），不再对原文跑正则（B10）。

## 4. 宿主适配（OP-D04）

`hostFetch(url, init)` 是 vendor 里所有 `fetch('/api/…')` 的统一替身。路由表草案（S0 用实际 `closure-manifest` 与 `evidence/endpoint-matrix.md` 补全；**“Huhu 能力”列为拟议**）：

| OK 端点 | 方法 | Huhu 实现 | 备注 |
| --- | --- | --- | --- |
| `/api/principal` | GET | 本机固定身份（常量） | 不发请求 |
| `/api/config`、`/api/workspace` | GET | 本地常量 + `vault.info` | 无 collab URL |
| `/api/pages`、`/api/documents` | GET | 资源目录查询（`vault.list` + 笔记元数据 `notes.list`）；**不使用 hiddenPaths** | `PageListContext` 的数据源；惰性 / 搜索走能力，不靠 DOM |
| `/api/documents?showAll=true&dir=&depth=1` | GET | `vault.list({dir, includeProtected:true})` | 文件树 |
| `/api/page-headings`、`/api/forward-links`、`/api/backlinks`、`/api/backlink-counts`、`/api/document` | GET | `notes.links` / 现有链接能力（名称未核实） | wiki-link 候选与内部预览 |
| `/api/tags`、`/api/tags/:name` | GET | `notes.tags` | |
| `/api/upload` | POST | 新增 `notes.attach`（写入笔记旁的附件目录，走原子写 + OperationLog）或扩展现有附件能力（名称未核实） | 返回相对路径 URL；大小 / 类型限制 |
| `/api/link-preview` | POST | 默认拒绝（Q3）；开启后经主进程抓取，限时限大小 | |
| `/api/documents/refresh` | POST | 资源目录失效 + 重新读取 | |
| `/api/comments*`、`/api/comment*` | GET/POST/DELETE | 适配到 `comments.*`（§9） | |
| duplicate-path / rename-path / create-page / create-folder / delete-path / trash / cleanup | POST | 现有 `notes.*` / `vault.*` 写能力（重命名 / 移动含双链重写、回收站、`OperationLog`） | `FileTree` 调用的真实请求体 S0 用代码核对（推断） |
| `/api/lint/*`、`/api/audit` | — | **不适用**（Q2 默认）；`hostFetch` 返回 `404 {code:'NOT_AVAILABLE'}`，vendor UI 入口通过 `OkHost.features` 关闭 | |
| `ws /collab` | — | 不存在：`LocalDocProvider` | |

`window.okDesktop` → `host/desktop-bridge.ts`：`reveal in OS`、复制路径、外部链接、“打开方式”、剪贴板等映射到 Huhu 桌面桥现有能力（名称未核实）；没有等价物的项目在 `OkHost.features` 中关闭并登记，**不留空按钮**（issue §3.4）。

`hostFetch` 的单测：每条路由的输入输出形状（用 core 的 zod schema 校验响应）、错误码 → UI 提示的映射。

## 5. 资源目录、隐藏、`@` 与计数

### 5.1 新能力 `vault.list`（OP-D10）

```ts
vault.list({ dir: string /* '' = 根 */, cursor?: string, limit?: number /* 默认 500 */, includeProtected?: boolean })
  → { entries: Array<{ name: string; path: string; kind: 'file'|'dir'|'symlink'; size?: number; mtimeMs?: number;
                        protected?: 'internal'|'git'|'dependency'|'agents' ; linkTarget?: { inside: boolean } }>,
      nextCursor?: string, total?: number /* 仅当本目录已全部列出 */ }
```

- 直接读文件系统；路径经现有守卫规范化（大小写 / Unicode / 越界）；符号链接做 `realpath` 检查，循环 / 越界返回 `kind:'symlink'` + `linkTarget.inside=false`，UI 显示原因，不跟随；空目录与点目录照常返回；`protected` 目录（`.huhu`、`.git`、`.agents`、`node_modules`）可见但操作受限，**元信息可列出，不代表外部 CLI / MCP 能读其内容**（权限表对 `vault.list` 与 `vault.readFile` 分别设置，保持 `exposable` 语义，S1 核对 `permissions.ts`）。
- 三类过滤分开：**列举**（本能力，不过滤）、**监听**（`snapshot.ts` 忽略表，避免 `.huhu` 写入回声）、**内容索引**（索引范围）。
- `vault.tree` 的消费者（`plugins/tasks/src/ui/references.ts:15`、`packages/kernel/src/mcp.ts:84`、权限表、`GatewayModule` 文案）一次迁完；`notes.files` 删除；`notes.list` 只保留笔记 / 星标 / 日记 / 标签语义查询。
- 失效：目录变化（创建 / 删除 / 重命名 / 外部）发 `entity.changed`，`query.ts` 的 `ENTITY_CAPS` 增加目录实体的前缀映射（`vault.list`）；不止刷新 React 本地数组（issue §5.1.7）。
- 性能：只在展开时 `vault.list(dir)`；`@` 候选走**查询**（`vault.search`/索引 + 目录列举），不依赖已展开节点（A04）。

### 5.2 `hiddenPaths`（OP-D11）

- 存储：每 Vault UI 偏好（类型化字段，位于 `<stateDir>` 下，不手拼 `.huhu`，不写 YAML；设施位置 S1 核实：`settings.get` 的 vault 级或 notes 状态文件）。内容：`{ hiddenPaths: string[] }`，规范相对路径，目录规则作用于子树。
- 叠加点：只在 `ResourceTree` 的数据 → 视图转换处过滤；**搜索、`@`、双链解析、已打开标签、收藏、评论不使用**。提供“显示已隐藏项目 / 管理隐藏项目 / 取消隐藏”；搜索 / `@` 打开隐藏资源时临时显露并标注，不自动改规则。
- 内部重命名 / 移动通过 `OperationLog` 回调同步重定位规则；外部重命名按路径规则处理，不猜测。

### 5.3 共享资源适配层（`@` 与双链）

把 `plugins/tasks/src/ui/references.ts` 中确有多消费者的部分（稳定回调、候选刷新、`scoreText` 排序）抽到 `packages/workbench/src/resources/`（仅此一处公共抽取）；notes 与 tasks 同用；引用使用完整相对路径（含扩展名），目录用明确目录形式，档案解析到真实目录 / `index.md`；同名 / 失效 / 越界明确区分；`Tasks/` 内业务 frontmatter 不被笔记链接重写误改。

### 5.4 计数

文件与目录分开计数；有隐藏时显示“可见 / 总数”；分页未完成时标“已加载 N，未完整统计”；档案视图投影不重复计数（A09、E05）。

## 6. Huhu 能力变更清单

| 能力 | 变更 | 消费者 / 事件 | 权限 |
| --- | --- | --- | --- |
| `vault.list` | **新增** | 文件树、`@` 候选、tasks 引用、MCP（如暴露） | 与 `vault.tree` 同级评估；受保护目录仅元信息 |
| `vault.readRange` | **新增** | PDF 查看器、（可选）大文件文本 | 与 `vault.readFile` 同级；单次 ≤ 4 MiB；`exposable:false` |
| `vault.tree` | **S5 结束时更名为 `vault.indexEntries` 或删除**（S1 先迁走除旧文件树外的消费者；对外接口变化见 spec Q8） | `tasks/references.ts`、`mcp.ts`（`huhu://notes/recent`）、`GatewayModule` 文案、`permissions.ts` | 保持 |
| `notes.files` | **S5 结束时删除**（旧文件树在此之前仍用它，`NotesModule.tsx:115`、`plugins/notes/huhu-plugin.json:42`） | `FileCard` / `NoteExplorer` 旧路径 | — |
| `notes.list` | 保留语义查询，不再是全文件树真源 | | |
| `notes.read/save/draft.*` | 复用；`save` 的 `expectedVersion` 语义不变 | `DocumentSession` | |
| `notes.attach`（拟） | 新增或扩展现有附件能力 | 编辑器图片上传 | 路径落在 Vault 内，原子写 |
| `comments.*` | 复用；契约只补确有缺失的字段（S4 字段对照后定） | 评论适配层 | |
| `archives.*` | 复用 | 档案 `DocTab` | |
| UI 偏好 `hiddenPaths` | 扩展已有 vault 级偏好 | 文件树 | |

所有写操作仍经 Dispatcher；新增能力在 `packages/contracts` 登记 DTO + 校验；`packages/workbench` 的 `ENTITY_CAPS` 同步更新。

## 7. 标签与档案导航（OP-D12）

```ts
type DocTab =
  | { kind: 'file'; vaultId: string; path: string; view: 'rich'|'source'|'read'|'viewer' }
  | { kind: 'archives-home'; vaultId: string }
  | { kind: 'archive-type'; vaultId: string; type: string }
  | { kind: 'archive-record'; vaultId: string; type: string; name: string }   // 对应 Archives/<类型>/<名称>/index.md
type SidebarContext = 'files' | 'archives'     // 由活动标签推导；用户点“文件”入口可手动切换，不被 effect 弹回
```

- 活动标签 → `sidebarContext`：档案三类标签 → `'archives'`，文件标签 → `'files'`；**两种上下文的展开 / 选中状态分别存**（E02）。手动点击“文件”入口只改变显示上下文，再次激活档案标签时按其上下文恢复；不使用会互相触发的 effect（用事件 / reducer）。
- 顶部分区顺序固定：**文件 / 星标 / 日记 / 标签 / 回收站 / 档案**；“档案”入口激活（或新建）唯一的 `archives-home` 标签。
- 文件树里 `Archives/` 是真实目录；`index.md` 默认以 Markdown 打开，提供“以档案视图打开”→ 切到 `archive-record` 标签，**同一文件同一 `DocumentSession`**（E04）。普通目录点击只展开 / 浏览。
- 持久化 / 恢复：标签条随 Vault 记录（沿用现有标签恢复机制：未核实），`DocTab` 带 `vaultId`，切 Vault 时 `epoch` 递增。
- 借鉴 obsidian-huhu：target 决定标题、页面与侧栏（`title(target)` / `panel(target)`），变化后 `refresh`；不搬其宿主与 schema。

## 8. 文件树与右键菜单

- 复制 OK 的 `FileTree.tsx`（3469 行）及 `file-tree-*`、`use-file-tree-listing`、`OkFileTree`、`FileTargetMenuItems`，数据源改为 `vault.list`（经 `hostFetch` 的 `/api/documents?showAll=true&dir=&depth=1`），操作经 `hostFetch` 调用现有写能力。**保持上游 `@pierre/trees` 集成**（beta 版本，锁定精确版本，不做 `^`）。
- 菜单项：打开 / 新标签打开、新建文件 / 目录、模板入口、重命名、移动、复制、复制相对 / 完整路径、星标、**在资源管理器中隐藏**、展开 / 折叠、回收站、恢复、永久删除确认、Huhu 现有版本操作；Share / OpenWithAi / 账户云项不带。文件 / 目录 / 空白区域分别适用；非 Markdown 同样有适用菜单。
- 行为：右键未选中行切换目标，右键多选不清空选择；右键 / 行内按钮 / 键盘走同一分发与同一禁用原因；窗口边缘翻转（Radix 自带）；关闭后焦点恢复；重命名保持扩展名与合法路径；移动不能进自身 / 后代；冲突不覆盖；对打开且未保存的文件 / 父目录先 flush 或提示（经 `settleDirtyDocs`），失败不丢草稿。
- 键盘 / IME / 拖放使用上游成熟实现；拖放与菜单移动经同一业务能力和 `OperationLog`。

## 9. 评论适配

- UI：复制 OK `comments/`（面板、线程卡、边距轨、选区入口、发送栏、锚点装饰与分层、store）；`store.ts` 与 `comments-client.ts` 是适配点——`comments-client.ts` 换成 `commentAdapter`（`comments.list/create/reply/resolve/reopen/relocate/delete` ↔ OK 的 `/api/comments` / `/api/comment` 动作集：`edit / reopen / replace / queue / unqueue / dispatch-*`；`queue / dispatch` 等 AI 派发动作不接，登记）。
- 锚点：OK 的锚点是 `{exact, prefix, suffix, start, end}`，匹配靠 quote 搜索（`createAnchorResolver`），每次文档变化重建；Huhu 持久化的是其 `CommentDto`（R-24 同源）。**S4 第一步产出字段对照表**（`evidence/comment-field-map.md`）并写适配层单测：冻结 quote / prefix / suffix / 缓冲 revision；`start/end` 在适配层只作为提示，不作为真源；找不到或歧义 → 孤立 / 待重新定位，**不吸附**（D04）。属性评论的锚点关联真实属性键（`propertyKey`），删除 / 改名后有定位状态。
- 数据事件：评论变化经 Dispatcher 发 `entity.changed`；任务评论（#1 的任务讨论）等其他消费者回归（D06）。

## 10. 属性区（OP-D17）

- 复制 OK 属性面板；YAML 位于 `Y.Text('source')` 的 frontmatter 段，面板经 OK 的 `use-frontmatter-field` 读写；**只留一份 YAML 编解码**：S0 对拍（SP-5）后二选一（Huhu 纯模块抽出供 OK 用，或 Huhu 委托 OK）。
- 工具栏自适应、顶部布局见 [ui-design.md](ui-design.md)。
- 属性与正文共用同一缓冲：编辑属性不会用磁盘旧正文覆盖未保存正文，反之亦然（C04）；坏 YAML 在面板里显示诊断与原文修复入口（C05）；文件元信息（路径 / 大小 / 时间）单独分组，不混入 frontmatter。

## 11. 查看器分派、PDF 与 HTML

### 11.1 分派（`ui/viewers/dispatch.ts`，借鉴 ORCA `EditorContent` 的结构）

| 判定（扩展名大小写不敏感；表放 `packages/ui` 的共享映射或 notes 的 shared） | 视图 |
| --- | --- |
| `.md` / 已支持 Markdown 扩展名 | `RichMarkdownEditor`（可切源码 / 阅读） |
| `.txt` | `PlainTextEditor`（text） |
| `.json` | `PlainTextEditor`（json：高亮 + 诊断，格式化显式） |
| `.html` `.htm` | `HtmlPreview`（可切源码：`PlainTextEditor`） |
| `.pdf` | `PdfView` |
| 图片 / SVG | `ImageView`（沿用现有） |
| 音视频 | 沿用现有可用能力；按需 ORCA `MediaViewer` 摘取 |
| 其它 / 二进制 / 超限 | `UnknownView`：元信息 + 适用操作（重命名 / 移动 / 打开方式），不伪装成功渲染 |

大文件：显式容量门槛与提示（沿用 / 完善现有），门槛不是隐藏资源的理由。

### 11.2 PDF（OP-D09）

- 摘取 ORCA 最小闭包到 `plugins/notes/src/vendor/orca/pdf/`；`pdfjs-dist 6.3.289` + 84 行补丁；worker 与 cmaps / standard fonts / wasm 由构建插件本地打包（**不联网**）。
- 字节：`pdf-orca-media-range-transport` 的 `readPreviewRange` → `vault.readRange`（≤ 4 MiB / 次，`rangeChunkSize` 256 KiB 沿用）；PDF.js 的 range 请求命中该传输。
- 状态隔离：`(vaultId, path, tab)` 为键的缩放 / 位置存储；关闭标签、换文件、取消加载时清理 worker、监听、observer、Object URL，迟到结果丢弃；加密 / 损坏 / 超限 / 外部修改有明确反馈；查找（`PdfFind`）与缩放快捷键接 Huhu 的快捷键系统。

### 11.3 HTML 预览（OP-D08，SP-7 定案）

先评估复用：ORCA `main/browser/document-preview/doc-preview-protocol.ts:65 handleDocPreviewRequest`（CSP `:46-50`）与 Huhu 现有 `huhu-app` 协议处理（未核实，S7 开头读代码）；然后在两个候选间按 F05 安全用例集选一个（规则见 decisions OP-D08）：

```text
(a) 渲染进程：<iframe sandbox="allow-scripts" src="huhu-preview://<vaultId>/<nonce>/<relative-path>">   # 不给 allow-same-origin
(b) 主进程：独立 partition 的 WebContentsView（无 preload、无 nodeIntegration、独立 session），加载同一个 huhu-preview URL

共同的主进程侧：
  - protocol.handle('huhu-preview')；scheme 与现有 huhu-app 合并在同一次 registerSchemesAsPrivileged 调用里（只能调用一次）；不设 secure / bypassCSP 以外的特权
  - nonce 一次一页，绑定 vaultId + path，随标签关闭失效
  - 相对资源按“当前文档目录”解析，经 Vault 路径守卫读取；越界、符号链接逃逸、受保护目录（.huhu / .git / .agents / node_modules）→ 403
  - CSP：default-src 'none'; img-src huhu-preview: data:; style-src huhu-preview: 'unsafe-inline'; script-src huhu-preview: 'unsafe-inline'; font-src huhu-preview:; connect-src 'none'; form-action 'none'；(a) 另有 frame-ancestors 仅工作台 origin（**开发模式 origin 不同，按 dev / prod 分别配置**）；nosniff；no-store
  - CORS：不同源 iframe / 视图加载模块脚本与字体需要 CORS 响应头，按预览 origin 精确放行
  - session 层硬化：webRequest 全拒非 huhu-preview: 的请求；拒绝全部权限请求；禁止下载；setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  - 导航：will-frame-navigate（不是只拦主框架的 will-navigate）+ setWindowOpenHandler 一律拒绝并改走“打开外部链接”；iframe 自身导航到外部 URL 被 webRequest 拦截
```

- 预览内容 = 会话当前**已确认**缓冲（打开 / 切换前先 `session.flush()`；源码修改保存后预览刷新），请求带 `epoch`，迟到响应不覆盖（F04）。
- 安全验收（F05）：恶意页尝试 `fetch` / XHR / 外部 `import()` / `postMessage` 到工作台 / `top` 导航 / iframe 自导航到外部 URL / `window.open` / WebRTC 探测 / 触发下载 / 访问 `file://` / 路径穿越 / 符号链接逃逸 / 受保护目录——全部被拦；代表性含脚本页面能运行。
- 不使用 `srcdoc`（OP-D08）。

## 12. 样式、i18n 与构建

- **样式**（OP-D05，限定在 `.ok-root` 内）：
  - Vite 加 `@tailwindcss/vite`；`ok/ok-globals.css`：`@import "tailwindcss/theme.css" layer(vendor.ok-theme); @import "tailwindcss/utilities.css" layer(vendor.ok-utilities);`，OK 自己的 base / components 规则放 `vendor.ok-base` / `vendor.ok-components` 子层；`@source` 覆盖 `packages/editor/src/vendor/open-knowledge/**`（全部 OK vendor 都在这里，见 §2）。**顶层层序声明不变**（`index.css` 与各样式文件首行的重复声明不动）。SP-2 若证明 `layer(a.b)` 子层在构建里不可行，退路是新增顶层 `ok-*` 层，并由 S2a 用脚本一次改全部样式文件的首行声明。
  - OK 的变量（`:root` / `.dark`、shadcn 变量、Tailwind `@theme` 产出）**只落在 `.ok-root`**，不输出到 `:root`；OK 的元素选择器 base 规则改写成 `.ok-root` 后代；**不导入全局 preflight**，改为 `.ok-root` 作用域的 preflight 子集（因为 Huhu 的 base 元素样式会渗入 OK 组件）；所有 OK 渲染的根与 portal 容器都挂 `.ok-root`。
  - `ok/token-map.css`（只写在 `.ok-root` 上）把 `--background / --foreground / --border / --muted / --accent / --ring / --radius…` 映射到 Huhu token（注意 `--muted` 在 Huhu 是文字色、在 shadcn 是背景色，按语义映射不按名字）；`@custom-variant dark` 改为 `data-mode="dark"`。**不把 7079 行 `globals.css` 原样放进 Huhu**，只保留被 vendor 实际引用的部分，S0 记录取舍（行数 / 来源）。
- **守护**：`check-ok-class-collisions` 三类交集（Tailwind 类 ∩ Huhu CSS 类；Tailwind 类 ∩ Huhu TSX / HTML 里没有 CSS 规则的类 token；`.ok-root` 之外出现 OK 变量名）；SP-2 断言 Huhu 根变量求值前后不变、`visual:compare rc4` 非知识库屏幕 0 差异；`check-css-layers` 只登记 `vendor.ok-*` 子层文件；`check-css-classes` / `check-ui-colors` 不扫 vendor；**不得**为此放宽对 Huhu 自有代码的规则，也不新增全局无层覆盖或 `!important`。
- **i18n**（OP-D06）：`@lingui/vite-plugin` + `@lingui/babel-plugin-lingui-macro`；`@vitejs/plugin-react` 需启用 babel 管线（S0 记录构建耗时变化）；编辑器包仅编译 `en`、`zh-Hans`；`host/i18n.ts` 初始化并订阅 Huhu 语言设置。
- **补丁**：`pnpm.patchedDependencies`（位置未核实）登记 `@tiptap/extension-drag-handle`、`@tiptap/y-tiptap`、`@handlewithcare/remark-prosemirror`、`y-prosemirror`（若需）、`pdfjs-dist`；`@hocuspocus/provider` 本地不用则不引入。
- **懒加载**：`RichMarkdownEditor` / `SourceEditor` / `PdfView` 经动态 `import()` 分包；插件的 notes 模块入口不静态引用 vendor；首屏与其它模块的冷启动指标有回归守护（G07）。

## 13. vendor 与上游测试（OP-D15 / D16）

- `scripts/ok-closure.mjs`：从固定 SHA 的本地副本出发做静态 import 闭包，输出 `closure-manifest.json`（上游路径、目标路径、动作、原因、行数、哈希）；`scripts/ok-patches.mjs`：从干净上游重放 `PATCHES.md` 里的补丁，与仓库 vendor 目录逐文件比对，**不等即失败**（G02）。
- `pnpm test:vendor`：独立 vitest 项目（jsdom），迁入的上游测试分类（通过 / 适配 / 不适用）；CI 单独 job；结果表入 `evidence/`。
- 许可证：vendor 目录带 `LICENSE`（取自 `git show HEAD:LICENSE`）与 `UPSTREAM.md`；`ledger.md` 新增条目；`gen-notices.mjs` 对新增包逐个核对 `ALLOWED`（OP-D14）。

## 14. 必须删除 / 替换的旧路径（issue §13 + 调查补充，S8 逐条核对）

1. `MarkdownEditor.tsx`、`vendor/atomic/*`（`inline-preview`、`wiki-links`、`tree-progress`、`atomic-theme`、`read-only`、`huhu-composition`）、`editor-cm.css` 中服务旧编辑器的部分、旧工具栏与重复格式命令；`MarkdownPreview.tsx`（`stripFrontmatter` / marked + DOMPurify）、`wikilink.ts`、`mention.ts`（若 `compact` 的 `@` 已由新实现替代）。
2. `FileCard` 对 JSON / TXT 的只读分支与 HTML 源码展示分支（未知类型元信息回退保留）。
3. 由 `notes.list` + `otherFiles` 拼全资源树的逻辑；`notes.files`；只为弥补索引不完整而维护的虚拟目录真源（新建空目录必须在文件系统里真实存在）。
4. 非 Markdown 文件菜单 / 拖放的限制分支；独立于右键的另一套行内操作实现。
5. 路径字符串数组标签与独立 `folderView`。
6. 旧 `CommentsPanel` 的重复入口，以及把源码偏移直接当 PM 位置的适配捷径。
7. 顶部与详情两份可独立修改的属性状态；任何保存时重建整个 YAML 的逻辑。
8. 无消费者的旧类型、导出、CSS、测试夹具、文案；`@huhu/editor` 旧导出（`MarkdownEditor` 等）；marked / DOMPurify 等无消费者依赖；`knip` 为准。

## 15. 性能、内存与生命周期

- 冷启动不加载编辑器闭包（懒加载）；首次打开笔记的耗时（含 chunk 加载、hydrate）记录 p50 / p95；长文（≥ 1 MB）、多评论（≥ 500 线程）、大 Vault（≥ 10 万文件，惰性列举）分别量输入延迟、保存耗时、内存（`pnpm bench` + 专项场景，记录机器 / 样本，F09）。
- `editor-cache` `MAX_CACHE=10`；compact 变体每实例成本在 S2 量（Q4）。
- 反复开关 200 次：编辑器实例、Y.Doc、observer、定时器、PDF worker、Object URL、iframe 无持续增长（F10 / H06）。

## 16. 主要风险登记

| 风险 | 影响 | 缓解 / 闸门 |
| --- | --- | --- |
| 闭包 861 文件 / 12.3 万行在 Huhu 构建里编不过、类型不兼容 | 整个 change 无法推进 | **S0 SP-1**：先复制 → 编译 → typecheck → 跑黄金样本；不通过即汇报用户，不硬凑 |
| Y 本地化后保真往返有差异（“无编辑不写盘”失效 → 用户文件被悄悄改写） | 数据保真 | SP-4 黄金样本字节级；`markdownSemanticallyUnchanged`；保存前双重检查；首个版本默认对改写做“写前备份”（`OperationLog` 已有） |
| Tailwind / Lingui 与 Huhu 层序 / 构建冲突 | 样式污染、构建变慢 | SP-2 / SP-3；碰撞守护；非知识库界面视觉基线回归 |
| 上游 beta 依赖（`@pierre/trees 1.0.0-beta.4`、`@hocuspocus/provider 4.0.0-rc.1`）与补丁随版本漂移 | 升级困难 | 精确锁版本；PATCHES 重放脚本；升级作为单独 change（Q6） |
| 许可证：126 个 npm 包里的 LGPL / CC-BY / PSF 与 `ALLOWED` | `pnpm notices` 失败、发布受阻 | S0 先跑 `gen-notices`；逐包记录理由，不放宽白名单 |
| 工作量与并行冲突（共享 `packages/editor`、`notes` 入口、`contracts`） | 合并冲突 / 半成品 | 见 [plan.md](plan.md) 的唯一写入者与整合边界；先稳定契约（`EditorPort`、`DocumentSession`、`DocTab`、`vault.list`） |
| 用户报告的选区 / 上下行问题换编辑器后仍在 | 目标未达成 | S0 在 rc.4 复现并存证；B06 在真实 Electron 里对照；不把“换了编辑器”当作已解决 |
| IME / Windows / macOS 行为无法在本环境验证 | 验证缺口 | 如实标“未验证”；CI 三平台 e2e 子集；不写已通过 |
| compact 变体拖慢 tasks / inbox | 回归 | Q4 / H05 |
| OK 编辑器与 `provider-pool` / `DocumentContext` / `editor-cache`（93 个文件导入）的接缝比编译能暴露的深 | S2 之后才发现要大改 | **SP-6 运行时闸门**（真实 Electron：LocalDocProvider 挂 TiptapEditor，两文件来回切触发 park / evict、切源码、撤销、无编辑不写盘）+ 写死的补丁 / 重写阈值（decisions OP-D02） |
| OK 全局样式（变量、base、preflight）渗入 Huhu | 非知识库界面走样 | `.ok-root` 作用域 + SP-2 断言（根变量不变）+ 三类碰撞检查 |
| HTML 预览隔离的细节（iframe 自导航、WebRTC、下载、权限、CORS、dev / prod 源） | 沙箱被绕过 | SP-7 在 (a)(b) 间按完整安全用例选择 |
