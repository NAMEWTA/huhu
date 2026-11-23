# task01.md #7 H11.2 已授权 SSH 作业、输出游标与取消（接续 WIP c23a8258）

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t5`
- 身份核对 — 本机 Linux 默认 Core，终端名 `h112-ssh`。Lead 在 Core 外部，worker 进程内 `HC_TERMINAL_ID` 应为 `t5`（若为空，以本文件和 manifest 为准）。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径，然后停下等待。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/ssh-exec`（分支 `impl/huhu-issues-3-10-ssh-exec-jobs`，HEAD `c23a8258`，父 `be7a8b8e`）
- 接续依据 — Windows 主题 `t18v/task15.md`（同仓 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task15.md`）未出报告；原 6 文件 WIP 已快照为 `c23a8258`，未验证。旧文件里的 `D:/Document/code/huhu` 对应本机 `/home/wta/projects/huhu`，旧 worktree 路径对应本任务工作目录。

## 目标与输入

完成 task15 的原目标：交付一条单独授权、默认关闭、可实证的 SSH Exec 作业链，返回稳定 jobId、明确生命周期、有界 UTF-8 字节输出与 cursor 跳过标记、真正的退出理由，以及按原 job 取消。先完整审阅 `c23a8258` 的 WIP（`git show c23a8258`），保留其中正确的部分，修复或补齐缺陷，不要从头重写。

必读：task15 全文；`.agents/dev/changes/2026-11-19-issue-7-ssh-module/` 的 `spec.md`（§12、A13、A16）、`design.md`、`plan.md`、`tasks/H11.1*`、`tasks/H11.2*`、`tasks/H11.3*`、`evidence/H11.1-public-resources-windows.md`；#6 的 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/` 中 G5c 相关任务和设计。复用 H11.1 的主体/路由/指纹、实际 SSH 会话、现有 Exec 通道和资源所有者（`plugins/ssh/src/engine/`）。

task15 的不变量照旧适用：host / attempt / session / job 独立标识并保留原路由身份；新启动要求当前启用的授权，并核对主机、路由版本和真实连接，不借用短命信任探针；拒绝跨主体、错 Vault、过期版本或任意 Workbench 运行 ID；同意图重交按真实 task 的重试语义，本机底层接收超时标为待核实，绝不自动重复执行；关闭观察不取消作业；只读目录与读取不拨号、不经状态夹带凭据；输出保留量有界；退出后回收连接。未完成的 Shell/SFTP 部分列入报告。

## 读写范围与产物

- 可读范围 — 整个仓库及 `/home/wta/projects/huhu/temp/sources/`（若缺 motty/viva，不要联网克隆，在报告中写明）。
- 可写业务范围 — `plugins/ssh/**`（源码、测试、SSH 领域证据）、`.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/`、`.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H11.2*` 的状态记录。
- 禁止改动 — `apps/engine/**`、`apps/desktop/**`、`packages/**` 的公共装配与公共契约、插件全局注册、Vault 包收集器、根 `package.json`/`pnpm-lock.yaml`、其他插件。需要 Engine/Gateway 接线时，用 SSH 包内的最小测试装配验证，并在报告里写出 Lead 要做的精确接线（文件、位置、代码）。不得 push，不得改其他分支，不得启动子 agent。
- 预期产物 — 在本分支上的一个或多个已提交的非 WIP 提交（可以在 `c23a8258` 之上继续提交；不要 rebase 或改写已推送历史），H11.2 证据文件 `evidence/H11.2-exec-jobs-linux.md`，以及报告。

## 验收与验证

- 使用回环隔离的假 SSH 服务与合成输出；不连接真实主机，不使用真实凭据，不写远端 Git。
- 至少用自动化测试覆盖：同 jobId / 同意图重交不重复执行；按字节段读取（含多字节中文跨块边界）与 cursor 跳过标记；并发启动/读取；失败、撤权、错主体、错 Vault、过期路由版本被拒绝；取消按原 job 生效且零重复执行；关闭观察不取消；退出后连接回收；输出上限。
- 运行：`pnpm --filter <ssh 包名> typecheck`（或仓库根 `pnpm typecheck` 中与 SSH 相关部分）、SSH 相关 vitest 文件、`pnpm lint`、`pnpm format:check`。如能经实际 CLI/MCP 同一入口执行，分列证据；不能则写明原因。
- 环境：Node 24.21.0 已在 PATH 前；依赖已用 `pnpm install --frozen-lockfile` 装好，不要改锁文件。
- 报告逐条列出：实际提交 SHA、改动文件、运行的命令与结果（通过/失败/跳过计数）、未完成项与 Lead 接线清单。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址 `t5` 与任务文件名。manifest 当前行须为 `t5	task01.md	active`。
2. 先查报告路径。已有身份匹配的终稿则仅打印路径；身份不符则停止说明。
3. 一个终端同时执行一项任务。上下文丢失时先查已有产物与 git 状态。
4. 只在给定范围内写业务产物。协作文件只写自己的报告和同目录临时稿。
5. 按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md` 格式完成报告：先写同目录临时稿 `report01.md.tmp`，核对身份后用不覆盖目标的方式发布（例如 `ln report01.md.tmp report01.md && rm report01.md.tmp`）。
6. 终稿发布后在终端打印报告绝对路径并停下。
