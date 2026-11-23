# task01.md #4 剩余切片：W5.2、agent.catalog.detect 工作台路径、W8.2/W8.3 代码部分

## 定位

- 共享根、topic、manifest 同其他任务。terminal_address — `t32`（实际终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t32/task01.md`；报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t32/report01.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-w4-agent`，HEAD `7cfed9bf`（集成最新，已含 #5 T7.1 生产切换 `d2601f83`）。候选父为 `7cfed9bf`。

## 目标

逐个对照切片文件与当前代码分类（已完成 / 部分 / 缺失），只补缺口：

1. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W5.2-history-restore.md`（参照 W5.1/W5.3 已有实现）。
2. `agent.catalog.detect`：当前保持关闭，原因是它会启动探测。按 t19 盘点（`/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t19/report01.md` 搜 `agent.catalog.detect`）改为工作台读路径用缓存，探测只经工作台显式触发；外部只读版本零副作用后按 #6 规则开放（`exposable: true`、`defaultExposed: false`），或写明保持关闭的理由。
3. `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W8.2-integrated-workspace.md` 与 `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W8.3-acceptance-package.md`：只做代码与 E2E spec 部分（#5 T7.1 已切换的调用方、回执/ACK 双边签收夹具，含 t31 报告列出的“随包缺少可截断内部 Agent → Tasks ACK 的验收夹具”）。**不打包、不生成安装包**，打包与随包验收由 Lead 在最终 main 上统一执行；spec 中需安装包的用例用环境变量显式启用并写明 skip 条件。

2026-11-21 定案见 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`。复用优先：先找 Huhu 现有实现、`temp/sources`（Herdr、Codex 上游）。采用上游代码时更新来源台账。已合入的 #6 会话身份和 Agent CLI 暴露直接复用，不改 dispatcher/MCP/contracts 调用身份。

## 职责边界（AGENTS.md「实施者职责边界」，强制）

- 只写业务代码、对应单测与 E2E spec；只跑改动涉及的单个 vitest 文件（`pnpm exec vitest run <路径>`），不调高并发。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/lint/knip/format:check、启动 Playwright/Electron/xvfb、截图。E2E 只写不跑。
- 写报告用带引号 heredoc（`<<'EOF'`），避免反引号展开误启动命令。
- 可写范围：`plugins/agent-cli/**`、`plugins/tasks/src/engine/receipt-inbox.ts` 等回执消费最少行（单列）、`packages/workbench/src/` 中 Agent 相关视图、对应测试与 `tests/e2e/**` 本切片 spec；`apps/engine/src/boot.ts` 仅最少装配行（单列）。HTML/CSS/客户端 TS 先执行 zh-modern-web-guidance 的 search 与 retrieve。禁止改 Kernel dispatcher/server/MCP/contracts 调用身份、SSH 插件、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault、凭据或原生 Agent 历史（只用夹具与临时 HOME）。

## 产物

- 候选提交（临时索引，父 `7cfed9bf`，见 topic「决定与交接」第 2 条），工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
- 证据追加到 `/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/evidence/`（新建 `W5.2-W8-linux.md`）。
- 报告按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：逐切片分类表、改动、已跑 vitest、单列「未运行的验证」（E2E 文件+用例名）。先写 `.tmp` 再 `ln` 发布，发布后打印报告绝对路径并停下。
