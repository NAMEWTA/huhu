# SSH 领域组执行报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2y
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report01.md
- 执行结果 — blocked
- 候选提交 — `d89c5e04bc388d8800df3a0cd26d9d482ec421c7`，父提交 `314c0bed81d76be1103ff6db4a6e473042ef8940`

## 结论

完成 `ssh.settings.get` 和 `ssh.settings.update`，两个动作均可逐项授予，首次默认关闭。CLI 与 HTTP MCP 验证了设置读取、保存、撤权和重启对账。其余 81 个拟开放动作保持关闭，依赖 Q6-3 所定的已保存主机授权及逐 ID 领域校验。10 个基线公共能力仍可选且默认关闭，已有回环回归通过，逐入口矩阵及主机授权仍待补齐。t19 的 SSH 表没有裁决为永久关闭的动作。

## 产物与改动

- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-ssh`，HEAD 仍为 `314c0bed`。候选使用临时索引生成。三个 SSH 代码／测试文件与候选逐字匹配。
- 证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-ssh-exposure-linux.md` 已写入候选树。worktree 的 `.agents` 为只读挂载，该文件从候选提交读取。
- 两个设置描述符来自 `ssh.sshCapabilityDescriptors` 的 `settingsGet`、`settingsUpdate`。继续沿用 `apps/engine/src/boot.ts:149` 的 `registry.declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors))` 和 `ssh.apply` 中对应的 `bindCapability`。本批所需的声明和绑定已齐。
- t19 将设置写入归为领域意图。现有设置写入只有 `expectedRevision`，没有独立领域操作标识。候选复用 `durableExternal` 对账并保留修订校验，结果只存库级设置和新修订。外部更新传输默认值后，由现有调度时机使用新值。桌面及插件内部调整保留即时调度行为。

## 验证

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 默认关、逐项授予、撤权 | 两个独立 Vault 分别走实际 CLI 与已认证 HTTP MCP。两个设置工具分别覆盖发现、已知名称的直接调用、策略修订递增和撤权后原名称被拒。 | `test/domain-exposure.engine.test.ts` 的 `%s SSH Vault settings are individually authorized, revoked and reconciled after restart` |
| 只读和设置影响范围 | 冷读无设置文件。热读文件字节一致。Herdr Core ensure、SSH Client connect、凭据列表及外部触发传输调度计数均为零。原桌面设置和连接默认值回归通过。 | 设置双入口矩阵，`test/preferences.engine.test.ts` |
| 设置持久对账 | 缺键在写入前拒绝。同参同键并发、丢弃应答、重启后重交只执行一次成功保存。异参同键返回 `IDEMPOTENCY_MISMATCH`，不同键加旧修订返回 `VERSION_CONFLICT`。MCP 重启后原 transport 返回 404，恢复逻辑主体后回原结果。撤权后原意图被拒。 | 设置双入口矩阵 |
| 81 个待开放动作 | 两个外部入口逐项返回 `CAPABILITY_NOT_EXPOSED`。批量开启预览只包含当前 12 个可选动作，显式塞入关闭项的批次返回 `INVALID_INPUT`。 | 设置双入口矩阵 |
| 10 个基线公共动作 | 校验静态和运行时全为默认关。9 项已有公共入口回归通过，含同令牌双会话、精确且单次的信任决定、changed-key 拒绝和重启不重放。每个 ID 完整双入口开放矩阵待补。 | `test/public-resources.engine.test.ts`、设置双入口矩阵 |
| Vitest | 三个关联文件共 12 项通过。Node v24.21.0，pnpm 12.10.1，临时 `XDG_RUNTIME_DIR`，使用仓库 maxWorkers。全量测试留给 Lead。 | `pnpm exec vitest run plugins/ssh/test/domain-exposure.engine.test.ts plugins/ssh/test/preferences.engine.test.ts plugins/ssh/test/public-resources.engine.test.ts` |
| 静态门禁 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 四项退出码均为 0。Knip 提示 `tests/parity-ok/compare.spec.ts` 冗余入口。 | `/tmp/huhu-t2y-typecheck.log`、`/tmp/huhu-t2y-lint.log`、`/tmp/huhu-t2y-format:check.log`、`/tmp/huhu-t2y-knip.log` |

## 已验证设置和原有公共入口

本表的设置双入口测试指上节所列用例。公共回归指 `test/public-resources.engine.test.ts`，各行列出代表用例名。公共动作的 Q6-3 主机选择仍待接入。

