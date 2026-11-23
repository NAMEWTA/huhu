# W03-03 复制卡片并单独修改配置

复制得到新身份与独立可编辑配置。调用已有配置入口更改副本，不让原实例共享可变参数。

**规格范围**　ACC-DASH-05、ACC-DASH-06。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-07 配置已有实例并保留身份](W03-07-configure-instance.md)。使用多实例类型、配置表单和新增实例入口。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [ui/HomeWidget.tsx](../../../../../../../plugins/ssh/src/ui/HomeWidget.tsx) · [src/home.ts](../../../../../../../packages/contracts/src/home.ts)。

**原型对照**　卡片动作→复制→改副本标题/目标，切回原卡核对。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 复制 A 卡，改副本指向 B，保存重开比较两份 ID、标题、配置及显示目标。直接配置原卡时仅它变更。
2. 副本配置校验失败应留在编辑状态。取消后原板不变。单例不允许复制出第二份。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
