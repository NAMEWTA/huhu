# #7 H4.3 · SSH 跨窗口控制交接的终端桥

- terminal_address — `t4x`，本机默认 Core `wta-ubuntu`，Lead `t3p`
- task — `task08.md`
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-window-control`，基线 `84d19cb8cb180c2daa28ad2d5964f2729e196d49`
- 执行结果 — 终端桥候选已交付，两个文件修改、一个新增，未暂存。宿主及窗口接线由 Lead 集成。

## 行为与授权

- 复用现有 `attachShell` 的回放、实时输出和 detach。单一控制 socket 继续决定二进制输入及远端 resize。目标使用同一 shell ID、以 `observe: true` 附着，回放后获得 `mode: observe`，认领后继续观察。源提交时同一同步回合核对角色并更新控制者。切换后仅目标可以写入和改变远端尺寸。
- 观察源提交时双方继续观察，原控制者不变。交接目标始终不进入普通等待队列。普通等待者只在当前控制者实际断开后接到既有 `control-free`。成功的源解绑时目标继续工作。
- `SshTerminalView.desktopHandoff?: boolean` 必须由已认证的桌面宿主传入。服务端另外排除 `ssh-local-*` 和 `ssh-external-*`。Web、消息正文和 URL 参数不能赋权。
- 每个 shell 同时只保留一项准备及一个认领目标。凭证由 24 字节随机数编码为 32 字符 base64url，30 秒到期。源 socket 保留最近一项同样为期 30 秒的终态回执，关闭或到期清理。回执重放不改变控制者、角色或尺寸。既有 4 MiB 输出积压上限也用于文本回执，提交前目标预留回执空间。
- 实现与类型位于 [terminal-bridge.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/terminal-bridge.ts) 和 [terminal-handoff.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/shared/terminal-handoff.ts)。时序依据 [t5h/report04.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report04.md)。

## 消息合同

同一现有 WebSocket 的 JSON 文本帧，最长 1024 字节。`operationId` 是源为本操作生成的 1–64 个 ASCII 字母、数字、点、下划线或连字符。`ticket` 只能通过可信的宿主交接传给指定目的窗口。JSON 无效、过长或未知类型的文本帧忽略。

| 请求 discriminator | 参数及发送方 | 成功事件 |
| --- | --- | --- |
| `handoff.prepare` | 源发 `{operationId}` | 源收 `handoff.prepared {operationId,ticket,expiresAt,targetMode}`，其中 expiresAt 为 Unix 毫秒，targetMode 为准备时源的实授角色。同源同操作可重收原 ticket，已认领时也重收 claimed。 |
| `handoff.claim` | 同 shell 的显式观察目标发 `{ticket,cols?,rows?}`，尺寸必须同时提供，或同时省略 | 两端收 `handoff.claimed {operationId,ticket,targetMode:"observe"}`。同候选重发只给该候选确认。后续 `resize {cols,rows}` 可在观察期更新待接管尺寸。 |
| `handoff.commit` | 原源在收到 claimed 后发 `{ticket}` | 两端先收既有 `mode` 确认，源为 observe，目标为准备中的 targetMode。再收 `handoff.committed {operationId,ticket,sourceMode:"observe",targetMode}`。目标获 control 时用最近尺寸进行一次 PTY resize，尺寸按 1–500 列及 1–300 行限幅。 |
| `handoff.cancel` | 原源或已认领目标发 `{ticket}` | 向仍可发送的参与者返回 `handoff.cancelled {operationId,ticket,reason:"cancelled"}`，原控制状态保留。 |

- 单请求拒绝用 `handoff.failed {request,reason,operationId?,ticket?}`。`request` 为完整请求 discriminator。有效的相关参数只回显给请求者。reason 可为 `not-allowed`、`malformed`、`busy`、`invalid-ticket`、`target-required` 或 `wrong-role`。未认领即提交保留原 pending。
- 已准备操作在超时、源或已认领目标关闭、shell 结束、角色失配或目标积压时终止，给仍可发送的参与者发 `handoff.cancelled`。对应 reason 为 `expired`、`source-closed`、`target-closed`、`shell-ended`、`source-changed`、`target-backpressure`。目标在认领前离开时，宿主可由源显式取消，也可等待到期。
- 同一原源 socket 可按 `operationId` 重发 prepare，或按 `ticket` 重发 commit/cancel，对账最近终态。回执只描述历史，实时角色始终由独立的 `mode` 消息确定。目标关闭后旧提交可对账，普通重挂的新持有者不受影响。

## Lead 接线与验证

- 在已认证的桌面终端监听入口传 `{...options, desktopHandoff:true}`，注意当前 Web wrapper 也经过公共 terminal 函数。Web 调用须继续传原 options。使用宿主的窄启动参数传递 ticket，并核对 Vault、Engine 启动实例、runId、generation、paneId 及 shellId。提交成功后才移除源 Pane 的输入和广播回调并解绑。
- 渲染器必须在原目标 WS 上接收从 observe 到 control 的 `mode`，并据此开放输入与 resize，保持同一 xterm 附着。在认领时提供当前 xterm 尺寸，准备期间可送后续 resize。按 operationId/ticket 关联 `handoff.*` 回执，避免把重复的历史回执应用为新的 mode 变化。
- Node 24.21.0 下运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/terminal-runtime.test.ts`，最终 1 文件、16 项通过。内存 socket 核对同 shell attach 次数、首次回放、结果/角色、write/resize 序列、源和目标取消、过期、关闭、积压、两类观察源、跨 shell、Web、公开及本地 shell、第三方队列和成功回执重放。 [定向测试](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/terminal-runtime.test.ts)
- `pnpm --config.verifyDepsBeforeRun=false exec tsc --noEmit -p plugins/ssh/tsconfig.json` 退出 0。
- 宿主鉴别、preload、Electron 真正开窗、目标定位、焦点和源视图的解绑效果仍由 Lead 端到端验收。本片未启动浏览器或 Electron，未运行 E2E、打包或其他测试，无远端写入。

## 文件 SHA-256

```text
4df9203559774f0051ce67a0ec8705bac95c9ad45f54be26364013b1dd8e0103  plugins/ssh/src/engine/terminal-bridge.ts
c6a420f0a5af003de5b10d6039bd9b1bba6c18e99df2b2a1110fc6c3098a56d4  plugins/ssh/src/shared/terminal-handoff.ts
1544acb2853ee620cfaf50abb444af5ae270acd4bc3e2e2786fed1d19ac13a0e  plugins/ssh/test/terminal-runtime.test.ts
```

## Core 回告

`hc get t4x` 返回 `cannot open core lock: Read-only file system (os error 30)`。已核对终端环境、topic、manifest、分支和基线。

报告发布后向 `t3p` 执行 `hc send`，同样返回 Core 锁只读，退出码 5。回告未送达，共享报告可读取。
