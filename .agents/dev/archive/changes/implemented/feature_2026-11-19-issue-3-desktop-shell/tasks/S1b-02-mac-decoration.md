# S1b-02 在 macOS 保留系统红黄绿

平台层选择 hiddenInset/hidden 的实测配置，向标题内容提供可用区。生产外壳切换由 S4 整合。

**规格范围**　TB-01、TB-05、TB-06、TB-10。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S0-01 采集安装版窗口基线](S0-01-native-baseline.md)、[S1b-01 把真实窗口状态交给所属工作台](S1b-01-window-host.md)。只需 macOS 基线、当前窗口状态接口和对应实机。

**现有代码入口**　[main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [desktop/package.json](../../../../../../../apps/desktop/package.json) · [main/window-chrome.ts](../../../../../../../temp/sources/open-knowledge/packages/desktop/src/main/window-chrome.ts) · [packaged/packaged.spec.ts](../../../../../../../tests/e2e/packaged/packaged.spec.ts)。

**原型对照**　平台选 macOS，比较普通、失焦、原生全屏的左侧安全区。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#platform) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在 macOS 安装样例中试原生三键与拖动，分别按系统双击偏好测试最小化/缩放，进出全屏查看状态及实际控件矩形。
2. 长标题或切屏时点击红黄绿仍命中系统控件。记录系统截图及不符合承诺的组合。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
