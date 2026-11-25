# 派发回执

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory`
- terminal_address — `t1v2`
- task — `task08.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task08.md`
- 回执文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report08.md`
- 业务验收报告 — `.agents/dev/changes/2026-11-24-issue-inventory/evidences/{104-aw6,108-aw7}.md`，由 Lead 写入
- 执行结果 — `done`，交回实施与证据，AW2 根因和实机复验待 Lead

## 成果与运行指针

- 工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `2843d2b17a5e7bcf7be4c4a7d44de0015839e212`，交付 HEAD `92fe101cfac62e29407c2ed33fa2299fab325eab`。业务工作树干净。
- 对照、单测与类型检查原件在 [task08](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08)。读取 Lead 的 [首轮 E2E 日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-l11ui-aw6.log) 与两份原始 Playwright `test.trace`。

### AW6 · 第一次回归修复

- 提交 `b61b03c88ecf1f03279a1ace48f6e9b56f435bbe`。改动文件为 `apps/engine/src/boot.ts`、`apps/engine/test/engine.test.ts`、`plugins/agent-cli/src/engine/index.ts`、`packages/workbench/src/engine-client/query.ts`、`packages/workbench/test/engine-client.test.ts`、`tests/e2e/workflows/automation-center.spec.ts`。
- Shell 原用例已成功保存固定需求规则，详情里的「立即运行」仍为原生 disabled，直到 30 秒超时。定向测试通过公开 HTTP 入口复现同一可用性错误。Agent 设置更新先刷新 Agent 自己的检测快照，自动化读取仍使用启动探测留在 `boot.ts` 的另一个副本。测试在启用 Codex 后得到 `availability.state=blocked`，动作只有改期和删除。
- 计划与执行资格读取统一使用 Agent 的当前检测快照。扫描前仍沿既有探测入口更新结果。设置修改或显式重新检测后，工作台收到 Vault 内事件，刷新相关目录、详情、摘要与 Agent 查询。原计划修订、暂停意图与无发生状态在 CLI 停用、启用、再次停用各步保持原值。外部 HTTP 凭据原始事件隔离用例仍通过。
- AW2 轨迹的最后一步在 `automation-center.spec.ts` 第 11 行，`engine-state` 已就绪，打开「自动化」的首次点击没有结束，模板与列表尚未执行。轨迹只有测试调用记录，缺少页面快照和点击的动作日志，无法判断侧栏缺失、被遮挡或其他启动条件。E2E 改为点击具名侧栏内的精确按钮，并给可见性和点击各自单独的 10 秒错误位置。现有模板和筛选验收断言保留。当前没有 AW2 产品根因或修复后的实机结论。

### AW7 · 真实集成与交付准备

- 提交 `92fe101cfac62e29407c2ed33fa2299fab325eab`。改动 `tests/e2e/workflows/engine-lifecycle.spec.ts`，两条用例复用原 TW7 常驻 Engine 夹具。
- 新用例从桌面创建真实任务提醒，在获邀 Web 确认同计划与未来时刻。关闭整个浏览器及桌面后，由真实 Engine HTTP 记录证明原计划在进程仍常驻时完成。重新打开两个客户端后，同一计划、修订、实际时刻、发生和唯一通知回执仍可读取。
- 逐项 AU01–AU20 对应到真实消费者、已有修订、原型状态、可执行场景与缺口。对照 AW0 固定的 Orca/T3 源码、用户确认的 AW1 原型、W5d 旧入口与字段清单、AW5/AW6 公开路径。该对照归入交回附件。[AU01–AU20 对照](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw7-coverage.md)

### 实际执行的验证

以下命令均在 `flock /home/wta/projects/huhu/temp/dev/verify.lock` 下执行，每次一个测试文件，并在持锁后检查主机、cgroup、磁盘与 inode。使用 `volta run --node 24.22.1 pnpm`。

| 命令后缀 | 结果 |
| --- | --- |
| `exec vitest run apps/engine/test/engine.test.ts -t 'AW6：固定需求计划'` | 修复前 1 例按预期失败，启用后仍受阻。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw6-cli-before.log) |
| `exec vitest run apps/engine/test/engine.test.ts -t 'AW6：固定需求计划\|automations.update 可以改规则正文\|F18 HTTP 凭据不能订阅原始工作台事件'` | 修复后 3 例通过，49 例被筛除。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw6-cli-after.log) |
| `exec vitest run packages/workbench/test/engine-client.test.ts` | 38 例通过。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw6-workbench.log) |
| `exec vitest run plugins/agent-cli/test/agent.test.ts` | 27 例通过，1 例跳过。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw6-agent.log) |
| `exec vitest run plugins/automations/test/task-scan-occurrences.test.ts` | 31 例通过。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw6-scan.log) |
| `exec vitest run plugins/automations/test/plan-directory.test.ts` | 4 例通过。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw7-plan-directory.log) |
| `exec vitest run plugins/automations/test/periodic-plans.test.ts` | 1 例通过。[日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/aw7-periodic.log) |
| 分别执行 `--filter @huhu/{engine,plugin-agent-cli,workbench} run typecheck` | 3 个包均退出 0。日志为 `typecheck-*.log`。[退出状态](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task08/verification.status) |

提交前 `git diff --check` 与两份变动 Playwright spec 的 TypeScript 语法解析通过。验证终端 `t1xx`、`t1xy`、`t1xz` 均已退出并回收。

## 阻碍与接续

- Lead 在同一候选串行运行 `tests/e2e/shell.spec.ts`「自动化运行：Agent 规则经 Tasks 派遣，运行页显示已完成和结果并可定位原会话」、`tests/e2e/workflows/automation-center.spec.ts`「AW2：模板只填草稿，目录组合筛选并保留原计划身份」和「AW6 AU16 AU17 获邀 Web 在任务来源管理原提醒，停用来源时中心显示准确状态」。如 AW2 仍失败，保留动作日志及 Engine 插件状态、侧栏 DOM 或 Electron 控制台，定位是否缺失入口或事件被遮挡。
- Lead 运行 `tests/e2e/workflows/engine-lifecycle.spec.ts`「TW7 桌面附着当前常驻 Engine，退出工作台后同一端点继续服务」和「AW7 AU18 桌面和获邀 Web 全部关闭后，同一常驻 Engine 按原计划只递送一次」。
- 本轮 worker 未运行 E2E、构建、打包、全仓检查、截图、真实外部 provider 或渠道。组合验收、最终制品及整体目录的 0/1k/10k 与多客户端 Core 查询证据仍归 J12/J13/J14/J18 和 SIGN。原通知反向深链、全局暂停统一端口、任意来源的排期与外部效果亦在对照中标明缺口。

## Lead 验收
- Lead 2026-11-25：合入 main 44b37c6f；AW6 回归修复通过、AW7 通过；AW3 间歇超时派 task09。
