# S0-01 采集安装版窗口基线

记录现有装饰、按钮区域、系统菜单和启动路径，作为各平台调整前的对照。平台覆盖承诺单列，见设计待决项。

**规格范围**　TB-01、TB-02、TB-06、TB-07、TB-08。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。需要相应系统、桌面会话和可识别版本的安装包。各平台可分别采集。

**现有代码入口**　[desktop/package.json](../../../../../apps/desktop/package.json) · [main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [main/window-chrome.ts](../../../../../temp/sources/open-knowledge/packages/desktop/src/main/window-chrome.ts) · [main/menu.ts](../../../../../temp/sources/open-knowledge/packages/desktop/src/main/menu.ts) · [packaged/packaged.spec.ts](../../../../../tests/e2e/packaged/packaged.spec.ts)。

**原型对照**　演练设置的三平台。首次启动与工作台。此项使用模拟画面定位要比较的状态。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#platform) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 从实际安装图标分别启动空配置及测试 Vault，记录系统、桌面会话、应用和 Electron/Chromium 版本、缩放、控件边界与整窗截图。
2. 某平台缺机或仅有 XWayland 时逐格标未测。记录缺哪个系统、哪项动作，已有平台可继续。

保存相应基线或走查记录，注明实际环境与覆盖状态。
