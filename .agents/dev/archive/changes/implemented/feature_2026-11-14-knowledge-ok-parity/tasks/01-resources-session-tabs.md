# 01 资源目录、会话与标签契约（S1）

规格：A01、A05、A09、A10、C03、C04、C06、E04（会话共享部分）、F02（编码保留）；设计：[design.md](../design.md) §3.1 / §3.4 / §5 / §6 / §7；决定：OP-D03 / D10 / D11 / D12。
交付：从用户角度——文件树数据源是真实文件系统（空目录、`Tasks/`、点目录、未知扩展名都在）；笔记编辑、保存、冲突、草稿、关闭前 flush 的行为与现在**完全一致**，但逻辑已抽成 `DocumentSession`；`DocTab` / `EditorPort` / `vault.list` / `vault.readRange` / `hiddenPaths` 的契约冻结，供 S2a、S5、S6、S7 使用。
依赖：S0（闸门通过）。
边界：唯一写入者 = S1 负责人；写 `packages/{contracts,kernel,vault}`、`plugins/notes/src/{engine,ui/documents,ui/tabs}`、`plugins/notes/src/ui/NotesModule.tsx`（**仅拆成组合壳**，之后 S6 是唯一写入者）、`packages/ui/src/components/FileIcon.tsx`、`packages/workbench/src/{engine-client,resources,state}`；**不**写 `packages/editor` 的 vendor / host（S2a）、不写 `ui/explorer`（S5）、不改 `NotesModule` 的标签 UI 行为（S6）；不改锁文件（向 S2a 提需求）。

## 当前代码指针（观察于 `9132640`，实施时复核）

`packages/kernel/src/capabilities/vault.ts`（`vault.tree` `:96-106`、`MAX_READ_BYTES` `:9`、`readBinary` `:170`）、`packages/vault/src/index/vault-index.ts`（`treeFrom` `:76-85`）、`packages/vault/src/watch/snapshot.ts`（忽略表 `:6-7`）、`packages/kernel/src/permissions.ts:28`、`packages/kernel/src/mcp.ts:84`、`plugins/tasks/src/ui/references.ts:15`、`plugins/notes/src/engine/{service,index}.ts`（`SEMANTIC_DIRS :26`、`isNoteFile :28`、`otherFiles :116-121`、`notes.files`）、`plugins/notes/src/ui/{NoteDocument,NotesModule,NoteExplorer}.tsx`、`packages/workbench/src/{state/flushers.ts,engine-client/query.ts}`。拟新增：`ui/documents/DocumentSession.ts`、`ui/tabs/{docTabs,sidebarContext}.ts`、`packages/editor/src/editor-port.ts`（类型，实现 S2）、contracts 中 `vault.list` / `vault.readRange` / 偏好 DTO。

## 任务

