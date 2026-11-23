# R04 / R05 执行位置、授权与传输复用

| 项目 | 记录 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux` |
| Core、Lead、terminal_address | `wta-ubuntu`、`t3p`、`t5h` |
| 任务 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task05.md` |
| 报告 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report05.md` |
| 执行结果 | `done`，固定候选的只读架构核对 |
| Huhu | `f80be2f20d58de5a2bc0940cafbc7fe3a1134a6a`，路径相对 `/home/wta/projects/huhu/temp/issue-worktrees/integration` |
| Motty | `temp/sources/motty`，`v0.4.12` = `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0，根 LICENSE/NOTICE。Huhu 为 GPL-3.0-or-later，复用的是现有带补丁的 MIT ssh2@1.17.0。 |

## 结论

**保留一份主机路由和现有逐跳 SSH 握手，只增加两种产生传输流的方式。** R04 的 ProxyCommand 由 Engine 所在设备启动，接入第一段。R05 的 ViaShell 由已通过主机密钥验证和用户认证的上一跳执行，接入该跳到下一跳的指定边。两者对 Manager 的共同产物是可取消、可关闭的双向字节流；配置、审批、参数来源、执行地点和生命周期各有自己的所有者。

固定候选已经有继承／直连／覆盖、SOCKS5、HTTP CONNECT、加密代理账号及首段路径版本。第一步应先交付**来源与审批守卫，加桌面显式启动的本机 ProxyCommand**；ViaShell 可以在同一守卫之后独立交付。首版两者默认关闭，CLI、HTTP、MCP、插件、Web 工作台及无人值守恢复均不能启动依赖它们的连接。已有普通网络代理和外部授权连接继续按原合同使用。整项 A03 须等两个执行位置各有真实回环证据。

