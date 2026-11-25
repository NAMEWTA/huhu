# MailPlan · 邮件账号的周期同步

状态：通过（Linux 桌面，回环 IMAP）；真实外部邮箱未验证。

[实施票据](../tasks/079-mailplan.md)

- 版本：提交 `dcda1497`，合入 main `febf92ea`。
- 实现：Mail 设置与中心读写同一 `periodic-mail-sync` 计划修订；定时、启停、删除、协议唤醒归 Automations，账号、凭据、文件夹、游标、缓存归 Mail；手动拉信独立于计划。旧 Vault 显式周期设置首次导入并保留原文件，空 Vault 默认关闭；删除留墓碑，重启/重新启用/旧配置不复活。
- 单测：mail sync-engine 2/2、messages-engine 5/5、tool-exposure 5/5（来源与中心操作、重启、手动拉信、IDLE 唤醒）。
- E2E（Lead，X11）：acceptance「MailPlan：邮件设置和自动化中心管理同一周期同步计划」通过。
