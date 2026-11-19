# W02-02 原子提交一份完整新布局

一个 Engine 写者校验整板后同目录原子替换。只存布局与受校验配置，实例与几何一一对应。唯一生产切换点在 W06。

**规格范围**　ACC-DASH-02、ACC-DASH-03、ACC-DASH-06、ACC-DASH-11、ACC-DASH-12。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W02-01 读取新格式布局并区分首次与空板](W02-01-read-board.md)。以当前 schema、读取快照的 revision 和写锁为输入。

**现有代码入口**　[src/home.ts](../../../../../packages/contracts/src/home.ts) · [capabilities/home.ts](../../../../../packages/kernel/src/capabilities/home.ts) · [src/boot.ts](../../../../../apps/engine/src/boot.ts) · [src/dispatcher.ts](../../../../../packages/kernel/src/dispatcher.ts) · [src/vault.ts](../../../../../packages/vault/src/vault.ts) · [test/home.test.ts](../../../../../packages/kernel/test/home.test.ts)。

**原型对照**　保存、重开和拒写提示。Engine 先以当前格式测试数据验证。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#save) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 通过真实 Dispatcher 提交新板，再重启 Engine 回读，核对 instanceId、几何与 revision。请求中的未知新增类型、任意业务内容不能进入文件。
2. 按空/重复 ID、漏几何、重叠、非有限或负坐标、尺寸越界、非法配置、只读及替换前写失败分别提交。文件逐字节不变，返回可区分的错误。

用临时 Vault 记录调用结果、revision 与操作前后文件摘要。这些都是实施时需要取得的证据。
