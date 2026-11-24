# task01.md #9 P8.3 保险箱整代 Git 候选（接续 Windows t1c2/task02）

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t1m`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t1m`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`，HEAD `f7901b0a`（集成最新，已含 P0.1、凭据测试放开与 Mail AI）
- 接续依据 — Windows 主题 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/task02.md`（缺 report02，未开工）；`t1bh/report09.md`。
## 目标与输入

按 Windows t1c2/task02 原文执行（全文照用，路径换成本机：`D:/Document/code/huhu` → `/home/wta/projects/huhu`，原 agent-lifecycle 工作树 → 本工作目录，Windows 临时 Vault → Linux 临时 Vault）。要点：复用 SafeStore 写队列与当前备份集合、现有 VaultSync 临时 index 和 GitRunner.runBuffer；在同一队列下捕获 Safe 当前 keyring、manifest 与引用密文；预览按实际组选择，用户排除导致组断裂时清楚反馈；自动暂存不带审计、旧元数据或未引用旧代；核对真实 Git 对象中的路径与字节；保留用户自己的 index、工作区、旧数据和历史；双边 Safe 代合并不得逐行拼接、不返回假成功。

必读：`.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/` 的 `tasks/P8.3*`、`spec.md`、`design.md`（同步与备份表）。

## 读写范围与产物

- 可写业务范围 — `plugins/versioning/**`、`plugins/safe/**` 中与 Git 快照接口相关的源码与测试、#9 证据目录 `evidence/P8.3-*.md`。
- 禁止改动 — Engine/Vault 公共装配（`apps/engine/**`、`packages/vault/src/**` 公共接口）、插件注册、Vault 包收集器、根锁文件。必须改公共装配时用最小测试装配验证，并在报告里写出 Lead 的精确接线。
- 预期产物 — 提交、证据、报告。

## 验收与验证

- 测试用 Linux 临时 Vault 与本机 bare Git 仓；覆盖 Safe 并发写、已暂存的不相关用户路径、出站实际树（`git ls-tree`/`git cat-file` 核对路径和字节）、冲突保留。无远端网络，无真实 Vault 写入。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、相关 vitest 文件通过；报告写明本任务覆盖的自动同步范围，以及已跟踪的旧提交、手工 stage、回滚等余项。


## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交（父为 `f7901b0a`），在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
5. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。

## 补充（Lead，2026-11-21）

- 本机内存有限：vitest 加 `--maxWorkers=3`；不要跑全量 e2e。另一实现者同时在跑测试。
- 2026-11-21 定案见 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`，与 #9 相关者照办。
