# Issue #6 用户动作开放清单

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t19`，两次恢复后的实际终端依次为 `t1d`、`t1j`。Lead 的地址变更记录见 `topic.md` 末条，manifest 指针为 `t19 / task01.md / active`。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t19/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t19/report01.md`
- 源码 — `/home/wta/projects/huhu/temp/issue-snapshots/5021f54c`，下文业务路径均相对该根。执行结果 — done（静态盘点）。

## 结论

任务给定命令命中 35 个文件中的 140 行。沿公共对象展开、计入运行时构造的 ID、排除显式覆盖为 true 的项后，共有 **302 个唯一能力 ID**。例如 SSH 的公共对象涉及 81 个关闭项，另有 10 个显式开放候选；导入的两个描述符另计。Mail AI 的一个公共标记对应五项，须分别裁决。单改公共布尔值会同时改变不同信任边界，单改运行时 handler 又会遗漏停用插件的目录。

这是 `5021f54c` 的逐 ID 实施建议。行号、代码路径和当前限制是快照事实，建议的风险、授权接口、意图、附加校验及测试均为待实施合同。盘点接续 t7 的 G5a、G5b.3、G3.4、G8.1 与 t11 的 P1、P2。本次仅执行静态核对，CLI、MCP、真实 Agent、SSH、邮件、桌面及 Web 的运行结果留给后续切片验收。

## 读表与实施边界

每个文件下的“定义／标记”是同文件的两个行号，前者标识能力名，后者标识原始 `exposable: false`。文件标题给出完整路径。分组标题即写入归属（Kernel/扩展/Lead 三组的描述符 owner 均为 kernel）。**开**表示改为用户可选开放，首次及新增项默认关。**闭**后注明理由。行中“目录”表示 handler 无本项的固定工作台身份判定，仍须 Dispatcher 复权及行中对象校验。“字段”表示有 `desktopOnly` 元数据，须一起核对工作台/Web 语义；它在当前 Dispatcher 外部授权分支不能替代工具策略。“工作台”“桌面”“域”分别指实际 handler 的工作台限定、桌面限定或领域守卫；保留可信内部来源检查。

“持久”要求同一业务意图能跨并发、丢应答及重启核对，只保存安全可回放结果。“领域”同样要求防重复，但以所属模块的操作 ID、版本、已消费确认或作业记录对账，只保存必要摘要与结果引用；未知结果不自动重放。“无”表示真正只读或不提供外部调用。版本防并发与意图防重分别实现，单凭 expectedVersion 不能向丢应答者证明第一次的结果。每一行均适用后述双入口测试。只读行的 scope 指满足零业务副作用后的合同，涉及现有命令、联网或隐式写入的修整写在对应行内。

规格路径以 `.agents/dev/changes/2026-11-19-issue-<编号>-<名称>/` 为根。所有“开”共同依据 #6 `spec.md`「目录、身份与调用」「同一批选择怎样生效」，#6 `source.md` §12 A01–A07、B01–B05、C04–C06、F01，以及 `design.md`「组件与依赖方向」「存储、协议与故障窗口」。各组标题下列出进一步适用于该组每一行的规格段落。来源 §4.3 中较早的首次默认建议以已定 Q6-1 全关为准。

## Lead

独占 `apps/engine/src/boot.ts`，依据 #6 spec「各业务归属与端到端样例」Widget 行、#10 spec「一期内容与所有者」、A07。

### `apps/engine/src/boot.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `home.notes.recent` | 305／308 | read / high | 开 | 目录 | 无 | 委托 notes.list/read 时传原 caller、subject、signal；任一来源撤权即停止返回相应片段。 |

## Kernel

只写本组标题列出的 kernel/capabilities 文件与对应单测。各行适用 #6 spec「各业务归属与端到端样例」Kernel 行、source §12 A01、A03、A04、A07、G5a.6。home 各项另依据 #10 spec「用户验收」「一期内容与所有者」，包导入导出依据 #6 E04、#8/#9 spec 的新格式备份条款，Web 分享依据 #6 spec「桌面分享当前工作台」E01、E07。外部对服务、策略、凭据和工作台邀请的管理均需用户显式委托相应管理权，不能从普通业务工具的授权推得。

### `packages/kernel/src/capabilities/health.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `health.run` | 67／70 | read / normal | 开 | 目录 | 无 | 各检查只取状态快照，诊断前后 Core 启动次数相同。 |
| `health.events` | 80／83 | read / high | 开 | 目录 | 无 | 限 Vault 和模块，诊断含事件与错误，剔除凭据和不可见实体。导出返回对象。 |
| `health.exportDiagnostics` | 94／97 | read / high | 开 | 目录 | 无 | 限 Vault 和模块，诊断含事件与错误，剔除凭据和不可见实体。导出返回对象。 |

### `packages/kernel/src/capabilities/home-dashboard.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `home.dashboard.update` | 147／150 | write / normal | 开 | 目录 | 持久 | 核对板 revision、实例、组件配置、布局边界。 |
| `home.dashboard.recovery.preview` | 207／187 | read / normal | 开 | 目录 | 无 | 只算候选摘要及原板版本，损坏原件字节相同。 |
| `home.dashboard.recovery.commit` | 220／187 | write / high | 开 | 目录 | 持久 | 核对 vaultId、revision、fileDigest、candidateDigest，一次保全原件。 |

### `packages/kernel/src/capabilities/home.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `home.focus.get` | 150／144 | read / normal | 开 | 目录 | 无 | 仅读剩余时间。结算另走 update。 |
| `home.focus.update` | 151／144 | write / normal | 开 | 目录 | 持久 | 绑定计时器代次，到期结算、累计及通知各一次。 |
| `home.habits.get` | 152／144 | read / normal | 开 | 目录 | 无 | 获取当前日期及勾选状态。 |
| `home.habits.update` | 153／144 | write / high | 开 | 目录 | 持久 | 含增删及 toggle，固定日期、habitId 和版本，防重复切换。 |
| `home.dashboard.get` | 154／144 | read / normal | 开 | 目录 | 无 | 只读实例与板配置，卡片数据另验来源能力；备份取已保存板。 |
| `home.dashboard.backup` | 160／144 | read / normal | 开 | 目录 | 无 | 只读实例与板配置，卡片数据另验来源能力；备份取已保存板。 |

### `packages/kernel/src/capabilities/package.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `vault.exportPackage` | 59／55 | admin / high | 开 | 目录＋字段 | 领域 | 绑定快照及下载句柄，替代任意 Engine dest。Safe/Mail 选择器归 Lead。 |
| `vault.importPackage` | 79／55 | admin / high | 开 | 目录＋字段 | 领域 | 包摘要、授权空目录与预检，禁止覆盖当前库或祖先，恢复为独立实例。 |

### `packages/kernel/src/capabilities/system.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `plugins.setEnabled` | 137／140 | admin / high | 开 | 目录 | 持久 | 核对插件版本、本机信任及连带停用集合。 |
| `gateway.get` | 159／162 | read / normal | 开 | 目录 | 无 | 回读本库真实策略、服务配置与令牌数，排除令牌原文。 |
| `gateway.mcp.update` | 171／174 | admin / high | 开 | 目录 | 持久 | 校验 transport、服务代次与真实监听；停用立即撤回旧 MCP 访问。 |
| `gateway.tokens.list` | 186／189 | read / high | 开 | 目录 | 无 | 只返回获准管理的 ID、名称与创建时间。 |
| `gateway.tokens.create` | 198／201 | admin / high | 开 | 目录 | 领域 | 一次签发，回执仅存 tokenId，原文只显一次；签发需单列委托。 |
| `gateway.tokens.revoke` | 213／216 | admin / high | 开 | 目录 | 持久 | 核对 tokenId、授权管理范围并终止派生会话。 |
| `gateway.update` | 225／228 | admin / high | 开 | 目录 | 持久 | 迁移到 policy.update 的同一管理动作；当前按单 ID 直接 setMany 缺版本前置。F01 退役旧入口，过渡期间禁止单项旁路。 |
| `gateway.policy.preview` | 245／249 | read / normal | 开 | 目录＋字段 | 无 | 核对明确 ID、catalogRevision 与策略修订；零写入。 |
| `gateway.policy.update` | 267／271 | admin / high | 开 | 桌面＋字段 | 持久 | 指定管理委托、可授范围和版本，整批原子提交；禁止普通工具自行授予更高权限。 |
| `gateway.audit.list` | 291／294 | read / high | 开 | 目录 | 无 | 限当前 Vault 可见审计记录，屏蔽私有目标。 |
| `gateway.audit.clear` | 303／306 | admin / high | 开 | 目录 | 持久 | 明确清除范围、快照上界，单次管理回执。 |
| `gateway.check` | 316／319 | read / normal | 开 | 目录 | 无 | 用真实入口上下文诊断最终目标，检查不能执行目标。 |
| `capabilities.list` | 356／359 | read / normal | 开 | 目录 | 无 | 管理描述与协议发现分开，停用仍可读完整描述。 |
| `notifications.list` | 422／417 | read / high | 开 | 目录 | 无 | 按可见来源过滤通知内容与深链。 |
| `notifications.markRead` | 432／417 | write / normal | 开 | 目录 | 持久 | 按原批次 ID 修改已读状态。 |
| `notifications.delete` | 441／417 | write / high | 开 | 目录 | 持久 | 固定原 ID 或已读快照集合，晚到通知不受旧意图影响。 |
| `notifications.clearRead` | 443／417 | write / high | 开 | 目录 | 持久 | 固定原 ID 或已读快照集合，晚到通知不受旧意图影响。 |
| `settings.get` | 444／417 | read / normal | 开 | 目录 | 无 | 回读当前版本与可公开的设置。 |
| `settings.update` | 447／417 | admin / high | 开 | 目录 | 持久 | 核对期望修订与设置作用范围；验证实际生效。 |

### `packages/kernel/src/capabilities/vault.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `vault.update` | 69／72 | write / normal | 开 | 目录 | 持久 | 核对实例和元数据版本，仅改指定名称或说明。 |
| `vault.location` | 84／87 | read / high | 开 | 目录 | 无 | 本机绝对根路径和说明，标明 Engine 设备。 |
| `vault.readRange` | 124／129 | read / high | 开 | 目录 | 无 | 限授权普通文件、版本、大小、偏移量，阻止链接和受保护路径绕过领域读取。 |
| `vault.managedFiles` | 139／144 | read / high | 开 | 目录 | 无 | 现会遍历 .huhu，按领域授权过滤文件元信息，保护私有状态。 |
| `vault.pendingOperations` | 159／164 | read / high | 开 | 目录 | 无 | 限可见 opId 和领域摘要；只取待处理项。 |
| `vault.readBinary` | 191／196 | read / high | 开 | 目录 | 无 | 限授权普通文件、版本、大小、偏移量，阻止链接和受保护路径绕过领域读取。 |
| `vault.reindex` | 223／228 | admin / high | 开 | 目录 | 持久 | 固定索引运行 ID，重复只重建一次。 |
| `vault.clearIndex` | 239／244 | admin / high | 开 | 目录 | 持久 | 核对本 Vault 索引代次，仅清可重建部分。 |
| `vault.reindexCancel` | 251／256 | admin / high | 开 | 目录 | 持久 | 仅取消原代次的重建，保留首次建立不可取消语义。 |

