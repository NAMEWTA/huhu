# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1yy
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/report02.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/111-rc.md
- 执行结果 — done

## 成果与运行指针

RC 指派的 13 个 Agent／自动化／其他组 E2E 用例已逐个处理。工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，基线 `4757d51f`，交回提交 `57bc6a6f35b05a72eb614e37926408d7154a9fd5`，工作区干净。具体用例需 Lead 在组合候选运行。 [原始全量失败证据](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/e2e-failures.txt) · [NDJSON 轨迹与失败上下文](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/e2e-failures)

| 待 Lead 运行的 E2E 路径及用例名 | 根因及改动 |
| --- | --- |
| `tests/e2e/perf.spec.ts` · 任务列表 1,000 行滚动：没有超过 50 ms 的长任务 | 轨迹记录 1,001 个 DOM 行，滚动出现一次 66.7 ms 帧间隔。源码核对显示任务表早已有整表渲染，原轨迹没有 CPU profile，具体引入提交与耗时分布未证实。`plugins/tasks/src/ui/tasks.css` 对各状态组第 41 行起启用原生离屏渲染延后，按原高度提供占位。测试先确认全部夹具已呈现，保留严格阈值和 120 ms 正对照，并增加 Tab 跨过延后渲染边界的检验。需在组合候选验证性能和键盘结果。 |
| `tests/e2e/shell.spec.ts` · Agent CLI：新建 Space 指向 Vault 外目录，只写 .huhu/agent-cli/spaces/，不启动任何进程（ACC-AG-01） | `e2b84a15` 的 Space 树在选中入口旁增加折叠按钮，旧名字子串匹配了两个按钮。改为直接定位 Space 入口，保持原目录断言。 |
| `tests/e2e/shell.spec.ts` · Agent CLI 历史：Claude 与 Codex 在原目录创建独立分支，恢复原会话并定位分栏 | 轨迹中 Codex 终端已登记为 running，但无子 UUID。F09 `5eb06e3d` 移除了每次历史列表读取的全量 Core 对账，迟到回执因此没有机会被确认。工作台会话与历史读取复用原已验证的进程绑定和签名回执，确认后保存并发出原事件。CLI、MCP 与只读 Vault 保持原读取路径。Engine 测试实测先绑定、后发布回执的时序，修复后无需增加 Core 查询。 |
| `tests/e2e/shell.spec.ts` · 同步设置用 Versioning 凭据补配旧 HTTPS 目标，换目标后明确提示重新配置 | GitPlan `2d5f2254` 将同步模式移到 Automations 持有。继续检查磁盘目标与分支、原凭据无残留，改从设置页单选状态验证模式为 off，并检查配置文件不再保存模式字段。 |
| `tests/e2e/shell.spec.ts` · 首页：专注计时到点（ACC-WB-06）、习惯勾选持久化、自定义隐藏卡片；停用任务插件后任务卡片隐藏 | F32 `f0b07078` 之后到期需要真实 Automations 截止计划，旧夹具只写 `running: true`。改为经 `home.focus.update` 启动，经 `automations.plans.submit` 缩短同一计划截止时间。保留重开、结算、通知及其它首页断言。 |
| `tests/e2e/shell.spec.ts` · 自动化规则编辑器：新建 Agent 规则（Space / CLI / 提示词 / 每天 09:30）默认暂停，编辑后提示词与时间写入规则文件 | 轨迹最后一步是填「时刻」。U1 `455ff748` 换用共享 `DateInput`，引入「清除时刻」操作。精确定位字段，保留保存及原样写盘断言。 |
| `tests/e2e/workflows/acceptance.spec.ts` · W05-W06 旧看板任务卡保留独立筛选、时区与布局，冲突后重读任务 | UX18 `de2e5de9` 将卡片标题编辑迁入「设置」对话框。用新入口修改同一卡片，保留迁移及布局对比。 |
| `tests/e2e/workflows/acceptance.spec.ts` · ACC-AG-05 切换 Space：右侧历史只显示当前 Space 目录的会话，搜索框被清空 | 与 ACC-AG-01 同源，创建后检查与切换都精确选择 Space 入口。 |
| `tests/e2e/workflows/acceptance.spec.ts` · Agent CLI 智能体设置页：列出检测状态，设置默认模型并持久化到 agents.json，命令行预览实时刷新；刷新检测；重启 Core 需确认；菜单里的“智能体设置…”可达 | `664996ad` 起显式刷新包含版本与原生历史能力探测，旧假 CLI 对 `--help` 也固定睡眠 30 秒，第二次刷新恰卡在 5 秒探测超时与老断言边界。夹具明确响应 `--help`，仍精确断言实际两次版本探测。 |
| `tests/e2e/workflows/acceptance.spec.ts` · Combobox：任务“项目”可从已有项目中搜索选择，也可直接输入新项目；版本历史“当前文件”可搜索 | 当前输入与 listbox 共享可访问名称，旧 `getByLabel` 在弹层展开后同时命中两者。改用具体 `combobox` 角色和精确名称，保留键盘操作。 |
| `tests/e2e/workflows/automation-linux-approval-revoke.spec.ts` · Linux 桌面对话框在系统 sh 无法核对时仍可撤销原批准 | 原作业工作树缺原生 PTY helper，`fc38dc86` 的执行映像核验要求令夹具创建到期前原批准失败。通过共享测试 helper 校验并把项目现有 native binary 路径显式传入 Electron，保留原批准及模拟核对失败后的撤销动作。 |
| `tests/e2e/workflows/automation-linux-environment.spec.ts` · Linux 桌面批准 sh，CLI 和 MCP 配置及运行沿用原请求 | 和撤销用例缺同一 helper，导致批准按钮保持禁用。开发模式用同一启动夹具，安装包分支继续使用内置资源。需要可用的 Linux Secret Service。 |
| `tests/e2e/workflows/workbench-baseline.spec.ts` · UX08 实际 PTY 随分栏、视口和字号同步，末行完整可见 | UX08 `012ab2b8` 的 Fit 在动画帧执行。旧用例在视口及字体刚变更时立即向 shell 写命令，失败记录显示 PTY 4 行而 DOM 网格 6 行。现等待 xterm 实际网格完成还原／变化后再发测量命令，保留本地 PTY 与末行、光标、裁剪、列数断言。保留的轨迹不足以确认原失败的具体子步骤，此同步改动需 Electron 和 Web 复验。 |

