# W09 档案

## W09.1 档案类型与字段

- 目标：类型的创建、编辑、删除（含迁移）与字段管理。
- 依据：[archives](../modules/archives.md) §2–3；ACC-AR-03。
- 前置：W04.3、W02.4。
- 位置：`plugins/archives/{huhu-plugin.json,src/engine/types.ts,src/ui/TypesDialog.tsx}`、`packages/contracts/src/kinds/{archive,archive-type}.ts`。
- 复用：R-56（`ArchiveTypes`）。
- 实现要点：新 Vault 不预置类型；示例 Vault 带 4 个类型（项目、联系人、书籍、资产）；字段类型 text/date/url/number；删除字段保留值；“迁移并删除类型”为一个操作。
- 异常：类型名重复、无字段、无其他类型可迁移。
- 测试：ACC-AR-03 集成测试。
- 完成：ACC-AR-03 通过。

## W09.2 档案 CRUD 与列表

- 目标：档案模块侧栏、表格/卡片、搜索、新建/编辑/删除、更改类型、导出当前视图。
- 依据：archives §2–3；ACC-AR-02、04、05。
- 前置：W09.1。
- 位置：`plugins/archives/src/engine/{archives,capabilities}.ts`、`plugins/archives/src/ui/{ArchivesModule,ArchiveTable,ArchiveCards,ArchiveEditor}.tsx`。
- 复用：R-56（`ArchivesView`）。
- 实现要点：字段表单由类型生成；删除时同一操作清理他方 `relatedIds`；导出为 Markdown 表格文件；未定义字段分区。
- 异常：链接字段校验；删除后关联任务资源显示失效（由 ResourcePicker 的失效逻辑呈现）。
- 测试：ACC-AR-02、04、05 集成测试；E2E 表格/卡片切换。
- 完成：三个 ACC 通过。

## W09.3 关系与关联笔记

- 目标：双向关系编辑、关联/解除笔记。
- 依据：archives §3；ACC-AR-01。
- 前置：W09.2。
- 位置：`plugins/archives/src/engine/relations.ts`、`plugins/archives/src/ui/{ArchiveDetail,RelationsDialog}.tsx`。
- 复用：R-56（`ArchiveRelations`、`ArchiveDetail`）。
- 实现要点：`archives.setRelations` 一个操作写两端；关联笔记选择器排除已关联项。
- 异常：对方文件缺失显示失效。
- 测试：ACC-AR-01；操作中断恢复测试（复用 W04.2 故障注入）。
- 完成：ACC-AR-01 通过。

## W09.4 关联任务

- 目标：档案详情列出关联任务并可新建关联任务。
- 依据：archives §3；ACC-AR-06。
- 前置：W09.3、W08.3。
- 位置：`plugins/archives/src/ui/ArchiveTasks.tsx`。
- 复用：W08.3 的 `TaskEditor`（经 tasks 插件 UI 导出的 `openTaskEditor(prefill)` 命令，避免直接导入内部组件）。
- 实现要点：`tasks.list` 按资源路径过滤；tasks 停用时隐藏分区。
- 异常：无。
- 测试：ACC-AR-06 E2E。
- 完成：ACC-AR-06 通过。
