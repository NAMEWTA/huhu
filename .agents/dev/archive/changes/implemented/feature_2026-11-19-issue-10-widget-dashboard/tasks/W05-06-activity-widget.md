# W05-06 按模块浏览最近活动

系统活动卡保留最近活动时间、筛选与可阅读列表，使用用户设置的时区。查询仅影响自己的卡。

**规格范围**　ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。使用现有 health.events 查询与模块筛选。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　最近活动卡、筛选和无活动状态。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 产生两个模块的事件，切筛选后与 health.events 回读比对来源、时间和排序，取消筛选恢复完整可见集合。
2. 空事件、服务拒绝或查询失败时呈现局部状态。恢复查询后不出现重复历史，其他卡仍可操作。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
