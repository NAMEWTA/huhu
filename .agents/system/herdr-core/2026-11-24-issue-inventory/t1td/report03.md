# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1td
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1td/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1td/report03.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/` 下的 `052-ux08.md` 与 `054-ux10.md`
- 执行结果 — done（回归用例交回，待 Lead E2E 验收）

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，快进基线 `e715abdb`，交回版本 `a15d4d3327582ae3bfb07dd7ca0850f0c6487b6c`，工作树干净。两票独立提交，均附 `Refs: #14`。改动落在 Playwright 用例。

使用 Lead 的 `6f0a8c89` 候选日志 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ux08-10.log` 对照。调查时该批 `test-results` 下的失败 trace 已不可读，以下按日志、基线差异和实际源码判断，原始交互的复验由 Lead 执行。

### UX08 · cce1dd9355383cba1db24a6d91b245544655a246

- 改动文件 — `tests/e2e/shell.spec.ts`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 分栏拖动 — 对照 `1b7bcb6d..6f0a8c89`，`WorkspaceCanvas` 的拖动、指针捕获、Escape 与分隔条 CSS 命中区无差异。键盘保存把比例写到查询缓存后立即使布局查询失效，`aria-valuenow=60` 可以早于 `aria-disabled=false`。原用例仅等前者便发出裸坐标按下，存在命中禁用分隔条的窗口。现等待比例入账且分隔条可编辑，并用定位器的 hover 命中检查后再拖出手柄。拖动时断言预览值变化且保存值仍为 60，Escape 后复原。
- Web PTY — 双宿主共用 Engine 和 Vault。Web 启动前既有 Electron 分栏，旧用例允许 `terminal-view.first()` 的 open 状态先命中其中的观察者。终端桥只允许控制连接输入和调整尺寸。已核对共享 `TerminalView` 先量网格再带 rows/cols 建连，且连接期间的变更在 open 时补发。用例现从真实 `agent.workspace.launch` 回执取得 sessionId 和 leaf，等待指定终端打开，并将首次输入、分栏及缩放都绑定到该 pane。继续用实际 `stty size`、末行、光标、显隐、视口和字号作断言。
- 定向单测 — 分别运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/terminal-bridge.test.ts` 与同前缀下的 `plugins/agent-cli/test/split-layout.test.ts`。终端桥 1 项通过，分栏布局 6 项通过。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-agent-cli run typecheck`，0 错误。
- Lead E2E — `tests/e2e/shell.spec.ts -g '递归分栏在两个 Space'` 的「Agent CLI 递归分栏在两个 Space 隔离，终端身份、比例和收起的会话在重开后保留」；`tests/e2e/workflows/workbench-baseline.spec.ts -g 'UX08 实际 PTY'` 的「UX08 实际 PTY 随分栏、视口和字号同步，末行完整可见」。

### UX10 · a15d4d3327582ae3bfb07dd7ca0850f0c6487b6c

- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。
- 判断依据 — 假 Claude 每个 argv 写一行，现有 resolver 把模型排在推理参数之前。Lead 失败日志中的文本恰为输出末尾，同批另一条「悬停智能体打开子菜单」用实际进程参数文件断言 `--model opus`，且已通过。窄窗只读当前 xterm 可见行最符合该结果。
- 修复 — 假 CLI 将完整 argv 写入临时文件。按每个宿主唯一的提示词核对新一轮参数，断言 `--model opus` 和 `--effort high` 的实际相邻参数，随几何记录附上 argv。终端仍检查本轮提示词回显，按启动回执定位。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/agent.test.ts`，27 项通过，1 项 Windows 批处理用例跳过。
- 包类型检查 — 以同一命令复跑 `@huhu/plugin-agent-cli` 类型检查，0 错误。两个改动的 spec 通过 Node 语法检查。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts -g 'UX10 按需启动器'` 的「UX10 按需启动器支持模型搜索、键盘返回和窄窗启动」。

### 未运行的验证

Linux Electron、独立 Web 的 Playwright 复验与视觉取证待 Lead 执行。`workbench-baseline.spec.ts` 需要 `HUHU_U0_DESKTOP_APP` 指向候选构建。真实 Pi/Codex/Claude、外部服务、构建、打包和全仓检查本轮未运行。

## 阻碍与接续

实施无阻碍。Lead 可在同一候选复验上述三条。已移除本轮检查终端。

## Lead 验收
- Lead 2026-11-25：合入 main 2e30184d，5/5 通过，UX08、UX10 验收通过。会话上下文 75%，回收后换新会话。
