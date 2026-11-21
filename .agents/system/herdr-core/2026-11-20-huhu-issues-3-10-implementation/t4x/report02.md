# #6 安装失败归属回滚独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t4x`
- task — `task02.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report02.md
- 执行结果 — `done`
- 身份 — Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 `0.1.21`。发布时核对 `HC_TERMINAL_ID=t4x` 与 `t4x / task02.md / active`。

## 本地合入建议

**建议签收 G1.2/G2.1 并本地合入候选 `c70a987`。** 上一轮的安装回滚 P2 已修复。原有卸载错误判定、静态描述快照与 G2.1 外部调用授权均复验通过。按祖先顺序纳入或保留 `6e6240d → 29a6e8f → cc736e5 → c70a987`，组合版本复跑 Engine 装配及跨入口回归。 [上轮独立报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report01.md) · [返工报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5r/report01.md)

## 规格轴

| 验收项 | 独立核对结果 | 证据 |
| --- | --- | --- |
| 启动失败后，同 Engine 的合法安装 | 用同一探针，经桌面令牌访问回环 `plugins.install`。两份快照首个扩展激活失败均返回 `INVALID_INPUT`，包目录、安装记录、本机信任与能力目录项清除，预存数据保留，`gateway.check` 为 `not-found`。基线后续安装返回 `NAME_CONFLICT`，探针退出 1。候选后续安装成功，目录显示新所有者与 `handler-missing`，探针退出 0。 | [探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/cli/review/t4x-r02.test.ts:153) · [基线日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/baseline.log) · [候选日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/probes-and-auth.log) |
| 成功历史与失败复装 | 在同一 Engine，成功安装后卸载，另一扩展占用原 canonical ID 或同 MCP 投影均收到 `NAME_CONFLICT`，原扩展可以复装。候选回归先成功安装再触发带新声明的失败复装，原有两个名称继续受保护，失败复装新增的名字可由其他扩展安装。独立探针还核对一个先列新名字、后列冲突 MCP 投影的清单，整次登记失败后，新名字可独立安装。 | [失败复装用例](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/engine/test/external-plugins.test.ts:201) · [候选日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/probes-and-auth.log) |
| 并发先占用与释放 | 回放受控的异步作用域释放。安装失败的清理进行中，同时尝试 canonical ID 与 MCP 投影竞争均返回 `NAME_CONFLICT`。完成注销后旧 handler 和旧目录消失，竞争方可成功登记。既有并发停用/卸载回归也通过。 | [PluginManager 回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/test/plugin-manager.test.ts:246) · [定向日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/targeted.log) |
| G1.2 静态目录与调用状态 | Notes 与 SSH 的禁用描述保留，SSH 复验包含 21 项、重开和恢复 handler。先声明与先绑定都固定 Schema 和归属，旧 handler 的清理不影响新绑定。桌面目录与诊断、CLI、stdio MCP 和 HTTP MCP 对同一扩展保持一致，已安装停用返回 `PLUGIN_DISABLED`，卸载后返回 `CAPABILITY_NOT_FOUND`。 | [Engine 目录](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/engine/test/capability-catalog.test.ts) · [CLI 生命周期](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/cli/test/cli.test.ts:84) · [描述回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/test/capability-catalog.test.ts) |
| G2.1 Vault 策略与调用授权 | 用命名 HTTP 令牌、构建的 CLI、stdio MCP 子进程和 HTTP MCP 在合成 Vault 回放。四入口初始零开放，仅打开 `notes.read` 后发现并读取，重开后保留 revision 1。关闭后旧名拒绝，另一 Vault 仍为 revision 0。坏策略重开报 `invalid-format`，外部发现为空且调用被拒，原文件字节保留，桌面仍可读取。候选自带回归覆盖未配置的新能力、显式关闭与同值版本。公共授权专项通过，覆盖管理入口、令牌撤销、插件委托、保险箱限制、自动化限制和主页摘要身份。 | [G2.1 测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/engine/test/tool-access.test.ts) · [独立四入口探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/cli/review/t4x-r02.test.ts:57) · [专项日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/probes-and-auth.log) |

[G1.2 验收契约](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G1.2-inactive-catalog.md) · [G2.1 验收契约](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G2.1-vault-policy.md)

## 规范轴

本次范围内未发现阻止本地合入的规范问题。

- Engine 将登记、激活成功确认、注销分别接入同一个 Registry。新装由 `ExternalPlugins.install` 经 `PluginManager.activateInstall` 占位后启动，只有启动返回 `active` 才确认。启动时加载已安装扩展沿正常登记，继续依据本机信任和启停偏好决定启用。 [Engine 接线](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/apps/engine/src/boot.ts:144) · [安装和加载](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/src/plugins/external.ts:269) · [激活确认](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/src/plugin-manager.ts:41)
- Registry 在一次登记中先检查整批 canonical ID 与 MCP 名，再登记新增归属。待确认集合仅记录本次新增归属，锁定范围覆盖激活和作用域释放。成功后确认历史归属，回滚注销等待停用后释放本次新增名称，保留此前成功安装的记录。成功历史的保护范围为当前 Engine。桌面目录和外部调用使用活动登记和 Vault 策略。 [Registry](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/src/capabilities/define.ts:104) · [停用和注销](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/src/plugin-manager.ts:123) · [发现与授权](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/candidate/packages/kernel/src/dispatcher.ts:42)

## 冻结范围与运行证据

- 候选 `c70a98729fd2c72dca819f3ca1888e5a2e45949e`，树 `8d5453cd08fc746afe09581286a07aeb9609d9ff`，直接父提交 `cc736e5fbdead615b4d49fa147969f8f86ea4076`。G2.1 `29a6e8f13bcbd3e644ef9b7a2a463627e6d39735` 与 G1.2 `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e` 依次在祖先链上。本轮增量为 6 个修改文件，整链相对 G1.1 有 28 个文件，含 4 个新增。独立运行副本的 28 个改动文件逐一核对 Git blob。 [快照校验](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/snapshot.log)
- Windows 11、Node 24.21.0、Vitest 3.2.7、TypeScript 5.9.3。基线与候选分别从 Git 对象归档至系统临时目录，复用 Windows 集成检出的同锁第三方依赖，workspace 依赖各自指向冻结源码。锁文件 Git blob `e7c2876017054b1a8944cf954b2cec97981bfdc0` 一致。运行数据为合成 Vault 和扩展，调用使用本机回环。
- 候选 12 文件的 99 项定向回归、11 项 Engine 公共授权回归、2 项独立探针通过。三个 vendor 类型声明构建，Contracts、Kernel、Engine、CLI 类型检查和本轮 6 文件格式、lint、Git 差异检查通过。CLI 构建产物版本 `0.0.1-rc.4`，SHA-256 `a0fa32c99e3750227cd6df5bbdaecc46c9f024d7c45bf8a430016f1090e74967`。两份 Playwright 夹具完成枚举。 [定向验证脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/run-targeted.ps1) · [独立探针脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/run-probes.ps1) · [基线对照脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/run-baseline.ps1) · [类型和枚举日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r02-69d4e9ab1898/logs/types-and-list.log)

## 接续范围

实际 Electron GUI、完整桌面安装包、真实 SSH 主机、Engine 专项筛选跳过的 34 项，以及安装期间进程中断或磁盘 I/O 故障，留待对应验收。

## Lead 验收

由 Lead 追加。

Lead 接收规格、规范复核和冻结对象证据。按祖先顺序本地合入四项，并在集成提交复跑共同入口。
