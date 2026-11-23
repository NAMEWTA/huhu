# #7 H3.3 首段 SOCKS5 与 HTTP CONNECT 传输

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4x`，本机默认 Core `wta-ubuntu`，Lead `t3p`
- task — `task05.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task05.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report05.md`
- 执行结果 — 候选实现在工作树。内存协议验证通过，TCP 回环待验收。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-outbound-proxy`，基线 `1ed17781837eddd35be194c1e12a85da6a52939f`。两个新增文件未暂存。

## 产物

- `dialOutboundProxy(proxy, target, signal): Promise<Duplex>` 只连接指定代理。目标域名交给代理解析，保留目标 IPv4、IPv6 和端口。HTTP CONNECT 对 IPv6 加方括号，仅接受 2xx，按需发送 Basic 认证。SOCKS5 支持代理协商匿名或用户名／密码认证。交给调用者的是原 socket，包含 HTTP `head` 或 SOCKS5 锁版延迟补发的目标首字节。交接前暂停读取，随后使用 Node 流背压。 [outbound-proxy-dial.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/outbound-proxy-dial.ts)
- 拨号和握手共享 20 秒截止时间，HTTP 响应头上限为 16 KiB，握手读取计数上限为 128 KiB。`HuhuError` 详情为 `{stage: "proxy", reason}`。`timeout` 使用 `SSH_TIMEOUT`，其余 `refused`、`authentication-failed`、`connect-failed`、`cancelled`、`invalid-configuration`、`response-too-large` 使用 `SSH_DISCONNECTED`。错误只含固定信息，失败和交付前取消回收所持 socket。
- 同一 Vitest 文件包含真实 TCP 回环夹具和内存双工夹具。覆盖两种协议的匿名与认证、域名与两种 IP 地址族、早到的目标数据、双向字节、认证和连接拒绝、HTTP 头上限、连接错误、超时、取消与关闭。内存夹具仍运行 Node HTTP 解析器和锁定的 SocksClient，并覆盖 SOCKS5 成功到延迟交付之间的取消。 [outbound-proxy-dial.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/outbound-proxy-dial.test.ts)
- Manager、配置、权限与公开入口由 Lead 集成。本片交付传输函数和上述测试文件。

## 来源与许可证

- 按 `t5h/report03.md` 复用 SSH 插件直接锁定并安装的 `socks@2.8.10`（MIT）及 Node 内置 `http.request` 的 CONNECT 事件。通过公开事件接回握手余字节。 [设计报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report03.md) · [Node HTTP CONNECT](https://nodejs.org/docs/latest-v24.x/api/http.html#event-connect)
- Motty `v0.4.12` 解引用为 `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0，NOTICE 署名 Motty contributors。参考 `internal/sshconn/proxy.go` 的首段域名解析、响应头限额、提前数据交接及超时取消语义，以及 `proxy_test.go` 的协议用例。采用行为参考，源码和资产复制量为零。 [proxy.go](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/proxy.go) · [proxy_test.go](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/proxy_test.go) · [LICENSE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE)

## 验证

使用 Node `24.21.0`、pnpm `12.10.1`。

| 实际命令 | 观察结果 |
| --- | --- |
| `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/outbound-proxy-dial.test.ts` | 仅此测试文件，退出 0。19 项通过。沙箱对 `listen(0, "127.0.0.1")` 返回 `EPERM`，17 项 TCP 回环用例明确跳过，测试输出逐项标出原因。前序定向运行用于定位内存夹具的关闭行为和 SOCKS5 交接丢字节，修正后重跑此命令。 |
| `pnpm --config.verifyDepsBeforeRun=false exec tsc --noEmit -p plugins/ssh/tsconfig.json` | 通过，退出 0。 |
| `pnpm --config.verifyDepsBeforeRun=false exec oxfmt --check plugins/ssh/src/engine/outbound-proxy-dial.ts plugins/ssh/test/outbound-proxy-dial.test.ts` | 两文件通过，退出 0。 |
| `pnpm --config.verifyDepsBeforeRun=false exec oxlint -c oxlint.json plugins/ssh/src/engine/outbound-proxy-dial.ts plugins/ssh/test/outbound-proxy-dial.test.ts` | 两文件通过，退出 0。 |
| `git status --short`、`git diff --check`，以及两新增文件各自与 `/dev/null` 的 `git diff --no-index --check` | 工作树仅有上述两个未跟踪文件，未报告空白错误。 |

真实 TCP 回环、Manager 及公开入口验收仍待 Lead。按任务分工未运行构建、E2E、全量测试或重型验证，也无远端写入。

## Core 回告

`hc get t4x` 返回 `cannot open core lock: Read-only file system (os error 30)`。任务身份已通过本机终端 ID、topic、manifest 和工作树核对。

发布同号报告后向 `t3p` 执行 `hc send`，同样返回 Core 锁只读，退出码 5。回告消息未送达。共享报告可读取。

## Lead 验收

传输候选在实施分支归档为 `cd62eede`，由 Lead 合入 `31352cae`。Linux 完整回环环境下本片 36 项通过。CLI、HTTP MCP 实际三跳分别通过，SSH、Engine 类型检查和 33 项相邻回归通过。日志 `h7-first-proxy-recheck.log`、`h7-first-proxy-regress.log`。接线审查与桌面 E2E 另行验证。
