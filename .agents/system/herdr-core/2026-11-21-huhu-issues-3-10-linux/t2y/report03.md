# SSH 主机管理执行报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2y
- 执行终端 — t3q
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task03.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report03.md
- 执行结果 — done
- 候选提交 — 8ddfc4356ffebf2e0b4900928cd8f630d9ff53cc，父提交 `10ebb272cc63d682db8242b2544f24ff74c0d6f8`

## 结论

完成主机管理四项可选工具，默认关闭。外部写入和回执重取均核对当前主机与跳板授权、原意图及领域版本。其余 75 项继续保持关闭，详见逐 ID 表。

## 产物与改动

- 分支 `impl/huhu-issues-3-10-g6-ssh` 仍指向任务父提交。候选由临时索引生成。业务和测试文件与工作树一致。工作树的 `.agents` 只读，追加证据从候选中的 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-ssh-exposure-linux.md` 读取。
- 复用现有的 `sshCapabilityDescriptors` 声明和 `ssh.apply` 绑定。四个既有名称继续由原 manifest 提供。
- 领域意图键为 JSON 输入字段 `intentKey`。作用域为 Vault 实例、可信外部调用主体和能力。受理后保存目标与跳板 ID。复用 `OperationReceipts`，并在排队结束、落实前和返回回执前核对授权。配置回执只有 ID 与修订，目录回执只有版本，删除回执只有结果。内联凭据去除明文后使用本机机密保护里的 Vault 专用 HMAC 密钥封存输入摘要。
- 主机配置允许修改已授权记录的显示信息与连接默认值，以及同一认证类型的凭据保留、清除和适用的内联替换。工作台负责首次创建、变更地址、登录身份、路由、认证类型和本机身份文件路径。目录外部操作限于可授权的主机和可见现有分组，工作台继续承担全库分组和排序管理。
- 清理、复制和配置的 Workbench 变体保留原 schema 所需字段及返回形状。公开输入保持单个 JSON Schema 对象，以兼容 MCP 工具发现。

## 验证

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 能力开关与发现 | 两个入口对每项验证默认关闭、单项开放后的发现、原调用撤销后拒绝。MCP 检查工具输入为对象。 | `%s confines host edits, copies, directory changes and removal to the authorized SSH route` |
| 授权、对象和配置版本 | 拒绝未授权的跳板、目标或分组，拒绝重定向目标与本机身份文件路径。旧路由修订拒绝。按原目录版本对授权同组主机移动、置顶及排序，未授权主机位置不变。拒绝删除仍被引用的跳板。 | 同一 CLI/HTTP MCP 矩阵 |
| 回执与凭据 | 同键并发只保存一次编辑、只生成一个副本。替换凭据改参同键拒绝。源主机和副本凭据独立。授权后删除副本并检查重复请求。检查持久记录无合成秘密或凭据状态。CLI 重启回原确认，恢复 MCP 写入返回 unknown 且领域结果未重复执行。 | 同一矩阵 |
| 单文件 Vitest | `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts --maxWorkers=1`，14 项通过。使用 Node 24.21.0、pnpm 12.10.1、临时 Vault、临时 XDG 和回环 SSH。 | `/tmp/huhu-t3q-task03-vitest.log` |

## 未运行的验证

- Playwright `tests/e2e/ssh/settings.spec.ts`，用例 `SSH settings reflect the shared gateway policy and provide redacted client samples`。用例改用此批仍关闭的连接工具检查拒绝，其余桌面流程不变。该文件的 `SSH host grants are editable from desktop and invited browser workbenches` 可同轮验证。
- 相关 Vitest `plugins/ssh/test/domain-exposure.engine.test.ts`、`apps/engine/test/capability-catalog.test.ts`、`plugins/ssh/test/directory.test.ts`、`plugins/ssh/test/host-auth.engine.test.ts`。按实施者职责边界，交 Lead 和全仓 typecheck、lint、format:check、knip、全量测试、构建、打包、截图一并串行验证。

## 本批 SSH 逐项

本表各项静态和运行时均使用 `exposable: true`、`defaultExposed: false`。测试为上述 CLI 和 HTTP MCP 矩阵。

| 能力 ID | scope / risk | 意图及校验 |
| --- | --- | --- |
| `ssh.hosts.organize` | write / normal | 领域意图与目录版本。约束所涉主机绑定、路由及可见分组。 |
| `ssh.hosts.configure` | admin / high | 领域意图、原主机修订与路由。替换凭据的摘要由本机保护。返回最小确认。 |
| `ssh.hosts.copy` | admin / high | 领域意图、原主机修订与路由。仅生成一个独立新 ID，凭据及授权单独配置。 |
| `ssh.hosts.remove` | admin / high | 领域意图、原主机修订、路由、引用和活动连接。复权后可读原删除结果。 |

## 逐 ID 接续清单

以下 75 项继续为 `exposable: false`、`defaultExposed: false`。计划、风险与定向验收依据为 t19。E2E 及补充矩阵由 Lead 验证。

| 能力 ID | 候选 scope / risk → 计划 scope / risk | 计划意图 | 开放所需校验与证据 |
| --- | --- | --- | --- |
| `ssh.monitor.tools.read` | read / normal → execute / high | 领域 | 现会在远端执行固定进程/容器查询。只读授权只能看已有采样。 [t19:465](../t19/report01.md#L465) |
| `ssh.monitor.session.open` | execute / normal → execute / high | 领域 | 按原 pane/连接代与订阅所有者创建或改变采样，重试不增采样器。 [t19:466](../t19/report01.md#L466) |
| `ssh.monitor.session.get` | read / normal → read / normal | 无 | 只读原订阅缓存样本，不主动连接/采样。 [t19:467](../t19/report01.md#L467) |
| `ssh.monitor.session.change` | execute / normal → execute / high | 领域 | 按原 pane/连接代与订阅所有者创建或改变采样，重试不增采样器。 [t19:468](../t19/report01.md#L468) |
| `ssh.monitor.panels.list` | read / normal → read / normal | 无 | 仅可见面板定义及主机顺序。 [t19:469](../t19/report01.md#L469) |
| `ssh.monitor.panels.save` | write / normal → write / normal | 领域 | 校验可见 hostId 及面板修订。只存配置。 [t19:470](../t19/report01.md#L470) |
| `ssh.monitor.panels.delete` | write / normal → write / high | 领域 | 按面板 revision 删除并释放本面板的订阅。 [t19:471](../t19/report01.md#L471) |
| `ssh.monitor.panels.run` | read / normal → read / normal | 无 | 名为 run，绑定 handler 为 monitors.dashboard，仅取已有样本。 [t19:472](../t19/report01.md#L472) |
| `ssh.monitor.panels.change` | execute / normal → execute / high | 领域 | 针对原面板、主机、采样代，启动/暂停/停用/重试各只发生一次。 [t19:473](../t19/report01.md#L473) |
| `ssh.forwarding.rules.list` | read / normal → read / normal | 无 | 限授权主机、监听和出口摘要，不开启监听。 [t19:474](../t19/report01.md#L474) |
| `ssh.forwarding.rules.save` | write / normal → write / high | 领域 | 验监听范围、目标及规则版本。运行中改规则会释放旧监听。 [t19:475](../t19/report01.md#L475) |
| `ssh.forwarding.rules.delete` | write / normal → write / high | 领域 | 绑定规则、运行、版本，释放该规则的持有权。 [t19:476](../t19/report01.md#L476) |
| `ssh.forwarding.runs.list` | read / normal → read / normal | 无 | 只取已存在监听、连接归属与流量计数。 [t19:477](../t19/report01.md#L477) |
| `ssh.forwarding.runs.start` | execute / high → execute / high | 领域 | 固定规则修订、出口及实际回环监听。恢复只用原规则，拒复用别人的通道。 [t19:478](../t19/report01.md#L478) |
| `ssh.forwarding.runs.resume` | execute / high → execute / high | 领域 | 固定规则修订、出口及实际回环监听。恢复只用原规则，拒复用别人的通道。 [t19:479](../t19/report01.md#L479) |
| `ssh.forwarding.runs.stop` | execute / normal → execute / high | 领域 | 校验原运行及规则代次，只关闭当前调用者可控制的监听。 [t19:480](../t19/report01.md#L480) |
| `ssh.archives.support` | read / normal → execute / high | 领域 | archives.ts:112 会探测原生 ZIP、尝试 SFTP。查询版改取缓存，不隐式启动探针。 [t19:481](../t19/report01.md#L481) |
| `ssh.archives.run` | execute / high → execute / high | 领域 | 核对文件会话、来源设备、目录、归档大小和目标版本，覆盖/解压须确认。 [t19:482](../t19/report01.md#L482) |
| `ssh.transfers.start` | execute / high → execute / high | 领域 | 固定获准的源/目标、文件快照、冲突策略和任务 ID，重交不复制两遍。 [t19:483](../t19/report01.md#L483) |
| `ssh.transfers.startBatch` | execute / high → execute / high | 领域 | 固定获准的源/目标、文件快照、冲突策略和任务 ID，重交不复制两遍。 [t19:484](../t19/report01.md#L484) |
| `ssh.transfers.list` | read / normal → read / normal | 无 | 过滤本人有权观察的队列，零连接/调度。 [t19:485](../t19/report01.md#L485) |
| `ssh.transfers.decide` | execute / high → execute / high | 领域 | 绑定原冲突的两端快照与版本，迟到的覆盖/跳过决定作废。 [t19:486](../t19/report01.md#L486) |
| `ssh.transfers.cancel` | execute / normal → execute / high | 领域 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 [t19:487](../t19/report01.md#L487) |
| `ssh.transfers.pause` | execute / normal → execute / high | 领域 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 [t19:488](../t19/report01.md#L488) |
| `ssh.transfers.resume` | execute / normal → execute / high | 领域 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 [t19:489](../t19/report01.md#L489) |
| `ssh.transfers.retry` | execute / high → execute / high | 领域 | 原端点与快照。recheck 可能恢复旧文件/清理暂存，不属于 read。 [t19:490](../t19/report01.md#L490) |
| `ssh.transfers.recheck` | execute / high → execute / high | 领域 | 原端点与快照。recheck 可能恢复旧文件/清理暂存，不属于 read。 [t19:491](../t19/report01.md#L491) |
| `ssh.transfers.origin` | execute / normal → write / normal | 领域 | openOrigin 会恢复或分离文件会话绑定，校验原 transferId 及源设备。 [t19:492](../t19/report01.md#L492) |
| `ssh.transfers.clearHistory` | execute / normal → write / high | 领域 | 只清调用者有权清理的已结束记录，保留在途任务。 [t19:493](../t19/report01.md#L493) |
| `ssh.workspace.runs.list` | read / normal → read / normal | 无 | 限本人可观察的原工作区实例与 pane。 [t19:494](../t19/report01.md#L494) |
| `ssh.workspace.runs.start` | execute / high → execute / high | 领域 | 绑定模板/主机及路由修订，每个目标 pane 对账。禁止重连到替代主机。 [t19:495](../t19/report01.md#L495) |
| `ssh.workspace.runs.reconnect` | execute / high → execute / high | 领域 | 绑定模板/主机及路由修订，每个目标 pane 对账。禁止重连到替代主机。 [t19:496](../t19/report01.md#L496) |
| `ssh.workspace.runs.close` | execute / normal → execute / high | 领域 | 绑定原 run/连接代，释放其持有的 pane 与会话。 [t19:497](../t19/report01.md#L497) |
| `ssh.workspace.runs.saveTemplate` | write / normal → write / normal | 领域 | 仅由获准原运行生成新模板，重交只生成一个 ID。 [t19:498](../t19/report01.md#L498) |
| `ssh.workspace.templates.list` | read / normal → read / normal | 无 | 取可见定义和引用，不因展示模板启动连接。 [t19:499](../t19/report01.md#L499) |
| `ssh.workspace.templates.save` | write / normal → write / normal | 领域 | 核对模板、hostId 与 expectedRevision。 [t19:500](../t19/report01.md#L500) |
| `ssh.workspace.templates.delete` | write / normal → write / high | 领域 | 核对模板版本与删除确认，单独处理已运行实例。 [t19:501](../t19/report01.md#L501) |
| `ssh.connect` | execute / high → execute / high | 领域 | 后台分支检查 desktop。改受权会话的连接意图，返回可查询 attemptId。按 hostId 不足以绑定待答。 [t19:508](../t19/report01.md#L508) |
| `ssh.connections.status` | read / normal → read / normal | 无 | 只列该主体/连接代，待答不可跨主体枚举。 [t19:509](../t19/report01.md#L509) |
| `ssh.disconnect` | execute / high → execute / high | 领域 | 只关闭该主体可控的原连接及通道，不能按全局 hostId 切断他人作业。 [t19:510](../t19/report01.md#L510) |
| `ssh.hostKey.decide` | execute / high → execute / high | 领域 | 仅原 attempt、hop、指纹、promptRevision。区分单次接受与持久信任，changed-key 走独立管理。 [t19:511](../t19/report01.md#L511) |
| `ssh.knownHosts.list` | read / normal → read / high | 无 | 限可见地址、端口、密钥类型和指纹，不含私钥。 [t19:512](../t19/report01.md#L512) |
| `ssh.knownHosts.forget` | write / high → admin / high | 领域 | 限确认的原地址、端口、类型和精确指纹，独立信任管理权。 [t19:513](../t19/report01.md#L513) |
| `ssh.exec.run` | execute / high → execute / high | 领域 | 外部复用已有 jobs 准备/启动/取消及回执，不向 hostId 下的任意会话施加命令或取消。 [t19:514](../t19/report01.md#L514) |
| `ssh.exec.cancel` | execute / high → execute / high | 领域 | 外部复用已有 jobs 准备/启动/取消及回执，不向 hostId 下的任意会话施加命令或取消。 [t19:515](../t19/report01.md#L515) |
| `ssh.audit.list` | read / normal → read / high | 无 | 限可观察作业、主机及主体，脱敏命令/路径。 [t19:516](../t19/report01.md#L516) |
| `ssh.fileSessions.open` | execute / normal → execute / high | 领域 | 新文件会话绑定既有受权连接，稳定意图返回原 fileSessionId。 [t19:517](../t19/report01.md#L517) |
| `ssh.fileSessions.list` | read / normal → read / normal | 无 | 仅本人或获委托会话摘要。 [t19:518](../t19/report01.md#L518) |
| `ssh.fileSessions.close` | execute / normal → execute / high | 领域 | 释放原文件会话及其持有权，不伤共享 SSH 连接。 [t19:519](../t19/report01.md#L519) |
| `ssh.fileSessions.localList` | read / normal → write / normal | 领域 | 可选 root 会写 binding.localRoot。拆成显式授权绑定与只读列目录。CLI 本地文件由 CLI 选择，Engine 根只取有范围的句柄。 [t19:520](../t19/report01.md#L520) |
| `ssh.fileSessions.search` | execute / normal → execute / normal | 领域 | 会分配可取消的递归搜索，限制源会话、根、深度、数量和期限。 [t19:521](../t19/report01.md#L521) |
| `ssh.fileSessions.cancelSearch` | execute / normal → execute / normal | 领域 | 仅原搜索代次，禁止旧取消影响新搜索。 [t19:522](../t19/report01.md#L522) |
| `ssh.fileSessions.directory` | read / normal → read / normal | 无 | 仅读原 Shell 所报告的目录与提示符修订。 [t19:523](../t19/report01.md#L523) |
| `ssh.fileSessions.prepareDirectory` | execute / normal → execute / normal | 领域 | 当前创建 navigation/follow，绑定会话、路径、提示符修订及短时效。 [t19:524](../t19/report01.md#L524) |
| `ssh.fileSessions.commitDirectory` | execute / high → execute / high | 领域 | 核对一次性 follow、输入持有权及原空闲提示符，禁止过期补发。 [t19:525](../t19/report01.md#L525) |
| `ssh.fileSessions.document.open` | read / normal → read / high | 无 | 只读绑定的远端文件，返回编码、权限、版本，禁止隐式连接。 [t19:526](../t19/report01.md#L526) |
| `ssh.fileSessions.document.save` | execute / high → write / high | 领域 | 核对 fileSessionId、路径、expectedVersion 及原权限，安全暂存与发布。 [t19:527](../t19/report01.md#L527) |
| `ssh.fileSessions.properties` | read / normal → read / normal | 无 | 只读原端点的元数据及版本。 [t19:528](../t19/report01.md#L528) |
| `ssh.fileSessions.changeProperties` | execute / high → write / high | 领域 | 核对原文件 revision、路径与授权字段，不得提高到未经批准的特权。 [t19:529](../t19/report01.md#L529) |
| `ssh.fileSessions.createEntry` | execute / normal → write / normal | 领域 | 在获准父目录创建文件/目录，校验名称与不存在前置条件。 [t19:530](../t19/report01.md#L530) |
| `ssh.fileSessions.moveEntry` | execute / high → write / high | 领域 | 核对原路径、版本、目标父目录/冲突，禁止跨会话混用。 [t19:531](../t19/report01.md#L531) |
| `ssh.sftp.list` | execute / normal → read / normal | 无 | 对已有受权连接只列远端目录，不拨号或执行命令。 [t19:532](../t19/report01.md#L532) |
| `ssh.sftp.read` | execute / normal → read / high | 无 | 对已有连接有界读取获准文件，无命令、无隐式重连。 [t19:533](../t19/report01.md#L533) |
| `ssh.sftp.write` | execute / high → write / high | 领域 | 绑定远端路径、版本、覆盖确认与内容摘要。 [t19:534](../t19/report01.md#L534) |
| `ssh.sftp.upload` | execute / high → execute / high | 领域 | 原合同含 Engine localPath。改设备标识和有界传输句柄，绑定两端和覆盖版本。 [t19:535](../t19/report01.md#L535) |
| `ssh.sftp.download` | execute / high → execute / high | 领域 | 原合同含 Engine localPath。改设备标识和有界传输句柄，绑定两端和覆盖版本。 [t19:536](../t19/report01.md#L536) |
| `ssh.sftp.cancel` | execute / high → execute / high | 领域 | 只取消主体的具体传输，不得按公共主机停止他人操作。 [t19:537](../t19/report01.md#L537) |
| `ssh.sftp.mkdir` | execute / normal → write / normal | 领域 | 限原连接的获准父目录，确认名称及冲突。 [t19:538](../t19/report01.md#L538) |
| `ssh.sftp.rename` | execute / high → write / high | 领域 | 核对远端路径、原对象版本、覆盖/递归删除意图。 [t19:539](../t19/report01.md#L539) |
| `ssh.sftp.delete` | execute / high → write / high | 领域 | 核对远端路径、原对象版本、覆盖/递归删除意图。 [t19:540](../t19/report01.md#L540) |
| `ssh.shells.open` | execute / high → execute / high | 领域 | 建立原主机/路由的 PTY，固定意图与 shellId。后续流持续验权。 [t19:541](../t19/report01.md#L541) |
| `ssh.shells.list` | read / normal → read / normal | 无 | 只列可观察 shell 元数据，不 attach、不启动。 [t19:542](../t19/report01.md#L542) |
| `ssh.shells.close` | execute / high → execute / high | 领域 | 限制原 shellId、所有者与连接代，重复关闭不碰新终端。 [t19:543](../t19/report01.md#L543) |
| `ssh.hosts.import.preview` | read / normal → read / normal | 无 | 仅解析有界输入字节及当前目录，列冲突，预览令牌绑定主体和源摘要。 [t19:549](../t19/report01.md#L549) |
| `ssh.hosts.import.confirm` | write / normal → write / high | 领域 | 校验确认 token、目录 revision、选中行及冲突。复用确定性 hostId 防止部分成功后多建。 [t19:550](../t19/report01.md#L550) |

## 阻碍与接续

- 接续从连接、待答和已知主机开始，随后做监控、转发、文件来源、传输和终端。现有按全局 hostId 断线及 SFTP 的 Engine 路径变体仍保持关闭。
- 按已保存主机授权之外的工作台主机管理变体包括首次创建、替换原信任目标、选择本机身份文件、全库分组及排序。可选高阶外部合同仍需明确授权对象并单独验证。
- C05 的恢复 HTTP MCP 会话保持只读与既有持久意图重放边界。四个 SSH 领域写入在恢复后可从领域状态核对，写请求返回 unknown。CLI 可按同一身份重取领域回执。若要为重启后的 MCP 单独开放明确的领域回执读回，需要下一批接线。

## Lead 验收

Lead 验收（2026-11-22）：通过。候选 `8ddfc435` 快进分支并合入集成 `adb5ff2d`。Lead 补跑：ssh、engine tsc，oxlint，oxfmt 通过；定向 vitest 与 SSH settings E2E 见 t2y/task04 前 Lead 记录（topic）。t3q 上下文 77%，关闭；剩余 75 项由新会话接 task04。
  Lead 补跑（集成 `adb5ff2d`）：plugins/ssh/test + capability-catalog 15 文件 92/92；`pnpm build`；`tests/e2e/ssh/settings.spec.ts` 3/3 通过（含此前因浏览器路径跳过的用例）。
