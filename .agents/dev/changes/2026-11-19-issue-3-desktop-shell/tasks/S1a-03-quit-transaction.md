# S1a-03 把关窗升级为一次可取消的应用退出

Main 归并在途 close/before-quit，按窗口和本次请求向已登记的页面询问是否可以离开。页面允许离开时，Main 继续文档落盘检查。页面要求留下、处理失败或结果未确认时，Main 保持窗口和 Engine 可用。本轮所有参与项都已处理后才允许退出。macOS 关最后窗后允许重新激活。

**规格范围**　TB-14、TB-15。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S1a-02 从关闭失败提示重试或取消](S1a-02-retry-close.md)。复用可重试、可取消且绑定窗口世代的关闭结果。

本片用测试参与者独立验收桌面契约。真实看板与原生关窗的联合验收归首页整合切片。

**现有代码入口**　[main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [preload/index.ts](../../../../../apps/desktop/src/preload/index.ts) · [state/flushers.ts](../../../../../packages/workbench/src/state/flushers.ts) · [home/FocusPauseOnClose.tsx](../../../../../packages/workbench/src/home/FocusPauseOnClose.tsx) · [packaged/packaged.spec.ts](../../../../../tests/e2e/packaged/packaged.spec.ts)。

**原型对照**　关闭窗口与退出应用的不同结果，在途关闭再点退出。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#menu) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在一个延迟保存的窗口连点 X 并请求退出，在测试宿主加入第二个未完成窗口，确认每窗最终结果、一次停止 Engine 与重开数据。
2. 取消其中一项后应用仍运行。再输入新内容并重新退出。迟到回执、已写成功的其他窗口和旧许可均不能掩盖新编辑。
3. 分别接入立即放行、延迟放行、要求留下及返回失败的测试参与者。放行后文档检查仍要执行。要求留下、失败或超时时，窗口和 Engine 保持可用。旧请求迟到的许可不能放行下一次关窗。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
