# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{006-f10,008-f13,005-f09}.md
- 执行结果 — done，交 Lead 验收

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，基线 `59a6020e`，交回版本 `5eb06e3d526f9a2ad7c2caadd985a8a05bce2ece`。三个独立提交均含 `Refs: #13`。工作树干净，`git diff --check` 通过。下面的定向单测逐文件运行，结果来自 Herdr Core 终端。

### F10 · 2a38647c1a7fcad8916d328a4bb6e334ef81e082

- 改动文件 — `plugins/automations/src/shared/cron.ts`、`plugins/automations/src/engine/{index,scheduler,service}.ts`、`plugins/automations/test/{scheduler,service,default-task-scan}.test.ts`、`tests/e2e/shell.spec.ts`。
- 复用 Croner 反查最近计划点，计划点须晚于上次受理和有效修订，宽限下界与当前时刻均包含等号。调度器按规则版本增量更新，补跑与在线触发共用同规则并发保护，停用生命周期结束后迟到对账无法重新安装作业。无历史的 Agent（含默认扫描）和提醒等下一次在线触发，定时终端以启用或编辑时刻为起点在宽限内恢复。现有发生身份继续沿用，Ledger 固定收支漏期归 #11 合同。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/automations/test/scheduler.test.ts`，12 项通过。覆盖每分钟/每秒离线 70 天、短间隔、宽限/修订等号、DST 和固定偏移、重复同步、启停与重启。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/automations/test/service.test.ts`，46 项通过。覆盖三类动作的首次计划点、终端运行中断与同槽唯一性。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/automations/test/default-task-scan.test.ts`，6 项通过。覆盖停用后迟到的启动对账和默认规则启停。
- Lead E2E — `tests/e2e/shell.spec.ts`，`自动化：每分钟规则离线 70 天后补跑，重启保留原计划点`。

### F13 · 5800107bf5c0592fd37569be77ea6cab1a4816c9

- 改动文件 — `plugins/mail/src/engine/conversations.ts`、`plugins/mail/src/ui/{MailModule,MailOutbox}.tsx`、`plugins/mail/test/conversations-engine.test.ts`、`tests/e2e/workflows/mail.spec.ts`。
- 联系人往来按真实接受的 To/Cc 地址聚合，详情显示公开地址的接受、明确未投递和待核实状态。匹配的同步副本保留正文入口和来源，参与者及投递状态以原操作为准，原操作也可继续定位去重后的副本。仅密送接受或只有未知结果时可在发件箱查状态。部分接受且有未知时，往来详情可进入原发件记录查看 Message-ID。发件箱与往来共用逐收件人列表。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/mail/test/conversations-engine.test.ts`，1 项通过。用回环 IMAP 缓存及本机出站记录覆盖部分接受、仅密送接受、待核实、只重试 B、同步副本、详情、查找与搜索。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/mail/test/outbox-engine.test.ts`，20 项通过。回环 SMTP 证明重试只向原拒收地址发送，确认丢失保留原记录。
- Lead E2E — `tests/e2e/workflows/mail.spec.ts`，`Web 邮件往来按接受者分组，逐地址显示结果并回到原投递记录`。

### F09 · 5eb06e3d526f9a2ad7c2caadd985a8a05bce2ece

- 改动文件 — `plugins/agent-cli/src/engine/history/scanner.ts`、`plugins/agent-cli/src/engine/index.ts`、`plugins/agent-cli/test/{history,sessions}.test.ts`、`tests/e2e/shell.spec.ts`、`tests/e2e/workflows/task-journey.spec.ts`。
- provider/profile 共享内存投影按 cwd 和原生 ID 建索引，异步刷新目录与 UUID 候选，复用未变更文件的解析。普通浏览沿用三秒刷新窗口，按目标 Space 与查询匹配后分页。显式预览重开原文件核对身份。未启动的冻结 Codex 目标从当前资料目录查唯一 UUID，再核对文件、修订与 cwd。已受理请求先按原持久启动记录回放。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/history.test.ts`，16 项通过。覆盖两个 provider 各 2,001 条外部记录、跨 Space 复用、追加、文件替换及归档 UUID 重复。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/tool-exposure.test.ts`，12 项通过。覆盖 CLI/HTTP MCP 下 Pi 历史 Space 与版本绑定、重开后原请求回读。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/sessions.test.ts`，60 项通过。覆盖同 UUID 新候选阻止启动及原请求回放。
- Lead E2E — `tests/e2e/shell.spec.ts`，`Agent CLI 历史：Codex 和 Pi 在大量其他 Space 记录中分页并预览旧会话`，用例覆盖 Linux 桌面和独立 Chromium。
- Lead E2E — `tests/e2e/workflows/task-journey.spec.ts`，`C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答`，新加冻结后插入 2,001 条无关记录及受理后的原身份重交。需要现役受控 Linux x64 Codex/private profile。

## 未运行的验证

- 上述四项 Playwright 入口由 Lead 运行。F10 的独立 Web 显示、F13 的 Linux 桌面显示仍待项目组合验收。真实外部邮箱和受控 Codex 的端到端执行本轮待验。其他 provider、平台、原生能力继续按 #17 分项取证。
- 类型检查由 Lead 逐包串行执行。相关包为 `@huhu/plugin-automations`、`@huhu/plugin-mail`、`@huhu/plugin-agent-cli`，组合验收涉及 `@huhu/plugin-tasks`、`@huhu/engine`、`@huhu/desktop`。本 worker 的验证限以上定向单测。

## 阻碍与接续

当前三个提交可交 Lead 审查。任务终端所开定向测试终端已回收。

## Lead 验收

- Lead 2026-11-24：已审查并合入 main；automations 测试中 Promise.withResolvers 不符合 ES2023，Lead 已修。清单转 task02。
