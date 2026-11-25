# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1td
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1td/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1td/report01.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/` 下的 `052-ux08.md`、`053-ux09.md`、`054-ux10.md`
- 执行结果 — done（实施交回，待 Lead 验收）

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，起点 `1b7bcb6d`，交回 `df5e49d78c1ba756789e52afa392c890ec04b944`，工作树干净。三个提交各自附 `Refs: #14`。

### UX08 · 012ab2b8886831655637e1835a02d163cb3de2ca

- 改动文件 — `packages/ui/src/components/TerminalView.tsx`、`packages/ui/src/styles/base.css`、`plugins/agent-cli/src/ui/agent-cli.css`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- xterm 在扣除外层内边距的内容区测量。Agent 分栏内的终端按分栏高度收缩。隐藏分栏保留上次网格和连接，显隐、字号、DPR 与容器尺寸变化触发重新适配。WebSocket 首次连接带测得的网格，连接期间变化的尺寸在打开后补发。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/terminal-bridge.test.ts`，1 项通过。
- 包类型检查 — 按上述锁及 Node 版本分别串行运行 `pnpm --filter @huhu/ui run typecheck`、`pnpm --filter @huhu/plugin-agent-cli run typecheck`，均为 0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 的「UX08 实际 PTY 随分栏、视口和字号同步，末行完整可见」在 Electron 和独立 Web 用真实 Shell PTY 检查交替屏幕、末行、光标和 `stty size`。另用 `tests/e2e/shell.spec.ts` 的「Agent CLI 递归分栏在两个 Space 隔离，终端身份、比例和收起的会话在重开后保留」走四向分栏与拖动。请依 §10 补真实 Pi TUI、全屏与缩放风险样本。

### UX09 · e2b84a1513b372f584f7886eee75ed90873c169f

- 改动文件 — `plugins/agent-cli/src/ui/AgentCliModule.tsx`、`AgentIcon.tsx`、`agent-cli.css`、`agent-icons/`（原型的四个 SVG 与两份许可）、`tests/e2e/shell.spec.ts`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 顶部全局会话行与可展开 Space 侧栏使用同一会话来源。切换根据 Space 和 session ID 定位已有分栏或会话预览。布局顺序、空分栏入口和重排按钮进入同一行。顶部和树复用确认原型的图标。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/split-layout.test.ts`，6 项通过。
- 包类型检查 — 持同一锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/plugin-agent-cli run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 的「UX09 全局会话行与 Space 树定位同一终端，切换及刷新保留布局」。`tests/e2e/shell.spec.ts` 的「Agent CLI 跨标签移动分栏与重排标签保留实际终端」覆盖布局重排及跨标签移动。

### UX10 · df5e49d78c1ba756789e52afa392c890ec04b944

- 改动文件 — `plugins/agent-cli/src/ui/AgentCliModule.tsx`、`AgentIcon.tsx`、`LaunchMenu.tsx`、`agent-cli.css`、`tests/e2e/agents/linux-environment.spec.ts`、`tests/e2e/workflows/acceptance.spec.ts`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 一级面板容纳 Shell、可用 Agent、启动环境与设置入口。悬停、点击或键盘进入相邻配置，模型搜索、推理、Fast 和提示取决于已检测的 provider 与目录能力。返回与分层 Escape 归还焦点。面板用现有 `@huhu/ui` Radix Popover 处理视口碰撞，启动沿用原能力与设置解析。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/agent-cli/test/agent.test.ts`，27 项通过，1 项 Windows 批处理用例跳过。
- 包类型检查 — 持同一锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/plugin-agent-cli run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 的「UX10 按需启动器支持模型搜索、键盘返回和窄窗启动」用可执行 Claude fixture 验证 Electron/Web 下的实际 PTY 传参。另见 `tests/e2e/workflows/acceptance.spec.ts` 中「ACC-AG-11 本机没有任何受支持 CLI」与「Agent CLI 新建菜单：悬停智能体打开子菜单」。
 
### 未运行的验证

- Linux Electron 与独立认证 Web 的 Playwright、UI 视觉取证、真实 Pi/Codex/Claude provider 以及外部服务均待 Lead 按 §10 验收。`workbench-baseline.spec.ts` 需要 `HUHU_U0_DESKTOP_APP` 指向本批候选构建。
- 未运行构建、打包、全量单测、全量 E2E、全仓类型检查或 lint。本检出已有 vendor 类型产物。
- 运行主机 Linux `7.0.0-43-generic`。已读取本地依赖的 Electron `44.9.1` 所带 Chromium `152.0.7977.167`，该信息用于前端兼容判断。

## 阻碍与接续

实施无阻碍。Lead 可按以上用例验收。工单验收报告由 Lead 回填。已移除本次的检查终端，保留交回分支及检出供验收。

## Lead 验收
- Lead 2026-11-25：合入 main 6f0a8c89。E2E：UX09 通过；UX08（Web 样本）、UX10（缺模型参数）失败，shell 递归分栏拖动回归，返工排 task03（task02 之后）。
