# S1b-01 把真实窗口状态交给所属工作台

新增窄窗口桥，仅可信顶层页面能读取本窗状态、订阅变化或提交有限外观。共享组件用可选宿主，preload、Renderer 声明、workbench Host 类型和测试替身由本片同步更新。

**规格范围**　TB-10、TB-16、TB-18。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。现有 BrowserWindow、preload 与 Root 足以验证初态、订阅与解绑。

**现有代码入口**　[main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [preload/index.ts](../../../../../apps/desktop/src/preload/index.ts) · [renderer/env.d.ts](../../../../../apps/desktop/src/renderer/env.d.ts) · [settings/host.ts](../../../../../packages/workbench/src/settings/host.ts) · [renderer/main.tsx](../../../../../apps/desktop/src/renderer/main.tsx) · [main/preview-session.ts](../../../../../apps/desktop/src/main/preview-session.ts)。

**原型对照**　失焦/恢复、最大化/还原，全屏状态。模拟只确认标记和占位。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#scene) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在 Electron 主窗口改变窗口状态，读初始快照与后续事件，反复重挂载后单次变化只通知一次。无 Host 的工作台能打开命令面板。
2. 使用项目宿主边界的既有测试入口验证隔离、无效参数和已销毁窗口返回拒绝。HTML 文件预览、错误页面没有窗口能力。运行根目录 pnpm typecheck 及宿主测试替身的既有用例，检查所有当前调用方已改用新接口。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
