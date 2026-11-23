# W04-04 仅用键盘完成布局编辑

可到达的等价输入或操作用于移动与缩放，焦点和读屏能指明目标、位置、尺寸。减少动效仍显示落点。

**规格范围**　ACC-DASH-13、ACC-DASH-15。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-02 为同一类型添加两张独立卡](W03-02-add-instance.md)、[W04-02 跨列跨行移动卡片并保留空位](W04-02-drag-grid.md)、[W04-03 按尺寸约束缩放卡片与内容](W04-03-resize-grid.md)。复用添加配置流程及移动/尺寸变换，保持同一个布局模型。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [shell/shell.css](../../../../../../../packages/workbench/src/shell/shell.css) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)。

**原型对照**　键盘开启目录、添加、配置、移动、改尺寸、保存，Escape 回到来源。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#toolbar) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 全程仅用键盘在桌面完成一轮，与同输入指针操作比较规范化几何。开减少动效和读屏核查焦点与通知。
2. 越界或取消时朗读拒绝或撤销原因，焦点仍可继续编辑。列表内常规键盘输入不被网格拦截。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
