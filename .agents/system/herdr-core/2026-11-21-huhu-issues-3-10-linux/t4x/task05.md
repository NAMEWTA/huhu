# #7 H3.3 首段 SOCKS5 与 HTTP CONNECT 传输

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 本机默认 Core `wta-ubuntu`，Lead `t3p`，实施终端 `t4x`
- 任务 `t4x/task05.md`，报告 `t4x/report05.md`
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-outbound-proxy`，基线 `1ed17781837eddd35be194c1e12a85da6a52939f`

按 `dev-build` 与 `t5h/report03.md`，实现 H3.3 第一段的真实出站代理。复用仓库已经安装并直接锁定的 `socks@2.8.10`（MIT）和 Node `http.request` CONNECT。仅可写 `plugins/ssh/src/engine/outbound-proxy-dial.ts` 与本片一个 Vitest 文件。建议签名 `dialOutboundProxy(proxy: { protocol: "socks5" | "http-connect"; host: string; port: number; credentials?: { username: string; password: string } }, target: { host: string; port: number }, signal: AbortSignal): Promise<Duplex>`。入口由 Lead 接入现有 SSH Manager、持久配置、凭据和 public 路由核验。无需改 package、根锁、Manager、注册、共享契约、前端或任何其他 agent 的文件。

保持当前 SSH 首段真实目标的域名、IPv4/IPv6 与端口，DNS 交代理。交给 Manager 的是同一条经过认证的双向字节流。CONNECT 成功的 head 或 SOCKS 成功同时到达的目标首字节完整保留。保留有界头部、流量和待交付数据。响应拒绝、407 或 SOCKS 认证失败、连接错误、超时和取消分别回传现成的 `SSH_TIMEOUT` / `SSH_DISCONNECTED` 与无秘密的 `{stage:"proxy",reason:...}`。不把代理原生异常、代理回复正文或凭据写进错误和日志。失败时关闭自己所持 socket，取消后迟到的成功也关闭。禁止回退直连目标。只处理第一段代理，不加入 ProxyCommand 或 ViaShell。

回环测试使用本机临时代理 fixture，覆盖两种协议的匿名和认证、目的 authority、早到目标字节、拒绝、取消、超时、连接失败和关闭，只准跑一个直接相关的 Vitest 文件。实际 worker node_modules 已按冻结锁安装。无远端写入，无其他派发，无构建、E2E 或重型验证。报告同号写明文件、真实命令、观察结果、未运行项及参考 Motty 固定版本和许可证。
