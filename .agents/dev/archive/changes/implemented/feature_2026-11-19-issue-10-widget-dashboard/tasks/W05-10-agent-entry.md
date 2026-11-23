# W05-10 从看板进入 Agent CLI

Agent CLI 插件拥有已有快捷入口。仅在真实可查询时显示状态，不将完整终端嵌入卡片。

**规格范围**　ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。使用已注册 Agent CLI 模块。无须等待 #4 新工作区。

**现有代码入口**　[ui/AgentCliModule.tsx](../../../../../../../plugins/agent-cli/src/ui/AgentCliModule.tsx) · [home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　Agent CLI 快捷入口，比较启用与不可用状态。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 启用插件点卡片的明确入口，核对到实际 Agent CLI 模块。若展示状态则与模块可用信息核对。
2. 停用或没有受权能力时不得启动进程、暴露假状态。返回首页仍可继续使用其他卡。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
