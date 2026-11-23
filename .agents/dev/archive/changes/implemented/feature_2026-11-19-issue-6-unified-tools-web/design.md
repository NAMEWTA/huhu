# #6 公共能力的所有权与调用合同

以下接口名和字段是拟议设计，行为依据见[规格](spec.md)。本设计是 #7 SSH、#8 Mail、#9 Safe 和 #10 Widget 引用共享契约的地方。

## 当前 checkout 的证据

核对版本为 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。Issue 分析的是 `913264045cee1818497a37a57715c664aa85a1ae`。后者仍在本地 Git 中。两提交间 MCP 最近笔记资源已改用 `vault.indexEntries`，Gateway 静态说明同步改动。boot 新增目录变化事件，preload 新增预览授权/撤销。宿主拆分要保留这些当前行为。[固定来源及差异编号 F01–F14](source.md)

| 观察入口（路径从仓库根起） | 当前调用链与工作量 |
| --- | --- |
| `apps/engine/src/boot.ts` 的 `boot`、`packages/kernel/src/dispatcher.ts` 的 `Dispatcher.call` | 一份 registry 和 Dispatcher 供插件、桌面、CLI、MCP 等使用；身份来自凭据。boot 还提供独立的 visibleTo。Dispatcher 校验输入并执行 handler，成功返回 data。幂等覆盖 write/execute，admin 及输出校验有缺口。超时已有 unknown 语义。 |
| `packages/kernel/src/capabilities/define.ts`、`exposure.ts`、`capabilities/system.ts` | `CapabilityRegistry.declare` 只保留 name→plugin；停用后无法据此还原 schema。`ExposureStore` 读写 plugins.json，解析错误退回默认；`gateway.get` 返回空 exposure，`gateway.update` 拒绝不可外露项。原先已共享逐项偏好。 |
| `packages/kernel/src/mcp.ts`、`apps/cli/src/mcp.ts`、`apps/cli/src/commands/call.ts` | 两种 MCP 共用 createMcpServer；stdio 通过普通 `capabilities.list` 发现，监测名字变化；HTTP 读 registry。名称换下划线，返回文本 JSON。callCapability 每次产生新意图 key。 |
| `packages/kernel/src/server/http-app.ts`、`server/ingress.ts`、`apps/engine/src/boot.ts` | startEngineServer 监听回环，checkIngress 校验 Host/Origin，终端 WS 按 desktop 身份判断。MCP HTTP 判断开关及 transport。现有 loopback 地址不能直接给 LAN 浏览器。 |
| `packages/workbench/src/gateway/GatewayModule.tsx`、`engine-client/client.ts`、`apps/desktop/src/renderer/main.tsx` | 管理页用 DataTable、ChoiceSwitch、MCP_STATIC 和逐项写入。EngineClient 用 endpoint/token、crypto.randomUUID，EventStream 支持重新同步。renderer 从 window.huhuHost 启动。`plugins/ssh/src/ui/FilesPanel.tsx` 自行读取 host 对话框。 |
| 领域和扩展 | Tasks、Automations、Notes 的 `src/engine/index.ts` 仍有 caller 守卫；HerdrCore 的 status 路径调用 ensure；SSH 和 Agent 的 manifest 分别列 21 和 25 项。扩展用户命令由 `packages/kernel/src/capabilities/external-plugins.ts` 代理，插件权限另在 `permissions.ts`。`plugins/mcp/src/engine/index.ts` 是占位。 |

## 两次调用推导出的接口

**在桌面开启两项，然后在 CLI 读取笔记。** 用户会话读到策略 revision=12，提交 `policy.update(expectedRevision=12, changes=[notes.list→true, notes.read→true], intentKey)`。Kernel 先校验整批 descriptor 身份与权限，Vault 单写者提交一次，返回更新的 ID 与 revision=13，并通知订阅者。CLI 用外部调用身份在同一 Vault 查询列表，MCP 可发现同名、同 schema 的工具。另一个页面仍以 12 提交时得到版本冲突及当前 revision；本次选择留在草稿。已提交但应答丢失时，同 key/同输入返回已提交结果或对账标识，无第二次版本递增。

**从 LAN 浏览器编辑已有任务。** WebHost 将同源会话绑定的 Vault 代次、任务 ID、expectedVersion、修改内容与操作 key 交给 Dispatcher。任务 handler 拥有任务版本，返回新版本并发布业务事件。桌面收到事件重取这一实体。外部关闭了该工具时浏览器用户仍可编辑；从关闭项的外部令牌发同一请求则收到授权错误。若切 Vault 或另端先修改，分别返回会话过期或版本冲突。刷新重读实际任务，禁止把失去应答当成新意图重放。

## 组件与依赖方向

