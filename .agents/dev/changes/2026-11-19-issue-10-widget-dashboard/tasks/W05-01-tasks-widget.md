# W05-01 在两张任务卡按各自筛选完成任务

tasks 插件拥有我的/今日筛选、时区计数和行内完成。写入走 tasks.setStatus 与 expectedVersion，布局只保存实例筛选。

**规格范围**　ACC-DASH-05、ACC-DASH-06、ACC-DASH-13、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。使用已扩展的定义契约，可在整合工作区以两张预置卡挂载，不等待画布手势。

**现有代码入口**　[home/HomeModule.tsx](../../../../../packages/workbench/src/home/HomeModule.tsx) · [ui/TasksModule.tsx](../../../../../plugins/tasks/src/ui/TasksModule.tsx) · [tasks/huhu-plugin.json](../../../../../plugins/tasks/huhu-plugin.json) · [src/contributions.ts](../../../../../packages/workbench/src/contributions.ts) · [engine-client/query.ts](../../../../../packages/workbench/src/engine-client/query.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　工作台两张任务卡分别选择筛选，查看态勾选其中一项。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在测试 Vault 准备跨当地午夜的任务，用设置时区核对今日数量。勾选一项后回任务模块读状态，另一筛选按实际数据刷新，布局文件不变。
2. 让任务先在模块被修改再点卡上复选框，验证冲突与重读。只读或权限撤销时禁止写，选择文字和滚动不引起卡片移动。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
