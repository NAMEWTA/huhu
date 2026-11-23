# Q6-3 资源授权与 SSH 首批执行报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2y
- 恢复后终端 — t3q
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task02.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report02.md
- 执行结果 — done
- 候选提交 — 10ebb272cc63d682db8242b2544f24ff74c0d6f8，父提交 `d89c5e04bc388d8800df3a0cd26d9d482ec421c7`

## 结论

Q6-3 的共享策略、桌面和受邀浏览器工作台已实现。未选择主机时，即使工具已开启，SSH 主机操作也失败关闭。选择 A 后只返回 A 的资源，撤销后原逻辑会话不能读 A 的待答、作业状态和输出。新增 `ssh.hosts.directory` 与 `ssh.hosts.list` 可选开放，原 10 个公共 SSH 资源与作业动作完成接线和 CLI / HTTP MCP 矩阵。工作树还有 79 个 t19 拟开放动作，交下一批按表接续。

## 产物与改动

- `ToolAccessFileSchema` 在 formatVersion 1 中新增可选 `resources["ssh.hosts"]`。`ExposureStore.setMany` 共用策略修订和文件 CAS。工作台通过 `gateway.get`、`gateway.policy.preview`、`gateway.policy.update` 操作。只有新加入的主机 ID 需要仍然存在，已删除的旧选择可以撤销。外部策略只读结果过滤主机 ID。
- `CapabilityContext.toolResourceIds` 提供实时只读授权。SSH 按原主体和原路由复权。目标与跳板均属于资源授权范围，作业回执绑定受理时的完整主机 ID 集。含资源守卫的工具由领域对账。扩展命令的通用步骤目前不代理这类工具，避免提前返回未经资源复权的步骤结果。
- `packages/workbench/src/gateway/SshHostGrants.tsx` 复用原生勾选及网关保存样式。桌面由原 preload 端点建立 Engine 客户端，Web 沿用邀请会话的同源 cookie。Web 新增的是主机选择编辑；通用工具批量修改仍由桌面入口处理。
- `apps/engine/src/boot.ts` 仅转发资源字段到现有策略写入，并为 Gateway 提供校验已保存主机的 SSH 回调。Boot 原有 `registry.declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors))` 已覆盖本批 12 个 ID，`ssh.apply` 现有入口继续绑定。
- `apps/cli/test/headless-engine.test.ts` 和 `tests/e2e/ssh/settings.spec.ts` 按新合同为合成主机授予资源范围。业务与测试文件和候选匹配。两份证据已写入候选树，当前 worktree 的 `.agents` 只读，应从候选读取 `G-ssh-exposure-linux.md` 和 `G-resource-grants-linux.md`。

## 验证

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 同一授权策略 | 旧格式加载为空资源集，非法主机拒绝，桌面原子提交工具及资源，两份并发预览只接受一份，修订递增，外部读写资源策略被过滤或拒绝。 | `the legacy policy defaults to no SSH access and resource changes share an atomic policy revision` |
| CLI / HTTP MCP 双入口 | 12 个主机相关工具均跑默认关、单项开和原调用撤权。开启工具但资源为空时拒绝，只授予 A 时不枚举 B。目录修订、SSH 新连接、凭据和 Herdr Core 计数验证读取无业务写入或启动副作用。 | `%s selects and revokes SSH hosts across all public entry points` |
| 撤销、原主体及 C05 | 同令牌双会话隔离。原信任提示精确匹配且只消费一次。连接核验及作业入队同键并发与丢应答只产生一次效果。撤权后原输出游标和作业回读被拒。恢复 MCP 会话读到原作业终态，未知核验不重拨。 | `plugins/ssh/test/public-resources.engine.test.ts` |
| 单文件 Vitest | 恢复后仅执行 `plugins/ssh/test/public-resources.engine.test.ts`，12 项通过。 | `/tmp/huhu-t3q-task02-vitest.log` |

环境使用 Node 24.21.0、pnpm 12.10.1、临时 Vault 与 XDG 运行目录，所有 SSH 目标均为回环夹具。

## 未运行的验证

按恢复后的实施者职责边界，下列验证交 Lead 串行执行。恢复前的全仓类型检查复跑被第四次 oomd 中断，重型验证的旧记录不计入本次交付判定。

