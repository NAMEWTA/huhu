# P0 · MCP 来源与路由审阅

[打开 MCP 原型](prototype/mcp/index.html) · [P0 票据](tasks/019-p0.md) · [固定上游与迁移台账](../../../../docs/upstream/ledger.md#mcp-聚合来源与合同12-p0)

资源包 SHA-256 为 `35b160139f464a78f2473e07b49bd1c029e0a111f7cfe876d854871a40f954fe`，覆盖 10 个文件。下载整个目录后双击 `index.html`。继续使用已确认的工作台外壳、主题、图标和本机资源。表单、认证、检查与路由在本页模拟。执行进程、访问上游、OAuth 和持久配置留给 P1–P5。

## 交互走查

| 入口 | 路径与状态 |
| --- | --- |
| 外部服务 | 列表显示程序或 URL、传输、启用与连接、最近检查和目录数量。打开「项目索引」可检查、改名、调整配置或撤销本机许可。连接配置变化使原目录失效。 |
| 添加服务 | 选择 stdio、Streamable HTTP 或旧版 SSE。stdio 输入命令、参数和环境变量引用，保存默认停用。核对本机执行许可后检查，再启用并重新检查。新发现的条目默认关闭。 |
| 导入 JSON | 在预览前后分别观察服务列表。示例含可添加、可更新、坏字段及待处理认证。选择更新/跳过，模拟写入失败后原样重试。导出保留配置与环境引用，可下载 JSON。 |
| 认证 | 打开「文档目录 · 工作账号」，模拟 OAuth 过期、完成绑定、重查、注销；「档案目录」展示环境引用及连接离线。使用演示控件可以查看凭据宿主不可用。 |
| 能力目录 | 在工具、资源、模板、提示间切换并按来源筛选。工具页可同时看见 `vault_info`、`repo__search` 与离线的 `archive__search`；对外开放或撤销均先预览，公开路由检查会体现最新状态。 |
| 服务与权限 | 关闭 MCP 对外服务后仍可检查来源。模拟只读、无权限或停用管理插件可分别看到不同状态和操作可用性。 |

离线 `file:` 走查使用 Playwright 1.65.0／Chromium 158.0.8127.18。1440×1000 浅色与 390×844 深色通过 5 组检查，非本地请求、页面异常与横向溢出均为零。结果位于 `temp/dev/2026-11-24-issue-inventory/runs/t1ht/task07/mcp-browser.json`。

## Huhu 基线与数据所有者

本批基线是 `825b0c0327954680c1133a4307730db5e94b33ca`。#6 的能力描述符、逐项开放与 Dispatcher 鉴权已落在 `packages/kernel/src/{capabilities/define,exposure,dispatcher}.ts`；#9 的 `ModuleCredentials` 与 Engine 凭据宿主可复用；#4 的 Agent CLI/provider 接入保留现有默认隔离，生产装配和委派属于后续切片。插件使用 manifest 中的静态描述符与 `bindCapability`，由 `PluginManager` 管生命周期。协议入口现由 `mcp.ts` 与 `server/mcp-http.ts` 承载，HTTP 会话主体包含真实入站身份、Vault、服务代次、取消及恢复标志。现有内置操作结果与回执继续由 Dispatcher 提供。 [Dispatcher](../../../../packages/kernel/src/dispatcher.ts) · [模块凭据](../../../../packages/kernel/src/credentials/module-credentials.ts) · [插件生命周期](../../../../packages/kernel/src/plugin-manager.ts) · [会话入口](../../../../packages/kernel/src/server/mcp-http.ts) · [Provider 注册](../../../../plugins/agent-cli/src/engine/index.ts)

| 数据 | 所有者与不变量 |
| --- | --- |
| Source/config、认证关系及导入预览 | `plugins/mcp` 经 `VaultFiles` 版本化提交稳定 ID、namespace 与可备份配置。展示名可改。更新导入绑定预览标识、来源集和单条来源修订。配置只保存明确非秘密字段与引用，适配器须从任意 header、URL 或导入参数识别秘密并移交凭据宿主。当前公共持久 URL 合同只允许 HTTP(S) 基础地址，带目标参数的凭据解析归 P4。 |
| 认证材料 | MCP 作为 `ModuleCredentials` owner 负责账户、目标、凭据修订与发布一致性。OAuth 由现有 SDK 完成发现和交换，回调绑定登录尝试／连接／目标／配置修订。宿主无凭据保护时保留显式环境引用。 |
| Route 和 policy | 来源插件拥有按来源稳定绑定的公开映射和外部选择。策略以 `sourceId + kind + upstreamIdentity` 持久化，缺项默认关闭，提交同时核对策略与目录修订；既有选择在目录刷新后按相同身份继续判断。内置选择仍读取 #6 所有者。来源删掉后公开键不能转指另一来源。 |
| Catalog 与运行实例 | Engine 的来源插件保存可重建目录投影，包括握手、四类条目、完整性和配置／认证／目录代次。连接、进程、计时器、取消、预算和请求只在生命周期内存活。切库或停用时回收。 |
| 执行许可与总开关 | 配置指纹与认证代次绑定到本机与 Vault 实例，许可不纳入便携备份。对外总开关沿用 `GatewayTokens.mcp().enabled`。关闭只回收发布子作用域，插件停用按框架移除处理器与全部运行对象。 |

## 协议矩阵与旧入口

| 通道 | P0 合同与所需证据 |
| --- | --- |
| 下游 | 目标为 Streamable HTTP `/mcp`，使用当前生效地址与 Huhu 入站凭据。#14 U5 负责删除旧 stdio、桥接与传输选择，保留普通 CLI 和使用现有 Dispatcher 的受权 HTTP。 |
| 上游 | SDK 1.32.2，主要验收协议 `2025-11-25`。P1/P2 验证 stdio、Streamable HTTP、显式支持的旧 HTTP+SSE。SDK 还声明四个历史版本，兼容声明以完成的真实传输用例为准。自动探测仅限显式检查，不会为业务请求换传输并重放。 |
| 标准方法 | `tools/list`、`tools/call`、`resources/list`、`resources/templates/list`、`resources/read`、`prompts/list`、`prompts/get`。初始化、ping、取消复用 SDK 和宿主。P3 按已落地的通知能力宣告 `listChanged`，模板进入资源目录代次。 |
| 范围 | 暂不宣告资源订阅、roots、sampling、elicitation、Tasks、MCP Apps、Code Mode、工具搜索和只支持 2026 版握手的协议扩展。缺少必要能力时明确报告不兼容。 |

聚合通过 `McpRoutingBackend` 读取同一投影，先校验主体和精确键，再验证授权；准备连接完成后再次核对来源、发布状态、主体及三组代次，才发送原参数。内置仍通过原 Dispatcher。外部保留 SDK 原生结果和工具自身 `isError`，由来源 Runtime 处理调用状态。P0 已有可执行适配器与合同样例，真实 `createMcpServer` 装配在 P1。P3 将以源记录匹配完整 URI/模板、保持占位符并仅投影协议 URI 字段。工作台的 `MCP_STATIC` 镜像在 P3 对应真实目录接通后移除。 [公共合同](../../../../packages/contracts/src/mcp-routing.ts) · [路由后端](../../../../packages/kernel/src/mcp-routing.ts) · [工作台入口](../../../../packages/workbench/src/gateway/GatewayModule.tsx)

1. 两条目录内容均可见时，`tools/call(vault_info,{})` 给真实 Dispatcher 传 `vault.info`，返回 Huhu `CapabilityResult`。同一目录的 `tools/call(repo__search,{query:"notes"})` 以精确索引确认来源 `source:repo` 和原始 `search`，夹具收到原参数，并返回 SDK 原生内容与结构化结果。
2. 撤销 `repo__search` 后重列目录只看见内置项；已有缓存名字和正在等待连接准备的调用均返回 `not-exposed`，发送计数保持为零。恢复会话的外部工具调用在发送前拒绝，新的正常会话仍重新检查授权。 [可运行样例](../../../../packages/kernel/test/mcp-routing.test.ts)

## 管理 scope、risk 与错误

所有管理能力初始对外关闭，显式开放沿用既有能力策略与真实主体。管理 handler 仍检查 Vault 可写性、修订、任务委派及本机许可。具备管理能力的用户仍须独立确认相应本机配置授权。

| 能力 | scope / risk | 输入、输出与重复请求 |
| --- | --- | --- |
| `mcp.sources.list/get`、`mcp.catalog.list`、`mcp.diagnostics.get` | read / normal | 列表、来源 ID、目录类型或分页；返回脱敏配置、条目和诊断，含状态与修订。 |
| `mcp.sources.create/update/delete` | write / high | 稳定 ID、联合配置、预期修订及幂等意图；返回更新记录或既有撤除结果。 |
| `mcp.sources.setEnabled/check/reconnect/refresh` | execute / high | 来源 ID、配置修订及执行意图；返回启用状态、健康或目录修订，首次连接并发合并。 |
| `mcp.sources.importPreview/export` | read / normal | 输入原始导入文本或导出范围；仅返回脱敏逐项预览及标识，或可再导入配置。 |
| `mcp.sources.importCommit` | write / high | 预览标识、来源集修订、明确选择和更新行修订；返回提交后 ID/修订，重复不创建第二份。 |
| `mcp.policy.preview/update` | read / normal，admin / high | 选择条目及策略/目录修订，分别返回影响范围与提交后策略修订；撤权自提交起生效。 |
| `mcp.credentials.put/remove` | write / high | 来源、账户、绑定目标与预期修订；秘密仅由 put 接收，返回状态/修订。 |
| `mcp.oauth.begin/status/cancel/logout` | execute / high，read / normal，write / high，write / high | 来源或登录尝试 ID；返回短期登录数据与脱敏状态，一次性回调。 |
| `mcp.executionApproval.preview/confirm/revoke` | admin / high | 绑定主机、Vault、配置指纹、认证代次和范围；显式确认及撤销返回当前许可。 |

| 路由或管理结果 | 错误合同 |
| --- | --- |
| 查无条目、精确索引多义、参数错误 | `CAPABILITY_NOT_FOUND`、`NAME_CONFLICT`、`INVALID_INPUT`，区分 `unknown-entry`、`ambiguous-entry`、`invalid-arguments`。 |
| 未开放、总服务不可用、来源停用或离线 | `CAPABILITY_NOT_EXPOSED`，细分 `not-exposed`、`service-unavailable`、`source-disabled`、`source-offline`。 |
| 会话、任务授权、本机许可 | `PERMISSION_DENIED`；区分 `stale-session`、`recovered-session`、`permission-denied`、`approval-required`。 |
| 认证、协议、代次、只读 | `PROVIDER_UNAUTHENTICATED`、`INVALID_INPUT`、`VERSION_CONFLICT`、`READ_ONLY_VAULT`。配置、认证、目录失效用 `stale-route`。 |
| 发送前取消；已发送结果未知 | `ENGINE_CLOSING` + `cancelled-before-send`；`RUN_UNKNOWN` + `upstream-result-unknown`。仅记录脱敏来源 ID/关联 ID，不自动重放。 |
| 上游工具报告业务失败 | 保留 SDK 的 `isError` 及内容。 |

## 切片验收归属

| 切片 | 归属与证据 |
| --- | --- |
| P0 | 上游映射、协议与共享 schema、两个调用样例、离线交互。用户确认约束对应 UI，明确的后端合同可继续推进。 |
| P1 | 插件清单、注册、控制与发布作用域；由真实 HTTP 入口发现并调用 stdio 夹具，核对内置与外部结果和重启保留。 |
| P2 | 三传输、目录分页、稳定命名、非秘密导入及即时撤权；真实同名工具和缓存拒绝计数（A1–A4）。 |
| P3 | 四类目录、精确 URI／模板和提示，资源投影、权限和通知；同 URI 上游往返（A5/A6）。 |
| P4 | 凭据安全导入和 OAuth、轮换；两个账号、旧代次失效与合成秘密排查（A7）。 |
| P5 | 复用、故障隔离、退避、停止回收、会话恢复和审计；真实进程与次数记录（A8/A9）。 |
| P6 | 真实交互 Agent CLI、独立 CI 和正常 Task 入口的委派 provider；以目标效果和撤权计数验收（A10）。 |
| P7 | 集成方清理被替代入口与镜像。Lead 用同一候选版本串行验收桌面、Web、三上游和真实 CLI／CI／Task。 |

## 用户确认

- 2026-11-25，用户在 Lead 会话中对四套原型的确认提问回复「基本表示同意，我提出的地方请你继续优化」，未对本原型提出修改。确认版本 SHA-256 `35b160139f464a78f2473e07b49bd1c029e0a111f7cfe876d854871a40f954fe`，范围为本记录场景表所列页面与状态；后台约束仍以规格与原 Issue 为准。
