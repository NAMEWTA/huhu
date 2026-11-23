# S2-03 让标题控制区跟随主题和可用宽度

外观变更使用统一高度、颜色与原生控制区矩形。次要标题可省略，长名与版本不侵占系统控件。

**规格范围**　TB-04、TB-05。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S2-01 工作台共用一条可交互标题栏](S2-01-workbench-bar.md)。需要共享标题槽位。各平台真实几何到位后分别完成实测。窄窗入口展示顺序待用户确认。

**现有代码入口**　[shell/AppShell.tsx](../../../../../../../packages/workbench/src/shell/AppShell.tsx) · [shell/shell.css](../../../../../../../packages/workbench/src/shell/shell.css) · [src/theme.ts](../../../../../../../packages/ui/src/theme.ts) · [main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [settings/host.ts](../../../../../../../packages/workbench/src/settings/host.ts) · [settings/AboutPage.tsx](../../../../../../../packages/workbench/src/settings/AboutPage.tsx)。

**原型对照**　四主题、明暗/跟随系统、长中文和 emoji 名、窄窗搜索两种放置方式。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#compact-choice) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 从冷启动到换 Vault，再切四主题×浅深及系统模式，在最小 960×600 和大窗记录首帧及原生区域。长名下检查搜索、菜单、控件可操作。
2. 改变 DPI、显示器和字体，比较系统按钮与点击位置。可用区暂缺时仍保守留白。窄窗实际布局取已确认版本。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
