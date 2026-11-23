# t144 · Mail 独审回归

Lead `t3p`，worker `t144`，任务 `task01.md`。已写入三条 P2 Vitest 回归和三条 P3 工作台 E2E。基线为 `a1d3fd9a` 上的未提交 Mail 候选。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t144/task01.md) · [独审报告](t142-report01.md)

## P2 预期失败点

- `Graph backfills past a stale listing entry after 201 uncached deletions`。先缓存 200 封。移出一封已缓存邮件并返回 201 个未缓存删除记录，旧列表把裁剪掉的 D 放在第 200 位，H 在下一页。给下一页注入 500，应看到请求失败且原游标及缓存保留。清掉故障后应沿原 nextLink 补齐 200 封，排除 D 和移出的缓存邮件，H 正文可读。当前候选预计在访问下一页及保留原游标的断言失败。
- `Graph resumes conflicting message verification across the round budget and Engine restart`。20 条冲突经过两张 delta 页，每次单封核实推进虚拟时间 4 秒。跨过一轮预算后保持已提交游标及旧已读状态，重启后继续核实剩余邮件并提交终态。当前候选预计重查上一轮完成的单封请求。
- `Graph records no delivery when reauthorization disables sending during MIME build`。暂停真实 MailComposer 的构建，完成同账号仅接收的 OAuth 回调，再释放构建。回环服务仍接受旧 access token，应看到 `/sendMail` 零请求、收件人明确未投递以及同草稿版本重交归并到原操作。当前候选预计使用旧令牌发出首次 POST。原 OAuth 集成用例保留了 POST 到达后丢失回执的 `unknown`、无常规重试资格及同操作 ID 断言。

三个用例共用已有合成 OAuth 发行方、回环 Graph、真实 Engine。时间预算用可控时钟，MIME 构建用门控。原四个 OAuth 测试的名称和断言均保留。 [OAuth 测试](../../plugins/mail/test/oauth-engine.test.ts) · [Graph 夹具](../../plugins/mail/test/fixtures/graph.ts)

Lead 的首轮日志已确认批量删除与重启续跑两条在目标断言失败。首轮发件用例在仅接收账号的夹具断言停止。当时的账号省略了 `oauth.graphSend`。前置断言已改为检查刷新授权范围仅为 `Mail.Read`、账号保留 Graph 路由并关闭 SMTP 发送，投递断言原样保留。更新后的发件用例待 Lead 重跑。 [首轮日志](mail-boundaries-red.log)

## P3 工作台 E2E

- `工作台手动同步触发 Graph 降权后继续读取并停用该邮箱的发信入口`。通过受保护凭据接口种下临期 Graph 授权，真实 Web 工作台发起同步，真实 Engine 向回环发行方续期。等工作台收到账号更新、显示只接收并移除该发件人后，才放行 Graph delta。检查同一次同步显示新邮件并提交缓存。
- `工作台切换账号时取消正在等待 Graph 的手动同步`。Graph 正等 delta 时切换到另一个账号，检查旧请求的服务端连接取消且缓存仍是原邮件。
- `工作台关闭邮件标签时取消正在等待 Graph 的手动同步`。Graph 正等 delta 时关闭邮件标签，检查请求取消并保留原缓存。

E2E 使用同一个 Graph 回环夹具，通过真实 Web 工作台、HTTP、WebSocket 和 Engine 覆盖降权时序。合成凭据直接种入存储，临期续权经过真实刷新路径。 [工作台 E2E](../../tests/e2e/workflows/mail.spec.ts)

## 待 Lead 执行

在 `agent-linux` 工作目录按顺序运行。

```bash
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts -t 'Graph backfills past a stale listing entry after 201 uncached deletions'
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts -t 'Graph resumes conflicting message verification across the round budget and Engine restart'
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts -t 'Graph records no delivery when reauthorization disables sending during MIME build'
```

使用该候选的 `apps/desktop/out/renderer` 和 Playwright Chromium 实际跑工作台。

```bash
pnpm exec playwright test tests/e2e/workflows/mail.spec.ts --grep '工作台手动同步触发 Graph 降权后继续读取并停用该邮箱的发信入口|工作台切换账号时取消正在等待 Graph 的手动同步|工作台关闭邮件标签时取消正在等待 Graph 的手动同步'
```

## 未运行的验证

t144 未运行 Vitest、类型检查、Playwright、构建或打包。生产文件未改。S5.2 通知口径待定。
