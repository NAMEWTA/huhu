# W05-05 独立显示习惯并保留打卡记录

将习惯作为系统卡呈现，可独立于专注卡显隐。打卡与布局各有持久化所有者。

**规格范围**　ACC-DASH-07、ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-04 隐藏并找回布局实例](W03-04-instance-visibility.md)。复用现有习惯能力与 HabitsCard。

**现有代码入口**　[home/HabitsCard.tsx](../../../../../packages/workbench/src/home/HabitsCard.tsx) · [home/HomeModule.tsx](../../../../../packages/workbench/src/home/HomeModule.tsx) · [capabilities/home.ts](../../../../../packages/kernel/src/capabilities/home.ts) · [src/contributions.ts](../../../../../packages/workbench/src/contributions.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　习惯卡打卡、隐藏/恢复。专注卡并列显示。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 打卡后核对真实习惯记录，隐藏卡再显示仍可读取。隐藏同板其他卡后习惯依旧可用。
2. 在只读 Vault 或打卡拒写时保留原记录。仅提交/取消布局草稿，比较习惯文件摘要，已记录的打卡无变化。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
