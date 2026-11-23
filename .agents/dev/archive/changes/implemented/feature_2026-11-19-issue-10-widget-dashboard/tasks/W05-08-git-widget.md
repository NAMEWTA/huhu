# W05-08 从版本卡查看当前 Vault 的 Git 状态

versioning 插件拥有分支/改动数和导航。仅查询现有 Git 状态。

**规格范围**　ACC-DASH-08、ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-05 停用或缺失插件后找回原卡](W03-05-missing-definition.md)。复用 VersioningHomeWidget 与 git.status。

**现有代码入口**　[ui/HomeWidget.tsx](../../../../../../../plugins/versioning/src/ui/HomeWidget.tsx) · [versioning/huhu-plugin.json](../../../../../../../plugins/versioning/huhu-plugin.json) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　版本与同步卡、非仓库、无 Git 和停用场景。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在独立测试仓库制造一处变更，比较卡片分支/计数与 git.status。点击入口到版本模块，切换 Vault 不复用旧仓库结果。
2. 分别使用非仓库与无 Git 环境显示原因，停用不再执行查询，重新启用恢复卡位。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
