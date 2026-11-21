# #6 Windows Web 分享 HTTP 与活动流独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t4z
- task — task06.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task06.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report06.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t4z`，清单指向 `task06.md active`。
- 执行结果 — done（复核完成，签收边界见下）

## 结论

| 审查轴 | 签收建议 |
| --- | --- |
| 规格 | **分享后端生命周期通过，Web 能力目录暂缓签收。** 真实 Engine 验证了启停、端口变化、同配置重启、切 Vault、按邀请撤销及活动流断开。Web 的可调用目录仍包含桌面专用能力。 |
| 规范 | **监听器、邀请归属和流隔离通过，授权边界需收口。** 复用现有 Dispatcher、事件和终端服务。应让桌面专属检查同时覆盖发现与执行，并明确 Workbench 身份和设备专用权限的边界。 |

建议保留本候选已验证的 HTTP／WS 分享后端，在统一 Web 能力判定及核对敏感能力所有权后，再签收含 Web 能力目录的装配。真实浏览器 UI、随包入口和系统终端互操作另验。

## 规格轴

### P2 · Web 能力发现与所有者检查不一致

Windows 回环真实 Engine 上，使用有效生成邀请建立的 Web 会话查询 `GET /api/v1/capabilities`，结果包含 `web.share.status`。同一会话调用该只读能力，返回 `PERMISSION_DENIED`。代码路径为 `packages/kernel/src/dispatcher.ts:42–46、125–126`，发现与第一层执行授权均放行 Workbench。随后 `packages/kernel/src/capabilities/web-share.ts:21–28` 在所有者 handler 内再限定桌面。其他分享管理动作采用同一注册逻辑。建议登记可用于发现与执行的可信入口约束，并保留 handler 的所有者检查。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/final-lifecycle.log)

### 已验证的行为

- **G6.1 启停与端口。** 真实 Engine 初始为停止，回环 Web 与控制监听器端口不同。对活动监听器重复提交相同配置，端口和代次保持。指定新端口后原监听器关闭、等待中的旧活动流断开，旧邀请及会话在新监听器得到 401。停止后按同配置重开同一个端口会生成新代次。占用端口得到 `port-in-use`，控制 `healthz` 保持 200。监听器的地址与网卡变化用例通过，真实 Engine 动态复验范围为 Windows 回环。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/final-lifecycle.log) · [候选测试](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/candidate-tests.log)
- **G6.2 静态入口和来源。** 使用合成公共资产验证任务深链、JavaScript MIME、缺失资源 404 和 Web 侧 `/mcp` 404。真实 HTTP 拒绝错误 Host、转发头、POST 缺少 Origin 和错误 Origin。WS 拒绝错误 Origin。仅桌面 Bearer 不能兑换邀请或认证 Web 能力和 WebSocket。有效会话用 Cookie 引导，实际返回 `HttpOnly`、`SameSite=Strict`，同源 GET 可无 Origin。Windows 原生 HTTP 客户端用于复核 Host，首轮 Fetch 夹具未实际发出预期的 Host 覆写。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/final-lifecycle.log)
- **G6.3 两份邀请、三个会话及共享业务。** 取回活动邀请得到同一邀请值，同一邀请兑换两次产生独立会话，加另一邀请的一个会话共三个。所有引导的 Vault 与监听器代次吻合。Web 创建合成任务后用同一意图重放得到同一任务，控制端可读。实际变更到达三条 Web 流及一条桌面流。邀请、会话与桌面令牌均未写入报告或证据结果。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/final-lifecycle.log)
- **G6.4 撤销、重启与切 Vault。** 在两条已升级活动流空闲等待时撤销同一邀请。两条流均关闭，旧邀请兑换、旧会话 HTTP 与重新升级被拒绝。另一邀请的流和会话保持可用，桌面流仍打开。授权的 CLI 和 MCP 身份可继续经控制 HTTP 读取合成笔记。独立重启相同 Vault 后仍可读原任务，分享默认停止，按同配置重开时拒绝旧邀请和 Cookie。关闭原 Engine 后切至另一个合成 Vault，在同一 Web 端口取得新 Vault 和新代次，旧会话继续拒绝。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/final-lifecycle.log)
- **共用流桥接。** 合成 `WebShareService`／`EventBus` 夹具在实际 WebSocket 上收到一个指定二进制终端帧。随后发布业务事件，只有事件客户端收到 JSON。撤销同一邀请时终端与事件流均关闭。真实 SSH、Core 会话及 PTY 待后续验证。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/final-lifecycle.log)

## 规范轴

- **来源和身份有明确入口。** Web listener 的 HTTP 和 WS 都匹配当前已公布来源与 Host，并拒绝转发头。HTTP 只从本代 Cookie 创建 `web:<session-id>` principal，WS 使用该绑定的邀请所有者认证。控制 listener 单独鉴别 Bearer，仍拒绝外部扩展事件订阅，其终端仍校验桌面身份。撤销先删除邀请和相关 session，随后由 AbortSignal 终止所属活动流。静态资产来自宿主提供的公共构建根与预设路径，IPC 独立传递桌面凭据。该资产根须由受信宿主指定并只含公开资源。定位 `server/web-session-http.ts:13–44`、`server/web-share.ts:35–69`、`server/web-invitations.ts:52–83`、`server/ws-workbench.ts:24–97`、`server/web-assets.ts:6–33`。
- **Workbench 与外部工具的权限。** `isWorkbenchCaller` 令已认证 Web 工作台不受 CLI／MCP／受权 HTTP 的工具开放选择限制，符合 #6 单用户工作台编辑语义。外部入口和插件身份继续走各自策略。Notes、Tasks、Inbox 的来源与作者采用工作台语义。Vault 受保护列表、Agent 任务配置与评论、自动化执行类规则也改用这个更宽的工作台判断。桌面专属的分享管理保留显式所有者检查。定位 `packages/contracts/src/capability.ts:4–11`、`dispatcher.ts:42–57、125–139`、`capabilities/vault.ts:152`、`plugins/tasks/src/engine/index.ts:24–38、124–141、196–213` 和 Automations、Notes、Inbox 差异。
- **敏感设备能力须按所有者核对。** `exposable: false` 约束外部工具，单靠该字段无法表达桌面范围。仍用它体现旧桌面边界的网关管理、插件管理和 Safe 显式取值等能力需明确 Web 支持。静态代码中部分 admin handler 和 Safe 的既有 `desktopOnly` 声明缺少等价的主机检查。动态复核限于上文的只读状态检查。建议按当前 G6 与领域规格确认这些入口，并把设备专属权限纳入同一发现／执行契约。定位 `packages/kernel/src/capabilities/system.ts` 的网关及插件管理注册和 `plugins/safe/src/engine/index.ts:23、83–89`。

## 产物与未测范围

- 候选 `aab62ba183bf054d7225bd6e36dcab7783e70c5f`，直接父提交 `5beba4c1c8028988a9c7440584fbcd4c71b2b4fb`，21 个改动文件。对照实际 Git 对象，`git diff --check` 通过。只解包候选相关路径并复用集成检出的同锁依赖，Windows build 26300、Node 24.21.0、Vitest 3.2.7。
- 候选 `web-share`、`server`、`web-assets`、`web-invitations` 共 4 文件 19 项通过。真实 Engine HTTP／WS 与合成终端桥独立探针通过，Core 为 `t10v`、`t10w`、`t10y`。归档脚本、探针和脱敏输出位于 `D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf`。 [候选测试](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/candidate-tests.log) · [探针实现](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/web-lifecycle-final.mjs) · [环境](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/setup.json)
- 原型资源指纹匹配 `e607f23a157edbf03aa83177dc613a7dd865d25b75155e8f3cc5dc73515c6ca6`，仍待用户确认。浏览器交换后清理地址、实际宿主能力、静态随包资产、第二设备与真实 LAN／IPv6、Unix 宿主差异、真实 Core／SSH 终端和原生 MCP 传输待后续验证。邀请列表当前只返回有效邀请，撤销后的产品状态展示需在 UI 验收确认。 [原型指纹](D:/Document/code/huhu/temp/issue-baseline/t4z-web-aab62ba-NFR8zf/prototype-fingerprint.log) · [确认记录](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/prototype-review.md)

## Lead 验收

由 Lead 核验后追加。