### `packages/kernel/src/capabilities/web-share.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `web.share.status` | 28／18 | read / normal | 开 | 桌面＋字段 | 无 | 只读已绑定地址、端口与服务代次。 |
| `web.share.start` | 29／18 | admin / high | 开 | 桌面＋字段 | 持久 | 显式管理 listener 范围和代次；关服仅断开从该服务建立的连接。 |
| `web.share.stop` | 30／18 | admin / high | 开 | 桌面＋字段 | 持久 | 显式管理 listener 范围和代次；关服仅断开从该服务建立的连接。 |
| `web.invitations.list` | 31／18 | read / normal | 开 | 桌面＋字段 | 无 | 取本代邀请元数据、会话计数。 |
| `web.invitations.get` | 32／18 | read / high | 开 | 桌面＋字段 | 无 | 有效链接可兑换工作台权限，需独立管理委托，禁止写日志或通用结果缓存。 |
| `web.invitations.create` | 33／18 | admin / high | 开 | 桌面＋字段 | 领域 | 核对可授工作台权限、Vault/listener 代次；只登记邀请 ID。 |
| `web.invitations.revoke` | 34／18 | admin / high | 开 | 桌面＋字段 | 持久 | 仅目标邀请及其派生会话失效。 |

## 扩展命令

写 `capabilities/external-plugins.ts`、kernel 的 `plugins/` 宿主及扩展声明、示例和专用测试。共享 Dispatcher/契约变动交下述协议负责人。依据 #6 source §3.1、§4.1、§12 A07、C06 与 tasks/G3.4-extension-actions.md「验收」。

### `packages/kernel/src/capabilities/external-plugins.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `plugins.inspect` | 22／15 | read / normal | 开 | 目录 | 无 | 只解析受权包。ZIP 当前解压临时目录，纯读取接口用限额解析，不激活插件。 |
| `plugins.install` | 42／15 | admin / high | 开 | 目录 | 持久 | 绑定源包摘要、版本、具体 grants 与用户信任，同一意图一次安装。 |
| `plugins.uninstall` | 52／15 | admin / high | 开 | 目录 | 持久 | 绑定版本和 eraseData 确认，释放该代 handler 与委托。 |
| `plugins.examples` | 61／15 | read / normal | 开 | 目录 | 无 | 仅列已知示例和安装状态，限制来源位置披露。 |
| `plugins.commands.list` | 79／15 | read / normal | 开 | 目录 | 无 | 外部只见当前可调用命令。管理者可查停用描述。 |
| `plugins.commands.run` | 89／15 | execute / high | 开 | 目录 | 领域 | 转发任意命令有执行副作用；建议保守 execute/high，实际执行需复核具体命令及下游，见 G3.4。 |

## agent-cli

写 plugins/agent-cli 专属文件。依据 #6 spec「各业务归属与端到端样例」Tasks/Automations/Agent CLI 行，source §12 D01、D03、D10，以及 #4 spec「工作区中的操作」「启动、断线与持久化」「历史、文件与完整界面」。内部委托依据 #6 source §3.1、§3.2、A06。冷启动读取与明确执行需分别取证。

### `plugins/agent-cli/src/engine/dispatch-capabilities.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `agent.targets.list` | 42／38 | read / normal | 闭·非用户动作 | 仅 Tasks | 无 | 仅供 Tasks 解析候选目标；用户经 tasks.dispatch.targets 选 Space。 |
| `agent.runs.dispatch` | 55／38 | execute / high | 闭·非用户动作 | 仅 Tasks | 无 | Tasks→Agent 私有执行委托；公共 tasks.dispatch 负责冻结意图。 |
| `agent.runs.inspect` | 69／38 | read / normal | 闭·非用户动作 | 仅 Tasks | 无 | 查内部受理状态；用户经 tasks.dispatch.read。 |
| `agent.runs.answer` | 83／38 | execute / high | 闭·非用户动作 | 仅 Tasks | 无 | 原生回答提交；用户经 tasks.reply，保留输入仲裁。 |
| `agent.runs.answer.inspect` | 97／38 | read / normal | 闭·非用户动作 | 仅 Tasks | 无 | 原生回答受理查询；用户经 tasks.reply.read。 |
| `agent.runs.stop` | 111／38 | execute / high | 闭·非用户动作 | 仅 Tasks | 无 | 内部停止委托；用户经 tasks.dispatch.stop。 |
| `agent.runs.stop.inspect` | 125／38 | read / normal | 闭·非用户动作 | 仅 Tasks | 无 | 对原停止动作取证；用户经 tasks.dispatch.stop.read。 |

### `plugins/agent-cli/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `agent.spaces.list` | 197／197 | read / normal | 开 | 目录 | 无 | 限可见机器、Space，不启动 Core。 |
| `agent.spaces.save` | 200／203 | write / high | 开 | 目录 | 领域 | 核对授权目录、机器、真实路径和 expectedRevision，创建一次。 |
| `agent.spaces.delete` | 212／215 | write / high | 开 | 目录 | 领域 | 核对 Space 版本与活跃会话，只移除 Space 记录。 |
| `agent.catalog.detect` | 241／244 | execute / high | 开 | 目录 | 领域 | detect.ts:161 缓存缺失或刷新时运行 provider 版本探测；只读发现须另取已探测快照。 |
| `agent.settings.get` | 255／255 | read / high | 开 | 目录 | 无 | 配置可能含本机路径、环境，摘要脱敏，与敏感读取分权。 |
| `agent.settings.update` | 258／261 | admin / high | 开 | 目录 | 领域 | 核对 settings.expectedRevision、可选命令和机器，变更影响后续执行。 |
| `agent.launch.environments.preview` | 295／298 | read / high | 开 | 目录＋字段 | 无 | 只返回固定目录、argv、变量名及批准摘要，不读出保护值或自行授予使用权。 |
| `agent.launch.resolve` | 309／312 | read / high | 开 | 目录 | 无 | 现有分支返回 env、stdin；分开脱敏预览和敏感视图，把 provider 主动探测移出 read。 |
| `agent.sessions.recover` | 373／376 | write / normal | 开 | 目录 | 领域 | findLaunch 会 applySnapshot 更新原启动记录；核对原 requestId，不发新启动。 |
| `agent.sessions.launch` | 385／388 | execute / high | 开 | 目录 | 领域 | 固定 Space/revision、cwd、provider、requestId；布局入口核对 baseVersion/tab/leaf。 |
| `agent.workspace.launch` | 402／405 | execute / high | 开 | 目录 | 领域 | 固定 Space/revision、cwd、provider、requestId；布局入口核对 baseVersion/tab/leaf。 |
| `agent.workspace.launchProtected` | 418／421 | execute / high | 开 | 目录＋字段 | 领域 | 只向批准的 cwd/argv/环境版本注入，回执仅留进程绑定。 |
| `agent.sessions.output` | 435／438 | read / high | 开 | 目录 | 无 | 核对原 Core/终端绑定与观察权，只读已运行终端，保留脱敏与不可核实提示。 |
| `agent.sessions.release` | 447／451 | execute / high | 闭·非用户动作 | 目录 | 无 | Automations 收尾私有委托，限定原 requestId 且核实已结束的受保护进程，用户结束会话走 kill。 |
| `agent.sessions.list` | 460／463 | read / normal | 开 | 目录 | 无 | 按授权 Space 过滤；将 reconcile 可能产生的状态写回移出读路径。 |
| `agent.sessions.interrupt` | 474／474 | execute / high | 开 | 目录 | 领域 | 核对原进程代次与控制权，旧 terminalId 不能作用于替代 shell。 |
| `agent.sessions.kill` | 477／477 | execute / high | 开 | 目录 | 领域 | 核对原进程代次与控制权，旧 terminalId 不能作用于替代 shell。 |
| `agent.sessions.rename` | 481／484 | write / normal | 开 | 目录 | 领域 | 按 sessionId、归属和版本修改显示名。 |
| `agent.core.status` | 493／496 | read / normal | 开 | 目录 | 无 | 复用 statusIfRunning，缺实例时 idle，不走 ensure。 |
| `agent.core.restart` | 505／508 | admin / high | 开 | 目录 | 领域 | 绑定受管理 Core 实例，停启影响原会话，重交只重启一次。 |
| `agent.history.list` | 617／620 | read / high | 开 | 目录 | 无 | 按机器、来源、provider、规范目录过滤后分页，后台对账与查询分开。 |
| `agent.history.read` | 675／678 | read / high | 开 | 目录 | 无 | 原生 ID、provider、机器、cwd/文件身份须匹配，禁止跨 Space 查看 transcript。 |
| `agent.history.pin` | 692／695 | write / normal | 开 | 目录 | 领域 | 更新指定历史项的 Huhu 标记，不改原生文件。 |
| `agent.history.resume` | 710／713 | execute / high | 开 | 目录 | 领域 | 绑定源历史及 revision、provider 支持、目标 Space，重交查原启动。 |
| `agent.history.workspaceLaunch` | 723／726 | execute / high | 开 | 目录 | 领域 | 绑定源历史及 revision、provider 支持、目标 Space，重交查原启动。 |
| `agent.history.locate` | 736／739 | read / normal | 开 | 目录 | 无 | 只定位原会话和布局，不启动、不抢焦点。 |
| `agent.review.diff` | 773／776 | read / high | 开 | 目录 | 无 | 可能含未跟踪正文，review.ts:127 实际调用 Git；纯读用已授权且无启动的快照。 |
| `agent.review.comments` | 784／784 | read / high | 开 | 目录 | 无 | 仅原会话评审记录。 |
| `agent.review.comment.add` | 787／790 | write / normal | 开 | 目录 | 领域 | 锁定 session、路径、版本、行，重复一次只增一条。 |
| `agent.review.comment.delete` | 799／802 | write / high | 开 | 目录 | 领域 | 核对 session/comment 及版本，禁止旧请求删除新评论。 |
| `agent.review.send` | 811／814 | execute / high | 开 | 目录 | 领域 | 固定原会话和批注，核对输入所有者；dryRun 零输入，丢应答按发送标记核对。 |

