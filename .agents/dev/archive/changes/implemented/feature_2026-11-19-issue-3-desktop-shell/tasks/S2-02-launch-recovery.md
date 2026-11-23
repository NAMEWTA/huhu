# S2-02 在启动与错误页仍可移动和关窗

Root 覆盖无 Vault、打开/切换中、Engine 启动或断开。主框架加载失败由 Main 的最小错误页接住，预览失败局限于子框架。

**规格范围**　TB-01、TB-11。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S2-01 工作台共用一条可交互标题栏](S2-01-workbench-bar.md)。复用同一标题内容槽位，错误页可直接使用宿主装饰。

**现有代码入口**　[renderer/main.tsx](../../../../../../../apps/desktop/src/renderer/main.tsx) · [launch/LaunchPage.tsx](../../../../../../../packages/workbench/src/launch/LaunchPage.tsx) · [main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [main/preview-session.ts](../../../../../../../apps/desktop/src/main/preview-session.ts)。

**原型对照**　首次打开、启动中、Engine 离线、Renderer 加载失败及重试。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#scene) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 以空配置启动，打开测试 Vault 并观察过渡。在 Engine 掉线后用恢复入口重新进入，每一阶段有移动和关闭路径。
2. 单独制造主页面与预览子页面的加载错误。前者可用安全错误页及系统按钮，后者只影响预览。核对主 Shell 仍在。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
