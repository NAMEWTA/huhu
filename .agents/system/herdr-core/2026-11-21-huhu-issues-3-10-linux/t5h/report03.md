# H3.3 出站代理与受控中继复用分析

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t5h`，本机 Core `wta-ubuntu`，Lead `t3p`
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task03.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report03.md`
- 执行结果 — `done`（只读架构分析）
- Huhu 基线 — `e71f47b0dedd323a69c4861f6bc808a450603e44`，工作目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`。以下 Huhu 路径与符号均相对此提交。
- 对照基线 — Motty `v0.4.12`，`102228261703d8f22c5eb98b1c500e2a24889dee`，本机镜像 `/home/wta/projects/huhu/temp/sources/motty`。[固定提交](https://github.com/t8y2/motty/tree/102228261703d8f22c5eb98b1c500e2a24889dee)

## 交付判断

**第一片应交付可实际使用的首段 SOCKS5 / HTTP CONNECT。** 用户在 SSH 路由页给 Vault 设置默认代理，或给目标主机选择继承、直连或覆盖。连接详情应能回答“哪个配置生效、从哪里拨到哪一跳、在哪一步失败”。工作台、草稿、CLI、MCP 和专用连接都经过同一个 SSH Manager。实现只需让首跳也能拿到一条双向字节流，后续每跳继续使用现有 ssh2 Client、主机密钥核验、认证和通道管理。SOCKS5 有已锁定的库，HTTP CONNECT 有 Node 原生接口。引入独立代理进程会增加进程、凭据交接及取消的所有权，当前没有这项需要。

R04 的本机 ProxyCommand 和 R05 的 ViaShell 分别需要本机程序授权和远端跳板授权，应独立交付。第一片完成后可验收 R04 的网络代理部分。A03 的整项验收还要把两类中继的运行证据与 H3.2 路由编辑、批量启停、拒绝循环的既有证据合并。三跳指 A、B、C 三个跳板，另外还有目标 T，共四次 SSH 握手。需求依据为 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/{source.md,spec.md,tasks/H3.3-route-attempt.md}` 的 R02–R06、H09、P07、A03，以及 `2026-11-19-issue-6-unified-tools-web/tasks/{G2.3-effective-access,G3.3-intent-outcomes}.md`。

## Huhu 的调用路径与改动落点

| 固定基线的文件与入口 | 已有行为 | H3.3 的落点 |
| --- | --- | --- |
| `plugins/ssh/src/shared/route.ts`、`engine/route-edits.ts`、`ui/RoutePanel.tsx`（后两者同属 SSH 插件） | 已有“目标→直接跳板”关系、递归展开、循环检查、批量改动及停用。 | 保留一份关系。首段代理取最终目标的选择；跳间中继挂在一条已有的“目标→直接跳板”关系上。改父跳板时重新确认对应中继。 |
| `plugins/ssh/src/engine/manager.ts` 的 `begin/doConnect/dialChain/connectHop`，约 331–445、615 起 | 首段无 sock 时 ssh2 用 host/port 拨号。每跳各建 Client，用该跳配置独立核验主机密钥和认证；后续通过上一 Client 的 `forwardOut` 得到流，作为下一 Client 的 sock。 | 保留直连分支。在首跳认证回调已取得当前配置、准入复核通过后，由 Engine 按快照取得代理流交给同一 `connectHop`。跳间仍按原有回调推进。逻辑端点、known_hosts 和提示都指向 SSH 主机，代理另作传输信息。 |
| `engine/host-configurations.ts`、`draft-connection.ts`、`identity-certificate.ts`、`patches/ssh2@1.17.0.patch`（前三者在 SSH 插件） | 已保存主机通过 `withManagedAuth` 读取逐跳身份，草稿的目标走草稿 authenticate，已合入的证书沿原 Client 提交。 | 保留这些认证分支、证书／裸钥选择、交互提示与 keepalive。草稿用本次目标选择加已授权的跳板；只测试，不发布配置、不借已打开的终端。 |
| `manager.ts` 的 `openExternalConnection/testDraft/acquireTransport/openForwardDial`，约 275、450、521、576；同目录 `public-{files,shells,forwarding,monitors,jobs}.ts` | 外部连接有独立 attempt/abort/validate；工作台转发和监控可借用适用连接或取得分域专用租约。专用拨号也进入 dialChain，目前取得租约末尾才有一处 identity 复核。 | 注入统一快照和逐步复核，覆盖所有入口。文件和 shell 使用拥有者绑定的连接，转发和监控复用已有租约规则，确保新借用与实际路由相符。 |
| `engine/forward-proxy.ts`、`forward-listener.ts`、`proxy-share.ts` | 前两者处理“本机接受代理请求，再由 SSH 通道连目的地”；分享功能给远端提供本机代理入口。 | 保留原方向与监听生命周期。H3.3 首段由 Engine 作为客户端主动连接代理，没有监听端口。 |

