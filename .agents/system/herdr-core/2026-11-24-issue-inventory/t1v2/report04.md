# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1v2
- task — task04.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task04.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report04.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{091-l6,100-l10,106-l11,103-w7}.md
- 执行结果 — done（原型交付待用户确认，W7 候选准备交回 Lead）

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1` 从 `14ef5516` 接续。两个独立提交均已保存，工作区干净。

### 账本原型（L6 / L10 / L11）

- 提交 `e030ac9cb349f10797296ecb337b958065acf795`。更新 `prototype/ledger/{index.html,module.css,prototype.js}`，加入 `budgets.js`、`financial-notes.js`，并在 `prototype-review-ledger.md` 记录待确认场景与原确认版本恢复点。打开 `index.html` 后从「原型演示」载入样例账本。[原型入口](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/prototype/ledger/index.html) · [场景表](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-ledger.md)
- L6 支持年月币种、固定/自由预算进度、同口径分页和批量编辑。跨月复制显示创建数、跳过数、冲突月份与同名项，重复复制不会新增副本。L10 从总览、预算和流水关联并打开 Vault 内的笔记或档案，缺失可替换，停用 Notes 提示重新启用并保留记账入口。报表可生成期间 Markdown、保存并重新打开。L11 三张总览卡片分别打开当月预算、固定收支和贷款补记区域，确认贷款期次后更新计数。
- 新目录 SHA-256 为 `0886426ecf3c2e3628eaa9f228a7e848cda8fa808d85d9c24109ea5b397ccfe1`（14 个文件）。提交后以 `node .agents/skills/dev-prototype/scripts/fingerprint.mjs <目录> --expect <SHA-256>` 校验匹配。原确认版本可从 `dcce110b6e91608a2651d7cc3d0ec656ab6e9102` 恢复，校验原 SHA-256 `3cb524336845bb8f6d2e4fea306b6bd00c39d0ca7ff16988edcdd91603efb940` 匹配。[逐文件指纹](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/ledger-prototype-fingerprint.txt)
- `node --check` 检查三个交互脚本，全部通过。持 `verify.lock` 运行 `volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/ledger-prototype-task04.test.ts`，jsdom 5/5 通过。临时测试已从检出移除，附件可回放。浏览器控制面未提供可用浏览器，窄窗、深浅主题实渲染及原生焦点待走查。[DOM 日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/prototype-dom.log) · [临时测试](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/prototype-dom.test.ts)

### W7（#13）

- 提交 `ca1b4653c0224dfd85eff1e7517063ff9714d62a`。在 `plugins/tasks/test/activity-reconciliation.test.ts` 原 0/1k/10k 夹具保留真实 Engine HTTP 正确性与计数门禁，新增逐轮字节、RSS 和读取量、对账及并发 HTTP 的 p95。索引列出 W0–W6 消费者、F01–F32 正负对照来源、S01–S14 具体端口和 W5d 清退前后记录。[W7 证据索引](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/w7-evidence-index.md)
- 定向验证均持 `verify.lock`，使用 `volta run --node 24.22.1 pnpm exec vitest run <文件>`。候选上 `plugins/tasks/test/activity-reconciliation.test.ts` 1/1（`HUHU_F11_BENCH=1 HUHU_F11_ASSERT_ACTIVITY=1`）、`plugins/automations/test/periodic-plans.test.ts` 1/1、`packages/kernel/test/dispatcher.test.ts` 29/29。提交前同锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/plugin-tasks run typecheck`，0 错误。[对账日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/w7-f11-candidate.log) · [计划日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/w7-periodic-plans.log) · [Dispatcher 日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/w7-dispatcher.log) · [类型检查](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/w7-tasks-types.log)
- Linux x86_64、i7-12700、Node 24.22.1，固定 2 个活动执行，每档 5 次。本次三档均为每轮 8 次读取。10,000 条历史档每轮读 15,936 B，对账 p95 5.27 ms，并发 Engine HTTP p95 25.70 ms。原 F11 基线对应 60,008 次、12,191.12 ms、12,241.87 ms。两次运行未交错，旧日志缺运行 SHA 和字节数，候选表保留这一限制。F27 另有原始固定 SHA、数据摘要及正常/正控对照。[基线与候选对照](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task04/w7-evidence-index.md#f11-基线和工作提交采样)

## 阻碍与接续

- L6/L10/L11 新增体验待用户确认。Lead 可用上面的原型指纹组织浏览器走查，尤其是窄窗、深色和键盘焦点。真实桌面和独立 Web 的产品接线与验收接续于确认之后。
- W7 同候选 E2E 复用 `tests/e2e/workflows/task-journey.spec.ts` 的「T7.2 Linux 实际定时与手动运行共享同一 Tasks 派遣，原目标不可用时可人工关闭」，`tests/e2e/workflows/automation-center.spec.ts` 的「AW2：模板只填草稿，目录组合筛选并保留原计划身份」「AW5：筛选原发生和逐项效果，重新读取不会再次发送通知」「AW4 AU16 专注来源与中心共享计划修订和下次时间」，以及 `tests/e2e/perf.spec.ts` 的「F23 大库正文保存记录路径树 RPC、字节和交互耗时」。统一由 J03–J06、J12、SIGN 合并取证。
- 未运行 — E2E、构建、打包、全仓检查及视觉取证。W7 新候选的发布制品、真实 provider、Mail 冷/热 p95、Agent 历史前后读取量和多工作台 Core 查询样本待组合验收。已回收本次验证终端。

## Lead 验收

- Lead 2026-11-25：合入 main 23b4d4aa；W7 验收通过；账本原型扩展待用户确认。
