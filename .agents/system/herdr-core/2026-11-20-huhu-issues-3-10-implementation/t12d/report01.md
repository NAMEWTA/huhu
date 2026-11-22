# Issue #4 · Agent CLI 停用与重启隔离

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12d`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12d/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12d/report01.md`
- 执行结果 — done
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 分支 — `impl/huhu-issues-3-10-agent-lifecycle`
- 冻结父 — `4fe97901d7952709f1371432bb0327ef0bdaf958`
- W1.2 — `ba5f348160b05826dd54f4eaa162f20a9a3fd25d`
- W6.1 与分支最终候选 — `ec581b3276541a7660a69bb2f50a551545ec0689`

## W1.2 启动归属

Agent CLI 作用域释放时中止旧一代信号并断开该代 Core 客户端。实际启动沿用 Dispatcher 调用信号。连接后重读原请求的持久索引及会话记录。在 Vault 单写者中，领取 attempt、落盘并提交 Core RPC 之间没有异步间隔。Core 返回及快照对账时核对同一持久会话与 attempt，只允许有效作用域写回。已提交的启动保留原 attempt，下一代可按原标签和进程身份找回。明确连接失败或 Core 参数拒绝仍可沿原请求续发。

- **红灯** — 在实际 `PluginManager` 与 Dispatcher 中，首次请求在连接前挂起。新作用域绑定了 `t5 / PID 34436`，旧请求恢复后持久 attempt 变为另一值且地址为空。Core 仍有一个进程，第三次调用返回 `RUN_UNKNOWN / no_match`。 [冻结父红灯](evidence-task01/w12-red.log)
- **绿灯** — 停用前挂起连接时，旧请求以可重试的 `PLUGIN_DISABLED` 结束。已经运行且回包迟到时，旧请求返回 `RUN_UNKNOWN`，新作用域对账到原进程。两种情况下第三次调用都得到新作用域核实过的原地址、PID 和 attempt，每个原请求在 Core 仅有一条终端记录。双服务的协议回归另证实并发领取只提交一次 `terminal.run`，迟到的连接失败不会覆盖已核实绑定。丢回包、记录截断或删除、Junction 消失或改向、明确未创建后的续发和原会话操作均复验。 [提交冻结日志](evidence-task01/w12-final.log)
- **独立交付** — 纯 W1.2 补丁通过 `git apply --check` 后应用到 W6.1 之前的 `a20128b8389da6bc404532c8c666d308320ca49c`。同一真实 Core 探针及定向回归共 47 通过、6 条件跳过，类型检查通过。补丁 SHA-256 `cc80480a3013cd9f23d9da751e47feb3361abded8326cdefdb6605aff5988035`。 [独立补丁](evidence-task01/w12-standalone.patch) · [独立冻结实测](evidence-task01/w12-standalone.log)

## W6.1 输入提交与对账

派遣将插件作用域信号和请求信号合并，传给启动、provider 就绪检查和收件查询。最终核对 Core 进程与当前持久会话后，在提交 `terminal.send` 的同一个同步步骤里核对派遣记录、检查输入归属、持久化 `sending` 及独立输入意图。停用期间等待中的旧请求无法领取，旧人工桥关闭并放弃排队输入。已过发送边界的操作保留输入意图和归属，新作用域把遗留 `sending` 对账为 `unknown`。只有匹配同一执行和正文摘要的 provider 收件证据才升为 `accepted`。

- **红灯** — 合成 provider 的就绪检查挂起，实际停用后新调用被拒绝。释放旧检查时，旧 handler 仍回报 `accepted / core_written`，provider 收到一条正文。 [冻结父红灯](evidence-task01/w61-red.log)
- **发送前绿灯** — 就绪检查和最后一次 Core 绑定核验分别挂起再停用。停用的两条路径均观察到零正文写入及 `not_sent`、无持久 owner。就绪检查收到取消信号，重新启用后用原网关幂等键和原 dispatchId 重传，provider 只收到一次。最终核验期间人工仍可取得控制，停用时旧窗口关闭，旧桥再接入失败。 [最终冻结日志](evidence-task01/w61-final.log)
- **发送后绿灯** — 实际 Core 先写入再故意延迟并丢弃回包。重开后同 dispatchId 返回 `unknown` 并保持原 owner，竞争任务为 busy，人工只能观察，评审发送被拒绝。匹配的 provider 收件证据到达后为 `accepted`，Core 写事实仍为 `unknown`。旧回包恢复没有覆盖新凭据，provider 正文总计一条，竞争任务为零。 [最终冻结日志](evidence-task01/w61-final.log)

## 环境与清理

- Windows x64 build 26300，Node 24.21.0，Vitest 3.2.7。固定 Core 0.1.19，exe SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。通过 Git 归档冻结源码，复用集成的 Windows 依赖安装，工作区包指向冻结源码。锁差异为其他切片的 CLI `tsx` 与原生 keyring 增量。真实调用使用独立 Core、合成 Vault/provider、实际 PluginManager/Dispatcher 及测试进程专用 Tasks 授权。 [冻结脚本](evidence-task01/frozen.ps1)
- 最终冻结 8 个文件，91 项通过、6 项条件跳过。Cosmokit 和 Cordis 声明构建后，Agent CLI 类型检查通过。格式和 `git diff --check` 通过。额外的 Windows `review.test.ts` 扩展运行遇到 5 秒 Git 子进程超时及符号链接 `EPERM`，冻结父也复现这两类失败。人工与评审的输入仲裁随最后的真实 Core 定向用例通过。 [最终冻结](evidence-task01/w61-final.log) · [扩展运行](evidence-task01/w12-final.log) · [Windows 基线](evidence-task01/windows-baseline.log)
- 关闭旧作用域时运行中的原进程仍可由新作用域核实。夹具结束时 W1.2 的两个竞态终端已通过 Core `wait` 确认结束。W6.1 红绿实测的隔离 Core、Pod/holder 和合成 provider PID 均消失，最终绿灯涉及 Core PID 40228、holder PID 35780 和 7 个合成子进程。已复查测试管道不存在、归档已删除和测试窗格已关闭。 [进程证据](evidence-task01/w61-final.log) · [清理记录](evidence-task01/cleanup.log)

## 接续

本轮验证范围是锁定的 Windows Core 和合成 provider。Core 0.1.19 的进程核验与 `terminal.send` 是两个 RPC，测试覆盖 Huhu 自身的任务、人工和评审入口。上游生产装配与权限仍归 Lead。交付分支干净，共四个已有 worktree。

## Lead 验收

由 Lead 追加。
