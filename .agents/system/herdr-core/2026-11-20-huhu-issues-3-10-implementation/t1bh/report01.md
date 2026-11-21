# `22e82370` 收口前独立审查

**建议先处理 Mail 的会话状态、重放和目录登记，再按最终包签收。** Windows 本地定向检查通过 8 项。Codex Default 的生产包闭环（T7.2）及 SSH 远端实际监听范围仍需单独验收。

审查对象固定为 `22e8237010e38b8b0049846156cd42af2f3fb3cc`，按 `a183c7b8`、`4563a422`、`22e82370`、`b686b0bd` 的各自父提交比较，并抽查 `22fbdc4f`、`96d79929` 的 H8。开始时 integration HEAD 与目标一致且工作树干净。运行期间 Lead 更新了 SSH E2E 文本和入口。定向测试的源码及测试文件与冻结对象相同，未纳入后续差异。资料依据见 [task01](task01.md)、[T7.2](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T7.2-full-task-journey.md>)、[Mail 规格](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md:13>)、[G3.2](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G3.2-mcp-discovery.md>)、[H8.2](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H8.2-forward-runtime.md>)。

## 规格发现

### P2 · 浏览器回执失败能覆盖正在完成的授权

回调验证通过后先转 `finishing`，随后异步交换、验签、保存。此时如 Main 尚未确认浏览器打开，而 Engine 的 5 秒定时器先到，`begin` 的 catch 仍把 `finishing` 判为 `live`，直接 `end(failed, browser-unavailable)`。`end` 只关监听并摘掉 abort 回调，已经开始的授权任务仍可保存，随后把同一会话改成 `configured`。窗口内也可能因为旧记录已被标为终态而让同地址再次开始。现有标准路测试的 `openBrowser` 立即返回，覆盖不到这段竞争。代码证据。验收时在本地夹具让有效回调先进入 `finishing`，随后模拟浏览器 ACK 丢失或失败，再放行交换。确认状态与保存结果一致，原授权目标最多落盘一次。 [回调与保存](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:137>) · [状态与 ACK 竞态](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:209>) · [Engine 定时器](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/main.ts:36>)

### P2 · 重启后重交原请求仍返回旧授权状态

`begin` 和 `cancel` 使用 Dispatcher 的通用写入幂等缓存，缓存结果落在 Vault runtime 并在 24 小时窗口内恢复。OAuth 会话则仅存在于 Mail 插件生命周期的内存 Map，停止时清掉。同 Vault Engine 重启后，使用同一调用者类别、同一幂等键和同一输入重交 `begin`，Dispatcher 先返回旧 `waiting`，客户端再查询该 session 得到 `NOT_FOUND`。取消请求在 `finishing` 时也可能缓存当时的快照，并在域终结后继续返回旧阶段。普通 CLI 每次生成新键，问题在复用调用键的入口上可见。已用实际 `IdempotencyStore` 和合成回执验证重开文件仍命中旧 `waiting`，完整 Engine 重交结论由调用链得出。验收要求同键请求在原代次读取实得状态，在新代次得到明确失效状态，同时保留原请求的浏览器启动防重。 [会话与销毁](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:225>) · [缓存先于 handler](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:89>) · [持久缓存装配](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:406>) · [缓存重读](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/idempotency.ts:29>)

### P2 · 服务令牌共用 OAuth 会话所有者

授权会话的 `actor` 只记录 `caller`，查询和取消比较该值。HTTP 服务的所有令牌在发行与重载时都映射为 `http`，HTTP MCP 也传递该值。管理员开放相应能力后，不同服务令牌只要持有同一 session ID，都会被视为同一所有者。现有用例只比较 `desktop` 和不同类别的 `web:other`。回调 state、PKCE 与 provider 账号主体校验仍在生效。代码证据。验收应让两枚合成的独立服务令牌分别调用 status 和 cancel，校验其会话归属，同时保留桌面查看和管理当前 Vault 会话的约定。 [会话所有者检查](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:56>) · [服务令牌发行与角色](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/gateway-tokens.ts:53>) · [HTTP MCP 调用者](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/http-app.ts:100>) · [现有隔离用例](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts:178>)

