# #5 T3.1 / T3.3 与 #8 S1a.2 · 组合数据独立复核

- 任务 [t13x/task05.md](./task05.md)
- 执行结果 **done**。两项 Tasks 定向测试和一项 Mail 测试首轮串行通过，两条 Vitest 命令均退出 0。
- 冻结组合候选 `c839daf64329eebade2607350fe0c4a0e9832be8`。已核对受理回执 `6152ce4`、问题投影 `e4b0387` 和 Mail 最新原文 `29c6f32` 均为该候选祖先。
- Windows x64、Node.js 24.21.0、Vitest 3.2.7。Tasks 使用真实 Engine 上的合成执行器与受信回执来源。Mail 使用真实 Engine、两个合成回环 IMAP 服务及各自的临时 Windows 本机凭据。

## 实测

| 场景 | 观察结果 |
| --- | --- |
| T3.3 持久 ACK | 在保存原回执前注入写失败，返回 `INTERNAL` 且结果评论为空。恢复写入后返回 `tasks_consumed`，隔离 Vault 中可回读原 payload、固定投递身份和 `pending` 状态。CLI 调用得到 `CAPABILITY_NOT_EXPOSED`，desktop 得到 `PERMISSION_DENIED`。 |
| T3.3 断点与重开 | 在评论已经写入、投递标记仍未落盘时注入失败。重开原 Vault 并重交原回执，返回同一 ACK，记录最终到达 `delivered`，原任务只保留一条相同 messageId 的结果评论。任务保持进行中，执行器总调用仍为一次，重交没有重新派遣。不同 run 的执行绑定及同回执 ID 异载荷均返回 `INVALID_INPUT`。 |
| T3.1 当代问题与私有请求 | 同一轮公开列表保留普通问题 v1 与原生暂停 v2，重复提交原生回执返回同一 ACK。迟到的原生 v1 没有替换 v2，其他 run 的绑定被拒绝。公开列表的序列化结果不含原生请求标识。 |
| T3.1 完成后的问题状态 | 同一轮提交 `no_update` 结束事实后，原生暂停变为 `closed`，普通问题仍为 `awaiting`，运行概要的待答数从 2 降至 1。 |
| S1a.2 同 UID 与重开 | 两个合成 INBOX 同为 UID 42、UIDVALIDITY 12，各得到独立 `localMessageId` 和各自 RFC822 原文字节。把另一账号的本地 ID 用于当前账号查询时返回 `needs-refresh`。重开两者均可从原缓存读回。 |
| S1a.2 UIDVALIDITY 换代 | 将账号 A 的 UIDVALIDITY 改为 13，刷新返回 `mailboxChanged: true` 和新 ID，账号 A 的旧 ID 返回 `needs-refresh`。账号 B 的 ID 和原文字节保持原值，FETCH 计数没有增加。 |
| S1a.2 只读与 ZIP | 只读 Vault 可回读原文缓存，刷新返回 `READ_ONLY_VAULT`，两端的 FETCH 计数保持原值。实际取信记录包含 `EXAMINE`、`UID FETCH ... BODY.PEEK[]`，未发送 `SELECT` 或 `STORE`。导出返回的 ZIP 文件清单未收录 `.huhu/cache/mail/`。 |

## 复跑与清理

- Git 归档与隔离 Vault 放在新建的 Windows 系统临时目录。归档应用锁与本机已安装的 Windows 依赖锁一致，102 个工作区链接指向归档源码，297 个第三方链接指向已安装包。运行前后归档锁对象为 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`。
- Tasks 使用单个 thread worker，2 项通过，19 项由用例名筛选跳过，整次用时 10.47 秒。Mail 在 Tasks 退出后运行，1 项通过，整次用时 7.07 秒。Mail 命令将默认单用例超时设为 30 秒，实际用例用时 1.273 秒。保留候选的测试断言。
- 既有清理钩子关闭 Engine 与回环服务并清除合成凭据。后置检查没有发现本轮夹具根，验证窗格 `t151` 已在退出后移除，隔离归档已清理。本轮未创建或切换 Git worktree，未修改业务源码和锁文件。

```powershell
node node_modules/vitest/vitest.mjs run plugins/tasks/test/persistence-http.test.ts -t '持久验收原回执|同一轮只显示' --pool threads --no-file-parallelism --maxWorkers=1 --reporter=verbose
node node_modules/vitest/vitest.mjs run plugins/mail/test/messages-engine.test.ts --pool threads --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --reporter=verbose
```

复核范围为指定 Engine 数据夹具。Tasks 的实际 Agent 回执生产、原生回答传输、界面和真实进程中断由相应切片验收。Mail 的阅读页、MIME 正文、联系人聚合和多页同步也属于后续范围。本轮只使用合成输入与回环服务。

依据 [T3.1 问题投影](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T3.1-questions.md)、[T3.3 回执投递](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T3.3-deliver.md) 和 [S1a.2 首封 IMAP 原文](../../../../dev/changes/2026-11-19-issue-8-mail-module/tasks/S1a.2-first-message.md)。

## Lead 验收
