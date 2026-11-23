# W02-04 备份可核验的新格式布局

通过现有可复用的备份路径或小范围适配生成当前格式的完整快照。只收已提交布局，保持布局文件和业务数据不变。

**规格范围**　ACC-DASH-11、ACC-DASH-12。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W02-01 读取新格式布局并区分首次与空板](W02-01-read-board.md)。用当前 schema 读取有效的已提交布局。

**现有代码入口**　[src/home.ts](../../../../../../../packages/contracts/src/home.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts) · [src/vault.ts](../../../../../../../packages/vault/src/vault.ts) · [test/home.test.ts](../../../../../../../packages/kernel/test/home.test.ts)。

**原型对照**　可浏览的已保存板与恢复提示。备份文件内容由真实存储验证。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#board-scenario) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在临时 Vault 准备两实例一隐藏的已提交板，另留一份未保存草稿。生成备份并按 schema 读出 ID、配置、尺寸、顺序，与已提交板一致。
2. 源无效或备份目标拒写时清楚报告失败。检查原板、业务文件和先前有效备份仍可读。对真实旧数据零操作。

用临时 Vault 记录调用结果、revision 与操作前后文件摘要。这些都是实施时需要取得的证据。
