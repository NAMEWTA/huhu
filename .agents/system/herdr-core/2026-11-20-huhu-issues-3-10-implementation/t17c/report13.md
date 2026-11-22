# t17c · #9 P4/P10 Git 同步认证切换

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task13.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task13.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report13.md`
- 执行结果 — `done`

## 交付

分支 `impl/huhu-issues-3-10-versioning-owned-auth`，提交 `df0fca9127d7ca741bd86e53771f3ff572fbba93`，父提交 `0c96c27b844a580178a4d6f24f1d6bb987eba4e7`。工作树为 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`。提交范围为 Versioning、本任务的桌面集成用例和 #9 证据。根锁 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。工作树状态仅有先前留下的未跟踪 `native/`。

Git HTTPS 复用 `GitRemoteCredentials`、短命 ASKPASS、精确目标和 revision 校验。同步设置现用 `GitAuthPanel` 调 Versioning 自有的两个认证能力。已核对指定基线及可达本地提交，自有认证能力已存在，桌面面板需要在此基线上接入。删除了 Safe 选择器、`secretUse` fallback、`safe.unlocked` 恢复以及 `sync.update` 的旧凭据写字段。

已有引用时继续保留 remote、branch、mode、间隔与排除规则。旧字段只用于判断是否需要补配，既不进入输出，也不进入 Git。旧 HTTP(S) 目标尚无本机认证时，预览和同步在联网前报 `GIT_AUTH_FAILED / needs-reconfiguration`。保存同一目标的普通配置时以布尔标记保存补配状态，同时移除原引用和用户名。用户可以直接在 Versioning 补配。已暂停任务在同一目标成功替换凭据后按新 revision 恢复一次。文件远端继续通过本机 Git，同步配置的 Git SSH 路径沿用原逻辑。

## Windows 实测

| 验收项 | 结果 |
| --- | --- |
| 旧引用、停用 Safe、补配恢复 | 临时 Vault 用有效且原先允许 Versioning 的 Safe 合成条目制造旧配置。验证旧字段写入拒绝、配置及错误脱敏、保存前零请求。Safe 锁定、解锁及停用期间仍为零请求。停用后补配同一目标，检测到一次有认证的 fetch 协商，状态回到 `idle`。 |
| 权限和错误回退 | CLI 无授权、Web 拒绝写入、只读、旧 revision、远端认证失败、受保护存储暂时不可用、取消均已验证。本机保护不可用时替换和拉取失败，回环请求数不变。恢复保护后原修订可继续使用。 |
| 远端与 Git 安全边界 | Windows Git `2.47.1.windows.2` 实际 HTTPS fetch／push。协议、主机、端口、仓库变更及跨源／同源重定向不转送旧认证。检查了系统 helper 文件、argv／环境、Git 配置、幂等日志、HTTP 错误脱敏和 ASKPASS 清理。普通本机文件远端、暂存区及冲突回归一并通过。 |
| Versioning 项目 | 7 个文件，68 项通过、1 项跳过。跳过的是原有 Windows 不支持字面 `*` 文件名的用例。 |
| Electron 桌面 | Electron `44.9.1` 的定向重写用例 1 项通过。验证停用 Safe 后现有目标的补配提示、密码遮罩与保存后清空、换目标后的补配状态和清除认证。请求记录没有 `safe.items.list`。 |
| 静态检查 | Versioning TypeScript、新旧改动文件 oxfmt／oxlint、`git diff --check` 通过。前端已执行 Modern Web Guidance search/retrieve，采用可读标签、分组和礼貌状态通知。 |

从仓库根复验。桌面用例以当前构建为输入。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-versioning' --maxWorkers=2 --minWorkers=1
node node_modules/@playwright/test/cli.js test tests/e2e/shell.spec.ts -g '同步设置用 Versioning 凭据' --trace off
```

## 验证边界

此次桌面构建产物位于系统临时目录，当前检出的桌面依赖缺少 Mail 链接，临时 Vite 配置把该依赖解析到同一检出的既有 Mail 源文件。Playwright 经 `HUHU_VERSIONING_E2E_APP` 使用该本地构建。标准安装包、非 Windows 系统、真实远端和跨模块 P10.2 组合验收未覆盖。自动审批拦截了对临时桌面构建目录的递归清理，保留在 `%TEMP%/huhu-task13-3319a8f46e594c38`。

[Versioning 切换证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p4-versioning-cutover.md)