### `plugins/agent-cli/src/engine/launch-environment.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `agent.launch.environments.list` | 44／39 | read / high | 开 | 目录＋字段 | 无 | 限本机器及配置归属，普通与受保护字段分开，受保护字段只给状态。 |
| `agent.launch.environments.save` | 54／39 | admin / high | 开 | 目录＋字段 | 领域 | 核对环境 ID、expectedRevision，变更后旧启动批准失效。 |
| `agent.launch.environments.remove` | 64／39 | admin / high | 开 | 目录＋字段 | 领域 | 核对环境 ID、expectedRevision，变更后旧启动批准失效。 |

### `plugins/agent-cli/src/engine/workspace-files.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `agent.workspace.files.list` | 63／10 | read / normal | 开 | 库外限桌面 | 无 | 对库外依已获授权的 Space 根和 revision 判定，按真实路径列目录。 |
| `agent.workspace.files.open` | 73／10 | read / high | 开 | 库外限桌面 | 无 | 同一授权根内有界预览，校验链接、文件身份与保护目录。 |

### `plugins/agent-cli/src/engine/workspace-layout.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `agent.workspace.get` | 209／202 | read / normal | 开 | 目录 | 无 | 核对 Space，使用 readCore，检查 waiting.poke 不因查看创建任务。 |
| `agent.workspace.save` | 219／202 | write / normal | 开 | 目录 | 领域 | 核对 Space/baseVersion 及布局归属；冲突重读。 |
| `agent.workspace.close` | 229／202 | execute / high | 开 | 目录 | 领域 | terminate 可结束进程，绑定原 leaf、会话与 baseVersion，单独核实终止权限。 |

### `plugins/agent-cli/src/engine/workspace-worktrees.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `agent.workspace.worktrees.list` | 62／15 | read / normal | 开 | 目录＋字段 | 无 | 当前运行 rev-parse 和 worktree list，纯读须取授权仓库的无启动快照。 |
| `agent.workspace.worktrees.open` | 75／15 | write / normal | 开 | 目录＋字段 | 领域 | 核对 repo、worktree 成员真实路径及 Space revision，新绑定一次。 |
| `agent.workspace.worktrees.create` | 92／15 | execute / high | 开 | 目录＋字段 | 领域 | 创建分支和 worktree，检查授权空目标、仓库状态，部分成功可核对。 |

## tasks

写 plugins/tasks。依据 #6 spec 业务表 Tasks 行及 source §12 A06、D01，#5 spec「用户可以做什么」「并发与失败的外部语义」。端到端夹具核对任务、run、原会话和输入所有者。

### `plugins/tasks/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `tasks.receipts.consume` | 152／155 | write / high | 闭·内部信号 | 仅 agent-cli | 无 | 仅 plugin:agent-cli 产生可信原生运行回执；人类任务操作使用公共入口。 |
| `tasks.supplement` | 219／222 | execute / high | 开 | 工作台 | 领域 | 绑定原 task/run/会话及输入所有者，补充一次只投递一次。 |
| `tasks.supplement.read` | 237／240 | read / high | 开 | 工作台 | 无 | 读原补充状态，无再次投递。 |
| `tasks.dispatch.targets` | 284／287 | read / normal | 开 | 工作台 | 无 | 选定 Space，内部调用 agent.targets.list，查询时不创建目标。 |
| `tasks.dispatch.list` | 300／303 | read / normal | 开 | 工作台 | 无 | 先按可见任务及运行过滤再分页。 |
| `tasks.dispatch.recent` | 315／318 | read / normal | 开 | 工作台 | 无 | 先按可见任务及运行过滤再分页。 |
| `tasks.dispatch.stop` | 345／348 | execute / high | 开 | 桌面 | 领域 | 绑定 run、机器、进程代次及 stop 意图，不向替代运行发停止。 |
| `tasks.dispatch.stop.read` | 363／366 | read / normal | 开 | 桌面 | 无 | 查看同一主体可见的停止记录，不再执行。 |

## automations

写 plugins/automations。依据 #6 source §12 D02、D10，#5 spec「何时自动派遣」「界面、权限与数据范围」、#9 spec「各模块要交付的独立行为」，#5 evidence/E07-approved-terminal.md 和 #6 tasks/G5b.2-automation-rules.md 的本机目标批准边界。

### `plugins/automations/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `automations.followUps.get` | 212／215 | read / normal | 开 | 工作台 | 无 | 仅查所属任务及跟进计划。 |
| `automations.followUps.schedule` | 227／230 | write / normal | 开 | 工作台 | 领域 | 核对任务/运行版本与计划时间，仅一个排队记录。 |
| `automations.followUps.cancel` | 242／245 | write / normal | 开 | 工作台 | 领域 | 核对原计划代次及已派遣状态。 |
| `automations.cancel` | 365／365 | execute / high | 开 | 目录 | 领域 | 当前按 ruleId 取消；补 run/activation 归属，避免旧意图误停后来运行。 |

### `plugins/automations/src/engine/terminal-environment.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `automations.terminal.environment.get` | 63／59 | read / high | 开 | 桌面＋字段 | 无 | 限已批准的规则、命令与名字，优先共用 external.status。 |
| `automations.terminal.environment.save` | 73／59 | admin / high | 开 | 桌面＋字段 | 领域 | 区分本机定义变量名与更新已批准值；后者复用 external.save，新增名必须重新批准。 |
| `automations.terminal.approval.review` | 83／59 | read / high | 开 | 桌面＋字段 | 无 | 查看固定命令、Space 与变量名，查看不会产生批准。 |
| `automations.terminal.approval.approve` | 93／59 | admin / high | 闭·宿主专属 | 桌面＋字段 | 无 | 指定命令/Space/变量名的本机用户确认，工具可发起申请，禁止受益调用方自签该批准。 |
| `automations.terminal.approval.revoke` | 103／59 | admin / high | 开 | 桌面＋字段 | 领域 | 验 expectedApprovalId、对象管理权及修订，后续运行即时拒绝。 |

## notes

写 plugins/notes，包括 Archives。依据 #6 spec 业务表 Notes/知识库/Archives/Inbox 行，source §12 A07、D08–D09，tasks/G5a.1、G5a.2。路径、版本、索引及事件归领域；每项涉及受管文件时检查操作目标及原路径，禁止用普通笔记接口修改会被调度的规则。

### `plugins/notes/src/engine/archives/capabilities.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `archives.types.list` | 18／15 | read / normal | 开 | 目录 | 无 | 列本 Vault 可见类型，不创建默认项。 |
| `archives.types.save` | 21／16 | write / normal | 开 | 目录 | 持久 | 核对类型路径、字段、版本，重交不多建。 |
| `archives.types.delete` | 34／16 | write / high | 开 | 目录 | 持久 | 预检依赖及受影响档案，确认后入回收站。 |
| `archives.addFile` | 59／16 | write / normal | 开 | 目录 | 持久 | 绑定档案、文件名与内容摘要，限制大小和目录。 |

### `plugins/notes/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `notes.templates.list` | 130／133 | read / normal | 开 | 目录 | 无 | 仅已授权 Vault 内模板路径。 |
| `notes.templates.import` | 142／145 | write / normal | 开 | 目录 | 持久 | 核对来源版本与目录，重交不能新生带序号副本。 |
| `notes.textEncoding` | 158／161 | read / normal | 开 | 目录 | 无 | 核对文件可读范围，探测编码及版本。 |
| `notes.previewEncoding` | 170／173 | read / high | 开 | 目录 | 无 | 按 expectedVersion 有界解码正文。 |
| `notes.convertEncoding` | 182／185 | write / high | 开 | Automations 路径守卫 | 持久 | 核对原字节版本、编码和领域所有者，只换一版。 |
| `notes.attach` | 271／275 | write / normal | 开 | Automations 路径守卫 | 持久 | 核对所属笔记、目录、大小、摘要；重交不重复关联。 |
| `notes.trash` | 295／298 | write / high | 开 | 目录 | 持久 | 核对笔记 ID 与版本，返回原 trashId。 |
| `notes.restore` | 311／314 | write / high | 开 | 目录 | 持久 | 核对 trashId、目标名和冲突，批注随恢复路径更新。 |
| `notes.deletePermanent` | 328／331 | write / high | 开 | 目录 | 持久 | 明确 trashId 及确认，只清原文档批注。 |
| `notes.hidden.get` | 345／348 | read / normal | 开 | 目录 | 无 | 当前库的隐藏偏好和元信息。 |
| `notes.hidden.set` | 357／360 | write / normal | 开 | 目录 | 持久 | 绑定配置版本及可设置的路径范围。 |
| `notes.setFavorite` | 369／372 | write / normal | 开 | 目录 | 持久 | 绑定笔记和当前版本，重试不反转。 |
| `notes.openDaily` | 384／387 | write / normal | 开 | 目录 | 持久 | 缺失时建日记，固定日期、时区和意图，重交返回同一路径。 |
| `folders.create` | 426／429 | write / normal | 开 | 目录 | 持久 | 限授权父目录、名称和冲突状态；保护目录走领域操作。 |
| `notes.draft.get` | 507／510 | read / high | 开 | 目录 | 无 | 仅本人可读的原笔记草稿，可能含未发布正文。 |
| `notes.draft.save` | 519／504 | write / normal | 开 | 目录 | 持久 | 绑定原笔记及草稿版本，禁止覆盖新草稿。 |
| `notes.draft.discard` | 532／504 | write / high | 开 | 目录 | 持久 | 验原草稿版本，保留源笔记和后来重建的草稿。 |

## inbox

写 plugins/inbox。依据 #6 spec 业务表 Notes/Archives/Inbox 行，source §12 D08、D09 及 tasks/G5a.3。转换、撤销应从两端回读原项、关联产物与事件。

### `plugins/inbox/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `inbox.update` | 70／73 | write / normal | 开 | 目录 | 持久 | 核对 id、expectedVersion，冲突留原值。 |
| `inbox.convert` | 82／85 | write / normal | 开 | 目录 | 持久 | 固定来源版本、目标类型及字段，原项和唯一产物可关联对账。 |
| `inbox.dismiss` | 92／92 | write / normal | 开 | 目录 | 持久 | 校验原项、状态及版本，避免覆盖后续人工处理。 |
| `inbox.restore` | 93／93 | write / normal | 开 | 目录 | 持久 | 校验原项、状态及版本，避免覆盖后续人工处理。 |
| `inbox.undo` | 94／94 | write / high | 开 | 目录 | 持久 | 核对转换及产物版本，修改后的目标不可被旧撤销误删。 |
| `inbox.delete` | 96／96 | write / high | 开 | 目录 | 持久 | 核实原项、版本及确认，保持转换产物归属。 |

