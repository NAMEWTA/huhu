# #5 T2.1 生产 Tasks → Agent CLI 绑定输入适配器

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t135`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135/report01.md`
- 执行结果 — **done**
- 本地提交 — `ff0afc5866e85b399143574f9e62f6820d4a90c1`，直接父提交 `3bd2e245d0eff8ffef8eb94f80c6106d73047ba9`
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-task-executor`，Git 状态干净

## 交付

- Tasks 默认执行器通过现有 Engine Dispatcher，以 `plugin:tasks` 身份调用 `agent.targets.list`、`agent.runs.dispatch` 和 `agent.runs.inspect`。内置专用权限只授予 Tasks，三个 Agent handler 继续校验调用者。任务作用域的 AbortSignal 经原调用链传入 Agent，Agent 自身停用也会撤销旧作用域。
- 第一次取得可验证目标时，将 Space revision 与启动配置身份或原实例的进程绑定写入已签名的 Tasks 受理记录。派遣与对账共用原 Vault、机器、task、dispatch、run、attempt 和 event 身份。首次派遣采用冻结的任务正文与显式规则补充指令，提交给 Agent 时把 CRLF 转为 LF，原快照和摘要保留存储字节。重传沿用原请求，由 Agent 的持久凭据返回当前结果。
- 显式 existing 等待原实例的输入权。过期目录 revision 和无法核验的进程代次保留原目标。只有校验了本轮身份、实例与提交正文 SHA-256 的 provider ACK 才会让 Tasks 写入进行中及一条系统评论。未证实发送结果的轮次只查原凭据。
- 生产配置没有可证明收件的 provider adapter。真实 Claude、Codex、Pi 的任务输入和原生 resume 当前返回不支持，任务保持未开始。正向取证使用 W6.1 已有的合成 provider，配置名为 Claude，实际运行的是 Node 本地夹具。显式 resume 的保存和生产负例已覆盖，也在旧 Automations 扫描时阻止按新会话执行。

## 验收与证据

| 规格条款 | 观察结果 | 证据 |
| --- | --- | --- |
| A02、C04 | 无 provider 证据时，new 与显式 resume 均为 `blocked / target_unsupported`，任务为 `not_started`，启动次数零。existing 的成功 Core 写入在 ACK 缺失时仍是 `unknown`，任务无派发评论。ACK 后仅一条系统评论，任务进入进行中。 | [真实 Engine 与适配器验收](evidence-task01/final-runtime.log) |
| A08、C01、C02 | new 返回所选 Space 的真实实例，受信 inspect 可回读同一绑定。existing 的原目标是 `sess-mwoqbk66titm`／隔离 Core 地址 `t2`。真实终端 WS 持有人工输入权时零输入，释放后原实例收到一次输入。精确打开详情和焦点策略由界面走查验收。 | [真实 Engine 与适配器验收](evidence-task01/final-runtime.log) |
| C05 | 在真实 Core 执行 `terminal.run` 及 `terminal.send` 后各丢弃一次回包。无 ACK 时任务待核实。重开同一 Vault 后找回 `run-mwoqbiswq08g`、`sess-mwoqbivlu0n6`、地址 `t1` 和 PID `36620`，合成 provider 日志只有一次输入。目录 revision 失效及在同地址改写代次标签模拟身份不符，两者向选定目标发送次数均为零。 | [真实 Engine 与适配器验收](evidence-task01/final-runtime.log) |
| B05、D09 | Automations 停用后人工仍可派遣，重开保持停用，原 run 重传无额外输入。两规则与人工竞争和活动占用由 T1.2 HTTP 回归覆盖。另在 provider 就绪期间停用 Tasks，观察到 Agent 收到 Abort，原轮当时零输入。恢复后同一 run 对账，仅收到一次。 | [真实 Engine 与适配器验收](evidence-task01/final-runtime.log) · [宽回归](evidence-task01/regression-concurrent.log) |
| 私有权限与快照 | 真实 Engine 允许受权 Tasks 枚举，拒绝 desktop、旧 Automations、CLI、MCP 直接调用 Agent 私有入口。适配器测试核对稳定身份、模型选项、CRLF 提交、冻结补充指令及错误摘要的 ACK。W6.1 回归使用同传输幂等键观察新的派遣结果。 | [真实 Engine 与适配器验收](evidence-task01/final-runtime.log) · [宽回归](evidence-task01/regression-concurrent.log) |

条款来源见 [T2.1 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T2.1-dispatch-cli.md)、[Issue #5 验收矩阵](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/source.md) 和 [W6.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md)。

## 运行记录与清理

- Windows x64 build 26300，Node 24.21.0，Vitest 3.2.7。实际使用固定 Core 0.1.19，二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。最后一轮的隔离 Core ID 为 `a68f11f5a8997bf479ae6f0738bc90c2`。夹具结束后查询到 Core、holder 和合成 provider 无存活 PID。 [验证脚本](evidence-task01/vitest.ps1) · [最终运行](evidence-task01/final-runtime.log)
- 宽回归有 195 项通过、6 项条件跳过。与类型检查并行时，既有时区子进程用例超过 60 秒。随后顺序复验三文件共 13 项全部通过，包含该用例、真实 Engine 和新增的适配器测试。Contracts、Kernel、Agent CLI、Tasks、Engine 类型检查全部通过。改动文件的 oxfmt、oxlint 与 Git 空白检查通过。 [宽回归](evidence-task01/regression-concurrent.log) · [最终验证](evidence-task01/final-verification.log)
- 验证使用现有工作树、同锁依赖和一次性 Vault/Core 夹具。pnpm 启动产生的自动锁增量已撤除，提交的根锁与冻结父提交一致。验证窗格全部移除。 [依赖设置](evidence-task01/setup.ps1) · [窗格清理](evidence-task01/cleanup.log)

## 范围与接续

本次交付 Engine 数据路径。详情定位、焦点和运行面板由对应界面切片验收，精确停止由 T2.2 承接，旧 Automations 切换归 T7.1。原生 resume 的正向实测需先有可验证的原生绑定与 provider ACK。交付点为本地提交和本报告。