| 能力 ID | exposable / defaultExposed | scope / risk | 意图 | 校验及代表用例 |
| --- | --- | --- | --- | --- |
| `ssh.settings.get` | true / false | read / normal | 无 | 当前 Vault 便携默认值。设置双入口测试。t19:463。 |
| `ssh.settings.update` | true / false | write / normal | 持久意图 + 领域修订 | 当前 Vault、expectedRevision、同键回原设置结果。设置双入口测试。t19:464。 |
| `ssh.resources.host.get` | true / false | read / normal | 无 | 便携主机定义、原路由、脱敏投影。公共回归 `only authorized Engine, CLI and MCP resolve the same portable SSH host and route without credentials or a dial`。 |
| `ssh.resources.connection.start` | true / false | execute / high | 现有请求幂等与活动核验归并，跨重启对账待补 | 已保存路线修订、外部主体及独立尝试。公共回归 `first trust stays with the original attempt, route and external subject through policy and token revocation`。 |
| `ssh.resources.connection.get` | true / false | read / normal | 无 | attemptId、hostId 与当前逻辑主体。公共回归 `HTTP MCP isolates SSH owners under one token and never replays a job after reconnect or restart`。 |
| `ssh.resources.connection.list` | true / false | read / normal | 无 | 列表仅含当前主体未过期尝试。公共回归 `first trust stays with the original attempt, route and external subject through policy and token revocation`。 |
| `ssh.resources.trust.decide` | true / false | execute / high | 领域待答单次消费 | 精确匹配原路由、提示修订、各跳及指纹，只支持本次接受或拒绝。公共回归 `first trust stays with the original attempt, route and external subject through policy and token revocation`。 |
| `ssh.jobs.prepare` | true / false | execute / high | 领域 intentKey 与 jobId | Vault 实例、当前逻辑主体、主机、路由修订。公共回归 `an admission left by an interrupted Engine remains unknown and cannot dial or dispatch again`。 |
| `ssh.jobs.start` | true / false | execute / high | 领域 jobId、sessionId 和状态 | 原作业、会话、主机与路由修订，原命令最多调度一次。公共回归 `HTTP MCP isolates SSH owners under one token and never replays a job after reconnect or restart`。 |
| `ssh.jobs.get` | true / false | read / normal | 无 | 主体及原作业，查活动状态或回执。公共回归 `route edits and a second Vault cannot reuse the original job or its receipts`。 |
| `ssh.jobs.output.read` | true / false | read / normal | 无 | 同主体按 stdout/stderr 字节游标，未知状态有界返回。公共回归 `CLI owns a separate SSH job, reads split UTF-8 with byte cursors and retains a bounded tail`。 |
| `ssh.jobs.cancel` | true / false | execute / high | 领域原 jobId 和状态 | 仅原作业可请求停止，按实际退出回报结果。公共回归 `SSH rejection, reported signals and missing replies preserve actual outcomes without replay`。 |

## 逐 ID 接续清单

下表按 t19 的 SSH 裁决列出 81 个尚待实现的动作。各项实际 `exposable / defaultExposed` 均为 `false / false`。候选 scope/risk 来自当前描述符，计划 scope/risk 和意图来自对应的 t19 行。每行的拒绝均由上节设置双入口测试覆盖。授予后的行为、对象与意图测试待按各行补齐。

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
| `ssh.hosts.directory` | read / normal → read / normal | 无 | 脱敏主机及分组目录，优先读可移植定义。禁止查询时取密码/拨号。 [t19:502](../t19/report01.md#L502) |
| `ssh.hosts.organize` | write / normal → write / normal | 领域 | 原目录版本、分组与主机成员须匹配，不能挪动未授权条目。 [t19:503](../t19/report01.md#L503) |
| `ssh.hosts.list` | read / normal → read / normal | 无 | 脱敏主机及分组目录，优先读可移植定义。禁止查询时取密码/拨号。 [t19:504](../t19/report01.md#L504) |
| `ssh.hosts.configure` | admin / high → admin / high | 领域 | 自有认证，按主机/路由版本 keep/replace/clear。受控输入不回显、不留秘密回执。 [t19:505](../t19/report01.md#L505) |
| `ssh.hosts.copy` | admin / high → admin / high | 领域 | 新主机独立配置凭据，原 hostId/修订固定，一次生成新 ID。 [t19:506](../t19/report01.md#L506) |
| `ssh.hosts.remove` | admin / high → admin / high | 领域 | 核对引用/跳板依赖，删除限定到原主机及认证。 [t19:507](../t19/report01.md#L507) |
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

- Q6-3 决定见 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md:13`。`packages/contracts/src/capability.ts:41` 的 `ToolAccessChoicesSchema` 只描述能力名到布尔值，`packages/kernel/src/exposure.ts` 同样只保存这些选择。`packages/kernel/src/dispatcher.ts:345` 的当前授权及其 `:118` 回执读入口无法检查主机授权。开放旧绑定会让当前工具开关覆盖超出选择的目标，例如旧 `ssh.disconnect` 直接对全局 hostId 断线，旧 `ssh.hosts.list` 访问本机凭据状态，旧 `ssh.sftp.upload/download` 接受 Engine 本机路径。
- Lead 需给现有 Gateway 策略提供工作台可管理、默认无授权的稳定 SSH 主机 ID 集，以及按当前 Vault 获取实时授权的接线。SSH 根据可信 `ctx.subject`、主机/路由修订及原领域对象检查授权和归属。主机撤销应立即约束旧会话、资源、流和操作回读。涉及主机的持久回执可优先沿用领域回执以重新验权。计划复用已有公共资源模块及便携定义读取。
- 接线后从主机目录和列表起补脱敏投影，再补主机修订、连接和信任、监控、转发、文件来源、传输以及终端。仍需将现有 10 个公共入口接入 Q6-3 并逐项取得两入口矩阵，尤其是连接核验重启的未知结果和撤权后的流与回执。
- 测试使用隔离 Vault、临时配置和回环网络。本批未运行全量测试，未修改集成分支或推送。

## Lead 验收

Lead 验收（2026-11-22）：部分通过。候选 `d89c5e04`（ssh.settings.get/update）快进到 `impl/huhu-issues-3-10-g6-ssh` 并合入集成。阻碍成立：Q6-3 按主机授权缺共享层支持；Lead 授权 t2y 作为工具策略资源选择唯一写入者，续派 task02。
