# SSHPlan · 已启动面板的 SSH 采样计划

[#13 原单](https://github.com/NAMEWTA/huhu/issues/13) · [本次完整快照](../../../../../temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/13.md) · W5c/F30 · [批次规格](../spec.md)

## 交付

来源设置与中心按同一 planId/revision 管理已启动面板的 SSH 采样计划，沿现有领域端口执行。

现有入口为 [plugins/ssh/src/engine/monitors.ts](../../../../../plugins/ssh/src/engine/monitors.ts)。

## 前置产物

- [F29](062-f29.md) 统一 Cron 和 FollowUps 的计划目录。

## 验收

- [ ] 同时打开两个同源面板，采样复用；最后引用关闭后资源释放，未启动的保存面板不自行连接。

[本票验收记录](../evidences/081-sshplan.md)
