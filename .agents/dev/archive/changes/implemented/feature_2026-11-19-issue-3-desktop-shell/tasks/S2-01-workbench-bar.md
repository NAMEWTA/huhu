# S2-01 工作台共用一条可交互标题栏

工作台拥有唯一标题内容和可用导航。共享 Web 只显示应用操作。模块标签、文档标签、预览和编辑区各处理自己的输入。

**规格范围**　TB-02、TB-03、TB-09、TB-16。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S1b-01 把真实窗口状态交给所属工作台](S1b-01-window-host.md)。依托窗口状态和可用标题矩形。可用桌面整合样例先验证，再与各平台装饰汇合。

**现有代码入口**　[shell/AppShell.tsx](../../../../../../../packages/workbench/src/shell/AppShell.tsx) · [shell/BrandMark.tsx](../../../../../../../packages/workbench/src/shell/BrandMark.tsx) · [shell/VaultMenu.tsx](../../../../../../../packages/workbench/src/shell/VaultMenu.tsx) · [renderer/main.tsx](../../../../../../../apps/desktop/src/renderer/main.tsx) · [shell/shell.css](../../../../../../../packages/workbench/src/shell/shell.css) · [command-palette/CommandPalette.tsx](../../../../../../../packages/workbench/src/command-palette/CommandPalette.tsx) · [settings/host.ts](../../../../../../../packages/workbench/src/settings/host.ts)。

**原型对照**　工作台首页/知识库、Vault 菜单、命令面板、拖动空白区。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#workspace) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 切模块、从搜索唤起面板、切 Vault，核对顶部各入口仅一处，任务切换器标题仅含 HUHU 与可公开的显示名。
2. 在 Electron 选预览文字、拖标签、点弹层。只有顶部空白带移动整窗。无桌面 Host 时仍能导航，无系统按钮。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
