# #4 W1.1 Windows 启动预检与 W1.2 重开对账

- 执行结果 — done
- terminal_address — t80
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/report01.md
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/receipt，分支 `impl/huhu-issues-3-10-receipt`
- 基线 — `ce5289ddd1ae5713167f6987fe6db53c3beef51f`，已含 W6.0
- W1.1 本地提交 — `5cda8418c5a278ee7c60b58599e28359949dd945`
- W1.2 本地提交及冻结候选 — `db0a562fd7c15a031509e7ac1477228de5e4bfd3`

## W1.1 启动预检和退出实测

Windows 上共用 `SessionsService.prepareLaunch` 校验真实 cwd。短的本地扩展盘符路径规范化为普通盘符形式。独立 Core 原生 RPC 复测中，现有 248–258 个 UTF-16 代码单元的 cwd 能创建合成 `.cmd` 和原生 `.exe` 进程，259、260、290 都返回 `spawn_failed` / Windows 267。259、260、290 的扩展形式也返回同一错误。两个 Huhu 入口对新启动请求共同在预检返回 `INVALID_INPUT`、`stage: cwd`、`reason: windows_cwd_too_long`、`maxLength: 258`。夹具创建有效的 259、300 单元目录并验证预览与启动返回相同错误，Core 保持未启动。正常路径上 PowerShell 与合成 Agent 均退出 0，进程自读中文含空格 cwd 与预览一致，Core 记录保留绝对 `.cmd` 路径和分立 argv，含空格参数及中文提示分别作为一个元素。

| 锁定 Core 0.1.19 路径 | 观察结果 |
| --- | --- |
| 合成 `.cmd` 直接启动，分别设置 `keep: false` 和 `keep: true` | 自然退出 7。两者的 `wait` 都得到 `ended: true, exit_code: 7`，`get` 均为 `finished`，事件均有 `finished` / 退出码 7，随后地址仍是已结束终端。 |
| 用 PowerShell `-NoExit` 调用同一合成 `.cmd` | 屏幕显示 `FIXTURE_EXIT=7`，随后收到输入并打印 `SHELL_READY`。Core 跟踪的是 PowerShell，`wait` 得到 `ended: false, exit_code: null`。Shell 输出中的 7 由夹具读取 `$LASTEXITCODE`，Core 的进程退出回执只覆盖它启动的根进程。 |

因此在本轮实测的同一终端方案中，直接运行保有真正的 Agent 退出回执，外层 shell 能保有交互。W1.1 交付预检，产品交互继续沿用直接启动。完整交互返回 shell、真正 UNC、安装版 GUI PATH 与真实 provider 登录留待对应验收。 [W1.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W1.1-launch.md) · [t19 Windows 基线](../t19/report04.md) · [t54 复核](../t54/report01.md)

## W1.2 启动对账

继续使用 Vault 下的会话 JSON 和 Core 标签。启动前原子写入本地操作，发送前再记录尝试代次和 Core ID／协议代次。持久指纹区分规范化请求与已解析命令和 argv，核对 Space revision、cwd、provider 及环境引用。会话记录保留 Vault 和机器归属，Core 候选核对 Vault、Space、session、launch、尝试代次标签，再核对 cwd、显式 argv、终端地址、`created_ms` 和 PID。会话能力返回既有形状，私有启动凭据留在会话文件中。

- 同意图重传复用同一 session 与操作。同键异 Space、目录、provider、提示词或解析后 argv 返回 `IDEMPOTENCY_MISMATCH`。命令环境的输出遮蔽值绑定实际发起启动的 Engine 实例。
- 空快照、读失败、多候选、`spawn_pending`、地址复用和身份不匹配均保留原请求待查，返回可用同一请求重查的 `RUN_UNKNOWN`。有关联凭据的会话只有在匹配的 Core 记录给出进程终态时才取得退出回执。
- 连接或握手在发送前失败，以及 Core 用 `-32602 / invalid_params` 当场拒绝参数，均有未创建证据。原 requestId 可在保留同一 session 的情况下开启下一次尝试。实际 RPC 复测 `spawn_failed` 用于缺少程序，故障注入用其模拟 holder 超时。只凭该 kind 或一次空列表仍保留待查。既有无指纹的历史会话记录继续可列出，同键重查显示 `legacy_record` 待核实。

