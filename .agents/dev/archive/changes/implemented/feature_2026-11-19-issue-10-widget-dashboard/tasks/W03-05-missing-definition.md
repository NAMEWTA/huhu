# W03-05 停用或缺失插件后找回原卡

查看态卸载停用卡，编辑态保留可识别占位。缺定义/移除插件时保留原 ID、配置和格位。重新启用再绑定。

**规格范围**　ACC-DASH-08、ACC-DASH-09、ACC-DASH-17。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。需要持久实例与可用定义集合，采用当前已存在的 SSH/Git 贡献。

**现有代码入口**　[src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [src/home](../../../../../../../packages/workbench/src/home) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts) · [ui/HomeWidget.tsx](../../../../../../../plugins/ssh/src/ui/HomeWidget.tsx) · [ui/HomeWidget.tsx](../../../../../../../plugins/versioning/src/ui/HomeWidget.tsx)。

**原型对照**　停用 SSH 或模拟缺失，比较查看/编辑态。重新启用。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#ssh-state) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 保存一张有参数的卡，停用后记录查询/订阅停止。在编辑态定位占位，重新启用回读同一 ID、配置和位置。
2. 在缺失期间编辑另一张并保存，未知记录只能原样携带。新增未知类型、改写未知配置均被拒。重复启停无重复注册。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
