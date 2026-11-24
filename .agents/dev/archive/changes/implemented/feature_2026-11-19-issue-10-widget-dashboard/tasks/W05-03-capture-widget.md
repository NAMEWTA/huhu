# W05-03 从待处理捕获卡回到收件箱

[验收报告](../evidences/W05-03-capture-widget.md)

inbox 插件拥有待处理列表、数量和收件箱入口。卡片读取本 Vault 的数据。

**规格范围**　ACC-DASH-09、ACC-DASH-13、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。依赖可信定义和已有 inbox.list 能力。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [ui/InboxModule.tsx](../../../../../../../plugins/inbox/src/ui/InboxModule.tsx) · [inbox/huhu-plugin.json](../../../../../../../plugins/inbox/huhu-plugin.json) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　待处理捕获卡、空列表和模块入口。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 准备已处理与待处理捕获，核对只出现待处理项及正确计数。跳到收件箱处理后返回，卡片随业务刷新。
2. 读失败、无权或空列表时显示对应状态，保留其他卡。滚动或选中文字不导航，不改布局。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
