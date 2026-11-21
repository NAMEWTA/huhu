# 合并工作包：w4:pT + w4:pP（Herdr 与机器重启后接续）

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w3`，分支 `closeout4/wp3`。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`，其中测试部分按下文覆盖。

背景：原各包会话两次被重启中断。中断现场已提交为 wip 提交，用户要求并行 worktree 不超过 4 个，因此两包合到本工作树，由你一并完成：
- 包一：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pT/task01.md`（现场在本分支）
- 包二：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pP/task01.md`（现场已 merge 进本分支）
- 包二已有 1 个提交（收件阅读入口/compact 输入的部分工作），合并无冲突。
先 `git status`、`git log --oneline -4`、按 wip 提交 diff 核对两包已完成到哪里（两包都没有报告）。如有未解决的 merge 冲突，先按两边意图解决并提交 merge；`vendor-replay.*` 这类生成物不要手改，最后用 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 重新生成。

## 测试纪律（用户要求，覆盖通用要求）
- 先把两包全部改动做完，再统一测试，不要边改边跑 e2e。
- 单元测试、typecheck、lint 可随时跑。Electron e2e 只在全部改动完成后跑**一次**：仅本包新增与直接相关的 spec 文件，单 worker，`--retries=0`。失败修复后只重跑失败的 spec。不要跑全量 e2e、不要跑性能测量（全量与性能由 Lead 在集成候选上统一跑）。
- 启动 Electron 前确认没有其他 Electron/Playwright 进程（`pgrep -f "electron|playwright"`），有就等。

回报写本目录 `report01.md`，两包子要求分节；manifest 中 `w5:p3` 改为 `task01.md done`。
