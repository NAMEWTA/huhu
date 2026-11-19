# S3-01 用平台入口打开 HUHU 菜单

Main 安装平台菜单模板，复用系统角色、关于、退出与 HUHU 帮助。Windows/Linux 按钮与 Alt/F10 唤起同一菜单。

**规格范围**　TB-03、TB-06、TB-12、TB-17。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S2-01 工作台共用一条可交互标题栏](S2-01-workbench-bar.md)、[S1a-03 把关窗升级为一次可取消的应用退出](S1a-03-quit-transaction.md)。Windows/Linux 的菜单入口需要标题栏的按钮锚点，菜单退出动作消费 Main 交付的统一退出流程。

**现有代码入口**　[main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [preload/index.ts](../../../../../apps/desktop/src/preload/index.ts) · [main/menu.ts](../../../../../temp/sources/open-knowledge/packages/desktop/src/main/menu.ts) · [shell/AppShell.tsx](../../../../../packages/workbench/src/shell/AppShell.tsx) · [settings/AboutPage.tsx](../../../../../packages/workbench/src/settings/AboutPage.tsx) · [src/shortcuts.ts](../../../../../packages/workbench/src/shortcuts.ts)。

**原型对照**　macOS 系统菜单或 Windows/Linux 菜单按钮，键盘展开与关闭。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#menu) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在打包应用看版本与关于，验证帮助目标、macOS 服务/隐藏/退出角色，Windows/Linux 用 Alt/F10 与方向键导航、Escape 返回原入口。
2. 无 Vault 或 Engine 断开时只执行可用项，安装版无模板重载/开发项。在 Windows 标题空区打开系统菜单不触发产品菜单。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
