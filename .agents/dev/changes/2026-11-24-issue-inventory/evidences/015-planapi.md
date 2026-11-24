# PlanAPI · 确定计划与活动查询的最小字段

状态：通过（合同样例）。

[实施票据](../tasks/015-planapi.md)

- 版本：提交 `a5972baa`，main `f10f8475`。
- 合同：`packages/contracts/src/automation-plan.ts` 公开计划、来源、运行归属、发生、效果、过期修订、任务活动查询的类型与 schema。Cron 与 FollowUps 的中心/来源共用稳定 `planId/revision`；发生保留接受时间、冻结输入、执行代次；区分用户暂停、执行受阻、未受理、已受理未知，按原 operationId/occurrenceId 查询。
- 单测：`packages/contracts/test/automation-plan.test.ts` 3/3——中心与来源身份一致；旧修订零受理且两个消费者分别显示冲突；同一未知发生可重查；缺冻结输入/时间的受理记录校验失败。contracts 类型检查 0 错误。
- 消费者：F29、#16 AW1–AW5。
