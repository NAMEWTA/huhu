# t17c task01 · Tasks 回执即时投递独立审查

审查已完成。未发现阻断移除 Tasks 固定 5 秒轮询等待的缺陷。发现一项新增的 ACK 路径成本。进行中的扫描仍会影响新结果的投递时延。

范围为 `integration` 的 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73` 到工作树 diff。审查时的 Git blob 为 `dispatch.ts=795925f87f87e5f7c47eab355b06047217438f18`、`index.ts=11b02e46ba7032b5361a841cfe7f18b580617011`、`persistence-http.test.ts=4fd07a5a2fe145a1bc7c280de290d5fae75facb8`。契约依据 t17c/task01、#5 T3.3 和 T6.4。 [回执交付](../../.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T3.3-deliver.md) · [停用与恢复](../../.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T6.4-plugin-recovery.md)

## 规格

- 闲时成功收件立即唤醒投递。扫描已在途时，终态回执置一位标记，在本轮 `finally` 清零并同步进入下一次 `check`。退出与重入之间没有异步让出，新一轮同步取得 `checking` 后先读收件箱。以收件成功为界，来件要么能被这一轮读到，要么置标让下一轮重读。下一轮在途又有来件时同样处理。异常退出仍经过 `finally`。 [收件入口](../../plugins/tasks/src/engine/index.ts#L466) · [轮次归并](../../plugins/tasks/src/engine/dispatch.ts#L752)
- ACK 持久顺序成立。任务锁内验证原派遣及机器绑定，条件写入 pending 原件与 delivery，回读后构造匹配 ACK。写队列等待结束并清理句柄后，收件入口才唤醒投递。评论写入另行取得该任务写锁，ACK 也不等待后续评论或派遣，因此找不到这两条路径之间的锁等待环。相同 receiptId 返回原 ACK，原 messageId 用于评论去重，投递状态以文件版本条件更新。 [执行绑定](../../plugins/tasks/src/engine/dispatch.ts#L199) · [写队列](../../plugins/tasks/src/engine/write-queue.ts#L5) · [持久 ACK](../../plugins/tasks/src/engine/receipt-inbox.ts#L99) · [评论去重](../../plugins/tasks/src/engine/service.ts#L377) · [投递存档](../../plugins/tasks/src/engine/receipt-inbox.ts#L209)
- 错误本身无法置位。最多消费已收到的唤醒，后续重试由新收件、现有调度入口或定时器触发。持久记录存在但消费抛错时仍可由现有定时检查或重开补送。Agent 端继续按 poll 串行重交，直到校验并保存匹配 ACK。 [轮次归并](../../plugins/tasks/src/engine/dispatch.ts#L752) · [ACK 丢失夹具](../../plugins/tasks/src/engine/receipt-inbox.ts#L122) · [Agent 重交](../../plugins/agent-cli/src/engine/execution-receipts.ts#L119)
- 停用清除定时器、置 abort 并等任务写队列。已置位的补扫经入口 abort 守卫返回。评论落盘但投递状态未落盘时，同 Vault 重开走同一 replay，按原 messageId 补齐。既有边界是停用不等待已发起的收件状态文件写入结束，该写入可能随后在原 Vault 上完成并发布原运行事件。文件和 EventBus 均绑定原 Vault。这一点来自静态路径。 [清理](../../plugins/tasks/src/engine/index.ts#L573) · [关闭](../../plugins/tasks/src/engine/dispatch.ts#L194) · [状态写入](../../plugins/tasks/src/engine/receipt-inbox.ts#L236) · [Vault 事件实例](../../apps/engine/src/boot.ts#L178)
- 若已有扫描卡在另一任务预检、派遣或原生回复，来件可拿到 ACK，结果要等该轮释放后才补送。新增测试用门闩直接覆盖这一行为。生产预检经 Dispatcher，默认能力超时可达 60 秒，一轮还可能依次等待多个调用。因此本次消除了等下一次定时触发的步骤，繁忙场景下没有独立的结果投递时限。 [测试门闩](../../plugins/tasks/test/persistence-http.test.ts#L613) · [串行预检](../../plugins/tasks/src/engine/dispatch.ts#L917) · [能力超时](../../packages/kernel/src/dispatcher.ts#L366)

## 规范

- **低 · 闲时 ACK 路径新增历史收件记录同步读取。** `void dispatch.check(...)` 在返回 ACK 前进入 `replay`，同步列目录并逐份读文件、验身份，直到首个会挂起的写入。历史记录多或存储慢时，原件已落盘后的 ACK 会多等这段扫描。已投递的重复收件也触发这段扫描。新增测试确认活跃轮次不阻塞 ACK，实际历史规模的 ACK 成本未测。若需保持持久 ACK 的原响应路径，可让首轮唤醒在当前调用返回后执行，并沿用轮次归并与 abort 守卫。 [ACK 调用点](../../plugins/tasks/src/engine/index.ts#L468) · [历史读取](../../plugins/tasks/src/engine/receipt-inbox.ts#L132) · [同步文件读取](../../packages/vault/src/write.ts#L57)
- 派遣、收件及投递继续复用现有队列、Vault 文件及原执行绑定。收件能力仍不可对外开放，Dispatcher 的插件授权和 handler 的 `plugin:agent-cli` 守卫均保留。原有启动恢复及轮询入口继续工作。 [能力登记与守卫](../../plugins/tasks/src/engine/index.ts#L456) · [Dispatcher 授权](../../packages/kernel/src/dispatcher.ts#L345) · [启动及周期恢复](../../plugins/tasks/src/engine/index.ts#L573)

## 验证

- 本会话核对了三个文件的基准、工作树 diff、调用链和锁时序，定向 `git diff --check` 通过。仅写入本报告。
- 读取 Lead 的运行日志。t179 基线两条新增用例均因 `pending` 未切到 `delivered` 失败。t17b 完整 `persistence-http.test.ts` 40/40 通过，耗时 15.85 秒。绿灯之后测试文件仅有格式及等效的 Promise 门闩写法调整，两份生产文件未变。重复收件用例验证唯一评论和最终投递，具体补扫次数由布尔归并代码确认。 [红灯日志](task-receipt-wakeup-red.log) · [绿灯日志](task-receipt-wakeup-check.log)

## 未运行的验证

本会话未重跑 Vitest，未执行真实 Agent/UI/E2E、构建打包或全仓门禁。停用恰逢投递状态文件提交、慢执行端和大收件箱下的 ACK 时延没有额外实测。仍在编辑的 UI 与验收夹具不在本任务范围内。
