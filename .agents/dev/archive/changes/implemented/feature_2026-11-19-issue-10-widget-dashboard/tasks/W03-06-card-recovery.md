# W03-06 在单卡内修复错误并重试

Frame 按实例隔离加载、无数据、权限受限、查询失败、渲染异常及配置待修复。各卡通过所属能力取数。

**规格范围**　ACC-DASH-09、ACC-DASH-13。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。需要受控组件、实例配置与可独立加载的卡框。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [engine-client/react.tsx](../../../../../../../packages/workbench/src/engine-client/react.tsx) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)。

**原型对照**　查询失败→重试，配置失效→修复。相邻卡仍可操作。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#ssh-state) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在同一测试板让 A 的查询失败，B 可浏览。只重试 A，服务恢复后成功。再让 A 渲染抛错，错误界限仍保住 B。
2. 无权时不继续请求。空数据提供实际入口。已知类型升级使 A 配置失效时可保留其他编辑，修复 A 后恢复。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
