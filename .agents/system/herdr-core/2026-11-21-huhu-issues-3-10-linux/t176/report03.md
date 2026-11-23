# t176/task03 · 持久 ACK 后延后唤醒

Lead 为 `t3p`。integration 返工已完成，代码冻结。本报告接续 [task02](t176-report02.md) 与 [t17c 独立审查](t17c-report01.md)。

## 实施

- `plugins/tasks/src/engine/index.ts:466–473` 在持久回读 ACK 成功且任务写锁已释放后登记终态回执唤醒。登记只设置状态并调度，ACK 调用返回后才进入同步收件箱扫描。
- `plugins/tasks/src/engine/dispatch.ts:753–773,805–808` 以一个待处理标记和一个 `setImmediate` 句柄合并唤醒。已有检查进行中时只置位，结束后安排下一次检查。其他入口在定时回调之前开始检查时，可以先消费该标记，回调会跳过已消费的唤醒。后续检查继续复用现有 replay、评论去重与轮询恢复路径，错误本身不触发新的补扫。
- `dispatch.ts:195–198,758–773` 保留 abort 守卫，关闭时还取消待执行的回调。进行中的检查沿用原关闭路径。
- `plugins/tasks/test/persistence-http.test.ts:595–618` 在第一条回归加入顺序断言，检查持久 ACK 返回时尚未调用 replay。第二条回归继续验证另一任务的预检暂停检查时可以重复接收并 ACK，放行后出现唯一原评论。

当前检查若正等待另一任务预检、发送或原生回复，后续唤醒仍需等这一轮退出。此次改动没有设定繁忙场景的投递时间上限。

## 验证

- Lead `t17f` 在返工后定向运行 `persistence-http.test.ts` 的两条回归，2 条通过，38 条过滤。覆盖 ACK 返回早于 replay，以及繁忙检查结束后的唯一评论。见 [延后唤醒回归日志](task-receipt-defer-check.log)。
- 三处改动通过定向 `oxfmt --check`、`oxlint -c oxlint.json` 与 `git diff --check`。
- Lead 以原 `4a54f0a9` 桌面构建搭配 task02 的新夹具运行三条 E2E，全部通过，耗时 19.4 秒。UI 和夹具保留在该验证版本。见 [夹具诊断日志](ui-fixture-diagnostic-4a54f0a9.log)。
- `t17c/task02` 已登记复核，结果待报告。

## 待验证

返工后的定向类型检查仍待 Lead 确认。当前生产修复上的运行结果正文 E2E、构建、打包与全仓门禁均无本轮结果。