## agent-guide

写 plugins/agent-guide。依据 #6 spec 业务表 Agent Guide 行、source §12 A01、A04、tasks/G5a.5。service.ts:124 的 check 会清 needsCheck 并保存。

### `plugins/agent-guide/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `guide.view` | 23／25 | read / high | 开 | 目录 | 无 | 限 GUIDE_PATHS，含用户修改的文件内容。 |
| `guide.check` | 32／19 | write / normal | 开 | 目录 | 持久 | 写检查状态，完成后回读 needsCheck。 |
| `guide.preserve` | 33／19 | write / normal | 开 | 目录 | 持久 | 绑定路径及内容版本，保留选择防自动覆盖。 |
| `guide.restoreBuiltin` | 34／19 | write / high | 开 | 目录 | 持久 | 覆盖前备份，核对文件版本，同一意图只生成一个 backupId。 |
| `guide.backups.list` | 35／35 | read / normal | 开 | 目录 | 无 | 仅本 Vault 指南备份 ID 及允许的文件名。 |
| `guide.backups.restore` | 36／19 | write / high | 开 | 目录 | 持久 | 核对本库备份 ID、目标版本和允许文件集合。 |

## versioning

写 plugins/versioning。依据 #6 spec 业务表 Safe/Versioning 行、source §12 D08、D10，以及 #9 spec「各模块要交付的独立行为」Versioning 行。限定 Git 白名单和当前库；HTTPS 凭据归此模块，SSH remote 走系统 Git/SSH。含路径内容的读取需核对所属领域。

### `plugins/versioning/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `history.checkpoint` | 100／103 | write / normal | 开 | 目录 | 持久 | 绑定路径、内容版本及标题，返回原 checkpoint。 |
| `history.restore` | 112／115 | write / high | 开 | 目录 | 持久 | 校验 entryId、原路径、expectedCurrentVersion，保留指南标志、自动化防重触发。 |
| `git.init` | 158／158 | admin / high | 开 | 目录 | 持久 | 限本 Vault 授权根和仓库身份。 |
| `git.stage` | 186／189 | write / normal | 开 | 目录 | 持久 | 限显式路径集、索引基线和允许提交文件。 |
| `git.unstage` | 198／201 | write / normal | 开 | 目录 | 持久 | 限显式路径集、索引基线和允许提交文件。 |
| `git.commit` | 208／208 | write / high | 开 | 目录 | 持久 | 以 HEAD、索引与意图定位唯一提交，不能按相同消息推定重复。 |
| `sync.get` | 253／253 | read / normal | 开 | 目录 | 无 | 只返回脱敏 remote、分支及配置，过滤 URL 内嵌凭据。 |
| `sync.auth.get` | 255／254 | read / normal | 开 | 目录＋字段 | 无 | 仅该 HTTPS 目标的凭据状态、revision。 |
| `sync.auth.configure` | 259／254 | admin / high | 开 | 目录＋字段 | 领域 | 按规范化 HTTPS 目标和修订应用 keep/replace/clear，原值不入回执。 |
| `sync.update` | 271／274 | admin / high | 开 | 目录 | 持久 | 验原配置版本，变更 remote 后重新绑定认证、校验调度效果。 |
| `sync.preview` | 287／290 | execute / high | 开 | 目录 | 持久 | sync.ts:360 的 previewLocked 会 fetch 并写引用，纯预览须另取本地快照。 |
| `sync.run` | 307／310 | execute / high | 开 | 目录 | 持久 | 固定 remote、分支、HEAD 及认证版本，按原提交/拉取/推送结果对账。 |
| `conflicts.list` | 334／337 | read / normal | 开 | 目录 | 无 | 取当前仓库冲突摘要，隔离会启动 Git 的分析，纯读取已有投影。 |
| `conflicts.read` | 356／359 | read / high | 开 | 目录 | 无 | 核对会话、路径及两侧版本，不隐式运行合并。 |
| `conflicts.resolve` | 368／371 | execute / high | 开 | 目录 | 持久 | 会产生 commit 并可能 push，限定 sessionId、两端 HEAD、逐文件决议。 |
| `conflicts.cancel` | 389／392 | write / high | 开 | 目录 | 持久 | 绑定原冲突会话和 HEAD，旧请求不能取消新冲突。 |
| `sync.status` | 406／409 | read / normal | 开 | 目录 | 无 | 只回读状态和失败原因，不重连或重启定时器。 |

## safe

写 plugins/safe。依据 #6 source §12 D08、D10 与 #9 spec「数据、权限与清洁安装」。本次 grep 仅命中 audit.list。setup、unlock、lock、changePassword 已另有默认关的声明，不能计为此次新增项；主密码本身没有读取动作。秘密编辑与普通生命周期开关分别依据对应规格验收。

### `plugins/safe/src/engine/index.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `safe.audit.list` | 90／95 | read / high | 开 | 域内复权 | 无 | 仅可见动作元数据，保留现有领域二次验权，核对库实例/代次、审计范围和条数。 |

## mail

写 plugins/mail。依据 #6 spec 业务表 Mail 行，#8 spec「添加并使用账号」「从联系人找到具体邮件」M-04、M-08、「网络事实、发送与持久数据」统一能力/只读/发信条款，#8 source §5.3、S7.1/S7.2 设置与片段确认记录，以及本任务对 Key 编辑的明确边界。账号和运行凭据由 Mail 持有。各行改守卫后仍检查账号、对象、修订和可写状态。

### `plugins/mail/src/engine/account-removals.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.accounts.previewRemoval` | 158／116 | read / high | 开 | 桌面＋字段 | 无 | 验账号/修订与影响摘要，不删除、不连接。 |
| `mail.accounts.remove` | 184／116 | write / high | 开 | 桌面＋字段 | 领域 | 绑定 impactKey、账号版本和确认项，仅删除该账号及其本地凭据。 |

### `plugins/mail/src/engine/account-setup.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.accounts.testConnection` | 80／12 | execute / high | 开 | 桌面＋字段 | 领域 | 固定服务器、账号版本和凭据输入，临时 setupId 绑定主体；不留明文回执。 |
| `mail.accounts.save` | 125／12 | admin / high | 开 | 桌面＋字段 | 领域 | 绑定本人 setupId、目录选择及账号版本，账号/凭据仅保存一次。 |
| `mail.accounts.cancelSetup` | 187／12 | write / normal | 开 | 桌面＋字段 | 领域 | 仅释放本人未完成 setup，不能取消其他账号保存。 |
| `mail.accounts.rename` | 203／12 | write / normal | 开 | 桌面＋字段 | 领域 | 只改原账号标签，核对 expectedRevision。 |

### `plugins/mail/src/engine/ai-settings.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.ai.getSettings` | 76／53 | read / normal | 开 | 工作台 | 无 | 只返已保存 endpoint/model/启用及 Key 状态；验证脱敏 URL。 |
| `mail.ai.verifyConnection` | 86／53 | execute / high | 闭·桌面秘密编辑 | 桌面＋字段 | 无 | 当前 edit 输入允许候选 Key 和目的地址，属于秘密编辑流程；若拆出测试已保存配置，可单列 execute/high 授权。 |
| `mail.ai.saveSettings` | 96／53 | admin / high | 闭·桌面秘密编辑 | 桌面＋字段 | 无 | 当前 edit 可替换或清除 Key，保留桌面；拆出的非秘密配置变更可另授。 |
| `mail.ai.prepare` | 106／53 | write / normal | 开 | 工作台 | 领域 | 当前创建 approvalId 并替换会话待确认；绑定主体、片段摘要、目的地与 settings revision。 |
| `mail.ai.chat` | 116／53 | execute / high | 开 | 工作台 | 领域 | 一次消费用户确认，锁定片段、问题、模式及服务。超时未知不重复对外发送。 |

### `plugins/mail/src/engine/conversations.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.conversations.list` | 209／147 | read / high | 开 | 工作台 | 无 | 先按可见账号、公开参与者与源目录过滤，再聚合/分页，不泄漏 Bcc 或隐藏项。 |
| `mail.conversations.messages` | 223／147 | read / high | 开 | 工作台 | 无 | 先按可见账号、公开参与者与源目录过滤，再聚合/分页，不泄漏 Bcc 或隐藏项。 |
| `mail.conversations.search` | 238／147 | read / high | 开 | 工作台 | 无 | 先按可见账号、公开参与者与源目录过滤，再聚合/分页，不泄漏 Bcc 或隐藏项。 |
| `mail.conversations.findMessage` | 267／147 | read / high | 开 | 工作台 | 无 | 先按可见账号、公开参与者与源目录过滤，再聚合/分页，不泄漏 Bcc 或隐藏项。 |
| `mail.conversations.sentBody` | 293／147 | read / high | 开 | 工作台 | 无 | 仅可见账号的原已发记录，不向会话视图泄露私有密送信息。 |

### `plugins/mail/src/engine/drafts.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.outbox.submit` | 419／36 | execute / high | 开 | 工作台 | 领域 | 固定草稿版本、收件人、提交回执，只重试可证未提交的收件人。 |
| `mail.outbox.status` | 433／36 | read / high | 开 | 工作台 | 无 | 仅本人可见的账号/操作记录，不尝试投递。 |
| `mail.outbox.list` | 446／36 | read / high | 开 | 工作台 | 无 | 仅本人可见的账号/操作记录，不尝试投递。 |
| `mail.outbox.retry` | 459／36 | execute / high | 开 | 工作台 | 领域 | 固定草稿版本、收件人、提交回执，只重试可证未提交的收件人。 |
| `mail.outbox.deleteLocal` | 473／36 | write / high | 开 | 工作台 | 领域 | 验原本地记录版本，清记录不重发或修改远端。 |
| `mail.drafts.list` | 487／36 | read / high | 开 | 工作台 | 无 | 限授权账号与草稿，附件跟随 draftId 验权。 |
| `mail.drafts.get` | 500／36 | read / high | 开 | 工作台 | 无 | 限授权账号与草稿，附件跟随 draftId 验权。 |
| `mail.drafts.save` | 513／36 | write / normal | 开 | 工作台 | 领域 | 按账号、草稿版本保存，创建只产生一个 draftId。 |
| `mail.drafts.discard` | 527／36 | write / high | 开 | 工作台 | 领域 | 按原草稿修订清理私有引用。 |
| `mail.drafts.removeAttachment` | 541／36 | write / high | 开 | 桌面＋字段 | 领域 | 核对 draftId、修订和附件引用；该动作不需要系统文件选择器。 |

