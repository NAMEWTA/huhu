# W05-11 从指标概览核对四项业务数量

[验收报告](../evidences/W05-11-summary-widget.md)

系统摘要负责已有任务、笔记、待处理捕获、启用规则四项指标与导航。各业务卡独立取数。

**规格范围**　ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。已有 home.summary、四个业务入口及系统定义。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　四指标概览及对应模块入口，摘要加载失败。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在测试 Vault 各准备可区分的数量，对照 home.summary 及模块实际列表，逐项从指标进入正确模块。
2. 让仅摘要查询失败或有插件被停用。可用的独立业务卡仍显示，不能从不可用指标触发业务写入。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