### P2 · 停用的 Mail OAuth 能力缺少静态目录登记

四项 `mail.oauth.*` 在插件激活时动态登记。Mail manifest 和 Engine 的预登记都未声明它们。#6 要求停用项仍可见并可预配置。Vault 在 Mail 已停用的状态启动时，四项从 `includeInactive` 中消失。在同进程停用后，保留名称的行也失去 scope、输入输出及 exposable 属性，策略页无法对停用项保存选择。活动中的 CLI/MCP 正常发现由动态登记提供。代码证据。验收应覆盖停用后重启仍保留四项描述与默认关闭状态，授权服务在停用时发现不到工具，重启插件后按已存选择恢复。 [Mail manifest](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/huhu-plugin.json:13>) · [Engine 静态预登记](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:126>) · [停用目录取值](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/capabilities/system.ts:341>) · [管理契约](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/spec.md:5>)

## 规范与边界发现

### P3 · Google 客户端秘密仍沿非 Mail 进程环境传播

Electron Engine 在 `mailOAuthWithBrowser` 读取后删除 `HUHU_MAIL_GOOGLE_CLIENT_SECRET`，这个动作只影响该子进程。配置该环境变量的 Main 仍持有原值，Windows CLI PATH 检查所起的 PowerShell 继承 Main 全部环境。若从带相同配置的环境独立启动 CLI Engine，其进程没有 `parentPort`，也不会执行删除。此项是客户端秘密继承范围过宽的代码证据。合成测试未发现 access token 或 refresh token 出现在公开投影或扫描的 Vault 文件中。验收可用合成标记检查普通子进程环境，确认明文只经 Mail 所需的可信配置入口传递。 [Engine 读取与删除](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/main.ts:19>) · [独立 Engine 分支](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/main.ts:80>) · [PowerShell 环境](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/cli-install.ts:41>) · [现有外泄断言](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts:297>)

### P3 · Default 放行缓存以文件元数据代替启动时字节证明

`prepare` 在新文件戳时对 Windows x64 正式二进制核对 `0.171.0` 和指定 SHA-256，在 fixture 参数存在时禁用新增形态。后续复用路径、inode、长度、mtime 作为缓存键，helper 启动前也仅重核文件戳。若交付承诺每次都由确切指纹放行，同文件戳下的变更没有新的字节证明。未做本地文件替换。验收时明确是按安装文件信任边界缓存，还是要求在实际启动入口重新核对发布指纹。 [文件戳](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch.ts:71>) · [版本与哈希](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch.ts:137>) · [helper 启动核对](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:53>)

## 各切片的验收边界

