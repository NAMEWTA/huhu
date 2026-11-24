# W02-03 核实并发或失联保存结果

[验收报告](../evidences/W02-03-concurrent-save.md)

在写锁内比对 baseRevision。同一保存请求复用在途结果/幂等键。回执丢失先重读确认结果，更新过的板须暴露冲突。

**规格范围**　ACC-DASH-10、ACC-DASH-11、ACC-DASH-16。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W02-02 原子提交一份完整新布局](W02-02-commit-board.md)。需要版本化原子提交及回读接口。

**现有代码入口**　[capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts) · [src/dispatcher.ts](../../../../../../../packages/kernel/src/dispatcher.ts) · [src/idempotency.ts](../../../../../../../packages/kernel/src/idempotency.ts) · [engine-client/client.ts](../../../../../../../packages/workbench/src/engine-client/client.ts) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts) · [test/engine.test.ts](../../../../../../../apps/engine/test/engine.test.ts)。

**原型对照**　保存中、版本冲突、失败后核对再试。此项负责 Engine 和客户端事实。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#save-fault) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 两个调用者读同一 revision 后提交不同布局，核对恰一份成功、另一份冲突。同一输入连点不增加实例或重复提交。
2. 分别在替换前、替换后且未收到回包时断连。恢复后比较 revision 及规范化布局，区分未提交、已提交、其后又变更。核对重试不覆盖他人写入。

用临时 Vault 记录调用结果、revision 与操作前后文件摘要。这些都是实施时需要取得的证据。
