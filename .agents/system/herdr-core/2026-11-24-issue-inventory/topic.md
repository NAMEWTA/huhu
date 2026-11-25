# 2026-11-24 Issue Inventory 实施

由 Lead 填写。交接时更新负责人、连接上下文和接续依据。

## 目标与验收

- 目标 — 完成 `.agents/dev/changes/2026-11-24-issue-inventory` 的 134 张票（#7/#11/#12/#13/#14/#16/#17，#15 统筹），合入 main 并推送 origin/main。
- 验收 — 每票按 `tasks/<票>.md` 验收条目在 Linux 与独立 Web 上取得真实证据，Lead 回写 `evidences/<票>.md`；组合验收 J01–J22 在同一候选执行。
- 约束 — 用户 2026-11-24 决定：Windows 和 macOS 不做验证，只验证 Linux 与 Web。项目资源限制见根 `AGENTS.md`：1 Lead + 2 worker，3 个检出，同机 1 项重验证。worker 只跑定向单测（一次一个文件），E2E 只写不跑。

## 共享位置与负责人

- Lead — Claude Code，本机默认 Core 终端 `t1hr`
- Core 连接 — 本机默认 herdr-core（hc 0.1.22），无远端
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory`
- 目录规则 — `encodeURIComponent(terminal_address)`
- 协调项目根 — `/home/wta/projects/huhu`，Change `.agents/dev/changes/2026-11-24-issue-inventory`
- worker 代码目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`（分支 `inv/w1`）、`/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`（分支 `inv/w2`）
- Issue 快照 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/<NN>.md`

## 决定与交接

- 2026-11-24 回收 11-23 旧验收遗留进程（用户批准），保留 `/tmp/huhu-closeout-native-history.*` 目录。
- worker 在各自分支提交；Lead 审查、跑定向验证后 `--no-ff` 合入 main，worker 随后在新 task 前将分支快进到 main。
- 验证名额：本机所有定向单测、E2E、类型检查等重任务统一用 `flock /home/wta/projects/huhu/temp/dev/verify.lock <命令>` 串行，Lead 与 worker 共用。
- E2E 环境：本机会话为 Wayland，Electron 在 xvfb 下需 `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 xvfb-run -a ...`。真实 Codex 用例用 `HUHU_CODEX_DISPATCH_BIN=/home/wta/projects/huhu/temp/dev/codex-0.170.0/codex-x86_64-unknown-linux-musl`（官方 0.170.0，SHA-256 880819aa…2971）。
- 2026-11-25：t1ht（codex-inv-w2）上下文 81%，task11 验收后回收；新会话 t1rb（codex-inv-w2b）接手同一检出 inv-w2。
- 2026-11-25：t1hs（codex-inv-w1）上下文 79%，task11 验收后回收；新会话 t1s2（codex-inv-w1b）接手 inv-w1。
- 2026-11-25：t1s2（codex-inv-w1b）上下文 94%，task02 交回后回收；新会话 t1t7（codex-inv-w1c）接手 inv-w1。
- 2026-11-25：t1rb（codex-inv-w2b）上下文 94%，task03 交回后回收；新会话 t1td（codex-inv-w2c）接手 inv-w2。
- 2026-11-25：t1td（codex-inv-w2c）task01–03 验收后回收（上下文 75%）；新会话 t1tw（codex-inv-w2d）接手 inv-w2。
- 2026-11-25：t1t7（codex-inv-w1c）task02 交回后回收（上下文 83%）；新会话 t1v2（codex-inv-w1d）接手 inv-w1，先修 L8/L9/首页看板 E2E。
- 2026-11-25：t1v2（codex-inv-w1d）task09 验收后回收；新会话 t1y6（codex-inv-w1e）接手 inv-w1。
