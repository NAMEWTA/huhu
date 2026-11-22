# G1.2 独立审查返工报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t1c
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report04.md
- 执行结果 — done
- 身份 — Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 0.1.21。核对 `HC_TERMINAL_ID=t1c` 和 `task04.md active`。

## 结论

P2 和 P3 均在 G2.1 父提交 `29a6e8f13bcbd3e644ef9b7a2a463627e6d39735` 上复现。本地修复候选为 `cc736e5fbdead615b4d49fa147969f8f86ea4076`，父提交即上述 G2.1，工作树干净。G1.1 `2dfd76240dbf8edc87310820b427452406d52635` 和 G1.2 `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e` 都在候选祖先链上。分支为 `impl/huhu-issues-3-10-capability`，工作目录为 `D:/Document/code/huhu/temp/issue-worktrees/capability`。 [独立审查](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report04.md)

## P2 卸载与复装

在同一个回环 Engine 上用无业务动作的外部扩展声明 `review-catalog-example.fixture.read`。父提交在卸载后给出空目录项和 `gateway.check` 的 `found:false / not-found`，CLI、stdio MCP 子进程和 HTTP MCP 仍返回 `PLUGIN_DISABLED`，两种同名竞争声明也都能安装。

候选在插件作用域释放后删除它的能力归属、静态描述和活动绑定。并发停用与卸载共用清理，卸载期间的启用请求返回停用状态。注册阶段先核对声明，冲突以 `NAME_CONFLICT` 返回并进入现有安装回滚。同一个 Engine 内首次登记会保留完整能力 ID、插件归属及 MCP 投影的关联，因此卸载后其他插件无法接管相同 ID，其他能力也无法复用已有的 MCP 名。原插件可以复装。归属保留限于当前 Engine 进程。 [Registry](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/capabilities/define.ts) · [生命周期](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/plugin-manager.ts) · [Engine 装配](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/src/boot.ts)

| 同一 Engine 的阶段 | 桌面目录与 `gateway.check` | CLI 调用、stdio MCP、HTTP MCP |
| --- | --- | --- |
| 安装前与卸载后 | 目录无此项，`found:false / not-found` | `CAPABILITY_NOT_FOUND` |
| 安装启用与原插件复装，清单有声明 | 目录显示所有者和 `handler-missing`，`found:true` | `CAPABILITY_NOT_FOUND`，`details.reason=handler-missing`，携带插件 ID |
| 停用但仍安装 | 目录保留归属，`found:true / plugin-disabled` | `PLUGIN_DISABLED`，携带插件 ID |

CLI 发现和两种 MCP 工具表在以上阶段均排除该无 handler 的能力，且在竞争安装失败后旧名继续返回未找到。发现变化来自卸载清理注册表，以及在注册时拒绝 MCP 名碰撞。桌面 `capabilities.list` 和 `gateway.check` 读取当前登记，CLI `capabilities list` 与 MCP stdio 读取认证后的 `GET /api/v1/capabilities`，HTTP MCP 使用同一 Dispatcher 发现策略。两种 MCP 的工具列表投影和旧名解析继续共用原来把点号转为下划线的规则。 [生命周期回归](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/cli/test/cli.test.ts) · [Dispatcher](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/dispatcher.ts) · [MCP](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/mcp.ts)

## P3 静态描述

父提交的红灯用例用普通对象登记和绑定，随后将输入和输出 Schema 改成最小长度 5。登记输入拒绝短输入，活动输入仍接受，二者引用已经不同。候选在首次登记或绑定时冻结描述字段快照，两种顺序都将原描述关联到同一份快照。登记表和活动 handler 共用快照中的输入、输出和身份。复制 handler 对象无法携带私有绑定，已有异源、重复和插件门面归属校验继续覆盖。冻结范围为描述字段，Schema 使用同一 Zod 对象。 [描述回归](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/test/capability-catalog.test.ts) · [门面归属回归](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/test/plugin-manager.test.ts)

## G2.1 回归及重放

G2.1 的原有 Vault 策略用例通过。双 Vault 初始均关闭，仅对 A 显式开放时 CLI、MCP、HTTP 可调用合成笔记，重启后保留选择且 B 独立。显式关闭后缓存 MCP 名返回 `CAPABILITY_NOT_EXPOSED`。损坏文件后外部调用拒绝，实际 stdio 子进程读回 `invalid-format`，工具发现为空，桌面调用仍可用。活跃能力继续走 Dispatcher 的同一 `toolAccess` 检查，Vault 策略文件格式和管理 API 沿用 G2.1。 [双 Vault 策略回归](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/tool-access.test.ts) · [CLI 和 stdio 回归](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/cli/test/cli.test.ts)

- Windows 本机 Node 24.21.0、pnpm 12.10.1、Vitest 3.2.7、Herdr Core 0.1.21。验证仅使用隔离 Vault、回环 Engine 和合成数据。
- 定向复跑 12 个测试文件、96 项全通过。Contracts、Kernel、Engine、CLI 类型检查通过，8 个提交文件通过 oxfmt、oxlint 和 Git 差异检查。
- 首次扩大范围并行运行时，双 Vault、外部扩展及其他用例超过各自默认超时，已结束该轮并单 worker 复跑。双 Vault、外部扩展、CLI、静态目录及整个 Kernel 测试组转绿。此次的完成结果以定向复跑为准，未完成全量 Engine 测试文件和 Electron GUI 验收。

从该 worktree 根运行，给 `TEMP`、`TMP` 和 `GIT_CEILING_DIRECTORIES` 指向同一个新建空目录。Git 查找上限用于隔离临时 Vault 与外层仓库。下列 PowerShell 环境只用于本次测试进程。

```powershell
$fixtureRoot = (Resolve-Path 'apps/engine/test').Path
$fixtureTemp = Join-Path $fixtureRoot ('.task04-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureTemp | Out-Null
$env:TEMP = $fixtureTemp
$env:TMP = $fixtureTemp
$env:GIT_CEILING_DIRECTORIES = $fixtureTemp
$env:CI = '1'
pnpm exec vitest run packages/kernel/test apps/cli/test/cli.test.ts apps/engine/test/tool-access.test.ts apps/engine/test/capability-catalog.test.ts apps/engine/test/external-plugins.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=30000
pnpm --filter @huhu/contracts --filter @huhu/kernel --filter @huhu/engine --filter @huhu/cli -r --workspace-concurrency=1 run typecheck
git diff HEAD^ HEAD --check
```

## Lead 验收

候选 `cc736e5fbdead615b4d49fa147969f8f86ea4076`。同一 Engine 上可按 CLI 生命周期回归重放安装、停用、卸载、同名安装拒绝及原插件复装。报告通过同目录临时文件原子发布，路径为 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report04.md`。
