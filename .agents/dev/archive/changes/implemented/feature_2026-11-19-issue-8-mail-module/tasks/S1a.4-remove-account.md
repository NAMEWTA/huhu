# S1a.4 预览影响并删除指定邮箱

所属交付 S1a。本项承接 [Issue §3.2、§5.3、M-01](../source.md)，行为规则见[添加与维护账号](../spec.md#accounts)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 删除账号前按配置版本列明本地草稿、附件、发件记录、历史和认证，停止该账号网络工作，保留可核对的在途投递事实。

**前置产物**　[S1a.1](S1a.1-account-discovery.md)、[S1b.4](S1b.4-outbox-reconcile.md) 的投递对账合同。

**代码入口**　[packages/workbench/src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)、[packages/vault/src/write.ts](../../../../../../../packages/vault/src/write.ts)、[packages/workbench/src/engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)。拟在 `plugins/mail` 的账号与收件流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「账号菜单 → 删除影响 → 取消/确认」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#modal)，核对账号删除的确认区；删除时待决投递须以受控服务复查。

## 验收

- [x] 准备两个合成同地址配置和本地草稿，先取消、再按 ID 删除其一，预览与实际删除范围一致。另一账号保持可用，模拟远端没有删除指令。
- [x] 预览后账号变更、仍有可能已接受的投递、或提交失败时，分别返回冲突、可核对事实或待继续清理。旧回调不能复活已移除账号。

Windows 临时 Vault、真实 Engine HTTP、回环 IMAP／SMTP 与 Edge 实际组件验证通过。两个同地址账号由测试夹具准备，删除按各自 ID 执行。已核对前置写入失败、分步清理失败、重启续作和迟到回调。 [运行证据与重跑方法](../evidence/S1a.4-remove-account.md)
