# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t6
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/report01.md
- 执行结果 — blocked

## 结论

#9 P0.1 的代码、确定性测试和平台证据已生成。真实 Linux Secret Service 已通过往返、重开、重复创建拒绝及清理检查。断开 D-Bus 后，基线 14 项 SSH 凭据失败全部通过。macOS 和 Windows 本轮未实机验证。

当前沙箱以只读方式挂载 worktree 的 Git 索引与 `.agents`。候选提交含代码和目标路径的矩阵，当前分支落提交与证据检出待 Lead 在可写环境完成。

## 产物与改动

- 工作区 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`，HEAD 为 `4d86c84bc55169bf4faa05867bf6ff2863030b81`。候选提交为 `0f242e2f1571bac59aec0029fd5fc6813fc3250c`，父提交是该 HEAD。已用 `git diff --exit-code <候选> -- apps/desktop/electron-builder.yml apps/engine/src apps/engine/test plugins/ssh/test` 核对候选代码与工作树完全一致。
- `apps/engine/src/module-credential-host.ts` 使用系统适配器和原有命名空间。Linux 强制选择持久的 Secret Service。调用失败统一为 `unavailable`，重复创建拒绝并保留原键。
- `apps/engine/src/boot.ts` 将 `moduleCredentialProtection` 作为受信进程内装配参数。两项 Engine SSH 测试和五个 SSH 插件文件复用现有 `TestProtection`，夹具分配于各自的隔离应用数据目录。
- 桌面打包配置单独改动 `apps/desktop/electron-builder.yml`，用 `**/keyring.*.node` 解包平台绑定。核对了 `electron.vite.config.ts` 对 `@napi-rs/keyring` 的运行时 external 规则和锁文件的对应预编译包。本轮使用本机 Linux glibc 绑定，安装包未构建。
- 候选树包含 `.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence/P0.1-protection-platform-matrix.md`。用 `git show <候选>:<该路径>` 回读并逐字节比对。矩阵记录 Ubuntu 26.04.1 LTS x64、未实测的 macOS x64/arm64 与 Windows x64，并引用 Windows 旧提交 `3bd2e24` 的 UtilityProcess 和解包证据。

## 验证

实际使用 Node 24.21.0、pnpm 12.10.1。日志保存于 `/tmp/huhu-t6-p01.qq1MxP/`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 真实 Linux 后端及安全清理 | 2 通过、0 失败、4 跳过，含真实 gnome-keyring 和不可用确定性用例。原生用例使用随机探针 ID 和模块生成的随机键 ID。清除后对模块 ID 读回 `null`，`finally` 对当次写入的每个精确 ID 分别删除并验证读回 `null`。 | `native.log`，`apps/engine/test/module-credential-host.test.ts` |
| 无后端时保留已有密文 | 通过无效 D-Bus 地址触发真实适配器 `unavailable`。失败夹具确认读取和显式重新配置均返回 `unavailable`，未请求创建新键，旧 revision 和密文字节一致。恢复后可读原值。 | `no-dbus.log`，`native.log` |
| 无 D-Bus 时 SSH 行为 | 五个 SSH 插件集成文件及故障用例共计 14 通过、0 失败、5 跳过。另筛选的两项基线 Engine SSH 测试均通过。原始基线的第 15 项为下列旧自动化停用断言。 | `no-dbus.log`，`engine-ssh-no-dbus.log`，`/home/wta/projects/huhu/temp/issue-baseline/linux-4d86c84b-test.log` |
| 装配注入边界 | 审阅 `boot.ts` 与 `main.ts`。注入仅接收启动调用者的进程内对象。Engine 主入口显式构造启动字段。桌面传既有 `HUHU_DESKTOP_USER_DATA`。CLI 连接现有 Engine 或传固定启动参数。HTTP、MCP 和 renderer 请求在启动后经能力分发，没有接入启动选项。 | `apps/engine/src/{boot,main}.ts`，`apps/desktop/src/main/engine-supervisor.ts`，`apps/cli/src/connect.ts`，`packages/kernel/src/server/capability-http.ts` |
| 静态检查 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 全部退出 0。候选暂存差异与工作树差异均通过 Git 空白检查。 | `typecheck.log`、`final-lint.log`、`final-format:check.log`、`final-knip.log` |
| Linux 全量 `pnpm test` | 以独立 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/ht6full.XXXXXX)"` 复跑并退出 1。Vitest **1274 通过、4 失败、60 跳过**，共 1338 项。前置 Node 检查 **18 通过、0 失败、0 跳过**。基线 14 项 SSH 失败全部消失，真实系统钥匙串用例也通过。 | `test-isolated-runtime.log` |

全量复跑的四项失败均与本次改动无关。

- `apps/engine/test/engine.test.ts:1149` 在 CLI 停用 Agent 规则时省略 `expectedVersion`。基线日志在同一断言失败。生产规则自 `1eb37eea` 起对此返回 `INVALID_INPUT`，见 `plugins/automations/src/engine/index.ts:333`。
- `apps/engine/test/engine.test.ts:387` 的 Safe 外部 reveal、`apps/engine/test/external-plugins.test.ts:172` 的扩展归属，以及 `plugins/automations/test/task-scan-occurrences.test.ts:922` 的任务扫描各超过默认五秒。三项按名称独立复跑均通过，证据在 `timing-retry.log` 和 `external-retry.log`。

首次使用沙箱默认 `XDG_RUNTIME_DIR` 的运行记录为 1267 通过、11 失败、60 跳过。默认套接字目录 `/run/user/1000` 被只读挂载，首次结果含七项 Herdr 相关失败。六项按名称迁入临时运行目录复核全部通过，隔离目录的完整复跑也通过全部七项。首次运行的三项 Vault 操作超时在完整复跑中同样消失。证据在 `test.log`、`herdr-runtime.log` 和 `test-isolated-runtime.log`。

## 阻碍与接续

`git add` 创建 `/home/wta/projects/huhu/.git/worktrees/safe-git/index.lock` 时返回 `Read-only file system`，在工作树内创建矩阵目录也返回该错误。临时索引只用于生成、核对候选对象。普通索引没有暂存改动，工作树保留十个代码和测试文件的未提交修改。Lead 在可写环境落入候选 `0f242e2f1571bac59aec0029fd5fc6813fc3250c` 即可一并检出目标路径的矩阵。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-21）：通过。审阅 `module-credential-host.ts`、`boot.ts`、`electron-builder.yml` 差异：去掉平台门禁，Linux 固定 Secret Service，测试注入仅为进程内 `BootOptions` 字段，打包解包覆盖各平台绑定。工作树与候选一致（证据文件除外），已 `git merge --ff-only 0f242e2f`。剩余 4 项失败：`engine.test.ts:1149` 为旧断言缺 `expectedVersion`（基线同样失败，归入后续修复），3 项 5 秒超时单独复跑通过（记为不稳定，最终全量再判）。独立审查待批次统一安排。下一步 task02。