真实 Core 夹具在收到成功创建的 JSON-RPC 响应时丢弃该响应并断开客户端，同时让当次快照失败。首个调用返回 `RUN_UNKNOWN`，磁盘原 session 为 `unknown`，Core 的原进程仍 `live`。随后关闭 Agent CLI 插件上下文、关闭并重开同一 Vault，重建 Dispatcher 和插件服务。相同启动请求与网关键找回同一条绑定。独立客户端读 Core `terminal.list` 时，该请求只有一个终端，仍为原 PID 与 `created_ms`。冻结主跑证据为 Core `5f78321362816174e8dd1aa506ccb016`、session `sess-mwolwoeyc0al`、尝试 `cdc5f42b-7b61-4a7b-a7e8-d0a1485cf221`、终端 `t3`、PID `37328`、`created_ms=1795156629666`。夹具通过 Huhu 停止该终端，关闭隔离 Core 后复核管道无监听。此处重开覆盖 Agent CLI Engine 服务与 Vault 持久层。 [W1.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W1.2-launch-reconcile.md)

## 冻结与红绿

- Windows 11 Pro x64 10.0.26300，Node 24.21.0，Vitest 3.2.7。使用集成目录的 Win x64 Core 0.1.19，exe SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`，项目锁的 Win x64 归档 SHA-256 `1cf7de14c862abc49b8eaeed32dc6a60d8146740edb2c244570d1a9f07cb813a`。使用独立 `HC_SOCKET`、隔离 Core 状态、临时 Vault 和合成脚本。
- W1.1 红灯在 `ce5289d` 复现超长目录仍返回预览成功。W1.1 冻结提交的真实启动夹具通过。W1.2 红灯在 W1.1 基线上复现 11 个故障场景失败。W1.2 冻结提交的定向回归为 5 文件通过、80 项通过、6 项条件跳过，含真实 Core 重开夹具、会话与协议测试及 W6.0 回执合同的 38 项。Agent CLI 类型检查、改动文件格式及 `git diff --check ce5289d..db0a562` 均通过。
- Windows 全 Agent CLI 与帧测试复测为 92 通过、11 跳过、4 失败。W1.1 冻结父版本复现同样四处失败，分别是 Windows 宿主上的 POSIX 可执行位断言，以及三处创建符号链接的 `EPERM`。父版本为 81 通过、11 跳过、4 失败。
- 分别以 `git archive` 冻结到 `%TEMP%/h80-w11-freeze` 与 `%TEMP%/h80-w12-candidate`。workspace 链接指向各自归档，第三方链接复用集成依赖。与集成锁的差异只有 `apps/cli` 新登记的 `tsx`，本轮测试解析的依赖版本一致。日志位于 `%TEMP%`，文件名为 `h80-core.log`、`h80-core-boundary.log`、`h80-core-wrapped-ps.log`、`h80-w11-red.log`、`h80-w11-freeze.log`、`h80-w12-red.log`、`h80-final-focused.log`、`h80-w12-candidate.log`。报告对应最终冻结提交。
- 验证命令均已退出，临时 Core 已清理。两个提交仅含 Agent CLI Engine 和私有测试，工作区另有 Lead 所管的根锁差异。所有取证使用合成数据，提交保存在本地。

## W6.1 前置

W1.2 提供可持久查回的新建操作和初始 Core 根进程绑定。锁定 Core 0.1.19 的 `hello` 有协议代次及 `automatic_input` 特性，实测终端记录提供 `created_ms` 与 PID。本轮取得的证据覆盖 Core 根进程。真实 provider 正文接受、原生会话资格、existing 或 resume 的 provider 进程代次、人工/评审/任务输入所有权和 W6.1 的派遣/检查、取消竞态仍需独立接线和实测。W6.0 合同由上述回归覆盖。 [W6.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md)

## Lead 验收

由 Lead 追加。
