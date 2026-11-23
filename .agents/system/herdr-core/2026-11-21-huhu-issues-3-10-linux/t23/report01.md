# 任务报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t23`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t23/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t23/report01.md`
- 执行结果 — blocked（候选已交付，集成门禁待 Lead 装配与复测）

## 结论

基线 `6471329e` 已补齐共享层持久意图门禁。本组在 7 个 Kernel 文件中实现 38 项新增可选开放，并核对 6 项原可选工具。44 项均默认关闭。按 2026-11-21 Gateway 管理定案，表中的 11 项仍仅原工作台入口可用。

13 项通用操作使用 `idempotency: "durable"` 与 `externalIntentRequired: true`。导入导出另有包 ID、摘要及恢复 ID，并沿用同一持久受理与回执。对外包产物位于按 Vault 实例与受信主体划分的 Engine 本机专用目录。调用方以包 ID 导出，以包 ID、摘要和恢复 ID 导入。父目录须可写，恢复会生成新 Vault ID。旧桌面绝对路径输入沿用已有行为。

## 产物与改动

- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`
- 分支 — `impl/huhu-issues-3-10-g6-kernel`
- 候选 — `9f4f72cab7cc55a8b93fbb39a011f06bbd3e49fd`，父 `6471329e`
- 证据 — `.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G-kernel-exposure-linux.md`
- 候选通过临时 Git 索引生成。工作树业务源与测试已和候选逐字节核对，主索引仍在原基线。证据目录为沙箱只读，已用临时索引把证据纳入候选树，用 `git show <候选>:<证据路径>` 可读。
- 未改 Engine 装配、协议组、插件、Vault 包收集器或前端。验证使用隔离 Vault 和合成凭据。

### Lead 装配

各注册函数已在内部从同一份定义执行 declare 和 bind。保留以下现有 Engine 注册入口，避免在 `boot.ts` 再静态声明同名描述。时机为各注册调用所处的 Vault 生命周期，策略初始化时已有全部 ID。

| 现有调用 | 候选包含的能力 |
| --- | --- |
| `registerHealthCapabilities(registry, deps)` | `health.run`、`health.events`、`health.exportDiagnostics`。保留 events 和 `core.probe()` 注入。 |
| `registerHomeCapabilities(registry, store, vault, widgets, changed)` | `home.focus.{get,update}`、`home.habits.{get,update}`、`home.dashboard.{get,update,backup,recovery.preview,recovery.commit}`。 |
| `registerPackageCapabilities(registry, vault, withSnapshot)` | `vault.{exportPackage,importPackage}`。保留现有快照回调和 Safe/Mail 包选器。 |
| `registerSystemCapabilities(registry, plugins, exposure, gateway)` | `plugins.{list,setEnabled}`、`gateway.{get,mcp.update,tokens.list,tokens.create,tokens.revoke,update,policy.preview,policy.update,audit.list,audit.clear,check}`、`capabilities.list`。 |
| `registerNotificationAndSettings(registry, notifications, settingsFile)` | `notifications.{list,markRead,delete,clearRead}`、`settings.{get,update}`。 |
| `registerVaultCapabilities(registry, vault, index)` | `vault.{info,update,location,indexEntries,list,readRange,managedFiles,pendingOperations,search,readBinary,readFile,reindex,clearIndex,reindexCancel}`。 |
| `registerWebShareCapabilities(registry, webShare)` | `web.share.{status,start,stop}`、`web.invitations.{list,get,create,revoke}`。 |

## 逐 ID 结果

用例简称和全名对应见候选证据文件。「只读」和「持久」逐 ID 在回环 HTTP 的 CLI 身份及 HTTP MCP 两条实际入口均执行。

| 能力 ID | 可开放 / 默认 | scope / risk | 意图 | 对象校验与定向验证 | 用例 |
| --- | --- | --- | --- | --- | --- |
| `health.run` | true / false | read / normal | 无 | 当前 Vault 快照，外部检查去除原错误、路径和动作参数 | 只读＋冷态健康检查 |
| `health.events` | true / false | read / high | 无 | 当前 Vault、公开模块与状态投影，查询只匹配投影 | 只读＋冷态健康检查 |
| `health.exportDiagnostics` | true / false | read / high | 无 | 模块过滤，返回诊断对象，移除原错误及事件消息 | 只读＋冷态健康检查 |
| `home.focus.get` | true / false | read / normal | 无 | 只取当前计时快照和版本，到期也不写盘或通知 | 只读＋专注代次 |
| `home.focus.update` | true / false | write / normal | 持久 | 绑定计时版本，旧代拒绝，同意图一次累计和通知 | 持久＋专注代次 |
| `home.habits.get` | true / false | read / normal | 无 | 读取时区日期、状态及版本 | 只读 |
| `home.habits.update` | true / false | write / high | 持久 | 固定日期、版本及习惯 ID，回执只保存 ID 与勾选状态 | 持久＋回执文本排除 |
| `home.dashboard.get` | true / false | read / normal | 无 | 读取当前板的配置和布局，业务数据由来源能力提供 | 只读 |
| `home.dashboard.backup` | true / false | read / normal | 无 | 只能读已经保存的看板 | 只读 |
| `home.dashboard.update` | true / false | write / normal | 持久 | Vault、板修订、组件配置及布局，回执只保存 Vault 与修订 | 持久＋home-dashboard 原有布局回归 |
| `home.dashboard.recovery.preview` | true / false | read / normal | 无 | 原字节保留，预览绑定修订和摘要 | 只读＋看板恢复 |
| `home.dashboard.recovery.commit` | true / false | write / high | 持久 | 比较 Vault、修订、原件和候选摘要，一次保全原件 | 持久＋看板恢复 |
| `vault.exportPackage` | true / false | admin / high | 包 ID＋持久 | 用 Vault 与主体划分专用目录，拒任意目标，固定包 ID 和摘要 | 持久＋包导出恢复 |
| `vault.importPackage` | true / false | admin / high | 包与恢复 ID＋持久 | 校验包摘要，目标在专用目录中且须不存在，拒绝当前库和祖先 | 持久＋包导出恢复 |
| `plugins.list` | true / false | read / normal | 无 | 插件版本、状态及依赖，外部列表去除原始错误 | 只读 |
| `plugins.setEnabled` | true / false | admin / high | 持久 | 校验已安装的内置插件、版本、受信依赖和连带停用集合 | 持久＋插件启停 |
| `gateway.get` | true / false | read / normal | 无 | 当前 Vault 服务配置、工具策略、令牌计数 | 只读 |
| `gateway.mcp.update` | false / false | admin / high | 无 | 2026-11-21 定案，仅工作台 | 批量全开 |
| `gateway.tokens.list` | true / false | read / high | 无 | 当前库 ID、名称、时间。HTTP 仅回自己的凭据，普通 CLI 可取库内元数据 | 只读 |
| `gateway.tokens.create` | false / false | admin / high | 无 | 2026-11-21 定案，仅工作台，一次性令牌原文 | 批量全开 |
| `gateway.tokens.revoke` | false / false | admin / high | 无 | 2026-11-21 定案，仅工作台 | 批量全开 |
| `gateway.update` | false / false | admin / high | 无 | 2026-11-21 定案，旧工作台入口保持服务原调用者 | 批量全开 |
| `gateway.policy.preview` | true / false | read / normal | 无 | 明确能力 ID，核对提供的目录和策略版本 | 只读 |
| `gateway.policy.update` | false / false | write / high | 无 | 2026-11-21 定案，仅桌面工作台，保留原 write 合同 | 批量全开 |
| `gateway.audit.list` | true / false | read / high | 无 | 只取当前 Vault 审计，外部仅当前可见能力的记录 | 只读 |
| `gateway.audit.clear` | false / false | admin / high | 无 | 2026-11-21 定案，仅工作台 | 批量全开 |
| `gateway.check` | true / false | read / normal | 无 | 检查能力状态、当前策略和 MCP 开关，零目标执行 | 只读 |
| `capabilities.list` | true / false | read / normal | 无 | 管理目录可包含非活动描述，协议发现仍只列出可用授权项 | 只读＋批量全开 |
| `notifications.list` | true / false | read / high | 无 | 外部只见已知 Kernel 专注完成通知，其他来源保留原领域边界 | 只读＋通知 ID |
| `notifications.markRead` | true / false | write / normal | 持久 | 外部须指定原 ID，拒绝跨来源与 all | 持久＋通知 ID |
| `notifications.delete` | true / false | write / high | 持久 | 固定可见原 ID | 持久＋通知 ID |
| `notifications.clearRead` | true / false | write / high | 持久 | 固定已读 ID，晚到通知不受旧意图影响 | 持久＋通知 ID |
| `settings.get` | true / false | read / normal | 无 | 可公开设置及当前修订，外部投影去除快捷键映射 | 只读 |
| `settings.update` | true / false | admin / high | 持久 | 核对修订、外部补丁范围和值，回执投影 | 持久＋重启回执 |
| `vault.info` | true / false | read / normal | 无 | 保留原响应形状，`includeVersions` 选取元数据版本和索引代次 | 只读＋Engine 兼容 |
| `vault.update` | true / false | write / normal | 持久 | 绑定 Vault 及元数据版本，只改名称与说明，回执不含说明 | 持久＋回执文本排除 |
| `vault.location` | true / false | read / high | 无 | 授权后提供本机根、说明和 Engine 设备标识 | 只读 |
| `vault.indexEntries` | true / false | read / normal | 无 | 当前索引和指定路径前缀 | 只读 |
| `vault.list` | true / false | read / normal | 无 | 既有路径守卫、外部拒绝包含受保护内容的开关 | 只读 |
| `vault.readRange` | true / false | read / high | 无 | 普通文件、范围上限、版本，拒绝链接和受保护路径 | 只读＋Vault 读取边界 |
| `vault.managedFiles` | true / false | read / high | 无 | 外部只走普通文件索引，整段排除 `.huhu` 私有状态 | 只读＋Vault 读取边界 |
| `vault.pendingOperations` | true / false | read / high | 无 | 当前库、可见领域操作类型、可选原 opId，移除外部 attention 原文 | 只读 |
| `vault.search` | true / false | read / normal | 无 | 当前库索引、查询与结果上限 | 只读 |
| `vault.readBinary` | true / false | read / high | 无 | 普通文件、10 MiB 上限及版本，拒绝链接和受保护路径 | 只读＋Vault 读取边界 |
| `vault.readFile` | true / false | read / normal | 无 | 外部通用文本读取使用同一对象守卫，保留原内容大小合同 | 只读＋Vault 读取边界 |
| `vault.reindex` | true / false | admin / high | 持久 | 当前索引代次，重建中拒绝新重建，成功回固定运行 ID | 持久＋索引代次 |
| `vault.clearIndex` | true / false | admin / high | 持久 | 当前代次，只清可从原件重建的全文索引 | 持久＋索引代次 |
| `vault.reindexCancel` | true / false | admin / high | 持久 | 当前运行代次，保留首次索引不可取消 | 持久＋Engine 取消空闲回归 |
| `web.share.status` | true / false | read / normal | 无 | 已绑定地址、端口和服务代次 | 只读 |
| `web.share.start` | false / false | admin / high | 无 | 2026-11-21 定案，仅桌面工作台 | 批量全开 |
| `web.share.stop` | false / false | admin / high | 无 | 2026-11-21 定案，仅桌面工作台 | 批量全开 |
| `web.invitations.list` | true / false | read / normal | 无 | 当前服务代的邀请 ID 和会话数 | 只读 |
| `web.invitations.get` | false / false | read / high | 无 | 2026-11-21 定案，可兑换邀请仅桌面工作台 | 批量全开 |
| `web.invitations.create` | false / false | admin / high | 无 | 2026-11-21 定案，仅桌面工作台 | 批量全开 |
| `web.invitations.revoke` | false / false | admin / high | 无 | 2026-11-21 定案，仅桌面工作台 | 批量全开 |

### 扩展命令委托对账

下列 15 个 ID 均设置 `externalIntentRequired: true` 和 `idempotency: "durable"`。集成 `5307b88f` 的 G3.4 扩展命令按原外部主体转发时，子调用同样需要相应意图键。合入后由 Lead 核验委托路径与部署的共享层。

- `home.focus.update`
- `home.habits.update`
- `home.dashboard.update`
- `home.dashboard.recovery.commit`
- `plugins.setEnabled`
- `notifications.markRead`
- `notifications.delete`
- `notifications.clearRead`
- `settings.update`
- `vault.update`
- `vault.reindex`
- `vault.clearIndex`
- `vault.reindexCancel`
- `vault.exportPackage`
- `vault.importPackage`

## 验证

| 检查 | 结果 | 本机证据 |
| --- | --- | --- |
| `pnpm typecheck` | 退出 0 | `/tmp/huhu-t23-final-typecheck.log` |
| `pnpm lint` | 退出 0 | `/tmp/huhu-t23-final-lint.log` |
| `pnpm format:check` | 退出 0 | `/tmp/huhu-t23-final-format-check.log` |
| `pnpm knip` | 退出 0 | `/tmp/huhu-t23-final-knip.log` |
| Kernel 与 Core 定向 Vitest，单 worker | 147 通过，其中本组 98。Core 此前的真实冷态用例和本组健康能力冷态注入夹具均通过。 | `/tmp/huhu-t23-final-related.log` |
| Engine 兼容性定向 Vitest，单 worker | 2 通过，筛选跳过 49。默认 `vault.info` 响应形状和浏览器工作台原有 Web 分享能力发现均验证。 | `/tmp/huhu-t23-engine-compat.log` |
| 全量 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` | Node 23 通过。Vitest 1772 通过、3 失败、19 跳过。文件 152 通过、3 失败、8 跳过。worker 由 `VITEST_MAX_FORKS=2`、`VITEST_MAX_THREADS=2` 限制。 | `/tmp/huhu-t23-full.log` |
| Vault 暂存清理隔离复测，单 worker | 26 通过，未复现全量中的失败。 | `/tmp/huhu-t23-vault-recheck.log` |

