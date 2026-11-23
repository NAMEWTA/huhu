# task01.md #8 与 #9 剩余切片：S8.2、S2.3、P3.4、P10.1/P10.2

## 定位

- 共享根、topic、manifest 同其他任务。terminal_address — `t33`（实际终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t33/task01.md`；报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t33/report01.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-mail-safe`，HEAD `1c2f8089`（集成最新）。候选父为 `1c2f8089`。

## 目标

逐个对照切片文件与当前代码分类（已完成 / 部分 / 缺失），只补缺口，按顺序：

1. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S2.3-read-message.md`
2. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S8.2-remote-files-oauth.md`（含 Web 草稿附件；OAuth 只用回环夹具或测试服务，不连真实邮箱、不用真实凭据）
3. `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P3.4-copy-password.md`
4. `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P10.1-external-safe.md` 核对，`/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P10.2-cutover-evidence.md`：逐个现行消费者（Git/Versioning、SSH、Agent 启动环境、Automations 运行环境、Mail）核对已切到所属模块凭据，Safe 锁定后各模块自有认证仍可用。SSH 插件由另一实施者在写，只读核对；发现 SSH 缺口写入报告交 Lead，不改 `plugins/ssh/**`。

2026-11-21 定案见 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`（Mail AI 外发需工作台一次性批准等）。复用优先：Huhu 现有实现、`temp/sources`。已合入的 #6 会话身份与 Mail/Safe 暴露直接复用，不改 dispatcher/MCP/contracts 调用身份。

## 职责边界（AGENTS.md「实施者职责边界」，强制）

- 只写业务代码、对应单测与 E2E spec；只跑改动涉及的单个 vitest 文件（`pnpm exec vitest run <路径>`），不调高并发。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/lint/knip/format:check、启动 Playwright/Electron/xvfb、截图。E2E 只写不跑。
- 写报告用带引号 heredoc（`<<'EOF'`），避免反引号展开误启动命令。
- 可写范围：`plugins/mail/**`、`plugins/safe/**`（或 Safe 实际所在插件/包）、各模块凭据接线的最少行（单列）、`packages/workbench/src/` 中 Mail/Safe 视图、对应测试与 `tests/e2e/**` 本切片 spec；`apps/engine/src/boot.ts` 仅最少装配行（单列）。HTML/CSS/客户端 TS 先执行 zh-modern-web-guidance 的 search 与 retrieve；桌面能力经 `window.huhuHost`，Web 按 Baseline Widely available。禁止改 `plugins/ssh/**`、Kernel dispatcher/server/MCP/contracts 调用身份、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault、凭据、邮箱或系统钥匙串（测试用临时 XDG/隔离 Secret Service）。

## 产物

- 候选提交（临时索引，父 `1c2f8089`，见 topic「决定与交接」第 2 条），工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。可按切片链式提交多批，在报告中逐批记录，不必每批停下。
- 证据：`/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/evidence/S2.3-S8.2-linux.md`、`/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence/P3.4-P10-linux.md`。
- 报告按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：逐切片分类表、改动、已跑 vitest、单列「未运行的验证」（E2E 文件+用例名）。先写 `.tmp` 再 `ln` 发布，全部完成或上下文超过 80% 时发布并打印报告绝对路径后停下。
