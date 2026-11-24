# MailPlan · 邮件账号的周期同步

[#13 原单](https://github.com/NAMEWTA/huhu/issues/13) · [本次完整快照](../../../../../temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/13.md) · W5c/F30 · [批次规格](../spec.md)

## 交付

来源设置与中心按同一 planId/revision 管理邮件账号的周期同步，沿现有领域端口执行。

现有入口为 [plugins/mail/src/engine/sync-schedule.ts](../../../../../plugins/mail/src/engine/sync-schedule.ts)。

## 前置产物

- [F29](062-f29.md) 统一 Cron 和 FollowUps 的计划目录。

## 验收

- [ ] 在来源与中心改同一修订，暂停/删除后重启不触发，手动拉信仍可用。

[本票验收记录](../evidences/079-mailplan.md)