1.1 **契约先行**：在 `packages/contracts` 定义并冻结 `vault.list` / `vault.readRange` 的 DTO 与校验、`hiddenPaths` 偏好字段、`DocTab`、`DocumentSession` 与 `EditorPort` 接口（[design.md](../design.md) §3–§7）；产出 `evidence/contracts-freeze.md`（含变更流程：改动回到计划修订）。
1.2 **`vault.list` 实现**：读文件系统、路径守卫、符号链接 `realpath`、保护标记、分页；`permissions.ts` 与 MCP 暴露策略（元信息可列、内容不泄露）；监听 / 索引 / 列举三套过滤分开。
1.3 **`vault.readRange`（实现留给 S7 也可，契约在此冻结）**：单次 ≤ 4 MiB，守卫与 `vault.readFile` 同级，`exposable:false`。
1.4 **消费者迁移**：`tasks/references.ts`、`mcp.ts`（`huhu://notes/recent`）、权限表、`GatewayModule` 文案迁到新能力；**旧文件树（`NotesModule.tsx:115` 仍调 `notes.files`）在 S5 之前保持可用，所以 `vault.tree` / `notes.files` 在此**不删除**，S5 结束时再删除或改名（对外接口变化见 spec Q8）**；`notes.list` 只保留语义查询；修正 `isNoteFile` 仅检查第一段目录的行为（R6）与点路径过滤，使其与新资源目录一致。
1.5 **`DocumentSession` 与 `DocumentSessionRegistry` 抽取**：从 `NoteDocument.tsx` 抽出保存队列、`expectedVersion`、`dirtyRevision`、在途保存、草稿、冲突、外部变更、flush / `registerFlush`、编码 / BOM / 换行保留；**会话按 `(vaultId, path)` 登记并引用计数，生命周期长于组件**（同一文件的多个标签 / park 中的编辑器共用一个会话）；`flush()` 先排空“编辑 → 会话”的 300 ms 防抖再保存；`NoteDocument` 改为使用它，**外部行为不变**；同时把 `NotesModule.tsx` 拆成组合壳（状态与菜单移出），为 S5 / S6 / S7 接线。
1.6 **标签与上下文模型**：`docTabs.ts`（reducer：打开 / 聚焦 / 关闭 / 恢复 / 切 Vault）、`sidebarContext.ts`（由活动标签推导 + 手动切换，无互相触发的 effect）；本任务只落模型与单测，不改 UI（S6 接 UI）。
1.7 **实体失效**：`ENTITY_CAPS` 增加目录实体前缀；监听 / 内部写操作发 `entity.changed`；单测覆盖创建 / 删除空目录、外部改名。
1.8 **`hiddenPaths` 偏好**：在每 Vault UI 偏好设施里加类型化字段（先核实设施位置，未核实），含读写能力与重定位回调（`OperationLog` 的移动 / 重命名）；单测。
1.9 **共享 `FileIcon`**：`packages/ui/src/components/FileIcon.tsx` + 静态扩展名表（lucide + OK `MarkdownFileIcon` 摘取，OP-D13），先给标签条与旧文件树用；S5 / S7 消费，不再各自写。

## 验收

- [ ] A01：根目录放普通笔记、`Tasks/`、`Comments/`、JSON、TXT、PDF、HTML、未知扩展名、点目录、空目录，`vault.list` 全部返回；嵌套 `Tasks/` 不再被误排除或误保留（对照 R6）。
- [ ] A05：创建 / 删除空目录、外部修改与自写操作后，`vault.list` 查询即时更新（`entity.changed` → 失效）。
- [ ] A09（数据面）：`total` 仅在目录全部列出时出现；文件 / 目录分开计数；分页游标正确。
- [ ] A10：`.git / .huhu / .agents / node_modules` 元信息可列、标 `protected`；外部 CLI / MCP 不能通过 `vault.list` 读取其内容；索引忽略表与列举规则互不影响（`.huhu` 写入不触发列举回声循环）。
- [ ] 会话：同一文件在两个标签 / park 的编辑器里引用同一会话（单测：引用计数、归零销毁）；输入后立刻关闭，磁盘内容包含最后一个字符（防抖排空，单测 + e2e）。
- [ ] C06 / C03：旧编辑器上，保存冲突、只读、磁盘失败、外部修改、删除、重命名、切 Vault / 关闭前 flush、草稿恢复的既有 e2e 与新增单测全绿；旧保存回执不清除新 `dirtyRevision`（新增单测）。
- [ ] 编码：BOM / CRLF / 末尾换行经 `DocumentSession` 读 → 写后与原文字节一致（单测）。
- [ ] 契约冻结文档存在；S2a / S5 / S6 / S7 的负责人可只凭契约开工。
- [ ] `pnpm lint / typecheck / test / build` 全绿；知识库既有 e2e（打开、编辑自动保存、拖放移动、外部修改 Banner、查看器等）全绿。

## 完成证据

命令输出与 e2e 报告存 `evidence/s1/`；契约冻结文档；`progress.md` 登记。拟新增的测试是创建工作，实施后由执行者记录结果。
