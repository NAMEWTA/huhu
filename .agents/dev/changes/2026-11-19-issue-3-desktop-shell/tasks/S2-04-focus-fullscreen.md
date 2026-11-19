# S2-04 专注或失焦后仍可操作窗口

专注仅隐藏业务导航。非系统全屏保留移动、最小化与关闭。系统全屏状态变化由宿主驱动。

**规格范围**　TB-09、TB-10、TB-12。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S2-01 工作台共用一条可交互标题栏](S2-01-workbench-bar.md)。复用工作台标题及窗口状态事件。

**现有代码入口**　[shell/AppShell.tsx](../../../../../packages/workbench/src/shell/AppShell.tsx) · [shell/shell.css](../../../../../packages/workbench/src/shell/shell.css) · [state/ui-store.ts](../../../../../packages/workbench/src/state/ui-store.ts) · [main/index.ts](../../../../../apps/desktop/src/main/index.ts)。

**原型对照**　工作台打开专注、全屏、失焦、恢复，再回到普通窗口。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#workspace) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 非全屏专注时移动、最小化并恢复。进入／退出系统全屏后核对按钮名称、焦点、留白与真实状态一致。
2. 在系统把焦点交给另一个应用、恢复或快速连续切换时，不能留下两排控件或抓住文档选区。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
