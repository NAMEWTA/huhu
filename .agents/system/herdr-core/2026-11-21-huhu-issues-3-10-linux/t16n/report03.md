# t16n/task03 跨重载反例关闭复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t16n`，Lead `t3p`
- task — `task03.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t16n-report03.md`
- 执行结果 — `done`

## 结论

**task02 的 P2 已关闭。** 成功回执先登记尚未认领的 `writeId`，再检查保存的基线代数。版本、正文、保存状态、草稿清理及回调仍由原守卫约束。跨重载成功回执仍按原路径对账，迟到的自身通知在进入外部变更分支之前被认领。 [原反例](t16n-report02.md) · [回执处理](../../plugins/notes/src/ui/documents/DocumentSession.ts#L454) · [对账条件](../../plugins/notes/src/ui/documents/DocumentSession.ts#L491) · [通知认领](../../plugins/notes/src/ui/documents/DocumentSession.ts#L799)

在 Node 24.21.0 对当前 `DocumentSession` 重跑两条受控时序，结果如下。

- A 跨重载对账完成后，在 B 的成功回执前依次交付 B 自身通知和 A 的旧自身通知。额外读盘挂起设定下，实际读取次数仍为 3。B 保存返回 `true`，退出结算返回 `file`，快照为 `saved`，错误为空。 [队列与退出回归](../../plugins/notes/test/document-session.test.ts#L877)
- 干净会话在 A 对账后收到 A 的迟到通知，即使读盘会拒绝也保持 3 次读取、正文 A 和空 `flushError`。随后交付不同写入标识，额外读一次并接纳真正的外部正文及版本。 [干净视图回归](../../plugins/notes/test/document-session.test.ts#L925)

## 版本与证据

核对本机终端及 manifest 的 `t16n/task03.md active`。工作树为 `integration` / `impl/huhu-acceptance-followup`，审查时 HEAD 为 `c0870297c816f9205d264f00d209399a8c5f54e8`，Notes 仍在工作树。实测源码 blob 为 `bde69e3f6e2d`，测试 blob 为 `28d812f63917`，均与实施报告一致。空白检查通过，只发布本报告。 [实施报告](t15t-report04.md)

两条新增用例在修前均失败，修后完整会话单测 93 项通过。本轮独立复核使用上述只读探针并核对实施日志。指定反例范围内没有剩余发现。 [修前日志](t15t-notes-cross-reload-red.log) · [修后日志](t15t-notes-cross-reload-green.log)

## 未运行的验证

本轮未复跑 Vitest 或 Engine 集成，未运行实际 HTTP/WebSocket、Electron/Playwright、构建、打包或全仓门禁。退出结算验证至 `flushForExit()`。
