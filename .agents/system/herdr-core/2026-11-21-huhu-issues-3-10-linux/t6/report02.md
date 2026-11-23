# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t6
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/task02.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/report02.md
- 执行结果 — done

## 结论

将 Mail、SSH、Versioning、Safe 和 Engine 中 40 项原先限定 Windows 的用例开放给 Linux。凭据用例使用 task01 的进程内注入及现有 `TestProtection`。原生系统钥匙串往返用例按 task01 的探针决定是否运行。

Git 的 Windows askpass 专项和 Engine 的三项 Windows PowerShell 批准或启动用例保留平台限定。依范围调整，#4 执行宿主相关文件只记录限定理由，候选提交的文件表无这些路径。

## 产物与改动

- 工作区 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`。父提交 `0f242e2f1571bac59aec0029fd5fc6813fc3250c`，候选提交 `6f30ffa856b33b0d39fd25f99e84cfdd3220d827`。按 topic 第 2 条生成候选，无需在 worker 修改分支引用。已核对候选树和工作树一致。
- 13 个测试文件与 1 个共享 Mail Engine 夹具。Mail 的回环 IMAP/SMTP、OAuth、附件与目录测试均开放。同步测试允许异步 IMAP 操作最多等待 10 秒，保留原定时与状态断言。
- Versioning 的回环 HTTPS 测试复用了 Mail 的合成证书。排除了原有的 Git for Windows `openssl.exe` 路径依赖。HTTPS 安全专项仍走 Windows askpass broker。
- 第一轮探索中，临时在 Linux 运行 Git HTTPS 安全专项，`remote-auth.engine.test.ts` 的 `existsSync(trace)` 断言失败。Linux 的私有 Git 调用在 `plugins/versioning/src/engine/sync.ts:279–294` 走独立的 POSIX askpass 分支。该分支没有调用 Windows 分支的环境清理，实测生成了测试预期禁止的 Git trace 文件。复现只用了回环 Git 与合成凭据。定位留给 Lead，业务源码未改。证据在 `focused-no-dbus.log` 的 Versioning 失败段。
- 本机 Ubuntu 26.04.1 LTS x64 有随包 Herdr Core `apps/desktop/resources/herdr/linux-x64/herdr-core`（0.1.19），PATH 有 `codex-cli 0.170.0`、Pi 与 Claude，PATH 无 `pwsh`。真实原生宿主及 macOS、Windows 本轮未验证。

## 验证

日志目录为 `/tmp/huhu-t6-p02.jFR34m/`。使用 Node 24.21.0、pnpm 12.10.1，每次测试使用独立临时 `XDG_RUNTIME_DIR`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Linux 全量前后对比 | task01 基线为 **1274 通过、4 失败、60 跳过**。task02 用 `pnpm test --maxWorkers=4 --testTimeout=15000` 复跑，为 **1316 通过、2 失败、20 跳过**，两次均共 1338 项。打开的 40 项全部通过。前置 Node 检查为 18 通过、0 失败、0 跳过。 | `report01.md` 的全量复跑及本轮 `test.log` |
| 全量的两项失败 | `apps/engine/test/engine.test.ts:1149` 是基线已有的自动化停用缺 `expectedVersion` 断言。`apps/engine/test/engine.test.ts:156` 的子进程等待 ready 逾 20 秒。按名称单独复跑该用例通过，耗时 4.439 秒。 | `test.log`、`subprocess-retry.log` |
| 真实钥匙串与隔离 | 全量运行的 Engine 凭据文件 3 通过、3 跳过，含 task01 原生往返和清理。真实用例仅写随机合成键，按精确 ID 删除并回读 `null`。其余新增用例用合成凭据和临时目录。 | `test.log`、`apps/engine/test/module-credential-host.test.ts` |
| 静态检查 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check` 均退出 0。 | `final-typecheck.log`、`final-lint.log`、`final-format:check.log` |

### 文件判定与 Linux 结果

Linux 计数取自候选的同一次全量运行，顺序为通过 / 失败 / 跳过。Win 指 Windows，Core 指 `HUHU_AGENT_LAUNCH_TEST_BIN` 所指的测试二进制。

