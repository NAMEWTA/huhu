# S1a-01 关窗前保存最后一次文档输入

把排空防抖、文件写入、可恢复草稿及未确认结果送回发起关窗的窗口。仅成功处理的窗口可放行。保留全局专注暂停。

**规格范围**　TB-14、TB-15。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。可从旧窗口的 X 和当前 notes 会话进入，无需先改标题栏。

**现有代码入口**　[main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [preload/index.ts](../../../../../../../apps/desktop/src/preload/index.ts) · [renderer/main.tsx](../../../../../../../apps/desktop/src/renderer/main.tsx) · [renderer/env.d.ts](../../../../../../../apps/desktop/src/renderer/env.d.ts) · [state/flushers.ts](../../../../../../../packages/workbench/src/state/flushers.ts) · [documents/DocumentSession.ts](../../../../../../../plugins/notes/src/ui/documents/DocumentSession.ts) · [documents/useDocumentSession.ts](../../../../../../../plugins/notes/src/ui/documents/useDocumentSession.ts) · [home/FocusPauseOnClose.tsx](../../../../../../../packages/workbench/src/home/FocusPauseOnClose.tsx)。

**原型对照**　笔记编辑，切自动／手动保存，最后一笔后关窗。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#policy) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 自动模式输入未过防抖的唯一文字，立即点 X，重开读正文。手动模式重开能恢复草稿，并能区分正文与草稿。
2. 构造写失败或冲突，核对主进程得到失败或真实草稿结果，窗口留存。一个 flusher 失败不掩盖其他结果。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
