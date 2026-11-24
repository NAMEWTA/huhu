# PlanAPI · 确定计划与活动查询的最小字段

[#13 原单](https://github.com/NAMEWTA/huhu/issues/13) · [本次完整快照](../../../../../temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/13.md) · W5a/W6，C3/C7 · [批次规格](../spec.md)

## 交付

以 Cron、FollowUps 和一次 Task 状态查询给出计划、发生与效果样例。和 #16 核对来源对象、修订、停用、受阻、未知与当前执行身份。

现有入口为 [packages/kernel/src/dispatcher.ts](../../../../../packages/kernel/src/dispatcher.ts)。

## 前置产物

可从现有代码与原单开始。

## 验收

- [ ] 同一计划从来源与中心读取相同身份；用一对过期修订与已受理未知样例演示两个消费者各自显示和提交的结果。

[本票验收记录](../evidences/015-planapi.md)
