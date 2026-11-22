# Huhu Issue #3–#10 Linux 接续实施

接续 Windows 主题 [2026-11-20-huhu-issues-3-10-implementation](../2026-11-20-huhu-issues-3-10-implementation/topic.md)。旧主题的终端地址与 `D:/Document/code/huhu` 路径只作历史索引；本主题在新 Linux 机器重新登记。

## 目标与验收

- 目标 — 完成 [批次 Goal](../../../dev/changes/2026-11-19-huhu-issues-3-10/program.md) 的 #3–#10，交付同一组合版本的成员验收、三条联验、集成提交，合入 `feature/issue-fix` 并落地 `origin/main`。部署与发布不在范围。
- 验收 — 在同一固定候选提交上运行 lint、knip、format:check、typecheck、test、build、e2e（xvfb）及可生成的包；逐 Issue 对照验收要求。未测项单列，不记为通过。
- 约束 — 原型已确认（`6da1b2ec`）。保留 #2 已交付行为。隔离 Vault、回环夹具，不写真实凭据、真实 Vault 或原生 Agent 历史。Codex 不用 fast、不用权限绕过参数。最多 4 个本批次 worktree（主工作区 + 3）；`huhu-wt-int`、`huhu-wt-rc4` 为 #2 遗留，用户决定不计入、不动。

## 共享位置与负责人

- Lead — 外部 Claude Code 主会话（不在 Core 终端内，无 `HC_TERMINAL_ID`）。Lead 用 `hc wait <地址>` 观察终端，并主动读取同号 report 文件；worker 发布报告后无需 `hc send` 回告，在终端末行打印报告绝对路径即可。
- Core 连接 — 本机 Linux（`wta-ubuntu`）默认 Core，hc 0.1.21；Codex CLI 0.170.0；随包 Herdr Core 0.1.19（`apps/desktop/resources/herdr/linux-x64`，SHA 与 `scripts/herdr.lock.json` 一致）。
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 目录规则 — `encodeURIComponent(terminal_address)`
- 运行环境 — Node 24.21.0（`$HOME/.volta/tools/image/node/24.21.0/bin` 置于 PATH 前；系统默认 Node 26 不用），pnpm 12.10.1。
- Codex 启动 — `codex --no-daemon -m <模型> -c model_reasoning_effort=<级别> -s workspace-write -a never -c sandbox_workspace_write.network_access=true --add-dir /home/wta/projects/huhu/.git --add-dir <共享根>`。不带 `service_tier=fast`，不带 `--dangerously-bypass-approvals-and-sandbox`。

## Worktree

| 路径 | 分支 | 用途 | 写入者 |
| --- | --- | --- | --- |
| `/home/wta/projects/huhu` | `feature/issue-fix` | 交接资料、本主题 | Lead |
| `/home/wta/projects/huhu/temp/issue-worktrees/integration` | `impl/huhu-issues-3-10-integration` | 集成；Engine/Renderer 装配、插件注册、Vault 包收集器、静态能力目录、根锁文件 | Lead |
| `/home/wta/projects/huhu/temp/issue-worktrees/ssh-exec` | `impl/huhu-issues-3-10-ssh-exec-jobs` | #7 H11.2 | 见 manifest |
| `/home/wta/projects/huhu/temp/issue-worktrees/safe-git` | `impl/huhu-issues-3-10-safe-git` | #9 P8.3 | 见 manifest |

只读快照（非 worktree）：`/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b`（`git archive 4d86c84b`）。

## 决定与交接

