# S1b.2 添加、移除并恢复草稿附件

所属交付 S1b。本项承接 [Issue M-06、§7.1](../source.md)，行为规则见[工作台操作](../spec.md#workspace)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

桌面经宿主选文件，Mail 持有经校验的字节和持久引用；外部流式入口交 S8.2。收件附件元数据与草稿实际字节分开。

**前置产物**　[S1b.1](S1b.1-compose-draft.md)。

**代码入口**　[apps/desktop/src/preload/index.ts](../../../../../apps/desktop/src/preload/index.ts)、[packages/vault/src/write.ts](../../../../../packages/vault/src/write.ts)、[one-mail/src/components/mail/mail-composer/index.tsx](../../../../../temp/sources/one-mail/src/components/mail/mail-composer/index.tsx)。拟在 `plugins/mail` 的草稿与发件箱流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「写信 → 添加附件 → 重复/移除 → 重新打开」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#composer)，核对写信的附件区，重启后再查看草稿引用。

## 验收

- [ ] 选合成文件、重复添加、移走源文件再重开草稿，引用去重且受管字节哈希一致；移除后只清理无引用对象。
- [ ] 复制中断、超限或附件缺失时给出待处理项，原草稿仍可打开；取消选择不产生附件记录。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