| 文件 | 原限定 | 处理与理由 | Linux |
| --- | --- | --- | --- |
| `plugins/ssh/test/host-auth.engine.test.ts` | Win x64 | 开放。SSH loopback 和合成保护后端。 | 4 / 0 / 0 |
| `plugins/safe/test/external.engine.test.ts` | Win | 开放。Safe 模块的 Engine、CLI 和网络入口无 Windows 依赖。 | 3 / 0 / 0 |
| `plugins/versioning/test/remote-auth.engine.test.ts` | 五项 Win x64；一项不限 | 开放四项实际 Git 测试。Windows askpass 的进程环境、trace 和启动器清理专项保留 Windows 门禁。 | 5 / 0 / 1 |
| `plugins/mail/test/accounts-engine.test.ts` | Win x64 | 开放。使用合成账号和保护后端。 | 2 / 0 / 0 |
| `plugins/mail/test/conversations-engine.test.ts` | Win x64 | 开放。用回环 IMAP。 | 1 / 0 / 0 |
| `plugins/mail/test/ai-selection-engine.test.ts` | 集成分支材料 | 本工作树缺文件。交由 Lead 在已含 Mail AI 的集成上处理。 | 未收集 |
| `plugins/mail/test/draft-attachments-engine.test.ts` | Win x64 | 开放。使用临时附件、Vault 和快照夹具。 | 8 / 0 / 0 |
| `plugins/mail/test/drafts-engine.test.ts` | Win x64 | 开放。离线草稿和合成账号。 | 2 / 0 / 0 |
| `plugins/mail/test/outbox-engine.test.ts` | Win x64 | 开放。用回环 SMTP/IMAP 与合成认证。 | 11 / 0 / 0 |
| `plugins/mail/test/oauth-catalog.test.ts` | Win | 开放。能力目录持久化可独立运行。 | 1 / 0 / 0 |
| `plugins/mail/test/messages-engine.test.ts` | Win x64 | 开放。回环 IMAP 缓存与本地保护夹具。 | 1 / 0 / 0 |
| `plugins/mail/test/sync-engine.test.ts` | 一项 Win x64；一项不限 | 开放。回环 IMAP 同步轮询等待扩大到 10 秒。 | 2 / 0 / 0 |
| `plugins/mail/test/ai-settings-engine.test.ts` | 集成分支材料 | 本工作树缺文件。交由 Lead 在已含 Mail AI 的集成上处理。 | 未收集 |
| `plugins/mail/test/oauth-engine.test.ts` | 一项 Win x64；一项不限 | 开放。用隔离授权服务及回环 IMAP/SMTP。 | 2 / 0 / 0 |
| `plugins/agent-cli/test/native-receipts.live.test.ts` | Win + Core | 按 #4 交接保留。原生 Codex dispatch 生产入口目前仅启用 Windows。 | 0 / 0 / 3 |
| `plugins/agent-cli/test/native-stop.live.test.ts` | Win + Core | 按 #4 交接保留。Windows 原生 Codex helper 和 `cmd.exe`。 | 0 / 0 / 1 |
| `plugins/agent-cli/test/launch.live.test.ts` | Win + Core | 按 #4 交接保留。真实执行 `.cmd` 垫片及 Windows PowerShell。 | 0 / 0 / 1 |
| `plugins/agent-cli/test/dispatch.live.test.ts` | Win + Core | 按 #4 交接保留。需适配 Linux 上 `hc server status` 会启动 Core 的行为，原夹具用其退出码判断未启动。 | 0 / 0 / 1 |
| `plugins/agent-cli/test/protected-launch.test.ts` | Win | 按 #4 交接保留。首项测试 Windows PowerShell relay，次项目前也绑定 PowerShell 夹具。 | 0 / 0 / 2 |
| `plugins/agent-cli/test/launch-reconcile.test.ts` | 一项 Win；其余不限 | 按 #4 交接保留。限定项需要 Windows junction 字面路径语义。 | 16 / 0 / 1 |
| `apps/engine/test/codex-dispatch.live.test.ts` | Win + Core | 按 #4 交接保留。需要 Windows 原生 Codex dispatch 路径。 | 0 / 0 / 1 |
| `apps/engine/test/task-dispatch.live.test.ts` | 一项 Win + Core；一项不限 | 按 #4 交接保留。Linux Core 的 status 探针会启动实例，原测试要求启动前与停止后均观察到缺席。 | 1 / 0 / 1 |
| `apps/engine/test/module-credential-host.test.ts` | task01 两项不限；其余 Win x64，部分需 Core | 开放 Agent 启动配置 CRUD。保留需要 Windows PowerShell 批准或实际执行的三项。 | 3 / 0 / 3 |
| `apps/engine/test/agent-workspace.test.ts` | Win + Core | 按 #4 交接保留。当前使用显式 Core 二进制与 Windows 平台门禁。工作区持久化与版本断言本身使用 Core 协议。 | 0 / 0 / 3 |
| `apps/cli/test/approved-terminal.test.ts` | Win x64 + Core | 按 #4 交接保留。外部终端规则批准只接受 Windows PowerShell。 | 0 / 0 / 1 |

## 阻碍与接续

候选已备好供 Lead 快进。集成上的 Mail AI 两个文件和 #4 执行宿主文件按分工接续。Linux Versioning 的私有 Git 环境清理差异已定位，上述证据可用于后续业务修复。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-21）：通过。候选 `6f30ffa8` 与工作树一致，已快进并合入集成 `b838fcd9`。发现 1（Linux askpass 未清理 Git 调试环境）列为 task03 第一项修复。Engine 三项 PowerShell 批准与 Git Windows askpass 专项保留限定，理由记录在案。
