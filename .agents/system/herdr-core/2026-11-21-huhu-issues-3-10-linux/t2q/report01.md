# t2q/task01 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2q
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2q/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2q/report01.md
- 执行结果 — blocked（候选已生成，完整运行门禁待集成）
- 恢复身份 — t2q 的 holder 丢失后，按用户授权在 t2s 接续原任务。

## 结论

完成 18 个新增外部可选动作和 5 个原有 Versioning 读项的守卫对齐。23 项均默认关闭，已经在隔离夹具中分别跑通 CLI 和 HTTP MCP 的单项授权、调用、撤权。持久项验证同意图并发、丢弃应答及重启回读。全量门禁受 CLI 旧断言及恢复环境权限阻碍。

## 产物与改动

- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`。分支 `impl/huhu-issues-3-10-g6-versioning` 保持在 `9aedbdf5017916915d0514ece25a393445cd6457`。
- 候选 — `96f9272d71c84724f992c4ff2bcb68cef6aff3ef`。以临时索引生成，父提交为 `9aedbdf5`。候选代码与工作树逐字核对一致。
- 证据 — `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidence/G-versioning-safe-exposure-linux.md`。工作树的 `.agents` 挂载只读，证据通过临时索引加入候选树，可用 `git show <候选>:<证据路径>` 读取。

## 逐项交付

下表的每行均为 `exposable: true`、`defaultExposed: false`。表中 17 个 Versioning 项和 1 个 Safe 项对应 t19「versioning」「safe」的开放裁决。另含 5 个原已可选的 Versioning 读项。t19 本组没有「闭」行。其余 Safe 项沿用各自的会话、秘密与独立选择守卫。

表中各 ID 都是 `domain-exposure.engine.test.ts` 的 `catalog and 23 actions are default off, individually authorized, revoked and reconciled after restart` 的一行，在 CLI 和 HTTP MCP 各执行一次。对象拒绝复用同文件的 `rejects a different repository, protected paths, stale object versions and wrong network target`。持久意图要求 CLI `--intent-key` 或 MCP `_meta["huhu.dev/intent-key"]`。

| ID | Scope / risk | 意图 | 对象校验与定向检查 |
| --- | --- | --- | --- |
| `history.timeline` | read / normal | 无 | 校验路径与原路径可见范围，空影子仓库保持空。 |
| `history.read` | read / high | 无 | 在文件时间线中查条目，再核对该版本的原路径。拒绝其他文件的条目及受保护路径。 |
| `history.checkpoint` | write / normal | 持久 | 校验 Vault 路径、单行标题和内容版本，按核对后的字节构建快照，返回原 checkpoint。 |
| `history.restore` | write / high | 持久 | 校验条目、原路径和当前内容版本，保留恢复前检查点。沿用指南 needs-check 与任务 inputHash hold，`history.test.ts` 复验语义字段及写入前后钩子。 |
| `git.status` | read / normal | 无 | 隔离仓库，过滤内部路径，返回供后续写操作使用的仓库、HEAD 和索引基线。 |
| `git.init` | admin / high | 持久 | 只初始化当前可写 Vault，已有外链仓库拒绝。 |
| `git.log` | read / normal | 无 | 仅输入指定上限，读取受验证仓库当前 HEAD。 |
| `git.diff` | read / high | 无 | 外部调用须指定单文件，核验其归属与符号链接，禁用外部 diff、textconv 和跨路径重命名配对。 |
| `git.stage` | write / normal | 持久 | 显式路径集、仓库、HEAD 和索引摘要，拒绝旧索引与内部路径。 |
| `git.unstage` | write / normal | 持久 | 校验同一基线和显式路径集，覆盖初始仓库撤销暂存。 |
| `git.commit` | write / high | 持久 | 从核对后的索引构建树，发布前重验，按原 HEAD 更新引用。外部回执只返回提交元数据，省去说明。 |
| `sync.get` | read / normal | 无 | 返回目标及配置摘要，带嵌入凭据的旧 remote 被过滤。 |
| `sync.auth.get` | read / normal | 无 | 校验当前 HTTPS 目标，只返回认证状态及 revision；保留桌面专用工作台标记。 |
| `sync.auth.configure` | admin / high | 领域 | 以逻辑主体和输入 `operationId` 对账，核对规范化目标与 revision，结果只含摘要。CLI 重启读原结果，恢复 MCP 得 unknown 后以领域读回 revision。 |
| `sync.update` | admin / high | 持久 | 绑定 Vault 配置 revision，核验传输与启用自动同步的仓库，按原事件更新调度。 |
| `sync.preview` | execute / high | 持久 | 绑定 Git 仓库、HEAD、remote、branch、认证 revision。真实回环 fetch 更新引用，沿用 Safe 整代快照。 |
| `sync.run` | execute / high | 持久 | 核验源 HEAD 和实际 origin，再按原流程拉取、提交与推送。双入口夹具覆盖 pull，`remote-auth.engine.test.ts` 覆盖真实 Git HTTPS fetch/push 与 Safe 锁定后的独立认证。 |
| `conflicts.list` | read / normal | 无 | 只回读会话投影。旧会话无现成摘要时返回 unknown，可另取冲突文件。 |
| `conflicts.read` | read / high | 无 | 校验原会话、两端 HEAD 和显式文件，从固定 Git blob 生成展示。 |
| `conflicts.resolve` | execute / high | 持久 | 要求原会话、两端 HEAD 与完整决议，拒绝 Safe 整代逐文件拆解。回执只保存 commit 和推送摘要。 |
| `conflicts.cancel` | write / high | 持久 | 核验会话及 HEAD。旧会话请求拒绝，新会话和 HEAD 保留。 |
| `sync.status` | read / normal | 无 | 回读可见状态及安全原因，无定时器重启、网络或 Git 调用。 |
| `safe.audit.list` | read / high | 无 | 保留二次复权，核对 Safe 库实例、锁定代次、调用者证明及 limit，只投影当前库的动作元数据。 |

## Lead 装配

- Versioning 声明 `versioning.versioningCapabilityDescriptors`，apply 绑定同源描述符，沿用现有插件注册。manifest 补列 `conflicts.{list,read,resolve,cancel}`。候选在 `boot.ts` 最少增加一行静态声明。
- Safe 沿用 `safe.safeCapabilityDescriptors` 及 `catalogDeclared: true`，其中 `safe.audit.list` 使用同源描述和领域二次复权，manifest 已有此项。
- 原 workbench 调用预览已通过 `useCall` 提供写入键。两个直接使用 desktop HTTP 客户端的预览回归用例显式传 `{ write: true }`，以匹配新的 execute 作用域。

## 验证

使用 Node 24.21.0、pnpm 12.10.1 与独立 `XDG_RUNTIME_DIR`。中断前日志在 `/tmp/huhu-t2q.uzXWAj/`，恢复后日志在 `/tmp/huhu-t2q-resume.GPvcas/`。

| 验收 | 实际结果 | 证据 |
| --- | --- | --- |
| CLI 与 HTTP MCP 矩阵 | 中断前全量日志记录本组 5 项通过，包含 23 个动作的双入口、对象拒绝及停用目录。 | 前一会话 `full.log:89–94` |
| Versioning、Safe 与 C05 | 中断前定向记录认证 6、历史 12、冲突 11、Safe 整代同步 7、Safe 外部入口 3、C05 3 项通过。前一次矩阵比较误计了后台历史索引变化，修正后本组 5 项在上述全量日志通过。 | 前一会话 `targeted.log`、`full.log` |
| 恢复后定向 Vitest | 67 项通过，54 项止于沙箱权限。其中 29 项回环 listen EPERM，25 项 Git spawnSync EPERM。 | 恢复后 `targeted.log` |
| 全量 pnpm test | 按全机锁和两个 worker 启动的前一轮在 holder lost 时中断，没有退出结果。已记录 CLI 旧断言失败。恢复后定向证明同一环境阻止测试夹具，因此未再次启动全量。 | 前一会话 `full.log:84–85` |
| 格式和未引用项 | `pnpm format:check` 与 `pnpm knip` 均退出 0。 | 恢复后 `gates.tsv` |
| lint | 全库 oxlint、两个反例规则和 stylelint 的独立命令通过预期检查。`pnpm lint` 在 Node `spawnSync` 自检处退出 1，诊断确认 EPERM。剩余五个 CSS 检查也在启动 Git 或 shell 时被 EPERM 拦截。 | 恢复后 `lint.log`、`lint-spawn.json`、`lint-components.log` 与各 CSS 日志 |
| 类型检查 | 根脚本的并行运行在内存压力下中断。按其两个步骤重跑 vendor build:types 及全工作区 typecheck，后一步限制两个工作区并发，两步均成功。 | 恢复后 `typecheck-limited.log`、`gates.tsv` |

## 阻碍与接续

1. 请 Lead 在集成范围更新 `apps/cli/test/cli.test.ts:463–465` 的不可开放断言。当前使用 `safe.audit.list`，这次明确将它改为可单独开放。替换为仍关闭的 `gateway.tokens.create`，继续验证不可开放项得到 `INVALID_INPUT`。该测试位于 t2q 可写范围之外。
2. 在可监听回环地址和可启动 Git 子进程的集成环境重跑 lint 和测试。全量用 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`，其余 Vitest 也按恢复消息限制为两个 worker。真实外部 Git SSH 与双入口 push 本次未联验。双入口使用回环 HTTP fetch/pull，既有 Versioning 认证套件已覆盖真实 HTTPS fetch/push。
3. 候选仅为本地提交对象。代码、分支引用和共享 manifest 交 Lead 验收与装配。

## Lead 验收

待 Lead 核对候选与门禁证据。

Lead 验收（2026-11-22）：通过。候选 `96f9272d` 快进到 `impl/huhu-issues-3-10-g6-versioning` 并合入集成；阻碍 1 由 Lead 在合并提交中改 cli.test 断言；阻碍 2（沙箱 EPERM）在集成环境复跑：16 文件 149/149，pnpm lint、format 通过。终端 t2w 关闭。
