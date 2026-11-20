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

- [x] 选合成文件、重复添加、移走源文件再重开草稿，引用去重且受管字节哈希一致。移除后只清理无引用对象。
- [x] 复制中断、超限或附件缺失时给出待处理项，原草稿仍可打开。取消选择不产生附件记录。

在 Edge 的实际 Mail 组件和真实 Engine 中用合成宿主联验。取消未写附件，退出中断悬挂选择，重开同一草稿可继续编辑。原生选择由 Lead 接入现有桌面宿主后复验。 [验证结果与强类型宿主契约](../evidence/S1b.2-desktop-attachments.md)

## Windows Engine 阶段

受管文件按校验后的 SHA-256 保存，草稿按修订引用。重复添加保持同一名称和修订，跨草稿共享对象。Windows 源文件移走后，重开仍可恢复原字节；中断、超限、原子替换失败及缺件状态保全已提交草稿。

真实桌面 `vault.exportPackage` 使用当前 Mail 实例的快照边界。导出期间排队的附件移除与回收等到导出结束。恢复到另一个隔离 Vault 后，原草稿修订、附件引用和字节可读。此验收使用同一可写 Engine 的导出和修改路径，原生文件选择及 Web 文件流仍待对应接线。 [桌面导出回归](../../../../../plugins/mail/test/draft-attachments-engine.test.ts)
