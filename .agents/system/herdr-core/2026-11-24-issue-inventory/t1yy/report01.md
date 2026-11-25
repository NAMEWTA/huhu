# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1yy
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/111-rc.md
- 执行结果 — done

## 成果与运行指针

RC 修复交付在 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2` 的 `inv/w2`。基线 `f69e23750039a9f6a1ad4dbf9d4d95a3dea1b252`，交回 `79c41ea6f58d444e8ffeb2362b8184e0ba583c37`，工作区干净。原始 `lint.log` 和 `unit.log` 分别记录 12 个 Oxlint 错误和 7 个失败用例。 [原始日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final) · [本轮日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task01)

| 修复 | 根因与改动 |
| --- | --- |
| Linux sh 授权、保护值轮换、原意图对账 | `fc38dc86` 起要求 Linux sh 的受保护启动 helper。RC 的 `suites.sh` 设置了 Herdr Core 路径，但测试直接调用 `boot`，因此还需显式设置 `HUHU_AGENT_PTY_HOST`。使用项目根已有 helper 后，两项均执行并通过。该项由验收命令提供夹具，产品仍要求核验执行映像。 |
| `64358995` · `apps/cli/test/cli.test.ts` | `da04886d` 将覆盖范围切换到唯一 HTTP 入口，P1/P2 聚合路由（`a57b3964`、`ff2ce914`）会将未知工具作为 JSON-RPC `InvalidParams` 返回，错误数据仍是 `CAPABILITY_NOT_FOUND`。测试此前将缺失的 `result` 交给 Zod。更新未知工具的断言，继续验证已声明但未绑定、已停用时的工具结果错误，以及卸载、名称冲突和复装。 |
| `51534171` · `packages/kernel/test/web-invitations.test.ts` | `de5c6851` 为 F06 的草稿隔离正式增加 bootstrap 的 `sessionId`。断言逐个核对三个 cookie 得到各自的真实会话 ID，同时保留撤回和监听代次验证。 |
| `5cf2cadb` · `plugins/agent-cli/test/tool-exposure.test.ts` | `b61b03c8` 为 AW6 的工作台缓存读取附加静态模型目录，刷新回包仍是检测器结果。测试验证工作台读取用原检测结果补齐模型，CLI 与 HTTP MCP 精确匹配脱敏字段，继续检查外部无法触发刷新和 Core 启动。 |
| `641a7a68` · `plugins/ssh/test/public-resources.engine.test.ts` | `5a07848e` 将面板首样本交给周期计划调度，旧测试默认只等 1 秒。基线定向复现得到 CLI 通过、HTTP MCP 超时，印证样本等待存在时序波动。`9d9ed1d5` 新增指标后，内存样本仍位于 `latest.sample.memory`。沿用现有监控测试的 7.5 秒观测上界，并在桌面采样成功后核对 CLI／MCP 仍读取不到该桌面运行。 |
| `79c41ea6` · 完整 lint | 移除废弃导入与正则多余转义，为 ZIP 路径、账本附件和导出文件名的控制字符匹配加局部说明。任务对账基准通过 Vitest 的 `mock.contexts` 取本次实例，5 个 Playwright 回调沿用已有 fixture 写法。后续 CSS gate 暴露 AW2/AW3 自动化类名前缀（`74f43657` 等）、UX01 知识库选择器（`5d3d1d21`）和未定义的 `hu-button`。同步改用插件前缀、已有上游类 token 选择器及共享 `Button`。 |

Lint 提交所属文件如下。

- `packages/vault/src/package/bounded-zip.ts`
- `plugins/inbox/src/engine/service.ts`
- `plugins/ledger/src/{engine/backup/index.ts,engine/references.ts,shared/entries.ts,shared/imports.ts}`
- `plugins/tasks/test/activity-reconciliation.test.ts`
- `plugins/automations/src/ui/{AutomationsModule.tsx,OccurrenceHistory.tsx,PlanDirectory.tsx,RuleDraftDialog.tsx,RuleEditor.tsx,automations.css}`
- `plugins/notes/src/ui/notes.css`
- `tests/e2e/workflows/{automation-center,ledger,ssh-workspaces}.spec.ts`

### 已运行

所有 pnpm 验证均为 Node 24.22.1，持 `/home/wta/projects/huhu/temp/dev/verify.lock` 串行执行。

- `volta run --node 24.22.1 pnpm --workspace-concurrency=1 --filter './vendor/*' run build:types` 通过。
- `volta run --node 24.22.1 pnpm --filter <包> run typecheck` 逐包零错误。包为 `@huhu/{cli,kernel,vault,plugin-agent-cli,plugin-automations,plugin-inbox,plugin-ledger,plugin-notes,plugin-ssh,plugin-tasks}`。 [状态与包级日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task01/verification-status.txt)
- `volta run --node 24.22.1 pnpm lint` 完整通过，包括类名、归属和重复选择器检查。还核对了两份 CSS 仅改变选择器类名或等价表示，原规则顺序和声明一致。 [完整 lint](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task01/lint-verified.log)

下表命令均使用同一锁与 `volta run --node 24.22.1 pnpm exec vitest run` 前缀。首行结果通过 Herdr Core 终端 t1z1 核对，其余有运行原件。

| 文件及用例筛选 | 结果 |
| --- | --- |
| `apps/cli/test/approved-terminal.test.ts`，设置 `HUHU_AGENT_LAUNCH_TEST_BIN="$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core"` 与 `HUHU_AGENT_PTY_HOST=/home/wta/projects/huhu/native/agent-pty/bin/huhu-agent-pty` | 2 通过，含真实 Linux sh 启动及保护值轮换。helper SHA-256 为 `ba4fbab04ab0b570b416b4b8dbd3938b6abcb399148dbd72d90f0ebb3d9b5174` |
| `apps/cli/test/cli.test.ts -t '同一 Engine 的扩展卸载与复装'` | 1 通过 |
| `packages/kernel/test/web-invitations.test.ts` | 1 通过 |
| `plugins/agent-cli/test/tool-exposure.test.ts -t 'Agent 可用性只读取脱敏缓存'` | 2 通过 |
| `plugins/ssh/test/public-resources.engine.test.ts -t 'scopes monitor reads and edits'` | 2 通过 |
| `packages/vault/test/package.test.ts -t 'bounded ZIP inspection'` | 1 通过 |
| `plugins/ledger/test/references-engine.test.ts -t '生成并保存与报表同口径'` | 1 通过 |
| `plugins/ledger/test/backup-engine.test.ts -t 'L9 portable backup'` | 1 通过 |
| `plugins/ledger/test/entries-engine.test.ts -t 'managed attachment'` | 1 通过 |
| `plugins/tasks/test/activity-reconciliation.test.ts`，启用 `HUHU_F11_BENCH=1 HUHU_F11_ASSERT_ACTIVITY=1` | 1 通过，0／1,000／10,000 条已结束运行三组均通过 |

### 未运行与 Lead 复验

- 全量单测接续时在验收进程设置 `HUHU_AGENT_PTY_HOST=/home/wta/projects/huhu/native/agent-pty/bin/huhu-agent-pty`，并沿用同一候选的有效 Herdr Core 路径。上述 7 个失败已定向复验。
- `tests/e2e/workflows/automation-center.spec.ts` 中的「AW2：模板只填草稿，目录组合筛选并保留原计划身份」「AW3：独立 Web 窄容器保留编辑内容和返回焦点」「AW6 AU16 AU17 获邀 Web 在任务来源管理原提醒，停用来源时中心显示准确状态」。
- `tests/e2e/workflows/workbench-knowledge.spec.ts` 中的「UX01：混合 Markdown 三种模式铺满知识库编辑区并保留焦点」，以及 `tests/e2e/workflows/web-share.spec.ts` 中的「F06 浏览器刷新前询问，重开后恢复未提交正文」。
- `tests/e2e/workflows/ledger.spec.ts` 中的「L6 预算页依同一筛选分页、批量编辑并显示逐月复制冲突」「L10 财务笔记可关联、打开和修复，Notes 停用时仍可记账和预览复盘」「L11 总览三张卡片定位本月预算、固定收支和贷款补记并反映新流水」。
- `tests/e2e/workflows/ssh-workspaces.spec.ts` 中的「H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸」，以及 `tests/e2e/ssh/monitoring.spec.ts` 中的「A11 独立 Web 查看两个主机的桌面采样，采样控制由桌面管理」。
- 本轮未运行 Playwright E2E、全量单测、全仓类型检查、Knip、构建、打包、视觉截图或真实外部服务验证。Windows 和 macOS 没有验证。

## 阻碍与接续

无 worker 实施阻碍。合入与整体候选验收由 Lead 接续。已回收本次运行的 Core 验证终端。交付分支和检出保留供 Lead 核对。

## Lead 验收