## 配置、账号与版本

| 配置位置 | 应保存的内容 | 拨号时的决定 |
| --- | --- | --- |
| Vault 的 SSH 默认设置 | 在 `plugins/ssh/src/{shared,engine}/preferences.ts` 的既有版本化格式中增加“直连或指定代理配置引用”。旧文件缺此字段视作直连。 | 最终目标选继承时读取。用 `get()` 的严格解析行为；当前 `runtime()` 会吞解析错误并返回默认值。损坏、引用不存在、凭据锁定或授权失效应在拨号前报错。 |
| Vault 的 SSH 主机定义 | 目标主机持有互斥的 inherit / direct / override(profileId)；旧主机缺字段视作 inherit。SSH 路由页和主机编辑器写同一份定义，以已有 expectedRevision 保存。 | 有跳板时选择 T 的策略，但代理收到的目标是 A 的实际 host/port；没有跳板时才是 T。A、B、C 各自主机的出站覆盖只在其自身作为最终目标时生效。显式 direct 不受全局变动影响。 |
| SSH 代理配置及设备凭据 | 建议参照主机与密钥库，在 SSH 域增加专有 ModuleCredentials owner（如 `ssh.proxy`）。可移植定义存协议、主机、端口、认证方式、规则和配置标识。将代理账号与口令作为同一登录绑定的私有材料。 | 仅在 Vault writer 的 `use` 回调中交给对应代理。绑定协议、规范化端点及登录身份代次；改址、改协议或改账号时重设绑定，两项凭据一起切换。外部视图至多返回“需要配置/可用”等授权内摘要。 |

凭据依据为 `packages/kernel/src/credentials/{module-credentials,versions,protection}.ts`。可移植定义含 revision 和已配置的 purpose；私有快照及加密版本存在 Vault 外的 localRoot，按本地 Vault 实例和 owner 隔离，数据密钥受本机 protection 管理。复制 Vault 到另一台设备可以看到代理定义，实际拨号需设备可解锁且绑定完整。复用现有版本化 save/use、CAS 和固定版本读取。先保存配置及账号，再 CAS 发布全局或主机引用；引用失败时旧指向仍有效，删除仍被引用的配置要拒绝或先显式解绑。凭据值、可猜测口令摘要和带 userinfo 的 URL 不进入 preferences、主机记录、回执、时间线或 renderer 存储。SOCKS 用户口令和普通 HTTP Basic 在 Engine 到代理这一段自身不提供传输加密，应在设置中标明。

**路由版本必须覆盖一次拨号真正使用的输入。** `engine/workspace-target.ts` 现用主机 ID、地址、端口、用户和 directJumpIds 标识逻辑工作区，`connectionIdentity` 使用各跳 id/revision。外部 `engine/public-resources.ts:137` 以 workspaceTarget 和各跳 revision/configId 计算 routeRevision。这三处目前都看不到全局代理。建议以一个确定性函数解析同一份非秘密快照，供 `resourceView/visibleSshRoutes/readBoundRoute`、Manager 和池使用：