| 所有者 | 最小输入与输出 | 生命周期 |
| --- | --- | --- |
| contracts + Kernel 注册器 | 每个用户操作声明稳定 id、plugin、title/description、scope、risk、输入/输出 schema、真实副作用和重试语义。静态描述可独立枚举，活动时绑定唯一 handler；重复 ID 或声明不一致在绑定时失败。 | 目录 revision 随描述、schema 和可用集合变化。插件停用释放 handler，保留已安装描述。 |
| Kernel 策略服务 | 管理 catalog 包含 descriptor、catalogRevision、policyRevision、selected（true/false/未配置）、plugin/handler/入口状态、effective 与 reason；policy.get 返回真实快照。check(capability, trustedContext, resource) 得到判定且零业务副作用。discover 生成可执行投影。 | Vault 独享的一份 choices 和 revision。插件启用、入口监听、资源可用性分别由其所有者上报。外部授权变化不会改动插件或运行对象。 |
| Dispatcher 与领域 | call(capability,input,requestId,intentKey?)；信任上下文由适配器认证并绑定 actor、入口、Vault 代次及资源，忽略自报 caller。返回 data 或 code/retryable/details/operationId。业务错误与协议握手错误分层。 | 再次使用相同判定，依次验证输入、领域前置条件、结果。外部观察/控制权限同样约束流。执行状态与取消归领域。 |
| Engine | 为打开的 Vault 组装上述服务、插件实例、事件流和 listener；响应 start/stop/status 并返回实际监听地址、端口、范围、代次及失败原因。 | 控制 listener 继续供桌面/CLI/MCP。Web listener 独立启停，Socket 和 session 均关联 listener 与 Vault。Web 入口不转发 MCP。 |
| 适配器与宿主 | MCP stdio/HTTP 和通用 API、CLI 只做认证、协议发现、参数/文件输入、输出和流适配。CLI 支持 list/describe、文件/stdin、JSON 和稳定 key。共享工作台经 DesktopHost / WebHost 做引导、文件选择、打开链接和复制。 | DesktopHost 使用现有 preload。WebHost 用同源引导和文件流，从真实来源推导 WS/API。工作台不持有业务副本。 |

