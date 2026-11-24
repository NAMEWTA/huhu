# W03-07 配置已有实例并保留身份

[验收报告](../evidences/W03-07-configure-instance.md)

从已保存卡的动作入口更改标题或配置。插件校验业务引用，看板只提交该实例的新配置。

**规格范围**　ACC-DASH-05、ACC-DASH-06。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-02 为同一类型添加两张独立卡](W03-02-add-instance.md)。使用多实例类型、配置表单和新增实例入口。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [ui/HomeWidget.tsx](../../../../../../../plugins/ssh/src/ui/HomeWidget.tsx) · [src/home.ts](../../../../../../../packages/contracts/src/home.ts)。

**原型对照**　两张独立 SSH 卡，配置其中一张，选择新主机并改名。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 选中已存卡 A，改名并改为主机 B，保存后重开。原 instanceId 和格位保留，其他卡的配置与显示仍一致。
2. 目标已失效或配置未通过校验时留下修复入口。取消编辑后回读，已提交板和主机配置均无变化。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