- **Codex Default。** 受控线程申请 ephemeral、`read-only` 和 `approvalPolicy: never`，禁 shell 工具、Web Search 及继承 MCP，保留隔离 HOME。候选会核对实际启用的实验开关。新增形态限一题、无自动解决、非秘密、有互异的固定选项，回复与原执行和请求身份绑定。写 intent 及 RPC 返回不会自动产生接受回执。`resolved` 本身也不够。ACK 还要求匹配 thread、turn、原始调用与一致的答案。停止 RPC 的返回只提供传输反馈，结果收据需要同一 turn 的完成状态与最终文本。独立探针实际调用候选 reader，确认缺预先 call、跨 thread/turn 以及只有命名输出均不能产生配对证据。最终包验收还应锁定包与 helper SHA，跑 Default 同轮消费、缺原始输出、等待中断和重复停止，核对一条真实接受回执、唯一结果与未消费时的待核实状态。t19m 的 `40822efd` 原包未通过，临时 helper 的正反样本提供协议线索。 [线程配置](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:431>) · [ACK 和停止](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:226>) · [原包报告](../t19m/report01.md) · [临时 helper 诊断](../t19m/report02.md)
- **Mail 浏览器与账号。** Main 在当前 `ready` Engine 的私有端口处理消息，停止时拒绝新请求，换进程时忽略旧回复。外部目标固定为两家 HTTPS 授权端点，并检查对应本机回调的主机、端口、路径与 S256 标记。Engine 以 state、PKCE、nonce、签名、issuer、audience、地址检查及重授权的原 subject 和 revision 约束保存。当前夹具验到拒绝、过期、取消、重复回调、切 Vault、原账号保全和一次并发刷新，实测 IMAP／SMTP XOAUTH2。主进程只收到授权 URL 及浏览器返回布尔值。最终浏览器打开、真实 Google/Microsoft 登录及租户条件需对应明确获准的客户端与合成验收证据。 [Main URL 核对](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/engine-supervisor.ts:39>) · [私有消息](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/engine-supervisor.ts:164>) · [ID token 核对](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-provider.ts:169>) · [重授权保存](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts:149>)
- **MCP。** 两种传输共用 `createMcpServer`。新增 `{ data, opId? }` envelope，重定位内部 `$ref`，既有 JSON text 和错误内容保留。已用仓内实际 SDK 1.32.2 验证标量、数组、同名 schema 变化后重读以及 `tasks_list` 的 HTTP/stdio 一致性。长连接才发布 `tools/list_changed`，当前 HTTP 无状态并声明不支持该通知。现有样例兼容，实际旧版客户端和全量插件输出形态未遍历。 [结构化声明与响应](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/mcp.ts:16>) · [stdio 通知](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/mcp.ts:49>) · [HTTP 配置](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/http-app.ts:124>) · [现有 SDK 验收](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/test/cli.test.ts:53>)
- **H8。** 按规则 ID 和 revision 查找该实例，停止释放对应 listener 和 lease。夹具实际通过四模式 TCP、专用连接最后持有者释放、借用会话保留、跳板断开及显式恢复。Local、SOCKS5、CONNECT 由本机 `listen({host: 127.0.0.1})` 直接决定绑定。Remote 候选只知道它请求 `127.0.0.1` 且收到远端确认，`ssh2` 回调只给端口，显示的 `listener.host` 由规则常量填写。当前夹具自己强制绑定回环，无法证明其他服务端的实际地址。签收 Remote 的「实际绑定」需要远端主机监听证据，或把显示语义限定为确认后的请求地址并明确远端策略前置条件。 [规则停止](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/forward-runs.ts:161>) · [lease 所有者](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:302>) · [Remote 转发确认](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/forward-listener.ts:95>) · [状态发布](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/forward-runs.ts:142>) · [夹具绑定](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/ssh/test/fake-server.ts:131>)

## 本地取证

- `node node_modules/vitest/vitest.mjs run apps/desktop/test/engine-supervisor.test.ts plugins/mail/test/oauth-engine.test.ts apps/cli/test/cli.test.ts --pool forks --maxWorkers 1 --no-file-parallelism -t '邮箱授权|OAuth|同名 MCP|ACC-PL-06 MCP'` · 5 通过，18 由过滤跳过。
- `node node_modules/vitest/vitest.mjs run plugins/ssh/test/forwarding.engine.test.ts --pool forks --maxWorkers 1 --no-file-parallelism -t 'all four modes|a borrowed SSH|a jump failure'` · 3 通过，1 由过滤跳过。
- Node `--experimental-transform-types` 从业务文件读取导出的原始输出 reader 和实际 `IdempotencyStore`，两组断言通过。`git diff --check a183c7b8^ 22e82370` 通过。
- 本次只读审查使用 Windows、合成输入、回环夹具和现有报告。打包、真实 Codex、在线 OAuth、外部 SSH 和全量流水线未计入本报告的运行证据。唯一交付写入为本报告。
