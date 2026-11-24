# S1b-04 在 Linux 的目标桌面操作窗口

[验收报告](../evidences/S1b-04-linux-decoration.md)

Linux 平台层先测原生装饰，实测失败才为受影响桌面评估适配。每个环境只展示一组按钮。

**规格范围**　TB-01、TB-08、TB-10。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S0-01 采集安装版窗口基线](S0-01-native-baseline.md)、[S1b-01 把真实窗口状态交给所属工作台](S1b-01-window-host.md)。按已取得的 Linux 会话分别开工。发布支持清单由用户圈定。

**现有代码入口**　[main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [desktop/package.json](../../../../../../../apps/desktop/package.json) · [main/window-chrome.ts](../../../../../../../temp/sources/open-knowledge/packages/desktop/src/main/window-chrome.ts) · [packaged/packaged.spec.ts](../../../../../../../tests/e2e/packaged/packaged.spec.ts)。

**原型对照**　平台选 Linux，普通、最大化、全屏和关闭。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#platform) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在承诺的 X11、原生 Wayland 会话分别启动安装样例，记录发行版、DE、合成器与缩放，逐一实测拖动、缩放、最大化、全屏和键盘关闭。
2. 出现控制区失效时保留该组合的样本。错误页仍能退出。未取得的会话保持未测，不能借用另一会话结论。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
