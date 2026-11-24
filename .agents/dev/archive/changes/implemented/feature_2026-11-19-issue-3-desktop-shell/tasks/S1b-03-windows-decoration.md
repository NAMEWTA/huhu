# S1b-03 在 Windows 保留贴靠与窗口菜单

[验收报告](../evidences/S1b-03-windows-decoration.md)

平台层保留 caption buttons、边框与系统菜单，为内容发布可用矩形。

**规格范围**　TB-01、TB-05、TB-07。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S0-01 采集安装版窗口基线](S0-01-native-baseline.md)、[S1b-01 把真实窗口状态交给所属工作台](S1b-01-window-host.md)。只需 Windows 基线、窗口状态接口，Snap 需支持该功能的 Win11。

**现有代码入口**　[main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [desktop/package.json](../../../../../../../apps/desktop/package.json) · [main/window-chrome.ts](../../../../../../../temp/sources/open-knowledge/packages/desktop/src/main/window-chrome.ts) · [packaged/packaged.spec.ts](../../../../../../../tests/e2e/packaged/packaged.spec.ts)。

**原型对照**　平台选 Windows，普通与最大化状态，右侧原生按钮预留。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#platform) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在安装样例逐项验证最小化、最大化还原、拖动、边缘缩放、Alt+F4、系统菜单。在 Win11 悬停最大化键触发 Snap。
2. 在不同 DPI 显示器间移动并重复命中。系统菜单和产品菜单各自只弹一次。记录屏幕、缩放和命中位置。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
