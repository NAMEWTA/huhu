# t194/task03 外部 Agent 到桌面同包用例独审

Lead `t3p`，审查者 `t194`，状态 `done`。审查未提交的 CLI-only / HTTP MCP-only 两条用例、专属候选桌面夹具及包装器 `external-agent` 模式。任务范围与实现方 [t176-report21](t176-report21.md) 一致。

**未发现阻止 Lead 首轮实跑的静态缺陷。** 有一处桌面终端证据边界，现有断言能验证原会话定位与 Engine 的 WebSocket 握手。

- **P3｜握手断言不足以证明 Core 已附着终端。** 页面捕获同一 Engine 中带原 `sessionId` 的 WebSocket，并检查 `data-state="open"`。该状态在 `onopen` 写入，Engine 接受握手后异步执行 `terminal.attach`。如果该附着延迟后失败，测试可能已经通过 open 断言，后续同任务、结果和 Core 身份读取也不依赖终端附着成功。若需把实际终端附着作为验收证据，可沿用既有 WebSocket 帧采集，在点击前注册监听，并等待此 socket 收到原会话的二进制回放。受控 Codex 会话的观察模式通知可在附着前发出。 [现有断言](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L168) · [客户端状态](../../packages/ui/src/components/TerminalView.tsx#L96) · [升级与异步桥接](../../packages/kernel/src/server/ws-workbench.ts#L43) · [观察通知](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L121) · [附着后转发终端字节](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L185) · [现有帧采集](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L288)

## 核对结果

- CLI 模式调用已核验 AppImage 同目录的 `resources/bin/huhu`，使用私有 Vault 的 Engine 描述和 CLI 身份。HTTP MCP 模式使用候选 Engine `/mcp`，通过桌面测试管理员创建临时令牌、初始化协议会话，再用 `tools/call` 和结构化结果。桌面能力调用限 Space 查询、策略授权及 MCP 服务准备，没有代写任务。创建来源由服务端按受信 caller 推导。 [两个外部入口](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L60) · [桌面夹具准备](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L105) · [CLI 连接](../../apps/cli/src/connect.ts#L70) · [MCP 意图与回包](../../packages/kernel/src/mcp.ts#L86) · [来源派生](../../plugins/tasks/src/engine/index.ts#L369)
- 创建意图经 CLI 的 `--intent-key` 或 MCP 的 `_meta` 传入。Agent 创建和编辑同时具备 `tasks.agent.create` 的授权，符合生产守卫。派遣使用更新后的版本、输入 revision/hash 与独立 dispatch ID。回复使用原任务、run、会话、问题版本和 reply ID。重交同一派遣核对初始身份，结束时同时检查一个派遣、一个成功且已投递的运行、一条结果，并把原会话、原问题、原结果贯穿到真实桌面详情。回环原生 Codex 夹具还检查修改后正文进入首回合、续答携带 Circle，及恰好两次 Responses 请求。 [外部任务链](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L111) · [Agent 编辑守卫](../../plugins/tasks/src/engine/index.ts#L451) · [派遣复用语义](../../plugins/tasks/src/engine/dispatch.ts#L528) · [桌面与唯一结果断言](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L147)
- 两例隔离 Vault、HOME、XDG、provider 配置与回环服务。原生 Codex 和 AppImage 均有 SHA 校验，候选 Electron 可执行路径、资源路径和构建 SHA 有身份验证。清理在独立 Playwright fixture 预算中执行，先关闭桌面，再通过同 UID 且可执行文件匹配的套接字核对 Core 后停止，检查已知 PID 与私有套接字退出后删除目录，最后关闭回环 Responses 服务。包装器只启用两条用例，并校验预期通过数、零跳过、零 flaky 和零全局错误。 [私有启动及身份](../../tests/e2e/helpers/external-agent-desktop.ts#L16) · [Core 回收](../../tests/e2e/helpers/external-agent-desktop.ts#L55) · [清理预算](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L24) · [包装器](../../scripts/accept-linux-candidate.sh#L66)

## 版本与验证限制

| 文件 | 工作树 blob |
| --- | --- |
| `tests/e2e/helpers/external-agent-desktop.ts` | `eb7ea598a49011877dd0d21b03f505990f724392` |
| `tests/e2e/workflows/external-agent-desktop.spec.ts` | `e8645016ead61438565f5df273ea2a47982d1442` |
| `scripts/accept-linux-candidate.sh` | `89c53f154d06688ef6ae035960e53970989a37b4` |

两份新增文件的 SHA-256 与实现报告一致，核对了定向类型、lint、格式记录和包装器 `git diff --check`。本轮未启动 Electron、Core、Codex 或 Responses，未运行 E2E、构建、打包或全仓检查，实际同包结果待 Lead。
