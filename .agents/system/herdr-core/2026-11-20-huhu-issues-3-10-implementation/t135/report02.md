# #4 W6.1 Codex 原生受控派遣

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t135`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135/report02.md`
- 执行结果 — **done**
- 本地提交 — `9b34df699ecfdd6f46b210f2d95b362cccdad56d`，直接父提交 `ff0afc5866e85b399143574f9e62f6820d4a90c1`
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-task-executor`，Git 状态干净

## 交付

Windows 上显式配置的 Codex 0.171.0 可作为受控 `new` 目标。Core 在所选 Space 启动独立 helper。helper 独占实际 Codex App Server 的 stdio，经过 `thread/start` 获得原生 thread，再由 Engine 核验 Core、地址、PID、持久启动代次与原 Huhu session。Engine 经该代次的本机认证通道提交输入。helper 在发送前持久写入原执行身份、正文摘要和客户端消息 ID，收到同一 RPC 的 `turn/start` 响应才保存签名收件凭据。Tasks 核对原轮与正文摘要之后进入进行中，只写一次派发评论。原生签收投影为 `nativeWrite: provider_accepted`，此次输入的 `coreWrite` 为 `not_sent`。

可读现场沿用原 Space、Huhu session 和 Core 地址。受控会话使用观察模式，人工 TUI、原生命令与手动历史恢复继续走各自已有入口。后端仍保留原 Tasks 授权与输入仲裁。存在发送意图却缺原生响应时保持 `unknown`，同键重传查询原记录。启动、进程通知和完成事件各自单独记录，不能代替本轮输入签收。

## Windows 启用条件

桌面 Engine 启动环境使用 `HUHU_CODEX_DISPATCH_BIN` 指定 Codex 0.171.0 原生 `.exe`，`HUHU_CODEX_DISPATCH_HOME` 指定专用 Codex 配置目录。桌面传入随包 helper 路径与 Electron Node 启动程序。专用目录与当前全局 Codex home 分开，受控启动冻结二进制、helper 与专用配置的文件身份。运行使用 ephemeral thread、只读沙箱和 `approvalPolicy: never`。手动 TUI 使用的自定义参数和环境变量不作为受控启动授权。受控路径的私有启动和收件记录位于当前本机 Vault 实例对应的桌面用户数据目录。

## 实测与规格

| 条款 | 实际观察 | 证据 |
| --- | --- | --- |
| W6.1 / C04、F01 | 真实 Codex 0.171.0、Electron Node 运行方式、Windows Core 0.1.19 和实际 Engine HTTP 入口共同通过。单个原生 ephemeral thread/turn 绑定原 Huhu session 与 Core 地址。本机合成 Responses API 收到一次包含原正文的请求，任务追加一条派发评论。真实 Codex 进程使用临时 home，模型响应来自本机夹具。 | [真实 Codex 取证脚本](evidence-task02/real-codex.mjs) · [最终验证输出](evidence-task02/verification.log) |
| W6.1 / C10、F02 | 固定 Core 的合成协议夹具里，同键并发只取得一个 run 和一次原生输入。关闭 Agent、重开 Engine 后找回原 Core 地址与原生迟到 ACK。服务端请求使用相同 RPC ID、先到的 started 通知以及无响应时的 completed 通知均未签收。丢失原生响应的轮次保持 `unknown`，重传未重发。 | [回归与故障注入](evidence-task02/regressions.log) |
| W6.1 / F01、F02 | 在认证连接已建立、提交边界之前停用 Tasks，原生写入次数为零。重新启用后同一轮只写一次。显式 existing 和 resume 返回 `target_unsupported`，任务保持未开始。合成夹具的 Core PTY 输入次数为零，关闭夹具后无存活 PID。 | [回归与故障注入](evidence-task02/regressions.log) |
| Windows Engine 构建 | 普通整包构建在未改动的 PDF 资源配置处无法解析 `pdfjs-dist`。本轮从仓库配置原样提取 main 段，使用同一 Electron Vite 构建成功生成 `out/main/engine.js`，并核对了 helper 的资源映射。Engine bundle SHA-256 为 `45ce6de0981fa39d4dc4f2c177ed8206a4831b0aa9c3a44e5f42326e5a41ce6a`。 | [整包构建日志](evidence-task02/electron-vite.log) · [main 构建证据](evidence-task02/build-main-pane.log) |

对照 [W6.1 验收](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md)、[Issue #4 验收矩阵](../../../../dev/changes/2026-11-19-issue-4-agent-cli/source.md)、[t13g 设计与取证报告](../t13g/report01.md) 和 [Codex App Server 文档](https://learn.chatgpt.com/docs/app-server)。

## 范围与清理

- 定向回归 8 文件、47 项通过、6 项条件跳过。Agent CLI、Tasks、Engine、Desktop 类型检查通过。改动文件的 oxfmt、oxlint 与 Git 空白检查通过。运行使用 Windows x64、Core 0.1.19，固定二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。 [运行命令](evidence-task02/verify.ps1) · [最终验证](evidence-task02/verification.log) · [退出状态](evidence-task02/verification-exit.log)
- 本片实测范围为 Windows 上的受控新建及输入签收。云端模型、真实账号登录、持久原生线程恢复、安装包端到端和界面定位留待对应验收。W6.3 双 ACK 和 Tasks 问答由后续切片接续。
- 提交沿用原工作树，根锁与冻结父提交一致。隔离 Core、临时夹具和本轮验证窗格均已清理。 [窗格清理](evidence-task02/cleanup.log)

