# t15t/task04 跨重载后的自身保存通知

Lead `t3p`。核对 `t15t/task04.md active`、`HC_TERMINAL_ID=t15t`、工作树 `integration` 和分支 `impl/huhu-acceptance-followup`。任务开始时 HEAD 为 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。Lead 随后提交 Vault `d1432fd3`、Agent/Gateway `383a385e` 和候选夹具 `c0870297`，报告更新时实际 HEAD 为 `c0870297c816f9205d264f00d209399a8c5f54e8`。从 05a 到该 HEAD 的提交均未改本轮 Notes 两文件，最终工作区 blob 与测试通过时一致。本轮只调整 `DocumentSession.ts` 与 `document-session.test.ts`，实现已冻结。

旧保存 A 已落盘且收到成功回执，但中间发生的重载推进了基线代数。原顺序先因基线过期返回，再走应有的磁盘对账，跳过了 A 的自身通知登记。这样，后来到达的 A 通知会额外触发磁盘核对。 [独立审查和探针](t16n-report02.md)

成功回执到达时，先按现有容量和认领规则登记未到达的 `writeId`，然后检查 `baselineGeneration`。版本、正文、草稿和保存状态仍在原基线守卫之后更新，旧写入继续照常对账。源码 blob `bde69e3f6e2d`。 [保存路径](../../plugins/notes/src/ui/documents/DocumentSession.ts#L454)

新增两条回归。测试 blob `28d812f63917`。

- A 跨重载对账结束，B 已落盘且等待成功回执时先交付 B 的自身通知，再交付迟到的 A 通知。独立阻塞额外读盘，核对 B 和退出可以结算，原 3 次正常读取保持不变，B 保存状态正确。 [B 保存中用例](../../plugins/notes/test/document-session.test.ts#L877)
- A 跨重载对账结束，干净视图收到其迟到自身通知时，即使 `notes.read` 会失败也不多读、不误报。随后写入真实外部正文并交付不同标识，核对恰好多读一次并接纳版本和正文。 [干净视图用例](../../plugins/notes/test/document-session.test.ts#L925)

## 验证

Node 24.21.0。定向红灯 2 失败、91 过滤，A 迟到通知引发第 4 次读取，B 和退出等待，干净视图出现 `flushError`。修复后运行同一 Vitest 文件，93 项全部通过。两文件格式化和空白检查通过。 [红灯](t15t-notes-cross-reload-red.log) · [绿灯](t15t-notes-cross-reload-green.log)

未运行 Engine 集成、真实 HTTP/WebSocket 时序、Electron/Playwright E2E、构建或全仓门禁。无提交或推送。

### Modern Web Guidance

沿用上轮检索的 `js` 指南。测试用其 `Promise.withResolvers()` 模式分别控制回执和读盘释放时序。 [检索指南](/tmp/mwg-guide-742470-1795376192756.md#L159)
