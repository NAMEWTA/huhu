# S1b.4 在发件箱核对部分成功与未知投递

所属交付 S1b。本项承接 [Issue §8.1、M-07](../source.md)，行为规则见[网络与数据契约](../spec.md#durability)，设计见[调用与失败处理](../design.md#operations)。

## 交付与依赖

Mail 维护逐收件人状态、重试及本地记录删除，清楚区分本机与服务器 Drafts/Sent；重新打开恢复选择。

**前置产物**　[S1b.3](S1b.3-submit-draft.md)。

**代码入口**　[packages/kernel/src/idempotency.ts](../../../../../packages/kernel/src/idempotency.ts)、[one-mail/src-tauri/src/mail/smtp.rs](../../../../../temp/sources/one-mail/src-tauri/src/mail/smtp.rs)、[one-mail/src/components/mail/outbox-panel.tsx](../../../../../temp/sources/one-mail/src/components/mail/outbox-panel.tsx)。拟在 `plugins/mail` 的草稿与发件箱流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「发件箱 → 投递详情 → 拒收重试/未知结果核对 → 删除确认」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#fault)，核对「部分收件人接受」「投递结果未知」，发件箱结果与重启后核对。

## 验收

- [ ] 模拟 A 被接受、B 被拒收，查看详情、只重试 B，核对两次尝试的收件人。切换页再返回仍选原记录。
- [ ] 在最终回执丢失、取消、崩溃或落盘失败后重启，已可能提交的地址显示未知，提交计数不增加；删除本地记录不撤回服务器邮件。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
