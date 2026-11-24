# S1 契约冻结（2026-11-15）

**冻结后任何改动都必须回到 plan.md 修订**（改动者先在 `decisions.md` 登记原因，再同步本文件与 S2a / S5 / S6 / S7 的任务书）。以下全部已有实现与单测，位置如下。

## 1 能力（`packages/contracts/src/resources.ts` + `packages/kernel/src/capabilities/vault.ts`）

| 能力 | 输入 | 输出 | 作用域 / 暴露 | 备注 |
| --- | --- | --- | --- | --- |
| `vault.list` | `{dir='', cursor?, limit=500(≤2000), includeProtected=false}` | `{entries:[{name,path,kind:'file'\|'dir'\|'symlink',size?,mtimeMs?,protected?:'internal'\|'git'\|'dependency'\|'agents',linkTarget?:{inside}}], nextCursor?, total?, counts?:{files,dirs}}` | read；`exposable:true`、`defaultExposed:false`；权限组 `vault.read` | 真实文件系统；点目录 / 未知扩展名 / 空目录照常返回；目录在前、按名称码点序；`total` / `counts` 仅在本目录列完时出现；`.DS_Store` / `Thumbs.db` 不列；越界 `PATH_OUTSIDE_VAULT`；**非桌面调用方不能 `includeProtected`**（受保护目录元信息仅桌面可列；内容读取走 `vault.readFile` 既有的路径守卫与暴露策略，不因本能力放宽）；Vault 内符号链接按目标类型展示并带 `linkTarget.inside=true`，越界 / 失效 / 循环保持 `kind:'symlink'`、`inside=false`，不跟随 |
| `vault.readRange` | `{path, offset≥0, length 1…4 MiB}` | `{path,offset,length,size,base64,eof}` | read；`exposable:false` | 路径守卫同 `vault.readFile`；超界 offset 返回空串并 `eof` |
| `notes.hidden.get` / `notes.hidden.set` | `{}` / `{hiddenPaths:string[]}` | `{hiddenPaths:string[]}` | read / write；不对外 | 存 `.huhu/notes/hidden-paths.json`（与既有 favorites / folders 同模式）；规范化、去重、排序；**只给文件树视图使用**，搜索 / `@` / 双链 / 已打开标签 / 评论不得使用；内部改名 / 移动（`NotesService.moveEntry`、大小写改名、空文件夹改名）在同一 `OperationLog` 里重定位规则，外部改名不猜测 |
| 事件 `vault.dirChanged` | `{path}` | — | 引擎发布 | 监听器检测到非跟踪文件的目录创建 / 删除 / 改名（含空目录）；`workbench/engine-client/query.ts` 据此让 `vault.*`、`notes.*` 查询失效。**轮询回退模式只比较文件快照，检测不到空目录变化**（已知限制） |
| `folders.create` | 不变 | 不变 | 不变 | 新增：成功后发 `entity.changed`（kind=note），使 `vault.list` 即时失效 |

`vault.tree` / `notes.files` **未删除**：旧文件树（`NotesModule`）仍用 `notes.files`；`tasks/references.ts`、`mcp.ts`（`huhu://notes/recent`）、`GatewayModule` 仍用 `vault.tree` 的平铺索引条目——它们需要“全库索引条目”，不是逐目录列举，不能迁到 `vault.list`。**删除 / 更名由 S5 完成**（更名为 `vault.indexEntries` 或删除），对外接口变化见 spec Q8（OP-D19：无外部调用方则直接删，有则保留一个版本并弃用）。

## 2 类型（同文件）

`DocTab`（`file` / `archives-home` / `archive-type` / `archive-record`）、`DocView`、`SidebarContext`、`EditorPort`（focus / getSelection / execute / canExecute / reveal / getDraft / flush / readOnly）、`SaveState`、`DocumentKind`、`SetTextOrigin`、`HiddenPathsPrefs`、`isHiddenByRules(rel, rules)`、常量 `VAULT_LIST_*` / `VAULT_READ_RANGE_MAX`。

**偏差**：计划把 `EditorPort` 放 `packages/editor/src/editor-port.ts`；因 `packages/editor` 的 vendor / 依赖由 S2a 独占，且 notes / workbench 不应反向依赖 editor 内部，S1 把类型放在 `@huhu/contracts`；S2a 的实现侧 `import type { EditorPort } from "@huhu/contracts"` 即可，不另建同名类型。