协议名称采用 canonical ID，注册时检查唯一性及协议命名约束；MCP 资源、prompt 与工具说明共用声明。schema 描述对象型 MCP 结果时，给已有数组或标量业务结果一个可逆的对象包装，并让声明和 structuredContent 一致。兼容文本内容从同一成功结果序列化。注解基于真实语义；具有重试 key 的操作也可能有副作用。锁文件及 notices 记录现有 MCP SDK 1.32.2、Hono 4.13.17、Zod 4.6.7 的 MIT 许可。沿用当前锁定依赖；上游源码按 `temp/sources` 实际默认分支检出和[批次来源清单](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md)核对，历史 Issue 引用用于追溯。下方链接是原协议对照。[MCP 工具规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

**消费边界。** #7 提供 SSH 主机、连接、等待项、文件和会话的 descriptor/handler；#8 提供 Mail 账户、消息及同步状态；#9 提供 Safe 锁定态、摘要和独立显式查看；#10 提供布局/实例，订阅其业务插件的授权快照。方向均为“领域向 Kernel 登记 → 宿主或适配器调用公共能力 → 所属领域执行业务”。Kernel 不导入这四个插件的具体实现。#4/#5 拥有会话、run、可信回执及恢复决策，#6 处理外部访问。按插件授权的内部业务委托与任意命令代理分别处理。raw 文件编辑须回到 KINDS 对应领域；目标版本、作者、归属和事件在语义写入处检查。

## 存储、协议与故障窗口

- 策略建议落在 `<vault.stateDir>/gateway/tool-access.json`。每个 Vault 对批量写串行化，在同一临界区比较 revision、验证明确 ID、持久化及发布快照。可借用 `packages/vault/src/write.ts` 的 expectedVersion 与 write-file-atomic 思路，单独串行保护读改写。临时写失败维持旧版本与旧内存。替换成功、通知前崩溃，重启从磁盘恢复，客户端按 revision 重拉。
- 首次初始化按[首次策略](spec.md#同一批选择怎样生效)保存当时目录的关闭选择；以后新增项未配置即关闭，插件停用保留选择。原文件损坏不可走首次初始化，留存可恢复数据并显示修复状态。已开过“全部”的旧快照不能自动授权后来加入的工具。并发目录变化下按提交时的明确目标核验，消失的目标导致整批失败。
- 请求 ID 用于追踪，幂等 key 代表同一调用者的一次意图，实体版本用于并发写，operation/run ID 指向已接收业务。key 按 Vault、调用主体和能力隔离，绑定输入摘要，异参冲突。先判现有权限再返回重试结果；日志与幂等缓存不得持久保存明文秘密。管理变更也按副作用纳入。领域在接受长操作时登记句柄；在发出副作用与写回确认之间崩溃，优先查领域记录，只能证实未知时显示 unknown。查询或传输断开与取消业务有各自语义。
- 按[局域网邀请](spec.md#桌面分享当前工作台)用有效邀请建立独立的 listener/Vault 会话，兑换不消耗邀请。重取指向当前有效邀请；显式撤销先使其无法再建会话，撤销与建会话由同一所有者串行裁决。会话记录来源邀请 ID，撤销按该 ID 注销全部衍生会话并关闭其活动流。其他邀请的会话与其他入口继续可用。浏览器在建会话后清除地址中的邀请值，后续按服务实际 Origin、Host 与会话认证 HTTP 和 WS。工作台静态包不含 Engine descriptor/桌面令牌。Web 停止、重启或切 Vault 时结束原服务代次，使其邀请及会话均失效。Boot 返回的 URL 能打开首页；深链与静态文件分类，缺 JS/CSS 返回资源错误。文件流带明确来源、方向和句柄，跟踪传输终态。普通 LAN HTTP 不提供链路加密，验证时分别记录本机与第二设备的地址、宿主能力和实际复制结果。
- 桌面锁定 Electron 44.9.1，对应 Chromium 152.0.7977.167。Web 按 Baseline Widely available。共享表格沿用 DataTable，将批量选择绑定到数据 ID 集合；窄屏可键盘滚动，有列头和可辨识的行操作。确认对话框复用项目 Dialog 的 showModal、标题关联和焦点恢复。普通 LAN HTTP 若缺 clipboard.writeText，显示可选可复制的原文；randomUUID 不可用时用 getRandomValues 生成意图标识，重试仍传原 key。桌面 API 与普通浏览器分别验收。已检索并获取 responsive-table、dialog、html、accessibility；尚无运行截图。[Electron 发行记录](https://releases.electronjs.org/release/v44.9.1) · [showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) · [Clipboard](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) · [randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) · [getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)

**判定示例。** 停用插件且工具已选，管理目录仍返回 selected=true、有效状态“插件停用”；插件恢复后按现行选择计算。插件已运行、MCP 选用 stdio 时，HTTP MCP 报传输未启用，独立 CLI 仍按自身已认证连接调用。停用 MCP 后连着的 stdio 客户端也失去发现/调用通道。已知能力未开放、能力不存在、缺运行依赖、版本冲突与结果未知分别可机读；单独校验 settings 查询与真正修改设置的 scope。

**受管文件示例。** 从笔记页保存任务原文时，文件归属路由保留原主体，交给 Tasks 做 expectedVersion、内容和可信状态校验。内部高层业务委托与可任选目标的通用代理使用不同入口，用户仅开启一项低层写文件工具不能改写被关闭的目标操作。

## 架构取舍

| 候选 | 两个调用场景的代价与选择 |
| --- | --- |
| 在各传输适配器生成目录并在调用前过滤，管理页直接操作 registry | 可局部扩展现有 HTTP/stdio，但停用元数据、直接调用、旧缓存、流授权及扩展命令都要跨适配器对齐。策略冲突和故障需在每个入口复核。 |
| **推荐** Kernel 持有静态目录和唯一调用判定，Engine 注入同一实例 | 两个场景都能按同一版本解释发现/调用差异。代价是拆出静态描述、迁移全部注册者及集成一组跨入口故障验证。适配器仍负责 MCP/CLI 格式。 |
| Web 单独运行工作台后端，代理或复制桌面状态 | 可独立部署，但要转发事件、终端、凭据及运行所有权，跨 Vault 恢复复杂。 |
| **推荐** 同一 Engine 内增加 Web listener，共享 App 并注入宿主 | 共用现有 Vault 写者和领域服务；需处理监听器独立清理、不同来源策略、浏览器传输、桌面资源预览及打包深链。两种 listener 分别报告真实状态。 |

## 产品决定与待决范围

> 2026-11-21 用户采纳本表全部推荐项，定案见[批次决定](../../../../changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)。


| 问题 | 选项、建议及代价 | 前提及阻塞范围 |
| --- | --- | --- |
| Q6-1 首次工具选择（已定） | 见[首次策略](spec.md#同一批选择怎样生效)。 | G2、G4 按干净 Vault 验收。 |
| Q6-2 邀请有效期（已定） | 见[可重复邀请、重取和独立撤销](spec.md#桌面分享当前工作台)。 | G6 核对两个浏览器先后加入和失效后拒绝。 |
| Q6-2a 撤销影响（已定） | 见[按邀请断开现有会话](spec.md#桌面分享当前工作台)。 | G6 以两份邀请、三个浏览器会话验证隔离。 |
| Q6-3 SSH 是否还需按已保存主机缩小外部资源范围？ | #7 §12.2 将该项列为可选。建议把可授权开发主机的选择落在 #6 的同一判定中，保存稳定资源 ID；另一选项是沿用已有业务对象归属与工具级选择。前者可区分主机，新增一组选择与撤销用例。 | 与 #7 对齐产品对象范围后定。仅阻塞资源选择 UI 及相关外部验收，主机信任和操作归属检查始终适用。 |
