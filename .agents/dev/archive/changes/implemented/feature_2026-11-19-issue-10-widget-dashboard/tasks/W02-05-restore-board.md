# W02-05 从新格式备份恢复已提交布局

恢复前校验备份并核对目标。损坏的已知新格式保全原件、预览可修复项，用户显式确认后提交。含混关联键不猜配。

**规格范围**　ACC-DASH-11、ACC-DASH-12。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W02-02 原子提交一份完整新布局](W02-02-commit-board.md)、[W02-04 备份可核验的新格式布局](W02-04-backup-board.md)。需要已核验的当前格式备份和原子写入。

**现有代码入口**　[src/home.ts](../../../../../../../packages/contracts/src/home.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts) · [src/vault.ts](../../../../../../../packages/vault/src/vault.ts) · [test/home.test.ts](../../../../../../../packages/kernel/test/home.test.ts)。

**原型对照**　损坏/恢复提示、只读与安全默认。原型未覆盖的磁盘动作在临时 Vault 验证。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#board-scenario) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在空测试 Vault 恢复有效备份，重开比对实例和几何。对新格式孤立几何、越界、碰撞样本连续预览两次，修复结果确定、可核对，读操作零写入。
2. 无效备份、不可保全损坏原件、只读、未知更高版本或目标 revision 改变时中止。原件和有效备份可复读。来源不明或旧文件绝不作为覆盖目标。

用临时 Vault 记录调用结果、revision 与操作前后文件摘要。这些都是实施时需要取得的证据。