- Playwright/Electron。文件 `tests/e2e/ssh/settings.spec.ts`，用例 `SSH settings reflect the shared gateway policy and provide redacted client samples` 及 `SSH host grants are editable from desktop and invited browser workbenches`。Linux Xvfb 环境检查继承的 Wayland 变量。原设置用例需要隔离已解锁的 Secret Service，细节见项目的 headless SSH 凭据证据。
- CLI 自启动补验。文件 `apps/cli/test/headless-engine.test.ts`，用例 `CLI 自启动复用桌面 SSH 密码并完成静默 Exec（锁定 Safe：%s）`，分别覆盖 `false` 和 `true`。
- 其余定向文件、全量测试、全仓 typecheck、lint、format:check、knip、桌面 build、打包和截图。

## 本批 SSH 逐项

两组设置能力继续按 task01 验证。本表各项均为 `exposable: true`、`defaultExposed: false`。每项应用 `%s selects and revokes SSH hosts across all public entry points` 的 CLI 和 HTTP MCP 两个测试。

| 能力 ID | scope / risk | 意图 | 领域校验 |
| --- | --- | --- | --- |
| `ssh.hosts.directory` | read / normal | 无 | 当前 Vault 已授权且已保存主机，目录分组祖先，搜索与分组作用域。 |
| `ssh.hosts.list` | read / normal | 无 | 便携主机记录的最小投影，过滤未获准 ID 和凭据状态。 |
| `ssh.resources.host.get` | read / normal | 无 | 授权目标和各跳，读可移植定义、路由修订和脱敏摘要。 |
| `ssh.resources.connection.start` | execute / high | 领域 intentKey | Vault、逻辑主体、已授权目标与跳板，原路由及尝试。重启后未知保持不重拨。 |
| `ssh.resources.connection.get` | read / normal | 无 | 逻辑主体、原 hostId/attemptId、原受理主机选择及有效期。 |
| `ssh.resources.connection.list` | read / normal | 无 | 归属当前主体且仍授权和未过期的尝试。 |
| `ssh.resources.trust.decide` | execute / high | 原待答单次消费 | 验 owner、原尝试、路由修订、hop、主机、类型、指纹和提示版本。仅本次信任。 |
| `ssh.jobs.prepare` | execute / high | 领域 intentKey | Vault、主体、原路由和当前授予的各主机。持久记录无命令内容。 |
| `ssh.jobs.start` | execute / high | 原 jobId 和 sessionId | 原作业连接绑定、一致的路由修订、同主体、单次派发。 |
| `ssh.jobs.get` | read / normal | 无 | 原主体和授权主机复权，活动状态与持久回执查同一 jobId。 |
| `ssh.jobs.output.read` | read / normal | 无 | 原作业、当前主机授权、stdout/stderr 字节游标及其保留范围。 |
| `ssh.jobs.cancel` | execute / high | 原 jobId 和停止状态 | 原作业、主体和当前主机授权，终态重复取消不产生副作用。 |

## 逐 ID 接续清单

下列 79 个动作在此候选均为 `exposable: false`、`defaultExposed: false`。默认拒绝与批量开启预览排除的验收用例在 `plugins/ssh/test/domain-exposure.engine.test.ts`，交 Lead 与其余定向文件一并执行。计划风险、对象校验和各行的领域测试来自 t19。

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
| `ssh.hosts.organize` | write / normal → write / normal | 领域 | 原目录版本、分组与主机成员须匹配，不能挪动未授权条目。 [t19:503](../t19/report01.md#L503) |
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

- 本轮范围收束在共享层、双端 UI、主机目录与列表及现有 10 个公共入口。接续从主机修订、配置管理和原对象意图开始。连接、监控、转发、文件、传输和终端逐项需要复用实时主机授权及各自的领域控制。旧 SFTP 本机路径及全局 hostId 断线路径仍在关闭范围内。
- 旧版核验调用未传领域 `intentKey` 时保留活动尝试归并。可持久核验的客户端须传稳定字段。旧版本已中断且缺失主机绑定的 Exec 接受回执无法安全确定对象，读取失败关闭。已受理命令沿领域生命周期收尾，撤权立即约束可见状态、输出分页和后续控制。
- 当前工作树分支仍指向任务父提交。此候选以临时索引生成，沿用恢复前候选的业务与测试文件。

## Lead 验收

Lead 验收（2026-11-22）：通过。候选 `10ebb272` 快进到 `impl/huhu-issues-3-10-g6-ssh`，合入集成 `e0cfa33c`。Lead 补跑：受影响包 typecheck、oxlint、oxfmt 通过；隔离钥匙串下 ssh/kernel dispatcher+exposure+mcp-recovery/tool-access/cli headless+cli 20 文件 236/236；`pnpm build` 后 `tests/e2e/ssh/settings.spec.ts` 2 过 1 跳过（xvfb、隔离 Secret Service）。
