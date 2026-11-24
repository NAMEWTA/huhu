# W04-06 保存冲突后对照已提交布局

[验收报告](../evidences/W04-06-save-conflict.md)

显式保存只发一次有效提交。外部更新和请求失败保留本地草稿，展示可辨识的最新板及重做/重新保存入口。

**规格范围**　ACC-DASH-04、ACC-DASH-10、ACC-DASH-11、ACC-DASH-16。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W02-03 核实并发或失联保存结果](W02-03-concurrent-save.md)、[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)。使用版本冲突/失联事实与编辑草稿。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [engine-client/client.ts](../../../../../../../packages/workbench/src/engine-client/client.ts) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts)。

**原型对照**　在编辑中触发外部修改、保存冲突或写入失败，核对后重试。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#save-fault) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 两个会话编辑同一板，A 先保存，B 保存见冲突并保留草稿。对照 A 的最新内容后重新应用并保存，重开可核实。
2. 断开回执后恢复连接，分别核对已提交和被继续修改两种结果，不盲目覆盖。多次点击保存无额外 ID，错误提示不会伪装成已保存。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
