# W03-08 只移除选中的布局实例

[验收报告](../evidences/W03-08-remove-instance.md)

从编辑态移除一个实例和它的几何，显示影响范围。任务、主机等业务对象由所属插件保留。

**规格范围**　ACC-DASH-04、ACC-DASH-07。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。已有可编辑实例、编辑会话和保存入口。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts)。

**原型对照**　卡片动作→移除实例→取消或确认，再取消编辑或保存。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 让两张卡引用同一业务对象，在测试板上只移除其中一张并保存。重开对照实例集合、几何键、业务文件摘要和模块中的对象。
2. 在动作确认处取消，或确认移除后取消整次编辑，两条路径均恢复原实例。最后一张被显式移除并成功保存后重开是合法空板。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
