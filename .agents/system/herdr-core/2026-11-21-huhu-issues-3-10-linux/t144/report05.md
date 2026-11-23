# t144 · Mail 恢复提示与可观察重试

Lead `t3p`，worker `t144`，任务 `task05.md`。已更新发件箱提示和现有恢复重试 E2E。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t144/task05.md) · [独立复核](t152-report01.md)

- 发件箱将 `graph-send-permission` 明确描述为该次投递时的权限状态。发信恢复后，历史原因与恢复的重试入口可以同时显示。草稿查询成功且结果为空时，详情直接说明源草稿已丢弃、无法重试。提交时才发现草稿丢弃的分支沿用同一提示。 [发件箱详情](../../plugins/mail/src/ui/MailOutbox.tsx)
- E2E 等待源草稿的实际成功响应和详情结束加载后，才核对只接收期间的重试门禁及零投递。恢复后核对同一历史提示，选中原收件人中的一个并提交，检查子操作显示原 Message-ID、收件人已获服务接受，回环 Graph 收到一封仅发给被选地址的 MIME。随后丢弃源草稿，回到原记录验证剩余收件人无法重试并显示原因。 [工作台 E2E](../../tests/e2e/workflows/mail.spec.ts)

## 待 Lead 验证

使用当前候选的 renderer 构建产物及 Playwright Chromium 运行。

```bash
pnpm exec playwright test tests/e2e/workflows/mail.spec.ts --grep 'Graph 发件箱在只接收期间停用重试，恢复发信后可重试原收件人'
```

## 未运行的验证

t144 按派工未运行测试、类型检查、E2E、构建或全仓门禁。本次工作台运行结果待 Lead 确认。
