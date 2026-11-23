# S6a.1 导出一致的邮件子集或整 Vault 包

所属交付 S6a。本项承接 [Issue §7、§9.1、§9.3、M-08](../source.md)，行为规则见[网络与数据契约](../spec.md#durability)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 提供同一代持久数据清单和附件快照，Vault 包所有者整合收集器。与 [#9 的包适配](../../feature_2026-11-19-issue-9-safe-accounts/tasks/P8.1-backup-contents.md) 共享一个整合入口，Mail 快照可独立验收。两种导出入口明确包含内容、排除项和新机重授权。

**前置产物**　[S1a.1](S1a.1-account-discovery.md)、[S1b.2](S1b.2-managed-attachments.md)、[S1b.4](S1b.4-outbox-reconcile.md)。

**代码入口**　[packages/vault/src/package/package.ts](../../../../../../../packages/vault/src/package/package.ts)、[packages/vault/src/write.ts](../../../../../../../packages/vault/src/write.ts)、[plugins/versioning/src/engine/sync.ts](../../../../../../../plugins/versioning/src/engine/sync.ts)。拟在 `plugins/mail` 的备份流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「设置 → 备份 → 邮件子集/整 Vault → 范围与结果」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#fault)，核对「邮件设置」数据操作和「备份校验失败」。

## 验收

- [ ] 改草稿与导出并发，解包核对配置、草稿 revision、投递事实、附件引用及哈希同代；有/无附件两种范围显示准确。
- [ ] 对象缺失、写盘失败或取消时不可发布半个有效包；检查实际包与 Git 候选路径，没有本机钥匙、token、缓存和运行连接。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
