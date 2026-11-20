# P4.1／P4.2／P10.2 Versioning 认证切换

Git 同步从 `sync.auth.get` 和 `sync.auth.configure` 管理该远端的本机认证。两个能力保留桌面范围，写入使用当前远端及预期 revision。同步设置显示保存的目标和脱敏状态。目标变更时重新查询该目标的状态，并清除前一个目标的输入草稿。

已有配置中的旧引用仅用来识别补配需求。读取保留 remote、branch、mode、间隔和排除规则；配置及状态响应只暴露业务字段与脱敏状态。用户改普通设置时，同一 HTTP(S) 目标以布尔标记记录补配需求，旧引用和用户名随此次写入移除。旧配置可直接从 Versioning 面板补配。文件远端沿用本地 Git，无需补配；Git SSH URL 沿用系统 Git 的 SSH 路径。

## Windows 实测

- 临时 Vault 里创建了一个有效且原先允许 `versioning` 使用的 Safe 合成凭据，旧同步配置引用它。`sync.get` 保留配置，`sync.status` 和 `sync.auth.get` 显示补配。旧字段写入被拒绝，预览和同步在联网前返回 `GIT_AUTH_FAILED`／`needs-reconfiguration`。Safe 锁定、解锁和停用期间，回环目标共收到零个请求。
- 从 `sync.auth.configure` 补配同一目标后，原 `follow` 暂停按当前修订恢复。回环目标记录一次有认证的 fetch 协商，状态回到 `idle`。人工注入本机保护暂时不可用后，配置保存及同步均失败，回环请求数不变；恢复保护后原凭据修订可继续使用。过期保存被拒绝。
- 两个回环仓库覆盖 HTTPS fetch／push、目标协议、主机、端口和仓库变化、同源与跨源重定向、只读、CLI／Web 授权、系统 helper 隔离、远端拒绝脱敏、取消和 ASKPASS 清理。普通本机文件远端另用真实裸仓库复验，保留原暂存区和冲突测试。
- Versioning 全项目 68 项通过。仅跳过既有的 Windows 不支持字面 `*` 文件名用例。Electron 44.9.1 的同步设置用例通过，验证停用 Safe 后的补配提示、遮罩输入、保存后清空草稿、换目标后的重新配置状态和清除认证。页面的能力调用记录没有 `safe.items.list`。

从仓库根复验，测试使用隔离 Vault、配置目录和 Git 回环目标。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-versioning' --maxWorkers=2 --minWorkers=1
node node_modules/@playwright/test/cli.js test tests/e2e/shell.spec.ts -g '同步设置用 Versioning 凭据' --trace off
```

桌面用例需要当前构建。本轮将构建输出放到临时目录，通过临时 Vite 配置把当前检出缺失的桌面 Mail 依赖链接指向现有 Mail 源码，并通过 `HUHU_VERSIONING_E2E_APP` 运行该构建。标准安装包和其他 P10.2 消费者的组合验证留给整合版本。
