# t144 · Mail 边界修复

Lead `t3p`，worker `t144`，任务 `task02.md`。三项 P2 和一项 P3 的生产改动及对应测试已写入 `agent-linux`。Lead 的修复前日志已确认三项 P2 红灯。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t144/task02.md) · [批量删除与续跑红灯](mail-boundaries-red.log) · [降权发送红灯](mail-send-boundary-red.log)

## 改动

- Graph delta 裁剪删除记录时记录被省略的最小 ID。旧列表中可能受影响的未缓存邮件经单封请求核实后才计入 200 封上限。列表有不足时沿原 nextLink 继续补位。 [Graph 列表核实](../../plugins/mail/src/engine/graph-mail.ts#L208)
- Graph 核实达到软预算时，将已核实结果、尚待处理的 delta 变更和列表读到的位置写入现有缓存检查点。下一轮或重启从检查点继续。终态游标仍在核实完成后提交。旧版分页检查点从上一个已提交游标重读以重建删除证据。缓存沿用原有的取消、账号修订和移除检查。 [Graph 核实检查点](../../plugins/mail/src/engine/graph-mail.ts#L325) · [缓存写入](../../plugins/mail/src/engine/message-cache.ts#L550)
- Graph 出站在 MIME 构建结束后、开始 POST 前同步核对刚才通过发信授权检查的账号修订、移除状态和凭据有效期。校验失败沿用发件记录的明确未投递路径。同一草稿版本沿用原操作，POST 已发出后回执丢失沿用 `unknown`。 [授权与修订检查](../../plugins/mail/src/engine/accounts.ts#L321) · [首次 POST 门禁](../../plugins/mail/src/engine/graph-send.ts#L18) · [发件记录](../../plugins/mail/src/engine/outbox.ts#L349)
- 工作台以 Engine、账号 ID 和目录作为手动同步作用域。账号续期降权仍即时更新发件人选项，同一次同步可以继续读取。切换账号、目录或卸载页面时仍中止原请求。 [工作台同步](../../plugins/mail/src/ui/MailModule.tsx#L715)

## 对应用例

保留原四个 OAuth 用例及丢回执时 `unknown`、无常规重试资格的断言。以下三个 P2 用例与对应的工作台 E2E 已就绪。 [OAuth 回归](../../plugins/mail/test/oauth-engine.test.ts#L1661) · [工作台 E2E](../../tests/e2e/workflows/mail.spec.ts#L177)

- `Graph backfills past a stale listing entry after 201 uncached deletions`
- `Graph resumes conflicting message verification across the round budget and Engine restart`
- `Graph records no delivery when reauthorization disables sending during MIME build`
- `工作台手动同步触发 Graph 降权后继续读取并停用该邮箱的发信入口`
- `工作台切换账号时取消正在等待 Graph 的手动同步`
- `工作台关闭邮件标签时取消正在等待 Graph 的手动同步`

## 待 Lead 验证

```bash
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts
pnpm exec playwright test tests/e2e/workflows/mail.spec.ts --grep '工作台手动同步触发 Graph 降权后继续读取并停用该邮箱的发信入口|工作台切换账号时取消正在等待 Graph 的手动同步|工作台关闭邮件标签时取消正在等待 Graph 的手动同步'
```

工作台 E2E 使用当前候选已构建的 `apps/desktop/out/renderer` 和 Playwright Chromium，以合成凭据触发真实 Engine 到回环发行方的续期。核实同一次刷新完成并提交收件缓存，同时覆盖切换账号和关闭标签后的取消。

## 未运行的验证与待决事项

t144 按派工未运行 Vitest、Playwright、类型检查、构建或打包。修复后的运行结果待 Lead 验证。S5.2 通知口径仍待用户决定。
