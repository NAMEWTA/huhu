# W05-07 按实例显示主机列表或指定主机

SSH 插件拥有 hostId 选择和卡体。用两份预置实例先验证数据独立，W03-02 承担目录添加流程。

**规格范围**　ACC-DASH-05、ACC-DASH-08、ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。复用 SshHomeWidget、ssh.hosts.list 及所选主机 ID 的可信配置契约。

**现有代码入口**　[ui/HomeWidget.tsx](../../../../../../../plugins/ssh/src/ui/HomeWidget.tsx) · [ssh/huhu-plugin.json](../../../../../../../plugins/ssh/huhu-plugin.json) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　SSH 卡分别选择两台主机、无主机及目标已删。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在隔离 Vault 准备 A/B 主机，挂载列表、A、B 三种配置并比较返回和显示。可从卡进入 SSH 模块，展示不发起连接。
2. 删除 A 后只有对应卡提示重选。权限撤销时停止查询。检查布局只存稳定 ID，主机配置和凭据无变更。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