### `plugins/mail/src/engine/message-cache.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.sync.refresh` | 99／95 | execute / high | 开 | 工作台 | 领域 | 主动同步会联网、写缓存；绑定账号代次及作业。 |
| `mail.messages.latest` | 109／95 | read / high | 开 | 工作台 | 无 | 读原账号、文件夹及消息缓存。缺缓存返回 needs-refresh，零标读和外部资源请求。 |
| `mail.messages.loadSource` | 118／95 | read / high | 开 | 工作台 | 无 | 读原账号、文件夹及消息缓存。缺缓存返回 needs-refresh，零标读和外部资源请求。 |
| `mail.cache.usage` | 522／95 | read / normal | 开 | 工作台 | 无 | 统计当前账号范围内可重建缓存字节。 |
| `mail.cache.clear` | 535／95 | write / high | 开 | 工作台 | 领域 | 预检范围，保留唯一草稿、附件、发件和操作状态。 |
| `mail.sync.status` | 584／95 | read / normal | 开 | 工作台 | 无 | 读取已有同步状态，不触发刷新。 |
| `mail.notifications.target` | 599／95 | read / high | 开 | 工作台 | 无 | 核对通知与可见账号/源消息的绑定。 |
| `mail.messages.prepareReply` | 639／637 | read / high | 开 | 工作台 | 无 | 用授权缓存与参与者计算草稿种子；不保存、不投递，保护 Bcc。 |
| `mail.messages.prepareForward` | 652／95 | read / high | 开 | 工作台 | 无 | 用授权缓存与参与者计算草稿种子；不保存、不投递，保护 Bcc。 |
| `mail.messages.prepareNewTopic` | 668／95 | read / high | 开 | 工作台 | 无 | 用授权缓存与参与者计算草稿种子；不保存、不投递，保护 Bcc。 |
| `mail.messages.loadBody` | 684／95 | read / high | 开 | 工作台 | 无 | 读原账号、文件夹及消息缓存。缺缓存返回 needs-refresh，零标读和外部资源请求。 |
| `mail.conversations.loadBody` | 685／95 | read / high | 开 | 工作台 | 无 | 读原账号、文件夹及消息缓存。缺缓存返回 needs-refresh，零标读和外部资源请求。 |
| `mail.messages.markRead` | 719／717 | write / high | 开 | 工作台 | 领域 | 可能 IMAP STORE，校验 UIDVALIDITY、UID、账号代并回读，本地状态与远端分开。 |

### `plugins/mail/src/engine/registration.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.accounts.list` | 28／34 | read / high | 开 | 工作台 | 无 | 返回可见账号及认证状态，pendingRemovals 按管理权过滤。 |

### `plugins/mail/src/engine/subset-data.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.subset.create` | 242／53 | read / high | 开 | 工作台 | 无 | 只从授权账号生成内存包，高敏读取、限制字节、排除模块认证。 |
| `mail.subset.preview` | 259／53 | write / high | 开 | 工作台 | 领域 | 当前新建 previewId、保留包并淘汰旧计划；按主体隔离容量与期限。 |
| `mail.subset.cancel` | 281／53 | write / normal | 开 | 工作台 | 领域 | 删除本人计划，恢复过程中不能取消已受理提交。 |
| `mail.subset.restore` | 296／53 | write / high | 开 | 工作台 | 领域 | 绑定主体、包摘要、账号集合及目标版本，重交不重复导入或投递。 |

### `plugins/mail/src/engine/sync-schedule.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `mail.sync.settings` | 173／169 | read / normal | 开 | 工作台 | 无 | 读当前周期及配置，不触发调度。 |
| `mail.sync.setInterval` | 186／169 | admin / normal | 开 | 工作台 | 领域 | 核对设置版本和作用范围，实际调度只变更一次。 |

## ssh

写 plugins/ssh，含注册绑定 index.ts 与领域服务；H11.2 接线与其当前实现者串行。依据 #6 spec 业务表 SSH 行、source §12 D04–D07、D10，#7 spec「进入 SSH 和管理主机」「工作区、终端和文件」「路由、转发与监控」「设置与公共入口」。所有作业、等待项、文件/终端流均须先绑定当前 Vault 实例、认证客户端、hostId、路由及连接代。下表 scope 为可公开的领域动作。即使现有 handler 只收 hostId，也必须先定位到有权使用的同一对象。