测试环境为 Linux、Node 24.21.0、pnpm 12.10.1，每次运行使用独立的 `XDG_RUNTIME_DIR`。未运行 E2E。

## 阻碍与接续

1. `apps/cli/test/cli.test.ts:474` 启动后读到 `guide.status=outdated`。`apps/engine/src/boot.ts:504` 的指南维护发生在 `:543` 的 Web 能力注册之前，导致指南新增的两条公开能力只出现在后续读回。建议 Lead 把 `guideRef.current?.maintain()` 整体移到 `registerWebShareCapabilities(registry, webShare)` 后，端点就绪之前。复跑该 CLI 用例和全量门禁。
2. `apps/engine/test/tool-access.test.ts:88` 用 `capabilities.list` 断言永久禁止开放，和本任务已定合同冲突。将这条断言的目标换为仍仅工作台的 `gateway.tokens.create`，保留前面的 `capabilities.list` 默认关闭检查。
3. `packages/vault/test/operations.test.ts:109` 全量运行时暂存文件消失后仍短暂可查到回执，隔离复测未复现。该文件和 Vault 写入实现无本组差异。最终全量计数保留这次失败。
4. 当前 MCP 的发现元数据仍把有持久回执的工具标作 `huhu.dev/intent-key: optional`。本候选的 15 项实际调用已强制校验，缺键在受理前失败。共享发现元数据与 G3.4 委托路径由 Lead 在集成统一核对。

## Lead 验收

前序阻塞已由 Lead 在 `6471329e` 解除。候选与本次集成门禁由 Lead 接续验收。

Lead 验收（2026-11-22）：通过。候选 `9f4f72ca` 快进到 `impl/huhu-issues-3-10-g6-kernel`，合入集成 `f74f4c23`。接续项由 Lead 在 `e3aa1cd4` 处理：1 指南维护移到 Web 分享登记后；2 tool-access 断言改用 gateway.tokens.create；3 Vault 清理用例竞态（同时等待删除与解除登记）；4 发现元数据新增 intentRequired、MCP 标 required，kernel-exposure 逐 ID 断言。定向 kernel-exposure/operations/tool-access 126/126、cli+agent-guide 28/28。终端 t23 关闭。
