# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1s2
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1s2/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1s2/report01.md
- 业务验收报告 — [F24](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/012-f24.md)、[TW4](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/066-tw4.md)、[TW5](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/086-tw5.md)
- 执行结果 — done，提交与定向证据交 Lead 验收。

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，起点 `f3ad411983a1b256f8c308455a0801562e27032a`。验证用 Linux x86_64、Node 24.22.1、pnpm 12.10.1，单次命令独占共享验证锁。原件在 [运行目录](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task01)。

### F24 · `290c14647044f52b538ce438fc3c8495543a622c`

- 变更 `package.json` 与 `.github/workflows/{ci,release,preview-platforms}.yml`。供应商声明和工作区类型检查均限并发 1。检查按 Git ref 取消过时运行。发布和补包共用同标签互斥组并排队。为相关任务设置超时，旅程数据、失败痕迹和安装产物设置显式保留期限。保留三平台矩阵。 [pnpm 命令文档](https://pnpm.io/cli/run) · [GitHub Actions 并发文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- 持锁运行一次 `/usr/bin/time -v volta run --node 24.22.1 pnpm typecheck`，完整退出 0，耗时 5:29.82，最大 RSS 2,873,724 KiB（2.74 GiB）。持锁启动时 MemAvailable 20.85 GiB，采样最低 18.58 GiB。各级 cgroup 无有限内存门槛，相关卷约 141 GiB 可用，磁盘与 inode 使用率约 50% 和 15%。 [类型检查原始日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task01/f24-typecheck.log)
- 日志 SHA 绑定启动时的 HEAD。运行期间工作树开始编辑 TW4，成功退出可证明串行入口可运行，整次结果缺少纯 F24 SHA 的隔离证据。进程组采样漏掉了 pnpm 启动的子进程，并发以脚本限制为依据。GNU time 的最大 RSS 不代表进程树 RSS 总和。
- 三个工作流通过本地 YAML 解析及并发和任务超时字段检查。未运行实际 Actions、Linux 整套测试／构建／旅程、发布或打包。Windows 和 macOS 按用户决定不验证。Linux 整合候选以 `.github/workflows/ci.yml` 的 `verify` job 及该 SHA 的旅程产物验收。

### TW4 · `40dbcbff1730687e152cc871e1db5f73f6a0a5a0`

- 变更 `packages/contracts/src/kinds/task.ts`、`packages/vault/src/semantic/repository.ts`、`plugins/tasks/huhu-plugin.json`、`plugins/tasks/src/engine/{github-sources,index,response-actor,service}.ts`、`plugins/tasks/test/{github-fixture,persistence-http.test}.ts`、`scripts/github-task-connector.mjs` 和 `tests/e2e/workflows/github-task-connector.spec.ts`。
- 使用 Gateway 的真实 HTTP 主体绑定来源实例及仓库，持久保存原事件 JSON、规范化指纹、收到时间、Issue 身份、原始 URL 和外部作者。首次受理保留 Task 创建来源。事件重投与 Issue 对象归并各自对账，同 ID 异载荷报冲突。Issue 更新进任务时间线，保留用户可编辑的任务目标及正文。旧的 Issue 快照不会覆盖新观察。用现有 Tasks 创建、评论和原生／普通答复能力提交。GitHub 答复需要允许的作者和本机批准的精确问题版本。
- 一次性适配器通过 GitHub REST 取指定仓库的 Issue 事件与新增评论，过滤 PR。使用稳定来源事件 ID 作为受理身份，并用原事件查询核实响应丢失。游标保存在适配器文件，缺口会中止并提示用 `--inspect-issue` 查对应 Issue 和评论。复用 Huhu Gateway、Vault 原子条件写和 Tasks 账本。阅读了本机 agent-autoloop `9a6826a` 的一次性采集脚本与 deepseek-harness `fcc0ad46` 的 GitHub webhook，采用现有 REST 入口与项目存储。 [GitHub REST 仓库事件](https://docs.github.com/en/rest/activity/events) · [GitHub 事件类型](https://docs.github.com/en/rest/using-the-rest-api/github-event-types)
- 定向命令 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t 'TW4 GitHub|回答只消费授权主体'`，4 通过，包括两个现有问题授权回归。首次两次运行发现测试夹具参数和原生问题选项不完整，已补齐并复测。 [最终日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task01/tw4-vitest-final.log)
- 持锁 `pnpm --filter <包> run typecheck` 使用同一 Node，`@huhu/contracts`、`@huhu/vault` 和 `@huhu/plugin-tasks` 均通过。供应商类型声明已在 F24 步骤生成。
- 未运行 Playwright。Lead 可运行 `tests/e2e/workflows/github-task-connector.spec.ts` 的 **TW4 GitHub 回环源通过公开入口创建任务并在桌面显示讨论**。本票定向用例以实际 HTTP 及合成原生执行器覆盖来源到问题和答复。带计划发生的完整跨轮次连线由 J17 联验。按派发仅用回环夹具，真实来源、独立 Web 旅程及真实 provider 未运行。

### TW5 · `d34e97891b76d4610c3e650b63de5bc9f3dcaf2f`

- 变更 `plugins/tasks/huhu-plugin.json`、`plugins/tasks/src/engine/{dispatch-store,dispatch,github-sources,index,receipt-inbox,result-delivery}.ts`、`plugins/tasks/test/persistence-http.test.ts`、`scripts/{github-task-connector,github-task-delivery}.mjs` 和 `tests/e2e/workflows/github-task-connector.spec.ts`。
- 输出从 Tasks 已持久化的原结果和稳定回执读取。经本机按 Issue 和出站账号批准后，适配器在 POST 前认领一个持久投递及关联标记。重交查询原投递。丢响应时从自回声或原 Issue 的评论核实，核验仓库、对象、作者、正文及已知评论 ID。缺证据保持 `unknown`。同标记的外部合法评论仍可进入讨论。投递用明确的原结果 ID，通过可信连接器的 `/user` 确认当前出站账号。 [GitHub Issue 评论 API](https://docs.github.com/en/rest/issues/comments)
- 邮件入口将已保存结果与本机显式选中的草稿版本关联，交由真实 `mail.outbox` 服务提交。冷恢复使用同一草稿版和原 Outbox 回执。邮件已送达状态仍使用现有 Mail Outbox 查询。
- 定向命令 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t 'TW[45] GitHub|TW5 邮件结果|持久验收原回执'`，7 通过。出站覆盖丢回包后先见自回声、通过 GitHub 列表核实、缺证据保留 unknown 三种情形，含重启、稳定结果重交和合法新事件。邮件关联用模拟 Outbox 响应丢失验证冷恢复。 [最终日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task01/tw5-vitest-final.log)
- 定向命令 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Engine 对两个来路只认领一次|Engine 持久区分拒收'`，2 通过。使用回环 SMTP 验证认领、部分接受和 DATA 确认丢失。持锁 `pnpm --filter @huhu/plugin-tasks run typecheck` 通过。 [SMTP 回归日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task01/tw5-mail-regression.log) · [类型检查日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task01/tw5-plugin-tasks-types-final.log)
- 未运行 Playwright。Lead 可运行 `tests/e2e/workflows/github-task-connector.spec.ts` 的 **TW5 GitHub 评论回包丢失后核实原投递且桌面只显示一次模型结果**。使用固定 Linux Codex 0.170.0，GitHub 和模型服务均为回环夹具。真实 GitHub 回传、同一真实来源至投递的闭环、独立 Web 旅程与真实邮件发送未验证。

## 阻碍与接续

实施范围内无待写改动。F24 的精确候选 SHA 类型、测试、构建和旅程记录，以及 J17 的真实来源及回传，仍待 Lead 在获准环境取得。当前分支提交可按本批惯例整合。

## Lead 验收


- Lead 2026-11-25：F24/TW4/TW5 合入 main 1d0d2f21，验收通过。清单转 task02。
