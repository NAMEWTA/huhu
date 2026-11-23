# SSH 连接、信任与执行审计首批报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2y
- 执行终端 — t3w
- task — task04.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task04.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report04.md
- 执行结果 — done（首批 4 项，task04 尚余 71 项）
- 候选提交 — `bfdf2c70b3c71a926985624be523c37d1199611c`，父提交 `adb5ff2d8679d4f8368fdbf8118e3a25031b01b5`

## 结论

完成连接状态、已知主机、审计三项只读查询，以及一项对原 Exec 作业的受限取消。四项可分别授予，默认关闭。查询重新读取所选目标和完整跳板链，连接、审计和取消还核对原路由修订及可信主体。

## 产物与决定

- 工作目录为 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-ssh-actions`。任务定位和 topic 指定 `adb5ff2d`，任务产物段另列 `10ebb272`。候选采用实际集成 HEAD `adb5ff2d`，保留已集成的 task03 和此后变更。
- 用临时索引生成候选，分支指针仍在父提交。业务文件及测试已与候选逐项核对。工作树 `.agents` 只读，证据追加在候选的 `.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G-ssh-exposure-linux.md`。
- 连接查询复用核验和作业连接的状态投影。已知主机查询限于当前获准且完整的路由所对应的端点。三个读操作从便携定义获得授权所需数据，无凭据访问或拨号。
- 作业取消使用原作业的持久 ID 和状态机。外部调用提交 `jobId`、`hostId` 和 `routeRevision`，原会话所属的主体、活动作业及路由均须匹配。重复调用返回 `cancelled: false`。
- 审计查询读取本机 Vault runtime 中当月新增的外部核验与作业终态记录，按 Vault 实例、可信主体及原路由匹配。返回时间、主机 ID、动作和结果，`detail` 为空。审计采用尽力写入，写入失败时 SSH 操作仍可完成，该事件可能缺失。

## 验证

| 验收要求 | 检查与结果 | 证据 |
| --- | --- | --- |
| 默认关闭和即时撤权 | CLI 与 HTTP MCP 检查三项只读能力的默认关闭、逐项授予、发现、撤权与原调用拒绝。 | `%s reads current SSH connection, known host and audit metadata within the authorized route` |
| 主体、路由和可观察结果 | 同令牌另一个 MCP 逻辑会话看不到原待答与审计。目标缺跳板授权时无可见连接、指纹和审计，显式审计查询拒绝。修改跳板修订后旧连接和旧审计消失。只读查询前后回环连接数一致，凭据读取 spy 无调用。 | 同一矩阵 |
| 作业取消和审计 | CLI 旧外部 `execId` 输入被拒绝。HTTP MCP 检查跨主体、撤去主机授权、错误路由及原作业重复取消。原作业收到停止，另一作业保持待命。CLI 的作业摘要省略命令与输出，Engine 重启后仍可读取。 | `CLI owns a separate SSH job, reads split UTF-8 with byte cursors and retains a bounded tail`，`HTTP MCP isolates SSH owners under one token and never replays a job after reconnect or restart` |
| 单文件 Vitest | Node 24.21.0，`pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts --maxWorkers=1`，一文件 16 项通过。 | `/tmp/huhu-t3w-task04-vitest.log` |
| 候选完整性 | `git diff --cached --check` 通过，业务和测试文件的工作树与候选一致。 | 候选 `bfdf2c70` |

## 未运行的验证

- `tests/e2e/ssh/settings.spec.ts` 的 `SSH settings reflect the shared gateway policy and provide redacted client samples`。新增 HTTP MCP 状态工具发现、无会话空结果及撤权断言。
- `plugins/ssh/test/domain-exposure.engine.test.ts` 的可选能力期望已更新。其他关联 Vitest、全仓 typecheck、lint、format:check、knip、全量测试、构建、打包和 E2E 由 Lead 按分工验收。

## 逐 ID 验收与接续

`可选` 表示 `exposable: true`、`defaultExposed: false`。`关闭` 表示本候选仍为 `exposable: false`、`defaultExposed: false`。以下覆盖前案全部 75 个 ID。

| 能力 ID | 首批结果 | 校验或接续依据 |
| --- | --- | --- |
| `ssh.monitor.tools.read` | 关闭 | 现会在远端执行固定进程/容器查询。只读授权只能看已有采样。 [t19:465](../t19/report01.md#L465) |
| `ssh.monitor.session.open` | 关闭 | 按原 pane/连接代与订阅所有者创建或改变采样，重试不增采样器。 [t19:466](../t19/report01.md#L466) |
| `ssh.monitor.session.get` | 关闭 | 只读原订阅缓存样本，不主动连接/采样。 [t19:467](../t19/report01.md#L467) |
| `ssh.monitor.session.change` | 关闭 | 按原 pane/连接代与订阅所有者创建或改变采样，重试不增采样器。 [t19:468](../t19/report01.md#L468) |
| `ssh.monitor.panels.list` | 关闭 | 仅可见面板定义及主机顺序。 [t19:469](../t19/report01.md#L469) |
| `ssh.monitor.panels.save` | 关闭 | 校验可见 hostId 及面板修订。只存配置。 [t19:470](../t19/report01.md#L470) |
| `ssh.monitor.panels.delete` | 关闭 | 按面板 revision 删除并释放本面板的订阅。 [t19:471](../t19/report01.md#L471) |
| `ssh.monitor.panels.run` | 关闭 | 名为 run，绑定 handler 为 monitors.dashboard，仅取已有样本。 [t19:472](../t19/report01.md#L472) |
| `ssh.monitor.panels.change` | 关闭 | 针对原面板、主机、采样代，启动/暂停/停用/重试各只发生一次。 [t19:473](../t19/report01.md#L473) |
| `ssh.forwarding.rules.list` | 关闭 | 限授权主机、监听和出口摘要，不开启监听。 [t19:474](../t19/report01.md#L474) |
| `ssh.forwarding.rules.save` | 关闭 | 验监听范围、目标及规则版本。运行中改规则会释放旧监听。 [t19:475](../t19/report01.md#L475) |
| `ssh.forwarding.rules.delete` | 关闭 | 绑定规则、运行、版本，释放该规则的持有权。 [t19:476](../t19/report01.md#L476) |
| `ssh.forwarding.runs.list` | 关闭 | 只取已存在监听、连接归属与流量计数。 [t19:477](../t19/report01.md#L477) |
| `ssh.forwarding.runs.start` | 关闭 | 固定规则修订、出口及实际回环监听。恢复只用原规则，拒复用别人的通道。 [t19:478](../t19/report01.md#L478) |
| `ssh.forwarding.runs.resume` | 关闭 | 固定规则修订、出口及实际回环监听。恢复只用原规则，拒复用别人的通道。 [t19:479](../t19/report01.md#L479) |
| `ssh.forwarding.runs.stop` | 关闭 | 校验原运行及规则代次，只关闭当前调用者可控制的监听。 [t19:480](../t19/report01.md#L480) |
| `ssh.archives.support` | 关闭 | archives.ts:112 会探测原生 ZIP、尝试 SFTP。查询版改取缓存，不隐式启动探针。 [t19:481](../t19/report01.md#L481) |
| `ssh.archives.run` | 关闭 | 核对文件会话、来源设备、目录、归档大小和目标版本，覆盖/解压须确认。 [t19:482](../t19/report01.md#L482) |
| `ssh.transfers.start` | 关闭 | 固定获准的源/目标、文件快照、冲突策略和任务 ID，重交不复制两遍。 [t19:483](../t19/report01.md#L483) |
| `ssh.transfers.startBatch` | 关闭 | 固定获准的源/目标、文件快照、冲突策略和任务 ID，重交不复制两遍。 [t19:484](../t19/report01.md#L484) |
| `ssh.transfers.list` | 关闭 | 过滤本人有权观察的队列，零连接/调度。 [t19:485](../t19/report01.md#L485) |
| `ssh.transfers.decide` | 关闭 | 绑定原冲突的两端快照与版本，迟到的覆盖/跳过决定作废。 [t19:486](../t19/report01.md#L486) |
| `ssh.transfers.cancel` | 关闭 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 [t19:487](../t19/report01.md#L487) |
| `ssh.transfers.pause` | 关闭 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 [t19:488](../t19/report01.md#L488) |
| `ssh.transfers.resume` | 关闭 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 [t19:489](../t19/report01.md#L489) |
| `ssh.transfers.retry` | 关闭 | 原端点与快照。recheck 可能恢复旧文件/清理暂存，不属于 read。 [t19:490](../t19/report01.md#L490) |
| `ssh.transfers.recheck` | 关闭 | 原端点与快照。recheck 可能恢复旧文件/清理暂存，不属于 read。 [t19:491](../t19/report01.md#L491) |
| `ssh.transfers.origin` | 关闭 | openOrigin 会恢复或分离文件会话绑定，校验原 transferId 及源设备。 [t19:492](../t19/report01.md#L492) |
| `ssh.transfers.clearHistory` | 关闭 | 只清调用者有权清理的已结束记录，保留在途任务。 [t19:493](../t19/report01.md#L493) |
| `ssh.workspace.runs.list` | 关闭 | 限本人可观察的原工作区实例与 pane。 [t19:494](../t19/report01.md#L494) |
| `ssh.workspace.runs.start` | 关闭 | 绑定模板/主机及路由修订，每个目标 pane 对账。禁止重连到替代主机。 [t19:495](../t19/report01.md#L495) |
| `ssh.workspace.runs.reconnect` | 关闭 | 绑定模板/主机及路由修订，每个目标 pane 对账。禁止重连到替代主机。 [t19:496](../t19/report01.md#L496) |
| `ssh.workspace.runs.close` | 关闭 | 绑定原 run/连接代，释放其持有的 pane 与会话。 [t19:497](../t19/report01.md#L497) |
| `ssh.workspace.runs.saveTemplate` | 关闭 | 仅由获准原运行生成新模板，重交只生成一个 ID。 [t19:498](../t19/report01.md#L498) |
| `ssh.workspace.templates.list` | 关闭 | 取可见定义和引用，不因展示模板启动连接。 [t19:499](../t19/report01.md#L499) |
| `ssh.workspace.templates.save` | 关闭 | 核对模板、hostId 与 expectedRevision。 [t19:500](../t19/report01.md#L500) |
| `ssh.workspace.templates.delete` | 关闭 | 核对模板版本与删除确认，单独处理已运行实例。 [t19:501](../t19/report01.md#L501) |
| `ssh.connect` | 关闭 | 旧入口使用工作台共享的连接对象，外部连接生命周期仍缺独立授权合同。 |
| `ssh.connections.status` | 可选，read / normal | 核对主体、完整获准路由、原修订和记录有效期。CLI 和 HTTP MCP 矩阵通过。 |
| `ssh.disconnect` | 关闭 | 旧全局 hostId 断线会影响其他会话或通道。受限合同需识别原连接和持有人。 |
| `ssh.hostKey.decide` | 关闭 | 旧入口可写工作台信任库。外部核验目前通过既有 `ssh.resources.trust.decide` 处理一次性待答。 |
| `ssh.knownHosts.list` | 可选，read / high | 按获准路由的地址与端口过滤密钥类型和指纹。CLI 和 HTTP MCP 矩阵通过。 |
| `ssh.knownHosts.forget` | 关闭 | 持久信任键以端点为范围，与主机 ID 授权粒度不同，仍需独立的信任管理授权。 |
| `ssh.exec.run` | 关闭 | 旧入口按全局 hostId 执行任意命令，未开放为外部工具。 |
| `ssh.exec.cancel` | 可选，execute / high | 仅对原主体、作业和完整获准路由请求一次停止。CLI 和 HTTP MCP 作业用例通过。 |
| `ssh.audit.list` | 可选，read / high | 按本机 Vault 实例、原主体和当前路由过滤已完成摘要。CLI 和 HTTP MCP 矩阵及 CLI 重启读回通过。 |
| `ssh.fileSessions.open` | 关闭 | 新文件会话绑定既有受权连接，稳定意图返回原 fileSessionId。 [t19:517](../t19/report01.md#L517) |
| `ssh.fileSessions.list` | 关闭 | 仅本人或获委托会话摘要。 [t19:518](../t19/report01.md#L518) |
| `ssh.fileSessions.close` | 关闭 | 释放原文件会话及其持有权，不伤共享 SSH 连接。 [t19:519](../t19/report01.md#L519) |
| `ssh.fileSessions.localList` | 关闭 | 可选 root 会写 binding.localRoot。拆成显式授权绑定与只读列目录。CLI 本地文件由 CLI 选择，Engine 根只取有范围的句柄。 [t19:520](../t19/report01.md#L520) |
| `ssh.fileSessions.search` | 关闭 | 会分配可取消的递归搜索，限制源会话、根、深度、数量和期限。 [t19:521](../t19/report01.md#L521) |
| `ssh.fileSessions.cancelSearch` | 关闭 | 仅原搜索代次，禁止旧取消影响新搜索。 [t19:522](../t19/report01.md#L522) |
| `ssh.fileSessions.directory` | 关闭 | 仅读原 Shell 所报告的目录与提示符修订。 [t19:523](../t19/report01.md#L523) |
| `ssh.fileSessions.prepareDirectory` | 关闭 | 当前创建 navigation/follow，绑定会话、路径、提示符修订及短时效。 [t19:524](../t19/report01.md#L524) |
| `ssh.fileSessions.commitDirectory` | 关闭 | 核对一次性 follow、输入持有权及原空闲提示符，禁止过期补发。 [t19:525](../t19/report01.md#L525) |
| `ssh.fileSessions.document.open` | 关闭 | 只读绑定的远端文件，返回编码、权限、版本，禁止隐式连接。 [t19:526](../t19/report01.md#L526) |
| `ssh.fileSessions.document.save` | 关闭 | 核对 fileSessionId、路径、expectedVersion 及原权限，安全暂存与发布。 [t19:527](../t19/report01.md#L527) |
| `ssh.fileSessions.properties` | 关闭 | 只读原端点的元数据及版本。 [t19:528](../t19/report01.md#L528) |
| `ssh.fileSessions.changeProperties` | 关闭 | 核对原文件 revision、路径与授权字段，不得提高到未经批准的特权。 [t19:529](../t19/report01.md#L529) |
| `ssh.fileSessions.createEntry` | 关闭 | 在获准父目录创建文件/目录，校验名称与不存在前置条件。 [t19:530](../t19/report01.md#L530) |
| `ssh.fileSessions.moveEntry` | 关闭 | 核对原路径、版本、目标父目录/冲突，禁止跨会话混用。 [t19:531](../t19/report01.md#L531) |
| `ssh.sftp.list` | 关闭 | 对已有受权连接只列远端目录，不拨号或执行命令。 [t19:532](../t19/report01.md#L532) |
| `ssh.sftp.read` | 关闭 | 对已有连接有界读取获准文件，无命令、无隐式重连。 [t19:533](../t19/report01.md#L533) |
| `ssh.sftp.write` | 关闭 | 绑定远端路径、版本、覆盖确认与内容摘要。 [t19:534](../t19/report01.md#L534) |
| `ssh.sftp.upload` | 关闭 | 旧合同含 Engine localPath，缺少受限的来源设备与传输对象绑定。 |
| `ssh.sftp.download` | 关闭 | 旧合同含 Engine localPath，缺少受限的来源设备与传输对象绑定。 |
| `ssh.sftp.cancel` | 关闭 | 只取消主体的具体传输，不得按公共主机停止他人操作。 [t19:537](../t19/report01.md#L537) |
| `ssh.sftp.mkdir` | 关闭 | 限原连接的获准父目录，确认名称及冲突。 [t19:538](../t19/report01.md#L538) |
| `ssh.sftp.rename` | 关闭 | 核对远端路径、原对象版本、覆盖/递归删除意图。 [t19:539](../t19/report01.md#L539) |
| `ssh.sftp.delete` | 关闭 | 核对远端路径、原对象版本、覆盖/递归删除意图。 [t19:540](../t19/report01.md#L540) |
| `ssh.shells.open` | 关闭 | 建立原主机/路由的 PTY，固定意图与 shellId。后续流持续验权。 [t19:541](../t19/report01.md#L541) |
| `ssh.shells.list` | 关闭 | 只列可观察 shell 元数据，不 attach、不启动。 [t19:542](../t19/report01.md#L542) |
| `ssh.shells.close` | 关闭 | 限制原 shellId、所有者与连接代，重复关闭不碰新终端。 [t19:543](../t19/report01.md#L543) |
| `ssh.hosts.import.preview` | 关闭 | 仅解析有界输入字节及当前目录，列冲突，预览令牌绑定主体和源摘要。 [t19:549](../t19/report01.md#L549) |
| `ssh.hosts.import.confirm` | 关闭 | 校验确认 token、目录 revision、选中行及冲突。复用确定性 hostId 防止部分成功后多建。 [t19:550](../t19/report01.md#L550) |

## 阻碍与接续

剩余 71 项见逐 ID 表。监控和工作区等读取仍需各自的对象绑定及副作用证据。外部任意命令执行、代理转发及无界文件操作仍关闭。

## Lead 验收


## 续批 2 · 监控配置与缓存

- 候选 `f297cfab397248570855d7bb7e3db653d25b0137`，父 `bfdf2c70`。
- 定向 `public-resources.engine.test.ts` 18 项通过，日志 `/tmp/huhu-t3w-task04-monitor-vitest.log`。本批无新增 E2E spec。能力目录预期已更新，待 Lead 验证。

| 能力 ID | 状态 | 证据或原因 |
| --- | --- | --- |
| `ssh.monitor.panels.list` | 可选，read / normal | 验证每个面板所含的完整授权路由。 |
| `ssh.monitor.panels.run` | 可选，read / normal | 采样自既有工作台连接。校验面板修订与原采样连接路由，读取过程不会拨号、续租或重采。 |
| `ssh.monitor.tools.read` | 关闭 | 当前实现会执行进程或容器枚举，并使用工作台分栏。 |
| `ssh.monitor.session.open` | 关闭 | 独立外部采样订阅和分栏归属未建立。 |
| `ssh.monitor.session.get` | 关闭 | 当前分栏查询会续租，已有分栏订阅没有当前外部主体的委托。 |
| `ssh.monitor.session.change` | 关闭 | 分栏订阅的主体、代次和租约控制仍由工作台维护。 |
| `ssh.monitor.panels.save` | 关闭 | 已有保存同时清理工作台运行，需要限定面板写入与采样运行控制。 |
| `ssh.monitor.panels.delete` | 关闭 | 已有删除同时释放工作台订阅，需要限定原面板与订阅所有权。 |
| `ssh.monitor.panels.change` | 关闭 | 已有处理器可主动启动或重试 SSH 及远端采样。 |

累计可选 6 项，本任务剩余 69 项保持关闭。

## 续批 3 · 转发规则与运行摘要

- 候选 `587c64f06b225c36adfd2b2a767c24d2575de760`，父 `f297cfab`。
- 定向 `public-resources.engine.test.ts` 20 项通过，日志 `/tmp/huhu-t3w-task04-forward-vitest.log`。本批无新增 E2E spec。能力目录预期待 Lead 验证。

| 能力 ID | 状态 | 证据或原因 |
| --- | --- | --- |
| `ssh.forwarding.rules.list` | 可选，read / normal | 核对规则绑定的端点和完整授权路由。只读取已保存的监听及出口配置。 |
| `ssh.forwarding.runs.list` | 可选，read / normal | 额外核对原规则修订和实际连接的路由修订。返回现有监听、连接类型和计数。 |
| `ssh.forwarding.rules.save` | 关闭 | 当前保存可变更代理出口并停止其他会话的运行。 |
| `ssh.forwarding.rules.delete` | 关闭 | 删除可能释放他人持有的监听，现有运行无外部委托。 |
| `ssh.forwarding.runs.start` | 关闭 | 启动网络代理或端口转发仍由工作台操作。 |
| `ssh.forwarding.runs.resume` | 关闭 | 恢复网络代理或端口转发仍由工作台操作。 |
| `ssh.forwarding.runs.stop` | 关闭 | 未建立对原监听及持有权的外部委托。 |

累计可选 8 项，本任务剩余 67 项保持关闭。

## 续批 4 · 工作区模板

- 候选 `c2e718b74ba8396c6bb6cd3abb78ed0f46b10ce5`，父 `587c64f0`。
- 定向 `public-resources.engine.test.ts` 22 项通过，日志 `/tmp/huhu-t3w-task04-workspace-vitest.log`。本批无新增 E2E spec。能力目录预期待 Lead 验证。

| 能力 ID | 状态 | 证据或原因 |
| --- | --- | --- |
| `ssh.workspace.templates.list` | 可选，read / normal | 核对当前授权及原目标绑定，仅返回模板和布局，省略登录命令。 |
| `ssh.workspace.templates.save` | 可选，write / normal | 核对新旧主机完整路由、原模板版本及调用者意图，保留已有主机的登录命令。 |
| `ssh.workspace.templates.delete` | 可选，write / high | 核对原模板、完整路由及操作意图。重试回执会重新核对路由。 |
| `ssh.workspace.runs.list` | 关闭 | 旧运行及分栏来自工作台，未绑定外部主体或委托。 |
| `ssh.workspace.runs.start` | 关闭 | 工作台可拨号并启动分栏登录命令。 |
| `ssh.workspace.runs.reconnect` | 关闭 | 工作台可重连并恢复远端分栏。 |
| `ssh.workspace.runs.close` | 关闭 | 运行及其终端使用权仍归工作台。 |
| `ssh.workspace.runs.saveTemplate` | 关闭 | 尚无可供外部主体读取的已委托运行。 |

累计可选 11 项，本任务剩余 64 项保持关闭。

## 续批 5 · 一次性连接核验

- 候选 `b536440630b9fc92f66f0bb0abe7542bdf12382d`，父 `c2e718b7`。
- 定向 `public-resources.engine.test.ts` 24 项通过，日志 `/tmp/huhu-t3w-task04-connect-vitest.log`。E2E 待 Lead 运行 `tests/e2e/ssh/settings.spec.ts` 的 `SSH settings reflect the shared gateway policy and provide redacted client samples`。该用例使用 `ssh.exec.run` 验证闭合能力无法选用。

| 能力 ID | 状态 | 证据或原因 |
| --- | --- | --- |
| `ssh.connect` | 可选，execute / high | 外部变体仅做短期核验。按当前路由及原意图取得一个尝试 ID，认证完成后释放连接。 |
| `ssh.disconnect` | 可选，execute / high | 必须提供本主体原核验尝试与原路由。可以重复撤销同一次核验。旧全局 hostId 断线仍为工作台专用。 |
| `ssh.hostKey.decide` | 可选，execute / high | 本主体短期核验的原跳点、原指纹及原待答修订。待答只消费一次，信任不写入库。 |
| `ssh.knownHosts.forget` | 关闭 | 持久信任按端点共享，外部主机授权未涵盖该信任管理范围。 |
| `ssh.exec.run` | 关闭 | 旧工作台处理器可按全局 hostId 下发任意命令。 |

累计可选 14 项，本任务剩余 61 项保持关闭。

## 续批 6 · 闲置监控面板配置

- 候选 `cfd9600aefd7bbe6f0674e8fad67c8b47cfd5a78`，父 `b5364406`。
- 定向 `public-resources.engine.test.ts` 24 项通过，日志 `/tmp/huhu-t3w-task04-monitor-write-vitest.log`。本批无新增 E2E spec。

| 能力 ID | 状态 | 证据 |
| --- | --- | --- |
| `ssh.monitor.panels.save` | 可选，write / normal | 校验原面板版本、新旧主机的完整路由及主体意图。只创建或修改闲置配置。 |
| `ssh.monitor.panels.delete` | 可选，write / high | 校验原面板和完整路由。允许重取删除回执。活跃和暂停的面板保留原工作台控制权。 |

累计可选 16 项，本任务剩余 59 项保持关闭。

## 续批 7 · 离线导入预览

- 候选 `8a3c5060e8518c33bc2db9c79b698fcb7cc736c9`，父 `cfd9600a`。
- 定向 `public-resources.engine.test.ts` 26 项通过，日志 `/tmp/huhu-t3w-task04-import-vitest.log`。本批无新增 E2E spec。

| 能力 ID | 状态 | 证据或原因 |
| --- | --- | --- |
| `ssh.hosts.import.preview` | 可选，read / normal | 解析受限内联内容，对比完整授权路由及便携定义，令牌绑定源、主体及路由修订。 |
| `ssh.hosts.import.confirm` | 关闭 | 旧确认会创建尚未获授权的新主机及全库分组，属于工作台首次导入。 |

累计可选 17 项，本任务剩余 58 项保持关闭。

## 续批 8 · 闲置转发规则配置

- 候选 `a308b39371a8e8eb8833f0ae8b67e1f6af958188`，父 `8a3c5060`。
- 定向 `public-resources.engine.test.ts` 26 项通过，日志 `/tmp/huhu-t3w-task04-forward-write-vitest.log`。本批无新增 E2E spec。

| 能力 ID | 状态 | 证据 |
| --- | --- | --- |
| `ssh.forwarding.rules.save` | 可选，write / normal | 只修改原闲置规则的显示名称。核对原规则及完整路由修订，拒绝新规则、出口变更及活跃规则。 |
| `ssh.forwarding.rules.delete` | 可选，write / high | 只删除原闲置规则。核对原规则及完整路由修订，按原意图重取结果。 |

## Task04 终稿

候选链从集成提交 `adb5ff2d` 起，依次为 `bfdf2c70`、`f297cfab`、`587c64f0`、`c2e718b7`、`b5364406`、`cfd9600a`、`8a3c5060`、`a308b393`。最终以工作树内容核对链尾，业务及测试文件一致。证据逐批追加到了候选中的 `G-ssh-exposure-linux.md`。初稿的状态已由上述批次更新取代。

原 75 项中，19 项可逐一授予且默认关闭，包括 Lead 指示接续后完成的 15 项。其余 56 项本候选继续关闭。其现有合同分别涉及外部任意命令、网络代理、文件与传输，或缺少对原工作台对象及其持有者的委托。以下是各闭合项的现状和原因。

| 能力 ID | 最终状态 | 当前关闭原因 |
| --- | --- | --- |
| `ssh.monitor.tools.read` | 关闭 | 原操作会主动执行远端进程和容器枚举。 |
| `ssh.monitor.session.open` | 关闭 | 原分栏、连接代和采样订阅仍由工作台持有。 |
| `ssh.monitor.session.get` | 关闭 | 原查询会续租工作台分栏订阅，且订阅未委托给外部主体。 |
| `ssh.monitor.session.change` | 关闭 | 原分栏、连接代和采样订阅仍由工作台持有。 |
| `ssh.monitor.panels.change` | 关闭 | 原操作可启动或重试拨号，并控制工作台持有的采样。 |
| `ssh.forwarding.runs.start` | 关闭 | 原操作会启动或恢复网络代理或端口转发。 |
| `ssh.forwarding.runs.resume` | 关闭 | 原操作会启动或恢复网络代理或端口转发。 |
| `ssh.forwarding.runs.stop` | 关闭 | 原监听没有对外部主体的控制委托。 |
| `ssh.archives.support` | 关闭 | 原查询可启动探针、远端命令或 SFTP。 |
| `ssh.archives.run` | 关闭 | 原来源与目标未委托给外部主体，归档操作可读写设备文件。 |
| `ssh.transfers.start` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.startBatch` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.list` | 关闭 | 当前读取会更新工作台全局队列状态，作业和设备端点未委托给外部主体。 |
| `ssh.transfers.decide` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.cancel` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.pause` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.resume` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.retry` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.recheck` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.origin` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.transfers.clearHistory` | 关闭 | 原作业或冲突快照及设备端点属于工作台队列，缺少外部主体绑定。 |
| `ssh.workspace.runs.list` | 关闭 | 原工作区运行、分栏和连接代未委托给外部主体。 |
| `ssh.workspace.runs.start` | 关闭 | 原操作会拨号并运行或恢复工作台分栏，可能下发登录命令。 |
| `ssh.workspace.runs.reconnect` | 关闭 | 原操作会拨号并运行或恢复工作台分栏，可能下发登录命令。 |
| `ssh.workspace.runs.close` | 关闭 | 原工作区运行、分栏和连接代未委托给外部主体。 |
| `ssh.workspace.runs.saveTemplate` | 关闭 | 原工作区运行、分栏和连接代未委托给外部主体。 |
| `ssh.knownHosts.forget` | 关闭 | 持久信任记录跨同端点的配置共享，缺少独立外部信任管理授权。 |
| `ssh.exec.run` | 关闭 | 旧入口能按全局 hostId 运行任意命令。 |
| `ssh.fileSessions.open` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.list` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.close` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.localList` | 关闭 | 旧入口可绑定或列举 Engine 本机路径，缺少设备范围授权。 |
| `ssh.fileSessions.search` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.cancelSearch` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.directory` | 关闭 | 工作台原分栏、提示符修订、会话及输入持有权未委托。 |
| `ssh.fileSessions.prepareDirectory` | 关闭 | 工作台原分栏、提示符修订、会话及输入持有权未委托。 |
| `ssh.fileSessions.commitDirectory` | 关闭 | 工作台原分栏、提示符修订、会话及输入持有权未委托。 |
| `ssh.fileSessions.document.open` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.document.save` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.properties` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.changeProperties` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.createEntry` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.fileSessions.moveEntry` | 关闭 | 原文件会话、来源连接代和相关路径未委托给外部主体。 |
| `ssh.sftp.list` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.sftp.read` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.sftp.write` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.sftp.upload` | 关闭 | 旧合同接受 Engine localPath，缺少受限设备与端点绑定。 |
| `ssh.sftp.download` | 关闭 | 旧合同接受 Engine localPath，缺少受限设备与端点绑定。 |
| `ssh.sftp.cancel` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.sftp.mkdir` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.sftp.rename` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.sftp.delete` | 关闭 | 旧入口可按 hostId 操作，或直接使用工作台文件会话，缺少外部主体、连接代和路径绑定。 |
| `ssh.shells.open` | 关闭 | 原操作会打开可向远端发送任意输入的 PTY。 |
| `ssh.shells.list` | 关闭 | 原终端及连接代由工作台持有，缺少外部主体委托。 |
| `ssh.shells.close` | 关闭 | 原终端及连接代由工作台持有，缺少外部主体委托。 |
| `ssh.hosts.import.confirm` | 关闭 | 原操作创建尚未获授权的主机及全库分组，由工作台完成首次导入。 |

