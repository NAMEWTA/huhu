# #7 H3.1 · OpenSSH 主机 CA 与用户证书选型

- 执行结果 — **done，设计交付**。H05–H08 的证书互操作仍待实现与验收。
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t5h/task02.md`，本机 `wta-ubuntu` 默认 Core，Lead `t3p`。已核对本机终端 ID、topic、manifest 的 active 指针及 report01 的 Lead 验收。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report02.md`
- 固定依据 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`，提交 `196cfbc60f0c8b5678178a0023e7d78749883c40`。Huhu 业务源码均按此 Git 对象读取。另行核对已安装依赖与上游固定版本。

## 建议与首个可验收行为

**先交付一条 Ed25519 用户证书路径**：在已保存且由本机明确选择的 identity-file 旁读取配对的 `-cert.pub`，用主体私钥签名，沿同一 ssh2 transport 通过证书专用的服务端用户认证。主机身份继续由当前逐跳指纹策略确认。ssh2 上游 PR #1495 已有与 1.17.0 对应的局部改动和独立 OpenSSH 服务端的正向报告，可审查后固定为仓库补丁。**主机 CA 单独交付**。它还需要协商主机证书算法、验证 CA 签发关系，以及验证服务端对本次密钥交换的签名。两项都保留 Huhu 的连接所有者。[ssh2 #1495 改动](https://github.com/mscdex/ssh2/pull/1495/files) · [上游互操作记录与范围](https://github.com/mscdex/ssh2/pull/1495)

从调用方看，有两个可独立验收的结果。

1. 桌面用户选择已有身份文件，连接一台普通已知主机。服务端仅接受测试 CA 签发的指定用户证书。连接获得原有的 connectionId，Shell、SFTP 和转发继续在该连接开 channel。相邻证书与该私钥不配对时显示本机身份错误；已选“必须用证书”且文件缺失时同样中止。再次连接读取续期后的证书。
2. 获授权的 CLI/MCP 主体持有目标和跳板的当前 routeRevision，连接一台以主机证书标识的目标。第一跳和第二跳分别在各自握手上作出信任决策。目标证书通过后才在该跳发送用户认证，返回原主体可使用的外部 connectionId；目标签发者未受信任、被撤销、过期或 principal 不符，要报告失败 hop 与原因。其他主体、Vault 或工作台连接不能领用这条连接的文件、命令、转发或提示。

## 实际路径与离线证据

| 边界 | 基线行为及限制 |
| --- | --- |
| Huhu 拨号和复用 | `plugins/ssh/src/engine/manager.ts:352,410,615`。直接连接传 host/port。每一跳都创建自己的 Client，上一跳 ready 才通过其 `forwardOut` 得到下一跳 Duplex，作为下一 Client 的 `sock`。目标标识来自该跳路由记录。Workbench 按主机及 `connectionIdentity` 复用，转发与监控可以借连接或依作用域建立专用连接。草稿拥有独立生命周期。外部主体通过 `public-probes.ts` 和 `readBoundRoute` 核对资源与路由，并保有自己的 Client。所谓一个池指一种执行实现与现有所有权模型；这些隔离域仍需要各自的连接。 |
| 主机 KEX | ssh2 1.17.0 `lib/protocol/constants.js:64` 的默认列表为 Ed25519（依运行时）、ECDSA 三种曲线、RSA SHA-2 两种及 ssh-rsa；supported 另有 ssh-dss。`lib/utils.js:210` 对配置作白名单校验。`lib/protocol/kex.js:638,690,1170,1194` 先后涉及协商类型、完整 K_S、签名封装的类型及用解析出的主机公钥验 exchange hash。原版没有主机证书的协商项、叶公钥解析或证书与签名算法映射。hostVerifier 收到原始 key，其“允许”仅完成主机信任判断，不能替代 KEX 证明。 |
| 私钥和 agent 用户认证 | `host-configurations.ts:46,292` 用模块凭据 lease 核对 revision/configId；身份文件有本机路径、类型和大小限制。已有私钥及口令在本地解析；agent 为 SSH_AUTH_SOCK 或 Windows OpenSSH 命名管道。ssh2 的 `client.js:448,938,1084,2155` 支持 privateKey、公钥认证回调或 BaseAgent，`agent.js:1046` 解析并过滤身份。`Protocol.js:631` 发送公钥探测，获准后签包含会话 ID 和请求字段的数据。原版将同一算法名同时写入请求和内层签名，原生 RSA hash 选择针对普通 RSA key。用户证书需保留完整证书 blob、主体 signer 和实际签名算法三者的区别。只设置 agent 或把证书当 privateKey 不满足条件。 |
| 已知主机和提示 | `engine/index.ts:78` 选择本 Vault SSH 状态目录的 known_hosts。`known-hosts.ts:15` 处理单个字面 host，22 用 host、其它端口用 [host]:port；跳过 marker、hash、逗号列表，通配字符串不作模式匹配。相同地址已有记录但全部不匹配即 mismatch，包括算法变化。`manager.ts:645,773` 直接拒绝 changed；首次信任由 attempt/hop/server/promptId 绑定，消费时重读文件，Vault 写入带版本。草稿只汇报可达或待信任。 |
| 外部权限与业务通道 | `public-resources.ts:61` 查当前获准的整条路由；`public-probes.ts:205,273,342` 绑定 owner、路由、提示版本和连接。`manager.ts:903,1072,1105` 在所绑定的目标 Client 上开 shell/sftp；`forward-listener.ts:26,107,163,214` 路由入站事件、开/关远端监听及 direct-tcpip。新增实现必须覆盖同样的 channel、取消、半关闭和 owner 生命周期。 |

**本次实际运行的只读实验。** 项目 Node v24.21.0 加载安装树 ssh2 1.17.0，调用其算法列表生成器，分别传 Ed25519、RSA-SHA2-256 的 OpenSSH v01 主机证书名，两者均返回 `Unsupported algorithm`。取 Go 模块公开测试数据 `golang.org/x/crypto@v0.57.0/ssh/testdata/keys.go` 的 `rsa-user-testcertificate`，分别将原文本、解码的原始 blob 传给 ssh2 的公开 `utils.parseKey`。文本结果的 type 为证书、isPrivateKey 为 false、getPublicSSH 与原 blob **不相等**；二进制结果为 `Unsupported key format`。对应 `keyParser.js:1192,1312,1416` 的文本正则与普通公钥解码分支。本实验没有网络拨号、没有使用真实凭据。Go v0.57.0 只提供公开夹具，Motty 实际依赖见下。

## Motty 的原始行为与取舍

本机 `/home/wta/projects/huhu/temp/sources/motty` 的 HEAD 与 `v0.4.12^{}` 均为 `102228261703d8f22c5eb98b1c500e2a24889dee`，go.mod 锁 `golang.org/x/crypto v0.59.0`、`github.com/pkg/sftp v1.13.11`，声明 Go 1.26.11。

- `internal/knownhosts/parse.go` 为管理界面保留 marker、逗号模式、hash 标志、原行位置及内容摘要/重复次数，校验文本算法与公钥 blob 一致。拨号实际由 `internal/sshconn/hostkey.go:newHostKeys` 调用 x/crypto 的 knownhosts.New。其模式为逗号列表，`!` 匹配优先排除，`*`/`?` 匹配主机名，端口独立精确比较，未注明端口取 22；`|1|` 基于规范化地址作带盐 HMAC。非默认端口与 IPv6 需规范拆分。CA 的适用范围校验 host 和 port，证书 principal 单独校验该跳不带端口的逻辑主机名。Motty 的 `algorithms` 只从精确匹配的无 marker 行推导偏好；`rememberReplacing` 只替换匹配主机与类型的普通记录，保留 marker。维护展示、模式匹配和替换是三个不同操作。[Motty hostkey.go](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/hostkey.go) · [Go v0.59.0 匹配实现](https://raw.githubusercontent.com/golang/crypto/v0.59.0/ssh/knownhosts/knownhosts.go)
- Go 此版把 `@revoked` 索引为整个已加载库内的公钥，不按该行 host 模式限缩。证书检查可识别已撤销的主体公钥及签发公钥，普通 key 也查撤销表；它与按证书序列号处理 OpenSSH KRL 分属不同功能。Motty 的 `verifyHostKey` 对非 KeyError 的证书错误也允许转成待询问，并允许用户确认变更后替换同类型记录。Huhu 应保留明确的拒绝结果；任何损坏、撤销、签名错误、有效期错误、类型/主体不符和受信任策略冲突都不能转首次信任。尤其不能用成功解析、算法后缀或 CA 指纹相同充当验签。裸钥查找应只接受普通 pin 行。建议 Huhu 的 OpenSSH 文件按所匹配的主机记录处理撤销；若复用 Go 的全库撤销表，应先筛出该 hop 的适用行，再检查叶密钥和签发密钥。夹具要同时放入同 CA、不同地址和端口的对照，确认撤销范围。参见 [OpenSSH 10.2p1 主机记录与撤销实现](https://github.com/openssh/openssh-portable/blob/V_10_2_P1/hostfile.c)。[Go v0.59.0 证书校验](https://raw.githubusercontent.com/golang/crypto/v0.59.0/ssh/certs.go)
- `internal/sshconn/certificate.go` 对选中路径取 `path+"-cert.pub"`，解析公开证书、查 UserCert，以 NewCertSigner 检查主体公钥等于 signer 的公钥；缺少伴随文件时回到普通身份。`auth.go:43,156` 在主机获信后列身份，按选定身份匹配 agent signer，可延迟请求解密口令，IdentitiesOnly 排除多余 agent 身份。Motty 可跳过不合适身份后继续尝试。Huhu 在显式要求证书时应固定该身份与身份来源，失败可由对应主体重新选择。服务端负责用户证书 CA、授权 principals、撤销和策略；客户端配对成功不能证明服务端已接受。[Motty 配对代码](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/certificate.go) · [Motty 用户认证](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/auth.go)

## 可选的执行结构

| 方案 | 对普通 TCP、跳板和已有通道的影响 | 审查成本与结论 |
| --- | --- | --- |
| **A · 同一 ssh2，固定小补丁** | 用户证书仅改变该跳认证材料和 SSH_MSG_USERAUTH_REQUEST；直接 socket 与 forwardOut Duplex 均沿原路径，已建立的 Shell、SFTP、转发的数据不经过额外组件。 | 首选。#1495 的候选头 `d268d9b8de7783a4e8b4357a8cf2bf659cfe2dff` 涉及 client、keyParser、Protocol 和测试，可用现有 pnpm patchedDependencies 管理。它可保留用户证书 blob，分别使用主体私钥、证书请求算法和普通签名格式；会识别 agent 证书身份。仍需上层校验类型/配对、选中身份和服务器策略。上游 PR 不是 Huhu 锁版发行合同，也没有提供主机 CA KEX。桌面打包与插件都依赖同一 ssh2，补丁需验证两处解析到同一份。 |
| **A 的主机 CA 扩展 · 在同一 KEX 上验证** | 先限 Ed25519 主机证书和 Ed25519 CA。ssh2 客户端在算法协商、blob 类型检查、KEX 签名与 rekey 上作明确适配，将完整证书保留于 exchange hash 输入，用被认证的叶公钥验证实际 exchange hash 签名。当前 hop 的完整证书同时交给受信策略。 | 独立审查传输侧与策略侧两种签名。可复用固定 Go x/crypto 的受限纯验证模块，输入有界的证书/批准的规则快照/目标/时钟，返回认证叶公钥与原因；不持私钥、不开连接。若采用跨进程 helper 或 WASM，要实证打包、冷启动与取消；每个握手或 rekey 才调用，不能逐包跨边界。仅改 ssh2 的 allowed list 或在握手前另连一次查证书都不能交付此项。 |
| **B · Go 作为唯一 SSH 传输实现** | Go x/crypto/ssh 对直连用 net.Conn+NewClientConn；下一跳用前一 Client.Dial 的连接再 NewClientConn。认证后复用同一 Client 上的 session、exec、SFTP 子系统、direct-tcpip 和远程监听，Huhu 按现有 owner/route 管理句柄。 | 主机证书与用户 signer 已有成熟实现，减少 KEX 补丁维护；代价是替换 Huhu 所有依赖 ssh2 Client/Channel 的调用处，并为桌面各架构分发单一协议助手。IPC 须支持流式二进制、背压、窗口调整、EOF、stderr、退出状态、远端监听释放、崩溃与重拨。Motty 的 mcp-serve 依赖自身 config.db，已有 Windows 参考构建不能证明可替换。若团队不承担主机 KEX 的独立维护，优先单独评估此路线；按一个执行后端切换，不能让一条链同时由两套池管理。[Go 固定版 SSH API](https://pkg.go.dev/golang.org/x/crypto@v0.59.0/ssh) |
| 系统 OpenSSH 或独立预检 | ssh 的证书功能可作互操作裁判。用 ssh -W 载运下一跳时，内层 ssh2 仍须完成目标的 KEX；另开 ssh 探测得到的证书无法绑定后续 ssh2 会话。 | 若改用 ControlMaster 等机制作为唯一所有者，还要重建跨平台控制、提示、文件、反向转发和 teardown；目前没有与既有 Node Duplex、Windows 控制连接和外部句柄等价的证据。排除此方案作为“小补丁”。 |

## 实施和审查边界

1. **用户证书切片。** 只针对由现有 host revision 和本机凭据许可选定的 Ed25519 身份文件。为该来源增加可选的证书要求，旧配置默认沿用普通身份；若支持自动伴随文件，只有“未要求且文件确实不存在”可按普通身份继续。已存在但不可读、超限、无效或不配对时直接报错。打开文件后通过同一个句柄验证为普通文件并限量读取；本地可信选择之外的远程输入、可移植主机字段、导入/同步文本和键盘提示都不能授予任意读文件权。用户证书是公开身份资料，不能把私钥、口令、证书全文、本机路径或 principal 列表发布到日志或外部状态。使用结构化证书解码，检查内外类型、UserCert、主体公钥与已解析私钥的规范公钥相等；PR 仅保留 opaque blob，不具备这个配对判据。首片可复用受约束的 Ed25519 v01 字段读取与 ssh2 现有公钥编码，对无法无歧义解码的输入拒绝；若同时推进 Go 验证组件，直接复用 ParseAuthorizedKey / NewCertSigner 的配对语义。证书不是另一个私钥，也无需本机持有签发 CA 私钥。
2. **主机 CA 切片。** 按 OpenSSH 文件格式，从 Vault 已批准的 SSH 信任记录读取快照；新 CA 的添加/扩大范围必须通过独立管理、版本核对和可信导入，远端、便携主机、草稿、请求参数和“信任一次”均不能添加 CA。先支持明确地址与端口、受支持的模式及撤销，未支持的规则须明确报策略不可用，不能静默降为 unknown。保留原行、注释、marker、行身份及写前版本，撤销优先；管理页区分普通指纹、CA 适用范围和撤销。建议将已有 pin 视为约束：存在匹配地址的 pin 时，即使 CA 校验成功，主体公钥与所有既有 pin 不符仍走 changed-key 独立处理。仅配置强制 CA 的目标应只协商允许的证书类型，服务器只提供裸钥时不给 TOFU 降级。
3. **逐跳最终判据。** 同一实际握手同时具备受信任发行者、匹配当前 hop/port 的 CA 记录、有效 CA 签名、HostCert、准确 principal、有效时间区间、可解释的 critical options、未撤销、正确的 KEX 叶密钥签名。不要把 known_hosts 行的通配符语义套给 principal。第一版若限 Ed25519，明确标出 RSA/ECDSA/SK 等支持边界；后续 RSA 还需区分 RSA 叶类型、RSA-SHA2 协商名、签名格式和 CA 所用签名算法。所有比较均从当前已批准的逻辑 hop 推导，不使用代理/跳板的 socket 对端或服务端自报主机名。错误分为 changed、revoked、untrusted-ca、invalid/expired/excluded-principal、算法不可用、身份缺失、服务端拒绝及取消；连接仍使用原有阶段、attempt 和 hop。
4. **权限与恢复。** 在实际拨 TCP、发上一跳 forwardOut、下一跳 connect、异步证书检查返回、签发用户认证请求、消费提示及交付可用 channel 前，复核相关路由、版本、scope、Vault 代及取消。权属变化立即取消待答、关闭其已打开的 hop；主体专属资源的 ID、owner、routeRevision 与原 connectionId 保持绑定。重连需重新握手和查信任；已撤销的绑定不再借给新资源。明确已建立连接在信任策略更新时的退役规则，禁止跨身份池复用。H08 的缺失身份/口令交互恢复另沿用 attempt+hop+promptId、一次消费、授权主体以及超时规则，外部来源不能提供本机路径或令其他主体替其签名。现存 `withAuthentication` 可能在连接前读取、解析私钥，应分别验收本地取材时机和网络中凭据发送时机。
5. **拟涉及文件。** 首片修改 `plugins/ssh/src/engine/{auth-profile,host-configurations,manager}.ts` 和相应桌面身份选择/摘要、上游注册与固定 patch/lock；用 `host-auth.engine.test.ts`、`manager.test.ts` 加回环验证。主机 CA 再改 `known-hosts.ts`、`shared/trust.ts`、`connectHop` 及依赖的 KEX 边界，复用 `tests/e2e/ssh/trust.spec.ts` 的信任时序和 `public-resources.engine.test.ts` 的主体授权夹具。agent 证书另交付：验证 agent 已持证书身份和“外部配对证书 + 仅持裸钥 signer”两种来源，各自限制 IdentitiesOnly；不默认开启远端 agent forwarding。某一路径通过不能替另一条签收。

## 性能、夹具与未证实事项

**性能预期取决于握手与业务流是否分离。** A 的补丁不改变现有 channel 数据路径，预计额外开销主要来自每跳证书解码和验签；本次没有延迟、吞吐或内存测量。B 让所有 channel 数据经过宿主 IPC，不能据语言或库的吞吐推导桌面表现。后续在同一主机、同一 OpenSSH fixture、相同算法/窗口/负载和相同连接数下，分别测直接/一跳跳板、冷/热连接、多 channel 共用和并发取消。记录 TCP 接受与认证次数、各跳握手 p50/p95、Shell 回显 p95、固定文件 SFTP 上下行 MiB/s 与哈希、正反向转发吞吐、CPU/RSS、慢读背压、释放后的 channel/监听数。按现有归属预期断言复用次数，无业务数据的验证助手不能承载传输流量。

| 验收路径 | 实施者应采的独立证据 |
| --- | --- |
| Linux 私钥与用户证书 | 两台临时回环 sshd，独立主机/用户 CA、测试身份和临时 Vault。直接及经跳板取得服务器原始认证记录，证明目标收到 Ed25519-CERT、使用选中账号/主体；同私钥无证书时由仅信用户 CA 的服务端拒绝。过期、错误类型、错配 key、伴随文件失效、续期重连、加密私钥口令及取消各自有独立结果。用原版与候选对照，并保留普通裸钥登录回归。 |
| Linux 主机 CA | 服务端只发布 host cert，按 hop 分配不同 CA；从批准的 CA 公钥和固定证书序列验证实际协商、CA 与主体指纹。测试准确主机、非 22 端口、IPv6、通配允许/否定、hash、不同端口、已知 pin 变化、撤销主体/CA、过期、未来生效、错 principal、未知 CA、未支持 critical option、重密钥协商。失败 hop 的服务端认证计数为零；前一跳只出现自身获准的认证。成功后 shell/resize、SFTP 字节和哈希、正反转发与关闭均可观察。 |
| 隔离与并发 | 两个外部主体和工作台使用同一目标。外部逐跳授权不足、等待时权限撤销或路由更新、重复回答、草稿与另一 Vault 均无法领用原连接。断言新 hop 拨号/forwardOut 计数、原监听释放、对照通道仍工作。只读/不可信来源不能写 CA。服务器拒绝须与本机身份不可用、未授信主机区分。 |
| macOS / Windows | 各自打包 Electron Engine 跑证书正反例；macOS 用临时测试 agent socket，Windows 用隔离测试账户的 OpenSSH agent 管道及临时测试身份，验证路径、ACL、加密私钥、agent 签名选中对象及用户取消。若交付 Go helper，加每种发包架构的签名、装载、缺/错版本和崩溃清理。可先复用 Motty `tools/e2esshd/certs.go` 的 E2E_USER_CERT、E2E_HOST_CERT 与 `internal/sshconn/certificate_test.go`，再以独立 OpenSSH sshd 做互操作判定。 |

**其余 H05–H08。** 基线已有普通指纹 Windows 逐跳验收及多轮多问路径。完整 IdentitiesOnly/IdentityFiles 列表、agent 内证书、RSA-SHA2/ECDSA、PPK v3、OTP seed/TOTP/HOTP、缺本机身份恢复、agent forwarding/X11 和跨平台发包不能从首片推得。锁版 ssh2 的内建 PPK 正则只覆盖 v2 的 RSA/DSS 子集。已有 keepalive 未设、显式 0 以及每主机超时应照旧回归。这份报告没有运行 SSH 握手、构建、E2E、性能测试或平台门禁。

**来源与许可证。** Huhu 锁 ssh2 1.17.0（MIT，Brian White）、类型包 1.15.6。采用 PR 时保留 MIT 声明并在 ledger 记准确提交、改动文件、补丁摘要及回归结果。Motty v0.4.12 为 Apache-2.0，移植代码时保留 LICENSE、NOTICE、作者及变更说明。Go x/crypto v0.59.0 为 BSD-3-Clause，分发可执行文件或 WASM 时照样附许可；Go 方案还要逐项登记实际带入的依赖。原有 H1.2 Windows 参考构建使用另一 Motty 提交 `2daa9db5`，不能作为 v0.4.12 或 Huhu 证书实现的运行结果。[ssh2 发行版](https://github.com/mscdex/ssh2/tree/v1.17.0) · [Motty 固定版](https://github.com/t8y2/motty/tree/102228261703d8f22c5eb98b1c500e2a24889dee) · [Go x/crypto 许可证](https://raw.githubusercontent.com/golang/crypto/v0.59.0/LICENSE)

**交付限制。** 本轮只写本报告及同目录临时稿。发布前，`hc get t3p` 返回 unavailable，Core lock 位于只读文件系统（os error 30）。报告以共享文件为准，发布后按协议另行尝试 `hc send`，投递结果在终端回执中说明。

## Lead 验收

Lead 接受设计交付并核对既有依赖边界。原版 ssh2 不能处理所需证书协商。优先在同一 ssh2 传输验证受控 Ed25519 用户证书路径，再制定实际主机 CA 互操作切片；两者均未实现或验收。
