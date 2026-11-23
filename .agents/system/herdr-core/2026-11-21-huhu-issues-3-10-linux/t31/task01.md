# task01.md #5 剩余切片：T1.4、T4.1、T5.5、T7.1 生产切换、T7.2 任务旅程

## 定位

- 共享根、topic、manifest 同其他任务。terminal_address — `t31`（实际终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t31/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t31/report01.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-t5-tasks`，HEAD `369efcfd`（集成最新）。候选父为 `369efcfd`。

## 目标

逐个对照切片文件与当前代码分类（已完成 / 部分 / 缺失），只补缺口：

1. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T1.4-retry-snapshot.md`
2. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T4.1-available-at.md`
3. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T5.5-edit-schedule.md`
4. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md`：定时、手动和列表的生产调用方切到持久派遣与执行槽（见 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/progress.md` 第 68 行），目标预检与规则配置一并核对。这是 #4 W8.3 的前置。
5. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T7.2-full-task-journey.md`：写完整任务旅程 E2E spec（Linux 可跑部分）；需要 Windows 或真实 provider 的部分写明并 skip 理由。

2026-11-21 定案见 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`，按定案实现，不重新讨论。已合入的 #6 Tasks/Automations 暴露（`exposable`、意图键、会话身份）直接复用，不改 dispatcher/MCP/contracts 调用身份。复用优先：先找 Huhu 现有实现与 temp/sources。

## 职责边界（AGENTS.md「实施者职责边界」，强制）

- 只写业务代码、对应单测与 E2E spec；只跑改动涉及的单个 vitest 文件（`pnpm exec vitest run <路径>`），并发由根配置限制，不调高。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/lint/knip/format:check、启动 Playwright/Electron/xvfb、截图。E2E 只写不跑，保证类型自洽。
- 写报告时用 heredoc 带引号定界符（`<<'EOF'`），避免反引号被 shell 展开误启动命令。
- 可写范围：`plugins/tasks/**`、`plugins/automations/**`、对应测试与 `tests/e2e/**` 中本切片的 spec；`apps/engine/src/boot.ts` 仅限最少装配行（报告单列）。禁止改 Kernel dispatcher/server/MCP/contracts 调用身份、其他插件、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault、凭据或原生 Agent 历史。

## 产物

- 候选提交（临时索引，父 `369efcfd`，见 topic「决定与交接」第 2 条），工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
- 证据追加到 `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/evidence/`（新建 `T7-cutover-linux.md`）。
- 报告按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：逐切片分类表、改动、已跑 vitest、单列「未运行的验证」（E2E 文件+用例名）。先写 `.tmp` 再 `ln` 发布，发布后打印报告绝对路径并停下。一轮上下文不足时按 1→5 顺序提交一批，报告写清剩余。
