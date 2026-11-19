# S1b.1 离线写一封富文本并继续编辑

所属交付 S1b。本项承接 [Issue M-06、M-07、§7](../source.md)，行为规则见[工作台操作](../spec.md#workspace)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 持有草稿 ID 与 revision。可换可发账号、录入 To/Cc/Bcc、主题、富文本和链接，关闭含内容的浮层先持久保存。

**前置产物**　[S1a.1](S1a.1-account-discovery.md)。

**代码入口**　[packages/workbench/src/contributions.ts](../../../../../packages/workbench/src/contributions.ts)、[one-mail/src/components/mail/mail-composer/index.tsx](../../../../../temp/sources/one-mail/src/components/mail/mail-composer/index.tsx)。拟在 `plugins/mail` 的草稿与发件箱流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「写信 → 扩大/还原 → 关闭 → 草稿重开」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#composer)，核对写信浮层，演示控制中的「草稿保存失败」「模拟重启」。

## 验收

- [ ] 用有重复收件人的合成信离线编辑，保存、退出并重开，同一草稿的收件人、正文、链接和来源账号仍正确。
- [ ] 只读、落盘失败或低版本提交时显示原因，保留编辑内容；取消丢弃可继续写，明确丢弃后才退出。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
