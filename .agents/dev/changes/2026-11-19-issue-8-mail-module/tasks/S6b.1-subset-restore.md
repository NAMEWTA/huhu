# S6b.1 预检并恢复 Huhu 新格式邮件子集

所属交付 S6b。本项承接 [Issue §9.1、§9.2 范围修订、M-08](../source.md)，行为规则见[网络与数据契约](../spec.md#durability)，设计见[待定产品选择](../design.md#open)。

## 交付与依赖

保留 S6b 编号用于新格式子集恢复。Mail 承担预检、暂存、提交与结果，既有目标账号出现冲突时呈现双方；one-mail 旧格式退出实施。

**前置产物**　[S6a.1](S6a.1-snapshot-export.md)；同地址提交取设计中的用户选择。

**代码入口**　[packages/vault/src/package/package.ts](../../../../../packages/vault/src/package/package.ts)、[packages/vault/src/write.ts](../../../../../packages/vault/src/write.ts)。拟在 `plugins/mail` 的恢复流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「设置 → 邮件子集恢复 → 预检/冲突/取消 → 恢复结果」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#modal)，核对设置内的邮件数据恢复预检/确认区；同地址提交另待决定。

## 验收

- [ ] 将合成 Huhu 子集恢复至已有无关账号的 Vault，逐项核对映射的草稿与附件，原账号不变；恢复后无自动投递。
- [ ] 分别输入损坏、超限、错误类型、重复或同地址的包，提交前呈现限制与冲突；取消/中断保全既有数据，再次执行不得重复生成已恢复对象。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
