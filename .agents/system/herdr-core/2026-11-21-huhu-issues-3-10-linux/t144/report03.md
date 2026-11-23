# t144 · Mail 新增 P3 回归

Lead `t3p`，worker `t144`，任务 `task03.md`。两项新增 P3 的回归已写入 `agent-linux`。原三项 P2 沿用独审关闭结论，原工作台自身续期后继续收件的正例保留。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t144/task03.md) · [独立复核](t14s-report01.md)

## 预期失败点

- `Outlook reauthorization cancels the old Graph page and immediately refreshes through Exchange`。挂起旧 Graph 首张 delta 页，完成同账号重授权切到 Exchange。第一张页仍挂起时，用新 revision 从另一工作台入口发起刷新。检查旧 HTTP 连接在放行前取消、旧 Graph 无下一页请求，以及新请求读到 Exchange 的 UID 42。当前候选预计旧连接仍等待、放行后请求旧 Graph 的下一页、新请求合流并收到 `mailbox-changed`。 [OAuth 回归](../../plugins/mail/test/oauth-engine.test.ts#L687) · [Graph 门控夹具](../../plugins/mail/test/fixtures/graph.ts#L88)
- `Graph records the revoked send permission and keeps the recipient eligible after reauthorization`。复用真实 MIME 构建门控。关闭发信后沿用零 POST、明确未投递和同版重交同操作 ID 约定，并要求结果记录已有的 `graph-send-permission`。恢复发送后，同一条发件记录应重新提供原收件人的重试资格。当前候选预计未投递状态正确，但缺少原因。 [OAuth 回归](../../plugins/mail/test/oauth-engine.test.ts#L786)
- `Graph 发件箱在只接收期间停用重试，恢复发信后可重试原收件人`。利用真实 Graph 续期降权生成带原因的明确未投递记录。工作台显示原因和原收件人，且收信期间无法触发重试。恢复同账号的发信凭据后，刷新投递状态并确认原收件人可选、重试按钮可用。当前候选预计只接收时仍能勾选收件人并启用按钮。 [工作台回归](../../tests/e2e/workflows/mail.spec.ts#L287)

## 待 Lead 执行

```bash
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts -t 'Outlook reauthorization cancels the old Graph page and immediately refreshes through Exchange'
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts -t 'Graph records the revoked send permission and keeps the recipient eligible after reauthorization'
pnpm exec playwright test tests/e2e/workflows/mail.spec.ts --grep 'Graph 发件箱在只接收期间停用重试，恢复发信后可重试原收件人'
```

工作台回归使用候选的 `apps/desktop/out/renderer` 与 Playwright Chromium。原有自身续期正例可以用 `--grep '工作台手动同步触发 Graph 降权后继续读取并停用该邮箱的发信入口'` 单独运行。

## 未运行的验证

t144 未运行 Vitest、Playwright、类型检查、构建或打包。红灯待 Lead 确认。生产文件未改。