- 保留已有有序主机链和配置版本检查。补入目标选择模式、实际首段方式、所用 profile ID／端点／认证绑定代次、命中绕过规则的结果，以及每条跳间边的方式和配置代次。后续本机程序批准或远端中继批准改变时也更新其所依赖的版本；公共版本只输出不透明值。便携定义可见性与本机批准/凭据可用性分别核验。
- 首段继承的目标随默认代理变动而变化；显式直连和独立覆盖不随无关全局改动变化。覆盖和继承即使今天指向同一代理，也保留来源差异。轮换所用代理账号/口令会换版本，修改无关设置不应导致所有继承目标断流。上游支持显式 bypass 的确切主机/IP、域后缀、CIDR；若纳入该片，只对第一 TCP 目的地求值、显示命中、计入所选规则版本，不读取系统环境变量来猜策略。未实现的 bypass 字段不能保存为已生效。
- 保留工作区标签的逻辑目标。已连工作台会话显示建连时的实际路径，路由编辑影响新连接；旧连接上的已开终端可继续用。若旧连接与新拨号要并存，用各自 connectionId 持有，避免 hostId 槽替换时关掉旧终端。待拨号也要按有效版本和拥有者合并，避免 `begin` 仅按 hostId 加入旧任务；旧 promise 的 finally 只删除自身。新的文件绑定、工作区借用或专用租约按所请求的版本匹配；显式关闭只释放相应持有者。给旧直接路由保留旧版本算法或明确要求外部刷新一次，两种迁移均不能使旧回执再拨号。

## 首段传输的实现选择

| 方式 | 可复用的实现与限制 | 交付条件 |
| --- | --- | --- |
| SOCKS5 | `pnpm-lock.yaml` 锁定 MIT 的 `socks@2.8.10`，由 `imapflow@2.12.1` 间接引入。`plugins/ssh/package.json` 当前仅直接声明 ssh2 等；应将 socks 精确版本声明为 SSH 插件的运行依赖并核对打包。用公开的 SocksClient CONNECT，支持域名、IPv4、IPv6 和代理认证。 | 库有超时但无 AbortSignal。由 Engine 持有代理 TCP socket，建立后交给 `existing_socket`，从建连起接入取消、截止时间和关闭清理。锁版 `build/client/socksclient.js` 成功后以延迟回调发出握手后余字节并恢复流；在异步交接前就接住这些字节，或用有界缓冲和背压桥接。不要将包含 options 的库异常原样上报。 |
| HTTP CONNECT | Node 原生 `http.request` 支持 CONNECT 和客户端 `connect` 事件，直接得到 response、socket、head。锁定的 `http-proxy-agent@7.0.2` 服务于 HTTP 请求，`https-proxy-agent@7.0.6` 服务于 ClientRequest，其失败路径还能返回承载错误响应的替代 socket。直接使用 Node 接口更贴合 ssh2 的裸流输入。 | 独立请求，禁止跨身份复用 Agent，限制响应头长度和总时限。authority 使用首段目的 host:port，IPv6 加方括号，域名交代理解析。认证仅发往选中代理；只把 2xx 交给 SSH，407 与其他拒绝分别记录。交接前保留 head 中的 SSH 首包，错误、取消或迟到的成功均回收 socket。 |