### `plugins/ssh/src/engine/capabilities.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `ssh.settings.get` | 163／47 | read / normal | 开 | 目录＋字段 | 无 | 只读该库默认值，区分设备设置和可移植设置。 |
| `ssh.settings.update` | 172／47 | write / normal | 开 | 目录＋字段 | 领域 | 保存当前库修订，传输策略变化须限定已受理任务的影响。 |
| `ssh.monitor.tools.read` | 181／47 | execute / high | 开 | 目录＋字段 | 领域 | 现会在远端执行固定进程/容器查询；只读授权只能看已有采样。 |
| `ssh.monitor.session.open` | 188／47 | execute / high | 开 | 目录＋字段 | 领域 | 按原 pane/连接代与订阅所有者创建或改变采样，重试不增采样器。 |
| `ssh.monitor.session.get` | 189／47 | read / normal | 开 | 目录＋字段 | 无 | 只读原订阅缓存样本，不主动连接/采样。 |
| `ssh.monitor.session.change` | 192／47 | execute / high | 开 | 目录＋字段 | 领域 | 按原 pane/连接代与订阅所有者创建或改变采样，重试不增采样器。 |
| `ssh.monitor.panels.list` | 201／47 | read / normal | 开 | 目录＋字段 | 无 | 仅可见面板定义及主机顺序。 |
| `ssh.monitor.panels.save` | 208／47 | write / normal | 开 | 目录＋字段 | 领域 | 校验可见 hostId 及面板修订；只存配置。 |
| `ssh.monitor.panels.delete` | 209／47 | write / high | 开 | 目录＋字段 | 领域 | 按面板 revision 删除并释放本面板的订阅。 |
| `ssh.monitor.panels.run` | 212／47 | read / normal | 开 | 目录＋字段 | 无 | 名为 run，绑定 handler 为 monitors.dashboard，仅取已有样本。 |
| `ssh.monitor.panels.change` | 221／47 | execute / high | 开 | 目录＋字段 | 领域 | 针对原面板、主机、采样代，启动/暂停/停用/重试各只发生一次。 |
| `ssh.forwarding.rules.list` | 231／47 | read / normal | 开 | 目录＋字段 | 无 | 限授权主机、监听和出口摘要，不开启监听。 |
| `ssh.forwarding.rules.save` | 242／47 | write / high | 开 | 目录＋字段 | 领域 | 验监听范围、目标及规则版本；运行中改规则会释放旧监听。 |
| `ssh.forwarding.rules.delete` | 253／47 | write / high | 开 | 目录＋字段 | 领域 | 绑定规则、运行、版本，释放该规则的持有权。 |
| `ssh.forwarding.runs.list` | 264／47 | read / normal | 开 | 目录＋字段 | 无 | 只取已存在监听、连接归属与流量计数。 |
| `ssh.forwarding.runs.start` | 275／47 | execute / high | 开 | 目录＋字段 | 领域 | 固定规则修订、出口及实际回环监听；恢复只用原规则，拒复用别人的通道。 |
| `ssh.forwarding.runs.resume` | 286／47 | execute / high | 开 | 目录＋字段 | 领域 | 固定规则修订、出口及实际回环监听；恢复只用原规则，拒复用别人的通道。 |
| `ssh.forwarding.runs.stop` | 297／47 | execute / high | 开 | 目录＋字段 | 领域 | 校验原运行及规则代次，只关闭当前调用者可控制的监听。 |
| `ssh.archives.support` | 308／47 | execute / high | 开 | 目录＋字段 | 领域 | archives.ts:112 会探测原生 ZIP、尝试 SFTP；查询版改取缓存，不隐式启动探针。 |
| `ssh.archives.run` | 319／47 | execute / high | 开 | 目录＋字段 | 领域 | 核对文件会话、来源设备、目录、归档大小和目标版本，覆盖/解压须确认。 |
| `ssh.transfers.start` | 331／47 | execute / high | 开 | 目录＋字段 | 领域 | 固定获准的源/目标、文件快照、冲突策略和任务 ID，重交不复制两遍。 |
| `ssh.transfers.startBatch` | 342／47 | execute / high | 开 | 目录＋字段 | 领域 | 固定获准的源/目标、文件快照、冲突策略和任务 ID，重交不复制两遍。 |
| `ssh.transfers.list` | 353／47 | read / normal | 开 | 目录＋字段 | 无 | 过滤本人有权观察的队列，零连接/调度。 |
| `ssh.transfers.decide` | 364／47 | execute / high | 开 | 目录＋字段 | 领域 | 绑定原冲突的两端快照与版本，迟到的覆盖/跳过决定作废。 |
| `ssh.transfers.cancel` | 375／47 | execute / high | 开 | 目录＋字段 | 领域 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 |
| `ssh.transfers.pause` | 386／47 | execute / high | 开 | 目录＋字段 | 领域 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 |
| `ssh.transfers.resume` | 397／47 | execute / high | 开 | 目录＋字段 | 领域 | 核对原 transferId、作业所有者/状态及端点，避免误控后来任务。 |
| `ssh.transfers.retry` | 408／47 | execute / high | 开 | 目录＋字段 | 领域 | 原端点与快照；recheck 可能恢复旧文件/清理暂存，不属于 read。 |
| `ssh.transfers.recheck` | 419／47 | execute / high | 开 | 目录＋字段 | 领域 | 原端点与快照；recheck 可能恢复旧文件/清理暂存，不属于 read。 |
| `ssh.transfers.origin` | 430／47 | write / normal | 开 | 目录＋字段 | 领域 | openOrigin 会恢复或分离文件会话绑定，校验原 transferId 及源设备。 |
| `ssh.transfers.clearHistory` | 441／47 | write / high | 开 | 目录＋字段 | 领域 | 只清调用者有权清理的已结束记录，保留在途任务。 |
| `ssh.workspace.runs.list` | 451／47 | read / normal | 开 | 目录 | 无 | 限本人可观察的原工作区实例与 pane。 |
| `ssh.workspace.runs.start` | 461／47 | execute / high | 开 | 目录 | 领域 | 绑定模板/主机及路由修订，每个目标 pane 对账；禁止重连到替代主机。 |
| `ssh.workspace.runs.reconnect` | 471／47 | execute / high | 开 | 目录 | 领域 | 绑定模板/主机及路由修订，每个目标 pane 对账；禁止重连到替代主机。 |
| `ssh.workspace.runs.close` | 481／47 | execute / high | 开 | 目录 | 领域 | 绑定原 run/连接代，释放其持有的 pane 与会话。 |
| `ssh.workspace.runs.saveTemplate` | 491／47 | write / normal | 开 | 目录 | 领域 | 仅由获准原运行生成新模板，重交只生成一个 ID。 |
| `ssh.workspace.templates.list` | 501／47 | read / normal | 开 | 目录 | 无 | 取可见定义和引用，不因展示模板启动连接。 |
| `ssh.workspace.templates.save` | 511／47 | write / normal | 开 | 目录 | 领域 | 核对模板、hostId 与 expectedRevision。 |
| `ssh.workspace.templates.delete` | 521／47 | write / high | 开 | 目录 | 领域 | 核对模板版本与删除确认，单独处理已运行实例。 |
| `ssh.hosts.directory` | 533／47 | read / normal | 开 | 目录 | 无 | 脱敏主机及分组目录，优先读可移植定义；禁止查询时取密码/拨号。 |
| `ssh.hosts.organize` | 543／47 | write / normal | 开 | 目录 | 领域 | 原目录版本、分组与主机成员须匹配，不能挪动未授权条目。 |
| `ssh.hosts.list` | 553／47 | read / normal | 开 | 目录 | 无 | 脱敏主机及分组目录，优先读可移植定义；禁止查询时取密码/拨号。 |
| `ssh.hosts.configure` | 563／47 | admin / high | 开 | 目录＋字段 | 领域 | 自有认证，按主机/路由版本 keep/replace/clear；受控输入不回显、不留秘密回执。 |
| `ssh.hosts.copy` | 571／47 | admin / high | 开 | 目录＋字段 | 领域 | 新主机独立配置凭据，原 hostId/修订固定，一次生成新 ID。 |
| `ssh.hosts.remove` | 579／47 | admin / high | 开 | 目录＋字段 | 领域 | 核对引用/跳板依赖，删除限定到原主机及认证。 |
| `ssh.connect` | 587／47 | execute / high | 开 | 后台分支限桌面 | 领域 | 后台分支检查 desktop；改受权会话的连接意图，返回可查询 attemptId。按 hostId 不足以绑定待答。 |
| `ssh.connections.status` | 598／47 | read / normal | 开 | 目录 | 无 | 只列该主体/连接代，待答不可跨主体枚举。 |
| `ssh.disconnect` | 608／47 | execute / high | 开 | 目录 | 领域 | 只关闭该主体可控的原连接及通道，不能按全局 hostId 切断他人作业。 |
| `ssh.hostKey.decide` | 618／47 | execute / high | 开 | 目录 | 领域 | 仅原 attempt、hop、指纹、promptRevision；区分单次接受与持久信任，changed-key 走独立管理。 |
| `ssh.knownHosts.list` | 628／47 | read / high | 开 | 目录 | 无 | 限可见地址、端口、密钥类型和指纹，不含私钥。 |
| `ssh.knownHosts.forget` | 638／47 | admin / high | 开 | 目录＋字段 | 领域 | 限确认的原地址、端口、类型和精确指纹，独立信任管理权。 |
| `ssh.exec.run` | 649／47 | execute / high | 开 | 目录 | 领域 | 外部复用已有 jobs 准备/启动/取消及回执，不向 hostId 下的任意会话施加命令或取消。 |
| `ssh.exec.cancel` | 660／47 | execute / high | 开 | 目录 | 领域 | 外部复用已有 jobs 准备/启动/取消及回执，不向 hostId 下的任意会话施加命令或取消。 |
| `ssh.audit.list` | 670／47 | read / high | 开 | 目录 | 无 | 限可观察作业、主机及主体，脱敏命令/路径。 |
| `ssh.fileSessions.open` | 680／47 | execute / high | 开 | 目录 | 领域 | 新文件会话绑定既有受权连接，稳定意图返回原 fileSessionId。 |
| `ssh.fileSessions.list` | 690／47 | read / normal | 开 | 目录 | 无 | 仅本人或获委托会话摘要。 |
| `ssh.fileSessions.close` | 700／47 | execute / high | 开 | 目录 | 领域 | 释放原文件会话及其持有权，不伤共享 SSH 连接。 |
| `ssh.fileSessions.localList` | 711／47 | write / normal | 开 | 目录＋字段 | 领域 | 可选 root 会写 binding.localRoot；拆成显式授权绑定与只读列目录。CLI 本地文件由 CLI 选择，Engine 根只取有范围的句柄。 |
| `ssh.fileSessions.search` | 721／47 | execute / normal | 开 | 目录 | 领域 | 会分配可取消的递归搜索，限制源会话、根、深度、数量和期限。 |
| `ssh.fileSessions.cancelSearch` | 731／47 | execute / normal | 开 | 目录 | 领域 | 仅原搜索代次，禁止旧取消影响新搜索。 |
| `ssh.fileSessions.directory` | 742／47 | read / normal | 开 | 目录＋字段 | 无 | 仅读原 Shell 所报告的目录与提示符修订。 |
| `ssh.fileSessions.prepareDirectory` | 753／47 | execute / normal | 开 | 目录＋字段 | 领域 | 当前创建 navigation/follow，绑定会话、路径、提示符修订及短时效。 |
| `ssh.fileSessions.commitDirectory` | 764／47 | execute / high | 开 | 目录＋字段 | 领域 | 核对一次性 follow、输入持有权及原空闲提示符，禁止过期补发。 |
| `ssh.fileSessions.document.open` | 774／47 | read / high | 开 | 目录 | 无 | 只读绑定的远端文件，返回编码、权限、版本，禁止隐式连接。 |
| `ssh.fileSessions.document.save` | 784／47 | write / high | 开 | 目录 | 领域 | 核对 fileSessionId、路径、expectedVersion 及原权限，安全暂存与发布。 |
| `ssh.fileSessions.properties` | 794／47 | read / normal | 开 | 目录 | 无 | 只读原端点的元数据及版本。 |
| `ssh.fileSessions.changeProperties` | 804／47 | write / high | 开 | 目录 | 领域 | 核对原文件 revision、路径与授权字段，不得提高到未经批准的特权。 |
| `ssh.fileSessions.createEntry` | 814／47 | write / normal | 开 | 目录 | 领域 | 在获准父目录创建文件/目录，校验名称与不存在前置条件。 |
| `ssh.fileSessions.moveEntry` | 824／47 | write / high | 开 | 目录 | 领域 | 核对原路径、版本、目标父目录/冲突，禁止跨会话混用。 |
| `ssh.sftp.list` | 834／47 | read / normal | 开 | 目录 | 无 | 对已有受权连接只列远端目录，不拨号或执行命令。 |
| `ssh.sftp.read` | 844／47 | read / high | 开 | 目录 | 无 | 对已有连接有界读取获准文件，无命令、无隐式重连。 |
| `ssh.sftp.write` | 854／47 | write / high | 开 | 目录 | 领域 | 绑定远端路径、版本、覆盖确认与内容摘要。 |
| `ssh.sftp.upload` | 864／47 | execute / high | 开 | 目录 | 领域 | 原合同含 Engine localPath；改设备标识和有界传输句柄，绑定两端和覆盖版本。 |
| `ssh.sftp.download` | 875／47 | execute / high | 开 | 目录 | 领域 | 原合同含 Engine localPath；改设备标识和有界传输句柄，绑定两端和覆盖版本。 |
| `ssh.sftp.cancel` | 886／47 | execute / high | 开 | 目录 | 领域 | 只取消主体的具体传输，不得按公共主机停止他人操作。 |
| `ssh.sftp.mkdir` | 896／47 | write / normal | 开 | 目录 | 领域 | 限原连接的获准父目录，确认名称及冲突。 |
| `ssh.sftp.rename` | 906／47 | write / high | 开 | 目录 | 领域 | 核对远端路径、原对象版本、覆盖/递归删除意图。 |
| `ssh.sftp.delete` | 916／47 | write / high | 开 | 目录 | 领域 | 核对远端路径、原对象版本、覆盖/递归删除意图。 |
| `ssh.shells.open` | 926／47 | execute / high | 开 | 目录 | 领域 | 建立原主机/路由的 PTY，固定意图与 shellId；后续流持续验权。 |
| `ssh.shells.list` | 936／47 | read / normal | 开 | 目录 | 无 | 只列可观察 shell 元数据，不 attach、不启动。 |
| `ssh.shells.close` | 946／47 | execute / high | 开 | 目录 | 领域 | 限制原 shellId、所有者与连接代，重复关闭不碰新终端。 |

### `plugins/ssh/src/engine/import/capability.ts`

| 能力 ID | 定义／标记 | 建议 scope / risk | 裁决 | 当前守卫 | 意图 | 对象校验及定向验收 |
|---|---:|---|---|---|---|---|
| `ssh.hosts.import.preview` | 60／66 | read / normal | 开 | 工作台 | 无 | 仅解析有界输入字节及当前目录，列冲突，预览令牌绑定主体和源摘要。 |
| `ssh.hosts.import.confirm` | 73／80 | write / high | 开 | 工作台＋字段 | 领域 | 校验确认 token、目录 revision、选中行及冲突；复用确定性 hostId 防止部分成功后多建。 |
## HTTP MCP 会话身份与 SSH 所有权（#6 / #7，P1）

**已核对的行为。** `packages/kernel/src/gateway-tokens.ts:25` 和 `:75` 将独立 Gateway 令牌的持久 ID 登记为 `caller=http` 的 subject。bootstrap 令牌由 `TokenTable.issue` 签发，subject 为 caller。HTTP MCP 在 `packages/kernel/src/server/http-app.ts:110` 取出这对值，`:139` 用它们调用 Dispatcher，`:150` 用相同 subject 查操作。`:154` 每次请求新建无状态 transport，响应关闭即释放。两个独立令牌已有隔离，同一个令牌建立的两个客户端缺少可区分的所有者。SSH 在 `public-resources.ts:28` 组合 caller/subject，`public-jobs.ts:106` 再结合 Vault 实例构成回执归属，共用 bootstrap MCP 身份会被拒。作业内的 sessionId 是原 SSH 执行连接的绑定，不能代替客户端会话。待答在 `public-probes.ts:114` 关联 owner，get/list/decide 均依赖它。两份前序审查记录用于定位，本次结论按此快照复核。

