# S1a-02 从关闭失败提示重试或取消

由 Main 管理故障对话框、请求世代与一次性放行。只在用户明确放弃后允许未落盘内容退出。

**规格范围**　TB-14、TB-15。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S1a-01 关窗前保存最后一次文档输入](S1a-01-flush-document.md)。使用每窗口的可核实结果及可阻止关闭的入口。

**现有代码入口**　[main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [preload/index.ts](../../../../../apps/desktop/src/preload/index.ts) · [renderer/main.tsx](../../../../../apps/desktop/src/renderer/main.tsx) · [state/flushers.ts](../../../../../packages/workbench/src/state/flushers.ts) · [documents/DocumentSession.ts](../../../../../plugins/notes/src/ui/documents/DocumentSession.ts)。

**原型对照**　关闭故障选择器。写入失败、超时或 Renderer 失联，分别重试、取消、放弃。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#fault) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 令测试写入失败，再恢复写入并点重试，重开读回最后的输入。另一次点取消后可接着编辑。
2. 隔离测试 Vault 内分别模拟超时、Renderer 崩溃、迟到及重复回执。保留窗口或宿主提示。仅明确放弃才结束，复发故障不被旧回执放行。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
