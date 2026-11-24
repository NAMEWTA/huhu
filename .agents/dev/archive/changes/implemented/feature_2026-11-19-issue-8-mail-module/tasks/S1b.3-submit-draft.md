# S1b.3 同一草稿版本只启动一次投递

[验收报告](../evidences/S1b.3-submit-draft.md)

所属交付 S1b。本项承接 [Issue §8.1、M-06](../source.md)，行为规则见[网络与数据契约](../spec.md#durability)，设计见[调用与失败处理](../design.md#operations)。

## 交付与依赖

Mail 在网络动作前冻结本次收件人、内容及 Message-ID，持久认领 (Vault, draftId, revision)；任何 caller 能查询同一 operationId。

**前置产物**　[S1b.1](S1b.1-compose-draft.md)；含附件校验接 [S1b.2](S1b.2-managed-attachments.md)。

**代码入口**　[packages/kernel/src/dispatcher.ts](../../../../../../../packages/kernel/src/dispatcher.ts)、[packages/kernel/src/idempotency.ts](../../../../../../../packages/kernel/src/idempotency.ts)、[one-mail/src-tauri/src/mail/smtp.rs](https://github.com/zhihui-hu/one-mail/tree/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/smtp.rs)。拟在 `plugins/mail` 的草稿与发件箱流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「写信 → 发送中 → 已接受/发送失败」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#composer)，核对发送动作和「明确未投递」故障。

## 验收

- [ ] 对同一版本从两个模拟 caller 同时发送，在本地 SMTP 替身核对一次 DATA、同一操作号；模拟明确接受后才可见已发送。
- [ ] 锁定写入、旧 revision、附件缺字节或收件专用账号均不触发提交；明确未投递的错误保留草稿及修复入口。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
