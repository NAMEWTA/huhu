# W04-01 编辑并保存或取消同一份草稿

在整合工作区打开编辑会话，改标题等动作只修改草稿。保存成功采用权威返回，取消恢复进入编辑时的状态。只读可浏览。

**规格范围**　ACC-DASH-01、ACC-DASH-04、ACC-DASH-11。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W02-02 原子提交一份完整新布局](W02-02-commit-board.md)、[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。依赖整板读写与可信定义。用现有 SSH 卡和当前格式样本可先走最小编辑闭环。

**现有代码入口**　[home/HomeModule.tsx](../../../../../packages/workbench/src/home/HomeModule.tsx) · [src/home](../../../../../packages/workbench/src/home) · [capabilities/home.ts](../../../../../packages/kernel/src/capabilities/home.ts) · [engine-client/react.tsx](../../../../../packages/workbench/src/engine-client/react.tsx) · [engine-client/query.ts](../../../../../packages/workbench/src/engine-client/query.ts)。

**原型对照**　基础草稿用可编辑标题演示。SSH 等插件参数表单由 W03-07 负责。编辑布局→改卡片标题→取消。重复操作再保存。只读对照。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#layout-actions) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在新格式板中改名后取消，核对 UI、身份和文件摘要。再次改名并保存，退出重开看到新标题，revision 只增一次。
2. 在保存前后测试拒写/磁盘满，显示失败并保留草稿，成功前不离开。只读不能进入可提交编辑。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
