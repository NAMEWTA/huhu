# W03-01 从目录查找可用的小组件类型

目录显示归属、能力、尺寸预览、说明和单例/多实例条件，支持搜索与系统/插件筛选。注册约定由本片拥有，业务卡各自维护清单。

**规格范围**　ACC-DASH-05、ACC-DASH-17。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。复用现有 registry、manifest 和启停快照。可先用一项已存在的 SSH 定义从目录走通。

**现有代码入口**　[src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [src/plugin-manifest.ts](../../../../../../../packages/contracts/src/plugin-manifest.ts) · [ssh/huhu-plugin.json](../../../../../../../plugins/ssh/huhu-plugin.json) · [versioning/huhu-plugin.json](../../../../../../../plugins/versioning/huhu-plugin.json) · [tasks/huhu-plugin.json](../../../../../../../plugins/tasks/huhu-plugin.json) · [inbox/huhu-plugin.json](../../../../../../../plugins/inbox/huhu-plugin.json) · [ui/HomeWidget.tsx](../../../../../../../plugins/ssh/src/ui/HomeWidget.tsx)。

**原型对照**　添加小组件抽屉。分类、搜索、无结果、不可用和单例说明。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#drawer) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 对启用与获权的真实内置类型作搜索和分类。比较 manifest、可信引擎描述与 UI 快照，确认显示集合吻合。
2. 在测试清单制造漏项、多报、重名并改变权限，检查检测能指出差异。停用、无权或外部任意组件不可添加，空搜索结果有恢复入口。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
