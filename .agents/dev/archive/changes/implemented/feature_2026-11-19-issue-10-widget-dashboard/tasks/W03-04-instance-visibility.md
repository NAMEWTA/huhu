# W03-04 隐藏并找回布局实例

隐藏使实例退出查看态。编辑中能找到它并恢复显示，始终保留同一实例、配置与位置。

**规格范围**　ACC-DASH-04、ACC-DASH-07。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。已有可编辑实例、编辑会话和保存入口。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts)。

**原型对照**　卡片动作→隐藏→在编辑态找回→恢复显示。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 隐藏并保存后查看态不显示。编辑中找回后核对同一 ID/配置。重新显示后重开，原位置与业务入口均可用。
2. 隐藏时取消整次编辑，比较实例及几何仍与原板一致。隐藏单例后不能从目录再加第二张，仍可找回原卡。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