- 2026-11-21 接续核对：61 个远端分支与 `handoff-branches.tsv` 完全一致，远端无后续推进。`origin/main` 比集成多 73 个提交（#2 收尾 `454bec7a`、`38cc28f6`、`e58586c6`、`7811141b`），集成需先合入 main。
- Codex `workspace-write` 沙箱把 worktree 的 Git 索引（`.git/worktrees/<名>/index.lock`）和 worktree 内 `.agents/` 挂成只读，`/run/user/1000` 也只读。约定：worker 不直接提交，改为用临时索引生成候选提交对象（`GIT_INDEX_FILE=$(mktemp) git read-tree HEAD && git add … && git write-tree && git commit-tree`），在报告给出候选 SHA，并保持工作树与候选一致；Lead 核对后 `git merge --ff-only <候选>` 落到分支。evidence 文件放进候选树即可。跑测试时设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
- `0f242e2f`（t6/task01，#9 P0.1 跨平台本机保护）已由 Lead 快进到 `impl/huhu-issues-3-10-safe-git`。
- Codex 启动时会自动 `npm install -g @openai/codex` 升级（t18 首次启动即发生并退出）。为固定批次内版本，Codex 启动参数追加 `-c check_for_update_on_startup=false`；本机解析到的仍是 `codex-cli 0.170.0`。
- 2026-11-21 Lead 会话重启后 Core 终端全部结束（`hc ls` 为空），e2e 后台运行停在第 157 项。用同一 Codex 会话 ID 在新终端恢复：t6→`t1b`（会话 01a1fd5b-f317），t10→`t1c`（01a1fd7b-bce6），t19→`t1d`（01a1fdef-c0d8）。它们接续原任务文件与原报告路径（`t6/task03`、`t10/task02`、`t19/task01`），manifest 仍以原地址行跟踪；`HC_TERMINAL_ID` 与任务文件中的地址不同属预期。
- 更正：19:55:40 与 20:27:37 两次终端全部结束都是 `systemd-oomd` 在内存压力下杀掉了承载全部终端的 `hc-hold-*.service`（`journalctl --user` 可查），不是测试 Core 抢占。此后约束：同时跑测试的实现者最多两个；vitest 加 `--maxWorkers=3`（全量用 `pnpm test -- --maxWorkers=3`）；Lead 不在实现者跑测试时运行 e2e 或全量测试。以同一会话 ID 第二次恢复，新地址见 manifest 之外的下一条。
- 第二次恢复：t6→`t1g`，t10→`t1h`，t19→`t1j`，仍接续原任务文件与报告路径。
- 2026-11-21 第二波：集成到 `f7901b0a`（全量门禁在 `4a9a7305` 通过：test 1665/0/20；之后仅放开 Mail AI 选择用例并记定案）。`agent-linux` 工作树改用分支 `impl/huhu-issues-3-10-g6-protocol`（原分支已并入集成），`safe-git` 快进到 `f7901b0a`。派发：`t1k`（g6-session，#6 HTTP MCP 会话身份，sol/high），`t1m`（p83-safe，#9 P8.3，sol/high；原 `t6/task04.md` 未派发，改由本终端执行）。
- 2026-11-21 23:52 机器重启，t1k/t1m 结束。以同一 Codex 会话恢复：t1k→`t1r`，t1m→`t1s`，接续原任务与报告路径。Lead 在集成落 `fc048b6b`（health.run/外部布局读取不启动 Core）。
- 第 2 轮独立审查：`t1t`（review-2，sol/xhigh），快照 `temp/issue-snapshots/fc048b6b`。
- 2026-11-22 00:16 第三次 `systemd-oomd` 杀掉 hc-hold（峰值 28.1G：两名实现者同时跑全量测试，外加审查者）。新约束：全量 `pnpm test` 全机同一时刻只允许一份，一律写成 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`；定向 vitest 用 `--maxWorkers=1`。Lead 自己的全量/e2e 同样取这把锁。t1k→`t1y`，t1m→`t1z`（同一 Codex 会话恢复，接续原任务与报告路径）。
- 2026-11-22 第三波：集成 `499427be`（含 #6 会话身份 `1aa5f3b9`、#9 P8.3 `2c7994d3`、第 2 轮审查返工）。`t1y` 续做 t1k/task02（G3.4，分支 `impl/huhu-issues-3-10-g6-extensions`，agent-linux 工作树）；`t23`（g6-kernel，sol/high）做 Kernel 管理组（分支 `impl/huhu-issues-3-10-g6-kernel`，safe-git 工作树）。t1z 已关闭。
- `t26`（g6-tasks，sol/high）：#6 Tasks/Automations 领域组，分支 `impl/huhu-issues-3-10-g6-tasks`（agent-linux 工作树，基线 `5307b88f`）。t1y 关闭。
- `t27`（g6-notes，sol/high）：#6 Notes/Archives/Inbox/Guide 领域组，分支 `impl/huhu-issues-3-10-g6-notes`（safe-git 工作树，基线 `e3aa1cd4`）。t23 关闭。
- 集成 `d7581825`（含 C05 `ecc1bd93`、Tasks/Automations 组）。`t28`（g6-agent，sol/high）：#6 Agent CLI 领域组 + tasks.dispatch.targets 无拨号快照，分支 `impl/huhu-issues-3-10-g6-agent`（agent-linux）。t26 关闭。
- 集成 `9aedbdf5`（含 Notes 组 `d07ba94c`、home.notes.recent）。`t2q`（g6-versioning，sol/high）：#6 Versioning/Safe 领域组，分支 `impl/huhu-issues-3-10-g6-versioning`（safe-git）。t27 关闭。
- 集成 `eaa5545a`（含 Agent CLI 组）。`t2r`（g6-mail，sol/high）：#6 Mail 领域组 + Mail AI 工作台一次性批准，分支 `impl/huhu-issues-3-10-g6-mail`（agent-linux）。t28 关闭。
- 2026-11-22 Lead 会话重启后（约 06:50 又一次 oomd）：用户提交 `e46661fa`（根 vitest.config.ts maxWorkers:3 与 AGENTS.md「测试与内存约束」），Lead 拣选到集成 `79305dcd`。新约束：开发中只跑涉及的测试，全量仅 Lead 收尾跑一次。g6-versioning 与 g6-mail 由用户恢复为 `t2w`、`t2x`（接续 t2q、t2r 的任务与报告）。集成 `314c0bed`（含 Versioning/Safe 组）。`t2y`（g6-ssh，sol/high）：#6 SSH 领域组，分支 `impl/huhu-issues-3-10-g6-ssh`（safe-git）。t2w 关闭。
- Mail 候选 `f3e764e8` 合入集成 `e6fe4f5b`，Lead 修正 `2b3fe70a`；t2x 原以默认沙箱恢复（无回环），以标准参数恢复同一会话为 `t2z`，执行 t2r/task02。
- 集成 `fc044713`（含 Mail 组）。`t30`（w05-widgets，sol/high）：#10 W05 业务卡归属迁移与 W06-01，分支 `impl/huhu-issues-3-10-w05-widgets`（agent-linux）。t2z 关闭。
- 2026-11-22 07:39 第四次 `systemd-oomd` 杀掉 hc-hold（峰值 27.4G，swap 8G，102 个进程；t2y 跑 typecheck/vitest/e2e，t30 跑 e2e/打包检查，t3c 跑 e2e）。根因是多个实现者同时跑重型验证。**新分工**：实现者只写代码和对应 E2E 用例，只跑单个涉及的 vitest 文件；不跑 E2E、打包、全量测试、全仓 typecheck/lint/knip。重型验证由 Lead 收尾串行执行（取 `flock /tmp/huhu-heavy.lock`）。已写入 AGENTS.md「实施者职责边界」与任务模板。恢复 t2y、t30 时以此约束为准，并在新任务文件里写明。
