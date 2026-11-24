# S3-03 从菜单执行 Vault 和视图操作

[验收报告](../evidences/S3-03-workbench-commands.md)

Vault 切换和文档脏检查、侧栏、专注、搜索等由原所有者执行。关闭标签、窗口及退出应用分别路由。

**规格范围**　TB-12、TB-13、TB-17。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S3-01 用平台入口打开 HUHU 菜单](S3-01-product-menu.md)。需要原生菜单可分发稳定命令 ID。当前 VaultSwitchDialog 与 UiState 已存在。

**现有代码入口**　[shell/VaultSwitchDialog.tsx](../../../../../../../packages/workbench/src/shell/VaultSwitchDialog.tsx) · [shell/VaultMenu.tsx](../../../../../../../packages/workbench/src/shell/VaultMenu.tsx) · [state/ui-store.ts](../../../../../../../packages/workbench/src/state/ui-store.ts) · [command-palette/CommandPalette.tsx](../../../../../../../packages/workbench/src/command-palette/CommandPalette.tsx) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [renderer/main.tsx](../../../../../../../apps/desktop/src/renderer/main.tsx)。

**原型对照**　文件/视图菜单，切 Vault、只读和 Engine 断开场景，关闭标签对比关窗。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#menu) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在测试 Vault 中从菜单切换，核对脏笔记处理。菜单与面板切同一视图只变更一次，关闭标签保留窗口。
2. 打开菜单后切换插件启用状态、切换 Vault 或取消脏检查，失效动作不执行。原 Vault 和焦点保留。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
