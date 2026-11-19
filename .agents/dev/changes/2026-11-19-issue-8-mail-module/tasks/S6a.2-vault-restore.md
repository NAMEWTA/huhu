# S6a.2 从整 Vault 新格式备份恢复邮件

所属交付 S6a。本项承接 [Issue §7、§9.1、M-08](../source.md)，行为规则见[网络与数据契约](../spec.md#durability)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

沿用现有整包恢复到新空目录，Mail 重新关联持久记录，区分账号定义与机器认证。

**前置产物**　[S6a.1](S6a.1-snapshot-export.md)。

**代码入口**　[packages/vault/src/package/package.ts](../../../../../packages/vault/src/package/package.ts)、[packages/vault/test/package.test.ts](../../../../../packages/vault/test/package.test.ts)。拟在 `plugins/mail` 的备份流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「设置 → 整 Vault 恢复 → 重授权提示 → 发件箱核对」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#fault)，核对设置中的恢复结果及「备份校验失败」；整 Vault 目标目录交数据与存储页验证。

## 验收

- [ ] 用合成新格式包恢复到新目录和新 VaultId，重开核对草稿、附件哈希及发件状态，发送中记录可查且网络提交计数为零。
- [ ] 目标非空、包损坏或缺失必要对象时明确失败、目标不被覆盖；按包范围省略的附件显示待重绑。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
