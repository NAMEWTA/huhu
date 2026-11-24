# 05 文件树、右键菜单、隐藏与 `@`（S5）

[验收报告](../evidences/05-explorer.md)

规格：A02、A03、A04、A06、A07、A08、A09、A10；设计：[design.md](../design.md) §5 / §8；决定：OP-D10 / D11 / D13。
交付：用户角度——文件树是 OK 的树：真实文件系统、真正的右键菜单、选择 / 展开 / 重命名 / 拖放 / 键盘；用户可只在资源管理器里隐藏目录并可恢复，而 `@`、双链、搜索、已打开标签不受影响；`@` 候选在未展开的大目录里也能找到；计数区分可见 / 总数。
依赖：S1（`vault.list`、`hiddenPaths`、失效、`DocTab`、`FileIcon`）；**S2a（依赖 / `@pierre/trees` 精确版本 / Tailwind `.ok-root` 作用域 / `hostFetch` 骨架）**；S0（树闭包清单）。vendor 复制由本切片完成（树子树 `packages/editor/src/vendor/open-knowledge/app/components/{FileTree*,file-tree-*,FileTarget*,OkFileTree*,use-file-tree-listing*,…}`），**所有 OK vendor 都在 `packages/editor` 下**（单一 `@source` / UPSTREAM / PATCHES），S2a 写 `core/`、`app/editor`、`app/lib`、`app/components/ui`，S4 写 `app/comments`，S5 写树子树，互不相交。
边界：写 `plugins/notes/src/ui/explorer/`、树 vendor 子树（`P-S5-xx` 补丁）、`host/routes/files.ts`、`packages/workbench/src/resources/`（`@` 候选共享层）；**不写 `FileIcon.tsx`（S1 交付，这里只消费）**；`NotesModule` 接线由 S6 负责，S5 提交接线请求；依赖变更由 S2a 统一引入。**S5 结束时：删除 `notes.files` 与 `vault.tree`（或改名 `vault.indexEntries`），把旧 `NoteExplorer` 的最后调用点迁走并删除旧树**（对外接口变化按 spec Q8 的结论）。

## 当前代码指针

`plugins/notes/src/ui/NoteExplorer.tsx`（293，无 `contextmenu`）、`NotesModule.tsx:39 / :214 / :241-243`（菜单状态与定位）、`plugins/tasks/src/ui/references.ts`；OK `components/FileTree.tsx`（3469）、`file-tree-*`、`use-file-tree-listing.ts`、`FileTargetMenuItems.tsx`、`file-entry-icon.tsx`、`file-tree-extension-badge.ts`。

## 实施要点

5.1 复制树与菜单的闭包；`hostFetch` 的文件树路由段（`/api/documents?showAll=true&dir=&depth=1`、重命名 / 复制 / 创建 / 删除 / 回收站）接 `vault.list` 与现有写能力；删掉 OK 的 `.okignore` 隐藏与 `showOnlyMarkdownFiles`。
5.2 菜单：文件 / 目录 / 空白区各自的项（design §8）；Hide → `hiddenPaths`；Share / OpenWithAi 等不带并登记；禁用原因一致；右键 / 行内按钮 / 键盘同一分发。
5.3 打开的脏文档 / 其父目录被移动、删除、复制：经 `settleDirtyDocs` flush 或提示，失败不丢草稿；完成后标签、引用、隐藏规则、评论同步重定位。
5.4 隐藏：叠加点只在树的数据 → 视图转换；“显示已隐藏 / 管理 / 取消隐藏”；搜索 / `@` 打开隐藏文件时临时显露。
5.5 `@` 共享层：把 `references.ts` 的多消费者部分抽到 `packages/workbench/src/resources/`；候选来自查询（`vault.list` / 索引搜索），**不依赖树的已展开节点**；notes 与 tasks 共用。
5.6 计数与图标：可见 / 总数、未完成分页标记；`FileIcon` 与 OK 角标 / sprite 同源。

## 验收

- [ ] A02：默认隐藏列表为空；隐藏目录后子树不可见，重启仍生效；管理入口可恢复。
- [ ] A03：隐藏后 `@`、双链、搜索与原标签仍可用；打开隐藏资源不报“不存在”、不擅自取消隐藏。
- [ ] A04：未展开的大目录（≥ 10 万文件夹具）里的文件仍能被 `@` 找到；分页树不截断引用候选。
- [ ] A06：文件 / 目录 / 空白处右键菜单正确；键盘、行内按钮、右键的目标与权限一致；靠窗口边缘不溢出；Esc / 方向键 / 子菜单 / 输入法正常。
- [ ] A07：重命名 / 移动 / 复制 / 拖放 / 回收站 / 恢复覆盖 Markdown 与非 Markdown；冲突、移入自身、越界均不破坏文件；走同一业务能力与 `OperationLog`。
- [ ] A08：操作打开的脏文档或其父目录不丢草稿；完成后标签、引用、隐藏规则、评论同步定位。
- [ ] A09：文件 / 目录分开计数、可见 / 总数；未完成分页不冒充总数；档案投影不重复计数。
- [ ] A10（UI 面）：受保护目录元信息可见、操作限制有原因。
- [ ] `notes.files` / `vault.tree` 已删除（或改名），`git grep` 无残留调用；旧 `NoteExplorer` 已删除；MCP `huhu://notes/recent` 与权限组按 Q8 结论处理。
- [ ] `test:vendor` 中树 / 菜单相关上游测试（约 34 个）的分类结果入表。

## 完成证据

`evidence/s5/`（e2e 报告、对照记录、大目录夹具与测量数据）；`PATCHES.md` 的 `P-S5-xx`。