**建议接口。** 在 Kernel 认证适配层复用 TokenTable 及 Gateway 撤销信号，为 SDK transport 增加一个服务端会话注册表。身份包含 `entry, credentialId, clientSessionId, vaultInstance, serviceGeneration`。entry 记录 HTTP MCP/stdio 与普通 HTTP 的实际入口；caller 沿用 Dispatcher 的既有类型。外部不能从请求体指定这些值。首次已认证的 MCP initialize 由服务端生成随机的逻辑 clientSessionId 和独立的高熵恢复秘密。客户端用标准 `Mcp-Session-Id` 头原样带回不透明句柄，句柄可同时封装公开查找 ID 与随机恢复秘密。服务端只保存恢复秘密摘要、父令牌身份、实例、代次、过期时间与撤销状态。公开的 ID、日志和操作回执均不含恢复秘密。

| 时机 | 服务端判定与可观察结果 |
|---|---|
| initialize / 后续请求 | 每次先校验真实 Bearer、Host/Origin、入口状态。仅 initialize 可签发新句柄。相同 Bearer 的两次初始化产生不同 owner。后续请求必须验证原令牌、恢复秘密及绑定元组；缺失、过期、错令牌或错代次时拒绝，不能退回令牌级主体。限额按父凭据与会话分别计算。 |
| 断线及重连 | 将逻辑会话寿命与单个 HTTP response 分开。网络断开只终止这次请求或订阅；在有效期内携带原 Bearer 和句柄可重连同一 owner，恢复已受理作业的查询。无凭据重建的全新会话无法认领旧作业。显式结束、超时、MCP 停用或切库使会话失效；服务代次更换后旧 transport 头立即失效，重启后的安全对账见下段。 |
| 当前策略 / 撤销 | 请求、资源、操作回读、流打开/续读均先验证会话和该项最新授权。某项工具关闭只收回相应访问；撤父令牌使所有子会话与流失效。分离调用取消和领域取消，已受理作业按自身生命周期收尾。只开放 CLI 的情况不受 MCP 服务开关影响。 |
| 接入现有代码 | 由适配器向 Dispatcher 提供服务端生成的稳定 subject 或独立 trustedContext，保留父 credentialId 用于存活性检查。持久意图、操作回读及 SSH owner 一起纳入会话维度。`apps/engine/src/boot.ts:428` 的 taskScanPrincipalCurrent 当前直接 `tokens.hasPrincipal(caller,subject)`；Lead 接入会话验证器，避免变更 subject 后所有合法后续检查失败。普通 CLI 的多次进程调用保留其已认证的原主体。 |
| stdio | `apps/cli/src/mcp.ts:6` 经 Engine HTTP 转发。为每个 stdio 客户端进程建立一次同级认证会话，发现、资源、call 和 operation 传同一绑定；多个进程共享 bootstrap 时亦隔离。CLI/MCP 可重连需要保管句柄，禁止把 SSH sessionId、terminalId 或自报 clientId 当作凭据。 |

**重启后的 C05 对账。** 将短命 transport 句柄与可持久核验的逻辑客户端恢复证明分开。初始化可向客户端另发一次高熵恢复凭据，服务器只在本机受保护的运行状态中记录摘要和绑定的逻辑 clientSessionId、稳定父 credentialId、Vault 实例、授权/撤销代、过期时间。正常网络重连沿用原 transport，Engine 重启后以仍有效的原独立令牌和恢复证明重新握手，核对正式停服/显式结束/撤销的失效记录，轮换证明与 transport 秘密，轮换及旧证明作废须原子完成。已撤销或复制到新 Vault 的状态不能恢复。服务代次负责验证活跃 transport，持久回执 owner 使用稳定的 Vault 实例、父凭据和逻辑客户端 ID；同逻辑客户端重新认证后可以查原回执，STALE/unknown 时不得重新启动 SSH 作业。为共享 bootstrap 的 stdio 做持久恢复时须有可核验的本机客户端绑定；尚未建立绑定的客户端只能在本次进程的会话内操作。TTL、能否跨受控停服查账的窗口待 #6 负责人定稿，不影响断线重连与同令牌隔离。验收加一组 Engine 重启后 A 恢复原逻辑身份可查原操作、B 重初始化仍不可查、作业执行计数保持 1 的用例。

**SSH 领域接线。** 将验证后的 owner 同时写入 job/attempt/prompt 与回执查询键。保留 `public-jobs.ts:183` 的原 SSH sessionId、hostId、routeRevision 检查。状态、输出游标、取消及查账均按 owner+jobId 验证，包括内存作业落到持久回执的路径。信任答复需精确匹配 owner、hostId、attemptId、路由修订、hop、serverHostId、promptId、指纹及 promptRevision，并核对未过期、未消费。只读列表先过滤归属。明确区分“仅本次接受”和修改 knownHosts 的独立管理操作。

**验收。** 用独立 Gateway 令牌完成正常 HTTP MCP 作业；另以同一令牌初始化 A、B，A 的作业和待答对 B 不可见，B 持 A 的公开作业/连接/提示标识时，状态、输出、取消、信任决定及操作回读均被拒。A 断网后用原句柄重连，读同一游标并仅答一次；换令牌带原句柄被拒。撤权、撤令牌、关闭 MCP 与换库覆盖已有连接及缓存名。再以两个 stdio 客户端验证同一 bootstrap 的隔离。复用 `plugins/ssh/test/public-resources.engine.test.ts` 的现有夹具，在同凭据双会话用例中保持同一 Vault 和同一 route。

## 扩展命令的逐项映射与 caller 传递（G3.4）

**已核对的行为。** `packages/kernel/src/capabilities/external-plugins.ts:89` 将通用 run 继承为 admin/固定关闭，`:94` 丢弃调用上下文。`plugins/external.ts:352` 从活跃子进程收集命令，`:371` 的 IPC 只带 reqId、命令 ID 和 args。宿主 `packages/kernel/src/plugins/host-script.ts:28` 的 registerCommand 只登记 ID/标题/handler。当前 api.call 使用子进程级插件令牌；没有一次命令调用的原始 subject、Vault 代次或父意图。

以下为建议的 canonical ID，示例的实际插件 ID、命令和下游来自 `examples/plugins/<插件>/huhu-plugin.json` 和同目录的 `main.mjs`。每一项独立选择、默认关；CLI 用 canonical ID，MCP 名称由同一描述符经现有 `mcpToolName` 派生。

| 现行 pluginId / commandId | 建议 canonical ID | scope / risk、输入与结果 | 代理最终目标 |
|---|---|---|---|
| daily-review / generate | `extensions.daily-review.generate` | write/normal，空输入，返回 path、tasks、notes；按意图仅建一份回顾 | tasks.list、notes.list、notes.create、notes.read、notes.save；保留期望文件版本。 |
| portable-export / export | `extensions.portable-export.export` | read/high，空输入，返回聚合正文与数量或受限下载句柄 | notes.list、notes.read；桌面的保存对话框由 DesktopHost 呈现，CLI 将内容保存到调用设备。 |
| quick-clip / clip | `extensions.quick-clip.clip` | write/normal，可选 text，返回 captured、title；同意图一条收件记录 | inbox.capture；来源保留真实外部主体及经手插件，禁止冒充 desktop 或可信内部来源。 |

1. 扩展安装前从 manifest 读取每条命令的 owner、commandId、title、description、输入/输出 schema、scope、risk、重试语义及依赖。对受限标识组成的规范名及变换后的 MCP 名同时查重；超过长度或产生转义/名称冲突时拒绝整份声明。用 `CapabilityRegistry.declareDescriptors` 在插件停用时保留描述；激活时仅能绑定声明过的命令和一致的 schema。新命令为未配置。停用注销 handler、终止该代活动委托，重启后不从空的进程命令表猜元数据。
2. 直接调用和 `plugins.commands.run` 解析到同一个 command descriptor。若保留可选通用 run，先验 run 的开放选择，再查具体命令；直接调用只需具体命令及实际依赖。一次授权不能解锁整个插件。以管控范围、已声明效果为依据，任意动态目标的代理按 execute/high 或限制到已声明目标。
3. 建议 `runCommand(context, descriptor, parsedArgs)` 创建短时调用委托，包含原 actor/subject、插件 ID/激活代、Vault 实例、命令 ID、parentOperationId、截止时间及 signal。服务端持有映射，IPC 只给不可猜的一次调用句柄。通过命令上下文的 `call(target,input)` 回到 Engine，校验插件进程及委托归属，再取**原主体对具体命令和最终目标的当前授权 ∩ 扩展已获权限组及允许 scope**。固定的 builtin 业务委托继续走其原路径。勿把桌面、Gateway 或插件的常驻令牌转交命令上下文。当前宿主有进程级 api.call，命令执行环境需移除该无上下文回落路径，区分独立插件生命周期操作与受委托调用；可用只持受限委托的命令工作进程。现有第三方插件以系统用户权限运行，此方案约束 Engine 能力调用，未建立 OS 进程隔离。
4. 每个子调用从目标 descriptor 校验输入、输出、ownership/版本和撤销。复合写在首次副作用前落父意图，子步骤使用稳定派生意图或领域回执；回顾已建但保存失败时对账原 path 后续写，不能再创建。代理的通用输出不得绕开目标结果校验。并发调用的临时上下文分别绑定，不使用进程全局“当前 caller”。
5. 从同一测试扩展直接、经代理各调用两条命令，只开其中一条。再分别撤具体命令、撤下游工具、撤插件 grant、停插件、换库、改 schema 并重连；旧名字及未完成的下一步均须复权。单测记录 handler 收到的 actor/subject/Vault 和实际写入计数。停用时应仍可预配，重启或更新后新增命令默认关。
## 组间交付与 Lead 独占写入

| 写入者 | 独占范围 | 交给 Lead 的装配内容 |
|---|---|---|
| Kernel 管理组 | 前述 system、vault、health、home、home-dashboard、package、web-share 及对应单测 | Kernel 注册调用、health extra 注入、包流与现有快照回调。 |
| 协议/会话组 | contracts 的共享调用身份、Kernel dispatcher、operation-receipts、define/exposure/shared policy、server 与 MCP 适配器、apps/cli、共享协议测试 | 统一导出 trusted context、命令委托验权与会话有效性接口。boot 装配服务、撤销和 taskScanPrincipalCurrent 交 Lead。扩展组只提交领域需求，不另写这些文件。 |
| 扩展命令组 | 前述 external-plugins、kernel/src/plugins、扩展 manifest 专有 schema、examples/plugins 与扩展测试 | 在插件安装/停用生命周期注册、清除描述和 handler。共享类型文件归协议组；需改插件中心工作台时，由 Lead 分配唯一消费者写入者。 |
| 每个领域各一组 | 各自 `plugins/<id>/` 的 descriptor、manifest、领域 handler 与同目录测试。Notes 与 Archives 同组；SSH 清单和 H11.2、Mail AI 凭据修复和开放策略、Git 与 P8.3 协同排期 | 每组交同一源导出的 descriptor 集、绑定函数及必要 owner/handler 依赖。先合现有执行者的修订再开始改相同文件。 |
| Lead | `apps/engine/src/boot.ts`、Engine/Renderer 装配、插件注册、跨插件联验及共享集成夹具 | 在 135–149 行合并静态声明；不用第二份字段手抄元数据。205 行附近的插件生命周期、222 行起和 415 行起的插件注册、459 行扩展注册与 518 行 Web 分享注册均只由 Lead 接线。 |