## 3 会话（`plugins/notes/src/ui/documents/`）

- `DocumentSession`（纯类，无 React）：`load / setText(next, origin) / save / flush / flushForExit / keepDraft / notifyExternalChange / readDisk / keepMine / merge / restoreDraft / discardDraft / setError / clearError / attachDrainer / dispose`，`subscribe + getSnapshot`；快照 `{loaded,text,state,baseVersion,dirtyRevision,flushError,draft,format{bom,eol,finalNewline},hasUnsaved}`。
- `flush()` 先调用 `attachDrainer` 注册的排空函数（S2 的“编辑器 → 会话”300 ms 防抖），再保存；保存回执只清除其对应的 `dirtyRevision`（C06）；保存串行；`dispose()` 自动保存模式落盘（失败改存草稿）、手动模式留草稿。
- `DocumentSessionRegistry`：按 `(vaultId, path)` 登记 + 引用计数，`acquire(vaultId, path, make, bind?)` → `SessionLease{session, release()}`；销毁中重新打开会等旧会话写完；每个新会话 `epoch` 递增。`useDocumentSession(path, autosave)` 是 React 包装，并注册退出 flush / 未保存文档（会话销毁时注销）。
- `documentKindOf(path)`：`.json` → json，`.md` / `.markdown` → markdown，其余 text；`detectTextFormat(text)`：BOM / 换行 / 末尾换行（会话永远保存原样字符串，保存逐字节还原）。

## 4 标签与侧栏（`plugins/notes/src/ui/tabs/`）

`docTabsReducer`（`open / focus / close / restore / switchVault / remap / prune`）、`tabKey`、`archiveRecordPath`、`tabFilePath`、`activeTab`；`sidebarReducer`（`activate / choose / expand / select`，两种上下文的展开 / 选中分别存储）、`contextOfTab`。**只落模型与单测，UI 仍是旧的字符串标签**（S6 接线）。

## 5 共享 `FileIcon`（`packages/ui/src/components/FileIcon.tsx`）

`<FileIcon name dir? open? size? />`、`fileIconKind(name)`、`extensionOf(name)`；Markdown 字形摘自 OK `file-entry-icon.tsx`（GPL-3.0-or-later，同许可证；路径数据由脚本逐字拷贝并比对）。已被标签条使用；S5 / S7 消费。

## 6 NotesModule 组合壳

`NotesModule.tsx`（787 → 545 行）只保留状态与编排；拆出：`NoteDialogs.tsx`（TrashList / NameDialog / NewNoteDialog / MoveDialog / CommentComposer）、`NoteContextMenu.tsx`、`tabs/TabStrip.tsx`；S5 / S6 / S7 通过各自目录导出的组件接入，S6 为 `NotesModule` 的唯一写入者。

## 7 已知偏差与限制（如实）

1. `vault.tree` / `notes.files` 的消费者迁移与删除全部留到 S5（见 §1）；任务 1.4 中“迁到新能力”仅完成 `vault.list` 新增与 `isNoteFile` 核对。
2. `isNoteFile`（R6）：语义目录排除只看**第一段**目录是**有意的**——`Tasks/` 等只在 Vault 根有语义，`b/Tasks/x.md` 是普通笔记；`vault.list` 完全不依赖它（不过滤），单测覆盖 `b/Tasks/t.md`。没有改行为。
3. 轮询回退下空目录变化不会推送（见 §1）。
4. `packages/editor` 的 `typecheck` 在基线提交 `fb034af`（S2a 把 OK 闭包放进 `src/vendor` 之后）已红：vendor 代码被 Huhu 严格的 `tsconfig.base.json` 检查。这不是 S1 引入的，需要 S2a 把 vendor 排出该 tsconfig（用 `tsconfig.vendor.json`）。`pnpm knip` 同样因 `packages/editor/package.json` 的未使用依赖失败（S2a 接入后消除）；S1 文件无 knip 报告。
5. S1 没有运行 `audit` 子代理（fork 不得派生子代理），验证由 fork 直接在本 worktree 运行，输出见 `evidence/s1/verification.md`。
