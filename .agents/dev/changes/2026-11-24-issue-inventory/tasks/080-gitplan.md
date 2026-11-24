# GitPlan · Git 同步计划与待写修订

[#13 原单](https://github.com/NAMEWTA/huhu/issues/13) · [本次完整快照](../../../../../temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/13.md) · W5c/F30 · [批次规格](../spec.md)

## 交付

来源设置与中心按同一 planId/revision 管理Git 同步计划与待写修订，沿现有领域端口执行。

现有入口为 [plugins/versioning/src/engine/index.ts](../../../../../plugins/versioning/src/engine/index.ts)。

## 前置产物

- [F29](062-f29.md) 统一 Cron 和 FollowUps 的计划目录。
- [F14](009-f14.md) 退出时结算末次修订。

## 验收

- [ ] 保留 full 同步、锁与冲突语义；停用前结算末次修订，恢复后旧计划不复活。

[本票验收记录](../evidences/080-gitplan.md)