### 验证状态

- 最终候选 `a308b393` 的 `plugins/ssh/test/public-resources.engine.test.ts` 26 项通过。命令 `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts --maxWorkers=1`，日志 `/tmp/huhu-t3w-task04-forward-write-vitest.log`。由 CLI 和 HTTP MCP 实际访问隔离 Vault，网络证据均使用回环夹具。
- 未运行 `plugins/ssh/test/domain-exposure.engine.test.ts` 的目录期望用例、其它相关 Vitest、E2E、构建、打包和全仓检查。
- E2E 修改见 `tests/e2e/ssh/settings.spec.ts` 的 `SSH settings reflect the shared gateway policy and provide redacted client samples`。
- 审计摘要是本机当月记录，采用尽力写入。离线导入预览令牌绑定进程、主体、输入和授权路由，由新预览更新。

Lead 验收（2026-11-22）：19 项开放部分通过，56 项关闭不接受。链尾 `a308b393` 合入集成 `9ccd6d28`；Lead 修正 `a54d8ef4`（`ResourceHost` 作为类型使用，缺类型导出，ssh/engine tsc 失败）与 `00d644d3`（host-auth 用例在 idempotency 日志缺失时 ENOENT，改为文件不存在也视为未写入）。Lead 补跑：ssh+catalog+tool-access 16 文件 107/107；`pnpm build`；ssh settings E2E 3/3。56 项关闭理由不符合 #6 原文（“SSH 永远不可开放”须取消，高危不能成为永久拒绝理由；连接、命令、交互终端、SFTP、待处理交互都要有工具合同），改由 task05 以“外部主体自有对象”模型开放。
