# W04-07 带改动离开时可保存、放弃或继续编辑

看板拥有草稿与离场选择。无改动、保存成功或用户明确放弃时，向调用方返回允许离开。继续编辑、保存失败或冲突时返回留在原处，保留草稿。桌面随后负责文档与其余退出参与者的检查。

**规格范围**　ACC-DASH-04、ACC-DASH-10、ACC-DASH-11。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 的编辑草稿与保存结果](W04-01-board-draft.md)、[S1a-03 的桌面退出契约](../../2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md)。工作台在编辑会话挂载时接入该契约，模块导航和桌面关闭请求共用同一个看板离场处理。

**现有代码入口**　[src/home](../../../../../packages/workbench/src/home) · [shell/AppShell.tsx](../../../../../packages/workbench/src/shell/AppShell.tsx) · [shell/VaultSwitchDialog.tsx](../../../../../packages/workbench/src/shell/VaultSwitchDialog.tsx) · [main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [state/flushers.ts](../../../../../packages/workbench/src/state/flushers.ts)。

**原型对照**　从有改动的编辑态切模块或关窗。分别选保存、放弃、继续编辑。再模拟保存失败。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#dialog) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在真实模块导航中触发离场，再用符合桌面契约的测试调用方发起关闭请求。分别核对三种选择及返回结果。保存成功才放行，放弃不更改已存布局，继续编辑保留草稿及焦点。干净状态直接放行。
2. 注入写失败或版本冲突再选保存，核对调用方收到留在原处的结果，已提交布局未变，草稿可重试。保存未完成时再次请求离开，仍只出现一份选择和一次有效提交。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