两者都要在 DNS、代理连接、代理认证及 SSH 交接边界识别取消；代理失败终止当次尝试，禁止触发隐式直连。超时预算从本次首段拨号开始。保留原来各跳的认证／信任超时。实现时在凭据回调内映射传输异常为受控结果，再转换为领域错误；`ModuleCredentials.use` 会把直接抛出的回调异常统一为 operation-failed。协议与实现依据见 [Node HTTP 客户端 connect 事件](https://nodejs.org/docs/latest-v24.x/api/http.html#event-connect)、[RFC 9110 §9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)、[SocksClient 发布项目](https://github.com/JoshGlazebrook/socks)。

## 每次尝试的授权与时间线

**外部连接沿用 #6 的能力、主体、资源和意图合同。** `plugins/ssh/src/engine/index.ts` 在 `ssh.connect` 分派工作台和外部请求。`public-resources.ts` 要求有效 caller/subject，MCP 还要求 session，并核验全部链上主机都在 `ssh.hosts` 选区。外部先读 `ssh.resources.host.get`，再带 hostId、routeRevision 和领域输入 intentKey 调用 `ssh.connect`。已发布策略允许使用经批准的网络代理时，调用者只引用主机路线；普通连接授权不赋予写全局代理、读代理账号、运行本机程序或更换中继的能力。现有 `ssh.settings.update` 会直接调用 preferences.update；新增敏感设置需独立限制写入口，并同样检查 `ssh.hosts.configure`、草稿、导入及同步入口。

`public-probes.ts:123` 起按本地 Vault 实例、外部 owner、能力和 intentKey 保留回执，claim 绑定输入及获准主机集合。已存同键同输入可返回原 attemptId；改输入走 idempotency mismatch。失去活动记录或重启，应按现有 unknown/operationId 对账，不能静默重开。旧回执分支目前核验旧资源集合和 revoked；在继续使用连接、答提示或产生副作用前还要重读当前生效路由和策略。新版本要以新意图发起。通用 #6 的 CLI `--intent-key` 和 MCP `_meta["huhu.dev/intent-key"]` 是通用操作合同；本 SSH 入口沿用现有领域输入字段，勿以适配器重试生成新键。

连接、等待信任和答复保留 attemptId、hop、promptId 及主体边界。桌面已有连接或已答提示不能替另一外部主体完成认证；外部主体间也不能借用流。已有明确授权的工作台管理动作按原规则保留。每次副作用开始前，以及异步返回但尚未交付流时，再验证 signal、权限、routeRevision 与凭据绑定；涵盖向代理发送凭据、把流交给 SSH、开下一跳、回复信任/OTP 和打开后续通道。在网关撤权、主机变化外，代理设置、配置版本和后来增加的中继批准变更也应触发相关外部连接复核。撤权回收该主体的资源，保留其他持有者。

`plugins/ssh/src/shared/trust.ts` 与 `engine/manager.ts:223` 已有逐跳 dialing、trust、authenticating、answering、forwarding、connected、failed 和有上限的 timeline。正常工作台连接创建 attempt.route；草稿、外部和专用拨号尚未一致初始化，`public-probes.ts` 的状态投影还会略去逐跳进展。把采集提前到共同入口，按已实际开始的 hop/edge 追加事件，在工作台与受权外部状态中分别投影。同阶段去重时保留边的开始和结果。建议显示以下字段：

| 场景 | 时间线应能读出的事实 |
| --- | --- |
| T 继承代理 P，首段代理超时／407 | 策略来自 T 的 Vault 默认；Engine 本机连 P，请求 P 连 A；失败发生在本机至 A 的代理建连／认证阶段，A 尚未完成 SSH 握手，B/C/T 无运行事件。配置路径可单独预览。 |
| A 到 B 的通道成功，B 拒绝主机密钥／认证 | 通道由 A 打开，SSH 信任或认证失败归 B；显示 B 的身份与阶段，C/T 没有开始。保留现有指纹和提示关联。 |
| 后续启用 B 到 C 的受控中继 | 显示配置归属为 C 的入边、实际执行位置为 B；区分中继握手失败和中继已就绪后 C 的 SSH 失败。工作台重开状态仍显示实际快照。 |

时间线使用阶段、时间、已授权的显示名、错误码与端点角色；不收集代理响应正文、代理认证头、进程参数、stderr 或终端横幅。终端/文件/监控/转发可引用同一连接的实际路径；专用连接各自记录。终端数量、SSH 连接数量及中继内部通道数量分别计数。

## Motty v0.4.12 逐文件对照

| 固定提交内文件 | 已核对的行为 | Huhu 可采用的部分 |
| --- | --- | --- |
| `internal/workbench/outbound_proxy.go` | 表单及保存层区分全局、主机直连和覆盖，代理密码有独立 secret；`proxyRouteKey` 纳入协议、地址或命令、用户名及 bypass。 | 保留三态和来源，采用 Huhu 的不透明凭据代次，避免直接展示上游内部 key。 |
| `internal/workbench/connection_catalog.go` | `proxyForHost/sshConfigFor/addRelays` 在建连时为目标求策略、展开跳板、装配各跳认证及 relay，把变动反映到连接复用判断。 | 借用解析时机和“入边归属”，复用 Huhu 既有主机图。 |
| `internal/sshconn/conn.go` | `dialTCP` 仅在第一段调用 Proxy.Uses/DialAs；`dialHop` 根据下一端点配置选用跳间通道，随后独立 handshake。 | 在 Manager 两个现存流交接点分别选传输，保留每跳 H3.1 核验。 |
| `internal/sshconn/proxy.go` | SOCKS5 与 HTTP CONNECT 求值、认证、超时及取消；CONNECT 头有 8 KiB 上限，成功后保留已读的目标字节；bypass 作用在真实首段地址。 | 将拒绝、早到数据、取消和地址族转成契约用例，协议实现采用 Node 与锁定依赖。 |
| `internal/sshconfig/sshconfig.go`、`internal/workbench/host_import.go`、`internal/workbench/agent_mcp.go` | 导入识别 ProxyJump/ProxyCommand 的优先关系；导入命令待显式确认；agent 的连接环境显式拒绝本机 ProxyCommand。 | Huhu 的导入预览、持续同步和运行批准保持独立，CLI/MCP 的资源授权不包含执行本机程序。 |
| `internal/sshconn/proxycommand.go`、`proxycommand_other.go`、`proxycommand_windows.go` | 本机展开受控占位符，限制命令 2048 字节、stderr 尾部 4 KiB，以 stdio 为数据流。POSIX 采用 shell 和进程组，Windows 走原生进程，可用时以 Job 管理进程树。 | 沿用归属、清理、错误分类和有界 I/O。Huhu 最小方案以结构化程序和参数启动；平台未能保证清理时不宣称支持。 |
| `internal/sshconn/shellrelay.go` | `dialRelay` 在上一已认证的 SSH Client 上另开专用 shell/PTY；可有 prelude，命令模板共用上游 token 校验。就绪检测、随机标记、目标 SSH 版本前缀及预读字节共同界定交接，整段启动有 30 秒上限，诊断缓存上限 64 KiB。 | 采用有界握手、取消与独立目标验钥。远端专用配置与本机进程权限分开；上游共享展开函数不意味着 Huhu 可以交换两类模板或批准。 |
| `internal/sshconn/{proxy_test,proxycommand_test,proxycommand_unix_test,shellrelay_test,shellrelay_unix_test}.go`、`internal/workbench/{outbound_proxy_test,connection_catalog_test,proxy_relay_test}.go` | 分别覆盖协议、程序生命周期、shell 握手、策略与边选择。 | 用作回环故障条件的来源；Huhu 的正常入口、设备凭据和 #6 幂等仍需由本仓库的测试验证。 |

### 后续两片的最小生产合同

**本机 ProxyCommand（R04）。** 默认关闭。OpenSSH 导入仅显示原文和来源，保存主机、预览、同步、草稿自动准备都不能启动程序。现有 `plugins/ssh/src/engine/import/openssh.ts` 报未解析路由，`engine/config-sync.ts:56` 对作用域内非 none 的 ProxyCommand 拒绝该 Host 块的 ProxyJump 同步，应保留诊断。用户须在受信桌面为本机重新选择固定的程序和参数模板，看到首段 SSH 端点、运行设备及适用目标后显式批准。批准绑定设备、系统用户、本地 Vault 实例、程序身份和模板版本；同步来的文本、别的设备或已变化的程序都需重新配置。可移植记录仅引用配置；本机负责核准和解析。程序执行入口由 Engine 独占。

最小实现用直接创建进程和结构化 argv（shell 关闭），仅在参数槽中解析允许的 %h、%p、%r、%%，取值来自固定快照的首段端点。拒绝未知 token、控制字符、能变成程序选项的非法端点和超长输入。不解释任意 OpenSSH shell 表达式；不兼容的导入项明确保留待处理。清理继承环境与工作目录，使用受控 stdio；stdout 专供字节流、stderr 限长并脱敏。进程创建失败、提前退出、无握手、超时、调用者取消与最后释放均有结果；回收整个受管进程树，异步迟到不得重新激活。CLI/MCP 首版对需要本机程序的路线返回不可用，即使已获得全部主机授权。回环验收用预置无害 fixture，只在明确点击连接后增加启动计数；展示/导入/同步/未批准草稿/外部请求计数均为零，改模板或程序身份后旧批准失效，取消后检查子进程、管道及句柄归零。

**远端 ViaShell（R05）。** 默认沿用 direct-tcpip。仅在管理员明确允许中继的堡垒机上，由受信桌面为指定的“上一跳→下一跳”配置固定中继方式，并展示实际执行主机、目标端点和适用操作。最小版本只接受已批准的中继配置和有类型的目标槽；不提供自由 prelude、临时命令或从调用输入选择目的地。即使两者都包含主机/端口占位符，也按远端中继自己的 schema 和作用域从下一跳取值。本机程序批准不能授权远端中继，普通通道被拒也不能自动切换到中继。首版如未建立单独的外部中继授权，外部请求应在开通道前终止。面向转发功能时还应遵守 P07 的模式范围，Remote 规则不接受此替代。

上一跳已通过信任与认证后才能建立专用通道，按远端配置确认握手完成，将完整的下一跳字节流交给该跳自己的 ssh2 握手。控制阶段限时、限量，能处理分块和同包首字节，未就绪、拒绝、提前 EOF 分别报告，关闭/取消立即释放通道。不会打开可见终端、篡改已有终端、创建可见 shell 会话或增加用户终端计数。回环用专门授权的模拟跳板，仅接受已登记的固定测试端点；分别模拟成功、标记分片、错误标记、超时、取消和中途关闭。以堡垒机通道计数与下一跳独立指纹证明运行位置，核对本机进程计数保持为零。

## 建议的回环验收与证据

以下是实施后的验收设计。本次只读了源码与既有测试，未经运行的场景没有计作通过。

1. **搭建拓扑并建立对照。** 扩展 `plugins/ssh/test/fake-server.ts` 和 `manager.test.ts` 现有跳板用例。使用独立临时 Vault、回环代理 P 和四个不同 host key／账户的 SSH 端点 A/B/C/T；给 A→B、B→C、C→T 各维护接受次数和目的。复用现有路由编辑只保存 T→C、C→B、B→A。先直连 T（一次握手），再跑完整链（四次握手、三次跳间通道）；区分已启动的跳与配置预览。用已合入的 `identity-certificate.test.ts` 保护现有证书传递路径。
2. **首段策略。** 分别让 T 继承 SOCKS5、显式直连、覆盖为 HTTP CONNECT，记录 P 实收目的 A 和各跳的认证/信任时序。直连模式代理计数为零。用仅代理夹具能识别的测试域名验证解析位置，并覆盖 IPv6 authority、匿名/凭据认证、407、SOCKS 拒绝、慢响应、同包 SSH banner、超时与取消。代理失败要求 A/B/C/T 均无 SSH 认证，不能另发直连。轮换账号和切换来源后核对 revision；复制 Vault 到未绑定设备，要求发送凭据与拨号计数均为零。
3. **沿正常入口取得真实结果。** 仿照 `tests/e2e/ssh/entry-parity.spec.ts`，通过桌面配置策略 preview/update 并选择整链资源。分别由 CLI 的 `call … --vault … --input-json …` 和已初始化的 HTTP MCP session 的 `tools/call`（工具名由能力名的点转下划线）读 host.get、发 ssh.connect、读 connection.get、回复同一 attempt/hop 的信任请求。工作台和草稿从各自现有入口发起。用末端 T 返回的独有内容验证终端、文件与命令；用 `plugins/ssh/test/forwarding.engine.test.ts` 的回环 listener 和监控现有采集入口核实实际流量、实际 SSH 来源与租约。三跳图只配一次，分别覆盖已有工作台持有、专用和外部持有。保存 attemptId、版本、脱敏事件、各端计数和释放后句柄数。
4. **授权与竞态。** 桌面已连时，CLI/MCP 仅选 T 或漏选 B，必须在 P 收到连接前拒绝；人为撤销 B 授权，绝不借工作台连接。旧意图同输入重提仅返回原结果，改输入仍用旧 key 得到冲突，重启后无运行证据返回 unknown。等待代理、信任、交接时分别切换默认代理、轮换凭据、撤权、取消，并让迟到回调返回；断言无新通道、无跨主体复用，工作台既有终端仍可显示旧路径。中间 B 拒绝信任/取消认证时，记录 B 的阶段并验证 C/T 无事件。
5. **两类中继独立验收。** 本机采用上述受控 fixture，检查其位于 Engine 设备。远端只在已登记的回环 B→C 边启用模拟中继，其余两边仍走正常通道。用 B 的通道观测和 C 的独立主机密钥确认边归属；未配置／未批准时停止，修改 B 或 C 后必须重新核对版本与批准。最后合并 H3.2 的批量关联、启停、成环拒绝证据，再判 A03。

## 产物、验证与许可证

| 核对项 | 本次结果 |
| --- | --- |
| 代码与规格 | 按指定 Git 对象读取 #7 与 #6 的规格、Manager、公共资源、凭据及入口。已定位首段 sock 交接、现有逐跳记录和外部回执三处可复用实现，以及专用拨号、版本、外部投影的缺口。 |
| 上游与依赖 | 对照 Motty v0.4.12 的固定对象。批次资料及部分既有第三方条目引用较早的 `2daa9db582e16edf60a60b7ada26f47f808f973c`，本报告以上述 v0.4.12 为依据。Huhu `package.json` 声明 GPL-3.0-or-later；Motty 为 Apache-2.0，根 LICENSE/NOTICE 署名 Motty contributors。ssh2@1.17.0（含本仓库补丁）、socks@2.8.10 为 MIT，版本与清单见 `pnpm-lock.yaml`、`THIRD_PARTY_NOTICES.md`。Node HTTP 为内置模块。未来若移植上游代码，应在现有 notices 中记录实际固定来源、对应文件、修改以及适用的许可与 NOTICE。 |
| 产物与运行状态 | 唯一交付为本报告。分析未修改业务代码、依赖、配置或远端，未启动 SSH、代理、子进程夹具或测试。回环结果和打包可用性待各实现片验证。 |

## Lead 验收

Lead 核对现有首段 sock 注入、SocksClient 锁版和 ProxyCommand/ViaShell 的运行位置。采用同一 Manager 与 ssh2 客户端的首段 SOCKS5、HTTP CONNECT 作为第一个实施片，外部使用原资源授权和版本绑定。此报告登记为设计交付，协议与实际入口仍需定向验证。