需求定位为 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/source.md` 的 R03–R06、H09、A03 及 `tasks/H3.3-route-attempt.md`。P07 另约束端口转发规则中的显式中继及其可用模式；本片实现路由边，不能据此宣称所有转发模式已经支持 ViaShell。

## 实际调用与最小改动

| 固定提交中的位置 | 已有行为 | 需要接入的边界 |
| --- | --- | --- |
| `plugins/ssh/src/engine/{index,outbound-proxies,outbound-proxy-dial}.ts`；`shared/outbound-proxy.ts`（同插件） | 注册时注入 resolve/dial。effectiveOutboundProxy 取最终目标的 inherit/direct/profile；Vault 默认引用在 `.huhu/ssh/outbound-proxy.json`；代理定义和 endpoint 绑定的 username/password 由 `ssh.proxy` 持有。现有纯网络 dialer 只接受 socks5/http-connect。 | 沿用首段策略选择。扩展为带类型的首段选择，计算网络代理时原分支不动。本机程序选择保存不透明引用；真正执行前另取设备批准。不要向网络代理账号接口追加“命令字符串”字段。 |
| `shared/route.ts`、`engine/{route-edits,host-configurations}.ts` | `routeForHost` 沿直接跳板生成有序链，处理禁用、缺失和循环；`editRoutes` 在版本化主机定义上批量改边。 | 把是否经受控中继记在“子主机→直接跳板”的已有关系上。改变父跳板、子主机身份或中继定义使原批准失效。禁用关系后边不参与实际路由；恢复前重核批准。 |
| `engine/manager.ts:447–505,673,844` | `dialChain` 在每跳的认证回调内工作。第 0 跳有 profile 才调 outbound.dial；后续在已 ready 的 Client 上 forwardOut 到 next，再把流交给下一 Client。connectHop 有 sock 就沿流握手，并使用实际 SSH 主机的身份、证书、known_hosts、提示和时限。 | 首段增加本机程序的流工厂；跳间增加显式边选择。先验证完整计划允许执行，再开始第一段。仅在已批准的边替换该次 forwardOut。拒绝、失败、超时都终止本次尝试，不能自动切到另一传输方式。 |
| `engine/{workspace-target,public-resources,public-probes}.ts`；`manager.ts:347,365,407–425,582–654` | 逻辑 workspaceTarget 与实际 connectionIdentity 分开。后者已有可选 proxyVersion；公共资源用相同的版本成分生成 routeRevision，并检查全部跳板授权。工作台正在拨号的任务仍按 hostId 合并；已有连接按 routeIdentity，专用连接按 scope+identity 借用。 | 在同一版本生成点加入已选首段和有序边的配置/批准代次，供列表、拨号、公共绑定、借用和重验共用。来源准入要在查已有连接、加入正在拨号的任务、借租约或替换旧连接之前完成。 |
| `engine/{draft-connection,index,public-forwarding}.ts` | 桌面草稿用独立 attempt，其他允许的草稿要求原主机、routeRevision 与已授权链；外部转发从原主体的 routeRevision+attemptId 获取原 Client。域事件已经会对 host/outbound-proxy 改动调用 revalidateRoutes。 | 将相同守卫带到工作台、草稿、后台连接、工作区启动、外部探测/作业和专用监控/转发；将两种配置或批准的变化接入重验。草稿只能使用已确认的具体首段/边，改地址后不能套用已保存主机的批准。 |

用法举例：桌面选择 T 的已批准本机配置，路由为 A→B→T 时，本机程序服务于 A 的 SSH 连接；A 的主机密钥仍在第一跳提示。另一次选择普通首段、仅将 B→T 标记为受控中继时，本机不启动程序；B 已认证后才打开中继通道，T 仍出现独立的主机密钥核验。把两者并成“任意位置执行命令”的单一配置会使目的端、解释器和授权域在运行时才确定，且容易把上一跳的权限错误带到本机。

## 两种传输的生产合同

| 合同 | 本机 ProxyCommand | 远端 ViaShell |
| --- | --- | --- |
| 执行权与位置 | 桌面展示 Engine 所在设备、确认的程序、参数模板及适用路由，用户显式批准。只在随后发起的、政策允许的桌面连接/测试中启动。 | 桌面另行批准“经哪个已验证的跳板账号，到哪个下一端点，用哪个中继配置”；跳板管理员也须允许这一目标和中继。普通转发被拒不能视为远端中继许可。 |
| 参数与解释器 | 首段 %h/%p/%r 取实际首个 SSH 端点的规范主机/端口/用户，%% 是字面量。首版建议仅支持经选择的固定可执行文件及独立 argv 槽，直接创建进程、禁用隐式 shell，逐槽替换且不再次分词。拒绝不完整或未知占位符、控制字符、越界端口、能被误读为选项的值；限制原始及展开后的字节数。导入的完整 shell 表达式应显示不支持并提示重新配置。 | 到达下一端点的模板取该端点的 host/port/user；解析规则与配置 ID 分开，即使允许相同的 token 拼写。远端 shell 有自己的语法，不能以“本机 argv 已经安全”为依据。首版只接受管理员预配置的固定中继及受限参数；控制字符、未知模板和未确认 shell 环境均拒绝。不继承工作区登录命令、不提供临时 prelude。 |
| SSH 流边界 | 子进程 stdin/stdout 组成双向流，stderr 独立限量。成功启动程序只表示获得传输端点；成功必须由原 ssh2 Client 完成真实 SSH 验钥、认证并 ready。保留预读首包、二进制内容与背压；不得把 stderr 或本机终端输出混入 SSH。 | 在前一跳自己的 Client 上建立独立的内部通道，支持的远端环境须提供透明的字节流。启动阶段有界地划分提示/回显、一次性就绪标识和下一端点 SSH 版本前缀，处理跨块和同包余字节；从真正的版本行开始完整交给下一 Client。标识只用于划分流，不提供 SSH 身份证明。用户可见终端、历史、录制和命令队列不参与中继。 |
| 取消与回收 | 准备阶段持有 signal 和截止时间，spawn 前后及交付前复核。关闭时停止双向传送、释放管道、收割已登记的子进程及其受管子进程；等待有上限，退出/取消/超时竞态只能完成一次。平台无法证明进程树回收时，该平台保持未启用。 | 准备阶段受 attempt、上一跳断开及剩余截止时间共同约束；拒绝 PTY、就绪失败、超时、提前 EOF 各有受控原因。取消只回收本次专用 channel 和本尝试自己创建的后续 Client；迟到的 channel/流立即关闭。其他已存在的会话遵循原持有者生命周期。 |
| 上游差异 | Motty POSIX 使用 shell 及进程组，Windows 使用原生命令行与可选 Job，无法创建 Job 时退为单进程回收。Huhu 的首片刻意缩小可执行语法。可参照同仓 `plugins/versioning/src/engine/git.ts` 的取消/进程组，但 GitRunner 缓存完整输出，不能作为 SSH 双向流。 | Motty 的远端实现另开 shell/PTY，可有 prelude。其启动默认上限 30 秒、噪声尾部上限 64 KiB。本片可借鉴有界就绪检测和前缀保留；时间值要受 Huhu 本次拨号预算约束，不把噪声或命令原文写入界面。 |

**所有权交接点**：开始拨号前检查整链资源、当前 routeRevision、当前设备批准及发起者来源；每次启动本机程序、打开远端通道、发送该跳认证、接受信任答复以及将流交给下一 Client 时复核。成功交接后，准备阶段的超时监听退出，但活流和进程仍归 connection/lease 所有，随真正断线、取消、释放最后租约或 Engine 停止回收。连接已成功后不应被过去的“启动超时”误杀。错误和迟到回调不能把已取消的流放回池中。

## 审批、导入和外部入口

1. **批准绑定。** 可移植定义存放模式、显示名、引用与定义版本。执行批准驻留本机用户保护域，按设备／本地 Vault 实例、配置 ID、程序身份与模板版本、运行位置、适用端点和账号绑定。对远端边还绑定父子身份与已核对的跳板主机密钥身份。优先复用 `SshCredentialHost` 提供的 localRoot、localVaultInstanceId、protection 和 ModuleCredentials 的版本化绑定惯例；执行许可单独建模。批准不作为可编辑 Vault 布尔值，不随导出、复制或同步迁移。先写受保护版本、再发布引用；失败或批准被撤销时禁止执行。复制主机/换 Vault/替换程序/改边均需重核。对程序默认采用受控 cwd 和最小环境，不向它暴露整个 Engine 环境及 SSH/代理凭据。
2. **导入没有执行副作用。** `engine/import/openssh.ts:115` 把非 none 的 ProxyCommand/ProxyJump 标成 unresolved-route；`engine/config-sync.ts:56` 对相应 Host 块报告诊断。沿用预览与显式编辑分界。导入、同步、保存、复制、页面预览及启动时恢复不得触发程序/中继，也不能自动跳过未批准设置改为直连。导入诊断可以标出字段和行；待用户查看的原文保持为数据，不进入实际执行配置、公共回执或审计。
3. **来源必须传到 Manager。** `packages/contracts/src/capability.ts:31` 将 desktop 和 web:<session> 都视为 workbench。`engine/index.ts:662` 的前台 connect 会把两者送到 manager.connect；该调用当前没有 caller 参数。新增敏感路线时，使用 dispatcher 给出的真实来源并将可信执行范围传到最终拨号和借用处；默认是无执行许可。只检查 publicProbe 是否存在、background 标志、按钮是否隐藏或字符串 caller === "web" 都不足以判定桌面。现有桌面专用描述符与 dispatcher 守卫应保留；新审批入口采用 desktopOnly、exposable:false，handler 也要求真实 desktop。普通连接、被授权的网络代理、外部资源摘要沿用各自现有口径。
4. **原授权不能转赠。** CLI/HTTP/MCP 继续先验证全部 `ssh.hosts` 选区和绑定，维持 hostId、routeRevision、attemptId、owner、intentKey 检查。对命令路线在任何建连、进程/通道分配和借用前返回稳定拒绝，包括已有桌面连通、后台作业、草稿、专用池命中和重试。读取旧意图只可对账，不能续签设备批准或触发重拨。Web 对已有命令路线的终端/文件等新附着也要在消费处判来源，不能经 hostId 取到桌面已开的能力；已读到的摘要不含程序/模板。原主体的连接结束时，外部调用仍报告原连接已结束。
5. **版本与并发。** 在 `outboundProxyVersion` 与 `resourceView/connectionIdentity` 已有输入上增加实际首段与各选中边的配置/批准代次；未配置新模式时保持现有版本算法。workspaceTarget 继续标识逻辑目标，不放路径、命令、秘密或凭据摘要。审批改变需触发本机准入重验。Manager 的 validate 当前会重新 resolve 已捕获的 target，执行敏感动作前还要重读当前持久主机/边及批准，避免只验证旧对象。新请求不得加入旧版本的 hostId 单飞，旧尝试 finally 不得删除替代项。配置编辑本身不关闭活连接；若新请求要切换且旧连接仍有持有者，先报告需显式重连或使用独立连接持有，避免 `doConnect` 直接 drop(hostId) 误杀旧 shell。已开文件、监控和转发继续绑定原 connectionId；禁止静默迁移。
6. **审计显示实际地点。** 沿用 attemptId、hop 和有界 timeline。首段显示“Engine 本机 → A / 本机程序”；中继显示“在 B 上执行 → C / 远端中继”。区分执行未获准、启动/就绪失败、超时/取消、下一跳验钥失败、下一跳认证失败。B→C 的中继准备失败只记录该边，C 尚未认证；C 密钥变化归 C。公共主体只得到已授权的错误类别。不要写入展开参数、原始命令、认证材料、stderr、远端横幅或握手内容。普通 `doConnect` 会初始化 route；草稿和专用拨号、公共状态投影各有自己的输出合同，不能依赖工作台 trace 的存在来证明它们也有同样的证据。

## 固定上游对照

| Motty v0.4.12 文件 | 对照依据 |
| --- | --- |
| `internal/workbench/{connection_catalog,outbound_proxy}.go` | 按最终主机选择首段；`addRelays` 按被到达端点配边，运行者是前一跳；上游会把跳板的 LoginCommand 当 prelude 并区分复用身份。这是 Huhu 必须显式决定的兼容差异。 |
| `internal/sshconn/{conn,proxy}.go` | 首段 dialTCP 与跳间 dialHop 分工，随后对各端点独立 handshake。 |
| `internal/sshconn/{proxycommand,proxycommand_other,proxycommand_windows}.go` | 受控 token、单行/长度检查、独立 stderr、进程退出与平台进程树。上游命令上限 2048 字节、stderr 尾部 4 KiB。 |
| `internal/sshconn/shellrelay.go` | 已认证 Client 上的专用会话、启动就绪与目标 SSH 流交接、取消和关闭。 |
| `internal/sshconfig/sshconfig.go`、`internal/workbench/{host_import,agent_mcp}.go` | 解析与确认分别处理；agent 的连接环境对本机程序有单独拒绝。上游对本机 ProxyCommand 的限制不能直接当作 Huhu 已对所有 ViaShell 外部入口实施的证据。 |

本次参照上游行为，未移植源码。若后续实际移植，应按具体文件更新仓库第三方说明。ssh2 的 sock 和 Client 生命周期可对照其原版文档，项目行为仍以固定候选和仓库补丁为准。[Motty 固定提交](https://github.com/t8y2/motty/tree/102228261703d8f22c5eb98b1c500e2a24889dee) · [ssh2 v1.17.0](https://github.com/mscdex/ssh2/blob/v1.17.0/README.md)

## 分工与集成顺序

| 切片 | 写入归属与出片条件 |
| --- | --- |
| 1. Lead 先锁共享合同 | 统一“来源、首段、跳间边、批准代次、端点、取消和交付后释放”的类型；集中修改 `manager.ts`、`public-resources.ts`、`workspace-target.ts`、`index.ts`。约定 caller 缺失时无执行许可及无新配置时的版本兼容。归属检查包括 `apps/engine/src/boot.ts` 的 Web terminal 包装与 `plugins/ssh/src/engine/terminal-bridge.ts` 的 attach 路径；当前 Web 包装只单独排除 ssh-local。先有政策和消费者测试，再接执行器。 |
| 2. 本机传输与设备确认 | 一位实施者拥有本机批准存储与窄桌面配置接口、本机双向流适配器、进程生命周期测试。首片建议在 Linux 验证固定程序及进程组；其他平台在验收清理能力之前显示不可用。网络代理的 `OutboundProxies.dial` 与原凭据用途继续单独测试。 |
| 3. 受控远端边 | 另一位实施者在已约定的接口上负责 edge 配置验证、内部中继通道与流边界测试。默认保留 direct-tcpip；明示模式不可用时报告发生在哪个已验证跳板。定向使用的夹具先限制可去端点，再检查握手/清理。 |
| 4. 集成验收 | 路由页/详情把“配置预览、设备已批准、实际发生”分开；通过桌面正常入口走一次完整路径。CLI/MCP、Web、草稿、借用连接和导入分别核验零执行。合并以固定测试目录的结果与资源回收计数为准。H4.3 的工作区/窗口变更无需纳入此 write set。 |

## 仅回环的验收命令建议

以下供实施者在项目根目录逐条执行。**基线已有完整三跳正对照。** `plugins/ssh/test/public-resources.engine.test.ts:263` 为 CLI 和 MCP 各建 A、B、C、T，验证授权少一跳时代理请求为零、完整时四次独立信任、CONNECT 只收到 A，以及 routeRevision 随实际策略更新。随后已有 “retires every external connection…” 用例验证原外部连接失效。沿用这两组夹具即可。

```sh
pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'first of three SSH jumps|retires every external connection'
pnpm exec vitest run plugins/ssh/test/outbound-proxy-dial.test.ts
pnpm exec vitest run plugins/ssh/test/manager.test.ts -t '经跳板|跳板全部接受'
pnpm exec vitest run plugins/ssh/test/draft-and-keys.test.ts plugins/ssh/test/host-import.test.ts
```

为新用例约定统一标题前缀 `R04-R05`，放在下列现有测试文件。实施后，在已有匹配提交的桌面构建与 CLI 产物的 Linux 环境中执行；本报告没有运行这些命令。

```sh
pnpm exec vitest run plugins/ssh/test/manager.test.ts plugins/ssh/test/public-resources.engine.test.ts plugins/ssh/test/draft-and-keys.test.ts -t 'R04-R05'
xvfb-run -a pnpm exec playwright test tests/e2e/ssh/remaining.spec.ts tests/e2e/ssh/entry-parity.spec.ts --workers=1 -g 'R04-R05'
```

每条结果核对匹配用例数，零匹配或跳过不计通过。现有出站协议测试含内存和真实回环两组，一些环境在 listen 权限不足时会 skip；内存组不能代替真实线路。沿用 `tests/e2e/helpers/launch.ts` 的临时 Vault／隔离 userData，并给进程夹具提供临时工作目录、独立的合成账号、空代理/agent 环境。所有监听只绑定 127.0.0.1 或 ::1、动态端口；固定夹具只接受本次登记的回环目标。回环绑定本身不限制出站，现有 `fake-server.ts` 的 tcpip handler 会使用请求中的目的地址，新增夹具必须在连接前验证目的元组。验收不依赖开发者的个人 SSH 配置、代理程序、凭据或远端账号。

| 需要新增的断言 | 可观察证据 |
| --- | --- |
| 桌面本机正例，远端边正例，以及一条混合三跳 | 本机用只服务本测试首端点的无害固定 helper；远端用 `startFakeSsh` 的专用测试模式，普通 shell 回显不会充当真实中继。A/B/C/T 分别有不同 host key；逐跳核验、在 T 完成固定往返。记录本机 helper 启动数、各跳专用 channel 打开/关闭数、四个 SSH 身份和 SSH 连接数；普通边不创建专用 shell。无需向任何真实主机投递命令。 |
| 传输完整性 | 标记、SSH 版本行分别分片、同包附后续二进制、流量超过单缓冲、非文本字节和半关闭。上游噪声、stderr 不进入下一 Client；下一跳密钥变化时停在该跳。单凭子进程已开或中继输出标识不能通过。 |
| 权限／导入／审批 | 导入、同步、保存、复制、无审批草稿、审批失效、外部请求、Web 正常调用、已存在的桌面连接及专用池命中均有零启动/零中继请求证据。测试同一请求重复、不同主体、换 Vault、程序/端点变化与撤权；错误不给出另一主体的主机详情。网络代理既有外部正例仍成功。 |
| 时间与释放 | 分别在准备前、打开中、SSH 首包前及交接边界取消或触发超时，返回一次终态；模拟迟到的成功并检查句柄、子进程树和 channel 全部回落。源工作台已有 SSH、文件与转发维持原 connectionId；草稿无注册连接，最后持有者释放时资源计数为零。 |
| 审计 | 用合成标记检查时间线、审计、回执与导出包：可见 hostId、hop、实际位置和受控原因，搜不到私有路径、参数、凭据、原始握手输出与审批材料。 |

## 交付与观察边界

唯一产物为本报告。已从固定 Git 对象核对 Huhu、固定 Motty、锁文件、能力描述符及上述调用与测试；没有读取个人凭据、接触真实跳点、修改工作树、运行构建/套件/E2E 或写入远端。上述新增合同、回环命令和结果判据供后续实施，尚无两种新增执行方式的运行验收结论。

## Lead 验收

由 Lead 追加。
