# 06 档案标签与侧栏切换（S6）

[验收报告](../evidences/06-archives-tabs.md)

规格：E01–E05；设计：[design.md](../design.md) §7；界面：[ui-design.md](../ui-design.md) §2；决定：OP-D12；复用：obsidian-huhu 的 target 驱动思路；现行档案规范 `notes/context/archives.md`。
交付：用户角度——顶部分区顺序为“文件 / 星标 / 日记 / 标签 / 回收站 / 档案”；点“档案”打开（或聚焦）真实的档案首页标签；类型页、记录页同样是标签；活动档案标签使侧栏切到档案树，切回文件标签恢复文件树，两者展开状态各自记忆；普通目录点击只浏览；`Archives/` 在文件视图里仍是真实目录；同一 `index.md` 的 Markdown 视图与档案视图共享一个会话。
依赖：S1（`DocTab`、`sidebarContext`、`DocumentSession`）。
边界：**`NotesModule.tsx` 接线的唯一写入者**；写 `plugins/notes/src/ui/{tabs,archives}/`；保留 `engine/archives/` 的业务与存储，不恢复独立档案插件，不复制 Obsidian 虎符的 schema。

## 当前代码指针

`NotesModule.tsx:35`（`folderView`）、`:160-175`（`openArchiveFolder`）、`:211`、`:286-298`（按 route 渲染）、`:305-309`（面包屑）；`ui/archives/route.ts`（`ArchiveRoute = home | type | archive`）；`ArchivesViews.tsx`（592）；`engine/archives/{service.ts 424, capabilities.ts}`。

## 实施要点

6.1 `TabStrip` 统一渲染 `DocTab`；`archives-home` 唯一；档案类型页 / 记录页为标签；关闭 / 切换 / 恢复（随 Vault 记录）；删除 `folderView` 与 `ArchiveRoute` 的旁路切换。
6.2 `sidebarContext`：活动标签推导 + 手动切换（reducer / 事件，不用互相触发的 effect）；文件树与档案树展开 / 选中状态分别存。
6.3 顶部分区重排；“档案”入口从标题操作区移到分区最右。
6.4 `index.md` 的两种打开：文件树点击 → Markdown；“以档案视图打开” → `archive-record` 标签，**共享同一 `DocumentSession`**（编辑 / 外部修改 / 重命名 / 删除后两边一致）。
6.5 新建 / 编辑 / 重命名 / 移动 / 删除档案继续调用 `archives.*`；与目录详情、文件树、搜索、`@`、双链同步；损坏字段显示错误与源码修复入口。
6.6 档案附件走统一查看器分派（S7），文件计数按真实资源。
6.7 接线汇总：接收 S5（树）、S7（查看器）的接线请求，一次性接入 `NotesModule`。

## 验收

- [ ] E01：“档案”位于指定分区最右；点击后标签条出现可关闭、可切换的真实档案页面标签；再次点击聚焦而非重复堆叠。
- [ ] E02：活动档案标签 → 档案树；普通文件标签 → 文件树；两种展开状态独立；手动切入口不产生 effect 循环（连续点击 50 次无抖动 / 无死循环断言）。
- [ ] E03：普通目录只浏览子资源，不自动渲染；`Archives/` 在文件视图展示真实目录和文件（`index.md`、字段定义、附件）。
- [ ] E04：同一 `index.md` 在 Markdown 与档案视图使用同一会话；编辑、外部修改、重命名、删除后两边一致，无第二份记录。
- [ ] E05：档案附件通过统一查看器打开，双链 / `@` / 反链保持真实文件资源语义；没有新增独立档案插件 / 数据库；既有档案 e2e（AR-06 / AR-10 / AR-09、AR-16 等）全绿。

## 完成证据

`evidence/s6/`（e2e 报告、录屏）；`progress.md` 登记。