**现有静态覆盖。** boot:135 仅预声明 Notes 的 read，:136 取 Tasks 的部分工具，:137 取 Mail 的账号列表、刷新、最近消息、消息来源、OAuth 与 AI，:145 已取 SSH 全描述（含导入），:146 取 Safe 全描述，:147 仅取 Agent 环境，:148–149 取 Automations 环境和 taskScan。SSH/Safe/已登记 Mail AI 等沿用原 descriptor 并 bind，无需重复 declare。Inbox、Archives/其余 Notes、Guide、Versioning、Agent 与 Automations 其他域，以及 Mail 现有运行时注册的项需补齐可停用目录。每个领域交清单给 Lead；Kernel 长驻能力也要让管理目录得到完整真实元数据。注册重复/不一致必须失败。Lead 负责 `boot.ts:182` 的 Vault 包收集器，Safe 密文/必要元数据、Mail 可移植子集仍走已有快照及校验；凭据保护资料、连接句柄、恢复秘密、活动批准不可随包。仅切换描述无需改包格式。

**有两个 read 的启动副作用须连同注入方一起修。** `boot.ts:381` 的 health extra 调 `core.status()`，`plugins/agent-cli/src/engine/herdr-core.ts:131` 会 ensure；影响 health.run 和调用相同 runHealth 的 health.exportDiagnostics。改用已有 statusIfRunning，并核对冷启动结果。Agent 布局的 `readCore` 注入使用 workspaceConnection；该方法在 Core 不存在但磁盘有保存布局时会 ensure（同文件 :111）。用持久布局的只读快照或明确 unavailable；测试同时覆盖空目录与有旧布局两种冷启动。现有会话/历史列表调用的 reconcile 如需记账，放在独立生命周期内。

## Mail AI 的确认与待定事项

t11 的 P2 涉及五项。按本任务边界，已保存配置的脱敏查询、准备片段和提交片段可逐项授权，接受候选 Key 的 verify/save 两个原合同保留桌面秘密编辑。当前 `plugins/mail/src/engine/ai-settings.ts:260` 的 actor 仅允许工作台，prepare 建立待答，chat 在 :283 起消费，get 在 :309 另验工作台，verify/save 另验 desktop。现有 prepare 的输入不含片段，仅把短期 approvalId 与 actor 和配置 revision 对应。只移除三处工作台门槛会让外部调用者自己准备、自己声称“已确认”。

建议 prepare 先固定选择范围、片段与问题的摘要、模式、目标服务/模型、账号及设置版本，给用户可核对的摘要，不发送正文。由可信用户交互生成与该意图绑定且一次消费的同意证明；CLI 可在受信用户确认界面交互，HTTP MCP 可使用有认证的用户确认通道。普通工具的 `confirmed:true`、自报账号或单持 approvalId 均不足以证明人的同意。chat 复核原会话、授予、内容摘要、服务地址/模型、revision、时效和已消费状态后才发送，回执只留状态。换配置、改片段、错主体、过期或撤权均应在网络请求数仍为零时拒绝。同键并发只发一次，丢应答不得盲重试。测试采用合成正文、两个回环目的服务和合成 Key，断言回执、审计、日志、事件、包内均无明文。只在工具侧提供一份“阅读结果或采纳为草稿”，另行授权发信。

**待定，由 #6/#8 产品负责人决定**：外部可信确认界面的载体及客户端没有受信交互时的待确认/取消体验；是否为已保存配置新增一个不接受 Key 补丁的连接验证动作。上述三项的逐项开放资格可以先登记，chat 的网络副作用须等确认契约可验证后接通。#5 的本机终端规则批准同理，开放目标规则的管理/执行不赋予工具替本机用户出具批准的资格。Gateway 管理委托可授的范围、是否允许签发具有工作台权限的邀请，由 #6 负责人明确；在高权限管理主体范围明确前，不能把普通令牌的“可调用本项”当作可授无限权限。

## 双入口验收矩阵

以下步骤参数化套用到表中**每个 ID**。CLI 与 HTTP MCP 各自从头到尾跑一遍，每个入口使用独立的隔离 Vault 或重新建等价夹具；HTTP MCP 使用独立 Gateway 令牌，CLI 使用实际 CLI 连接。测试回报记录 Vault 实例、入口、凭据的非秘密标识、能力 ID、前后 revision、返回码/operationId 与领域实际变化。只存在共享策略一份。

| 场景 | 两个入口应各自取得的证据 |
|---|---|
| 默认关 → 开 → 撤 | 干净安装时管理目录可见用户动作、协议发现无该工具，已知名字直接调用也被拒，业务计数为零。可信管理端只开目标及该场景明确需要的独立公开依赖。分别经真实 CLI call 与 HTTP MCP initialize/tools/list/tools/call 完成行内动作，核对 schema 和领域结果。缓存该工具名及参数，撤销后用原连接、同一名字、原意图再次调用被拒，领域计数不增。对管理策略、停 MCP、撤令牌等会切断自身入口的项，由另一受信管理通道布置与回读状态，重建已授权测试入口后再验旧工具选择。 |
| 四类保持关闭 | 批量“全部开启”不能选中相应内部入口；尝试直接调用、经命令代理调用均无该内部副作用。经原持有人走桌面编辑、真实原生同意、内部 Tasks 委托或可信回执仍可达。关联的**用户**动作在公共高层入口跑通，两端均应得到同一业务语义。 |
| 只读 | 只开目标 read，单独验证 normal/high 交叉筛选。用冷、热两组快照比较业务文件哈希及版本，记录 Core/Agent 进程启动、SSH 新连接及远端命令、IMAP/SMTP/AI 请求、调度/通知、输入、业务写入的计数。读取已有 SFTP 数据仅允许原连接的声明读取；协议和网关审计单独计数。打开资源/模板/Widget 也重验原能力，撤权后流的下一段拒绝。 |
| 对象与并发 | 尝试同库错对象、同令牌不同会话、跨 Vault/恢复的同名对象、旧版本、旧进程代次或过期句柄，核对拒绝及原数据。过滤列表和游标后再分页。副作用成功后从所属领域回读 ID、版本与事件，桌面/Web 按事件刷新；已停用插件无活动 handler，偏好保留。 |
| C05 / G3.3 | 对标“持久/领域”的行，用同主体、同能力、同键同参并发两次，再模拟丢应答与重启。同键异参报冲突，不同意图可区分；只有一次创建/派遣/发信/启动/授权或终止。CLI 已有 `--intent-key`，MCP 已有 `_meta["huhu.dev/intent-key"]`；领域型用其 requestId/intentId/operationId 等原合同。先查现行授权再查回执。未知/输出不符时查 operation 或领域记录，禁止重新产生副作用。短时批准已失效则返回原动作已过期/未知，不能自动再签一份。 |
| 切片回归 | Notes/Archives/Inbox 检查转换唯一性、受管路径、原文和 D09 刷新。Guide 分开验清标记、备份与覆盖。Versioning 核对原 HEAD 和 remote 身份。Agent/Tasks 验指定 Space 的原终端、输入权、unsupported 以及真实回执。SSH 验同令牌双会话及文件来源。Mail 验未确认时零发送、SMTP 未知不重复。Safe 验锁定代次及审计无秘密。Widget 布局与源业务权限分别撤销。 |

**G8.1 交付条件。** 140 处的覆盖不能替代盘点现有 `exposable:true` 用户动作。已见的同域接续点有 Notes 模板/Automations 路径守卫（plugins/notes/src/engine/index.ts:115）、Tasks Agent 类型的 create/update/duplicate 守卫（plugins/tasks/src/engine/index.ts:103、:448、:464），以及 Automations 的通用 Agent/terminal 规则守卫（plugins/automations/src/engine/index.ts:29、:295、:316、:334）。这些路径要与专有入口对齐，保留原生回执和固定目标批准。域组交付时检查运行时和静态声明均为 defaultExposed=false（包括现已可选但写 true 的常规读项），校验策略初始化、管理页、CLI/API/MCP 发现、旧文案和备份格式。当前 `dispatcher.ts:147` 仅显式传 intentKey 才会走 durable，admin 平时不在 NEEDS_IDEMPOTENCY 内；外部管理/创建等新合同要让各入口传同一个稳定意图，不能只加元数据。通用 receipts 会持久化 result（`operation-receipts.ts:70`、complete），涉及 token/邀请/正文/配置值时改用领域回执或安全投影。

## 核验记录

- 使用任务给定的 grep 及独立 rg 计数得到 140。逐文件处理公共基类、覆盖与循环生成，再核对表内 302 个唯一 ID 的定义行和标记行。35 个文件、140 个标记位置集合完全相同，覆盖差集为空。35 个源文件的 Git blob 内容散列均与集成提交 `5021f54c` 相同。
- 290 项归为可选开放；12 项保持关闭，其中 8 项是有公共领域入口的内部委托或清理，1 项是可信回执，2 项是接受 Mail AI Key 编辑输入的合同，1 项是已指定本机呈现的终端规则批准。此统计按 ID 去重，含需先拆分副作用、校验对象或补安全合同的用户动作。旧单项 gateway.update 的用户动作归入统一策略变更，F01 切换后退役旧 ID。
- 本次唯一交付物为本报告。已核对源码和规格，没有运行 Vitest 或入口测试；上表是后续实现者的验收合同。工作台宿主对话框、窗口控制和系统剪贴板本身未作为上述 140 个标记行额外计数。

## Lead 验收

由 Lead 核对清单并在此追加验收结论。

Lead 验收（2026-11-21）：通过，作为 #6 开放实施清单。按「组间交付与 Lead 独占写入」切成实现任务：协议/会话组（HTTP MCP 会话身份、G3.4 扩展命令）、Kernel 管理组、各领域组（SSH、Mail、Agent CLI、Notes/Archives、Versioning、Tasks/Automations、Inbox、Guide、Safe）；health/布局读取的启动副作用随 Kernel/Agent 组修复。Mail AI 外部可信确认载体与 Gateway 管理委托范围为待产品决定，相关项先登记不接通。终端 t1j 关闭。
