# W04-02 跨列跨行移动卡片并保留空位

网格只在编辑把手接收移动。预览吸附、碰撞让位，落定改变同一草稿。查看态保留业务控件的输入。

**规格范围**　ACC-DASH-02、ACC-DASH-13、ACC-DASH-16。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W01-01 用同一布局样本比较网格实现](W01-01-grid-comparison.md)、[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。依赖选定的布局库和事务草稿。可用预置多卡板验证。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [shell/shell.css](../../../../../../../packages/workbench/src/shell/shell.css) · [board/layout](../../../../../../../temp/sources/homarr/apps/nextjs/src/components/board/layout)。

**原型对照**　编辑态跨列/跨行拖动及边缘落点。查看态选文字与滚动列表。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 移动卡片经过其他卡并拖到更下方，保存重开，比较预览、格坐标、空位与阅读顺序。多次相同操作无叠卡。
2. 拖出画布取消落点或按取消，恢复最后有效草稿/原板。在查看态选文字、点输入框、滚动，布局文件和坐标不变。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