### 改动文件

- `plugins/agent-cli/src/engine/{index,sessions}.ts` 与 `apps/engine/test/agent-history.test.ts`
- `plugins/tasks/src/ui/tasks.css` 与 `tests/e2e/perf.spec.ts`
- `tests/e2e/shell.spec.ts`、`tests/e2e/helpers/launch.ts`
- `tests/e2e/workflows/{acceptance,automation-linux-approval-revoke,automation-linux-environment,workbench-baseline}.spec.ts`

### 已运行

均在 `inv-w2` 持 `/home/wta/projects/huhu/temp/dev/verify.lock` 串行，每次一个文件，Node 24.22.1。 [完整命令与退出状态](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task02/verification-status.txt)

- `volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/agent-history.test.ts`。旧夹具 3/3，加入延迟回执后精确复现一次失败，修复后 3/3。 [失败](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task02/agent-history-red.log) · [通过](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task02/agent-history-fixed.log)
- `volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/engine.test.ts -t 'F32：专注截止'`，1/1。 [日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task02/focus.log)
- `volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/sessions.test.ts -t '原生历史启动'`，2/2。 [日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task02/agent-sessions.log)
- `volta run --node 24.22.1 pnpm --filter <包> run typecheck` 依次检查 `@huhu/engine`、`@huhu/plugin-agent-cli`、`@huhu/plugin-tasks`，零错误。沿用 task01 已生成的 vendor 类型。
- `git diff --check` 及暂存差异检查通过。该轮临时 Core 验证终端已回收。

### 未运行

未执行 Playwright E2E、全量单测、构建、打包、全仓类型检查、全仓 lint、Knip 或视觉截图。性能实际结果、PTY 尺寸链路、Linux Secret Service 和两个 Linux 审批 spec 需由 Lead 复验。官方真实线上 provider、外部服务、Windows 和 macOS 未验证。

非安装包 Linux 审批复验可用已有构建产物，设置 `HUHU_AGENT_PTY_HOST=/home/wta/projects/huhu/native/agent-pty/bin/huhu-agent-pty`。VAULT 内用例使用合成值。若 perf 严格复验仍出现长帧，现有 `HUHU_PERF_DIAGNOSTICS=1` 路径可以收集基线及修复后的滚动区间和 CPU profile。

## 阻碍与接续

无 worker 实施阻碍。Lead 按表复验同一组合候选。性能长帧与 Web PTY 竞态的归因保留上述证据边界。

## Lead 验收
- Lead 2026-11-25：合入；进入第二轮最终全量（主检出）。
