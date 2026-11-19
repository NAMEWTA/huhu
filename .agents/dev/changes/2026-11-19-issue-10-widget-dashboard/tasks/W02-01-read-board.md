# W02-01 读取新格式布局并区分首次与空板

由 Engine 为同一 Vault 读出实例、几何、revision 与可写性。缺文件返回内存默认。合法空板仍为空。只读从原 Vault 取板。

**规格范围**　ACC-DASH-01、ACC-DASH-10、ACC-DASH-11、ACC-DASH-12。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。现有 HomeStore、Vault、Dispatcher 可用。首屏种子组合的最终内容另由 W05-12 确认。

**现有代码入口**　[src/home.ts](../../../../../packages/contracts/src/home.ts) · [capabilities/home.ts](../../../../../packages/kernel/src/capabilities/home.ts) · [src/boot.ts](../../../../../apps/engine/src/boot.ts) · [src/vault.ts](../../../../../packages/vault/src/vault.ts) · [test/home.test.ts](../../../../../packages/kernel/test/home.test.ts)。

**原型对照**　首开、保存后的空板、只读状态。后端读语义可先实施。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#board-scenario) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在新建测试 Vault 内用实际 Engine 调拟建的 home.dashboard.get，对缺文件、当前格式空板、有卡板各读两次。核对身份、稳定 ID、文件摘要均不变。
2. 只读打开有板、无板及拒读目录，分别验证已有板、内存默认与错误提示。scratch 不充当持久化结果。旧格式或来源不明的原件原样保留。

用临时 Vault 记录调用结果、revision 与操作前后文件摘要。这些都是实施时需要取得的证据。
