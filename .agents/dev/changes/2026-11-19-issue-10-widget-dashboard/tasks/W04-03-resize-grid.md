# W04-03 按尺寸约束缩放卡片与内容

编辑宽高时显示合法占位，内容按卡片容器调整。单卡恢复推荐尺寸也只改草稿。

**规格范围**　ACC-DASH-03、ACC-DASH-04、ACC-DASH-14。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W01-01 用同一布局样本比较网格实现](W01-01-grid-comparison.md)、[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。需要同一布局库、定义给出的 min/max/推荐尺寸和草稿。

**现有代码入口**　[src/home](../../../../../packages/workbench/src/home) · [shell/shell.css](../../../../../packages/workbench/src/shell/shell.css) · [board/layout](../../../../../temp/sources/homarr/apps/nextjs/src/components/board/layout) · [src/contributions.ts](../../../../../packages/workbench/src/contributions.ts)。

**原型对照**　缩放把手、卡片尺寸控件、推荐尺寸和边界。比较相邻两种大小的正文。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 同屏把同类卡调为不同尺寸，核对内容布局各自适配。保存重开读回 w/h。恢复推荐尺寸再取消，原尺寸不变。
2. 越最小/最大、画布边缘或产生非法放置时回到最近合法草稿并说明。以不同缩放检验显示与命中一致。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
