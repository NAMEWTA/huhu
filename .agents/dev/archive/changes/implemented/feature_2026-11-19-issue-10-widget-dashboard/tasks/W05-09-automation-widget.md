# W05-09 从自动化摘要查看真实规则或运行

automations 插件拥有已启用规则或最近运行的只读摘要与模块入口。摘要不承担规则编辑、取消或调度。

**规格范围**　ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。复用现有自动化列表与运行查询，独立于 #5 后续实现。

**现有代码入口**　[ui/AutomationsModule.tsx](../../../../../../../plugins/automations/src/ui/AutomationsModule.tsx) · [home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　自动化摘要卡、空/受限状态及打开模块。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 创建测试规则与运行样本，从卡读取摘要并与 automations.list / automations.runs.list 对照，点击后能进入规则所属模块。
2. 权限不足或无运行记录时反馈对应原因。显示摘要不触发规则、改变已入队任务或写看板。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
