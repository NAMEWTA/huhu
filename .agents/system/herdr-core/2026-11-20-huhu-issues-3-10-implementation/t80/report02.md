# #4 W1.2 复核修复与 W6.1 持久派遣

- 执行结果 — done
- terminal_address — t80
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/report02.md
- 分支 — `impl/huhu-issues-3-10-receipt`
- 冻结父 — `db0a562fd7c15a031509e7ac1477228de5e4bfd3`
- W1.2 优先修复 — `a20128b8389da6bc404532c8c666d308320ca49c`
- W6.1 私有底层及最终候选 — `4fe97901d7952709f1371432bb0327ef0bdaf958`

## W1.2 复核修复

在 W6.1 之前完成独立提交。启动前独占创建按 requestId 查找的本机 Vault 索引，保存 session 及可核对的原请求、解析后意图和执行配置指纹。会话 JSON 截断、删除或与索引不一致时，原请求保持 `RUN_UNKNOWN / launch_receipt_unavailable`。旧版没有索引时，损坏的记录也不能成为“操作从未发出”的证据。已索引的完整记录可直接查回，旧的未索引请求在凭据无法排除损坏记录时保留待查。

Core 候选必须给出明确的 `live` 或 `finished` 及相容的退出字段，再结合原有五标签、目录、argv、地址、PID 和创建时间对账。预检保留同一字面路径的指纹及实际目录指纹。已发送请求的原 junction 消失时，可按原字面意图找回原进程。junction 重新指向不同实际目录仍触发冲突。

冻结父红灯为 3 项。真实 Core 在会话 JSON 截断后曾同时留下 `t3 / PID 4996` 和 `t4 / PID 30136`。修复候选在独立 Core `9fa5bff3a0316a5051514e36d9a364db` 上复跑，截断和删除后均只保留 `t3 / PID 40132`，返回 `RUN_UNKNOWN`。真实 junction 消失后仍找回 `t4`，重新指向另一有效目录返回 `IDEMPOTENCY_MISMATCH`。协议注入缺 state 和退出字段不相容时保持待查，补齐真实终态字段后才绑定退出码 7。冻结定向回归 83 项通过，6 项条件跳过，Agent CLI 类型检查通过。 [t54 独立复核](../t54/report04.md) · [红灯日志](evidence-task02/w12-review-red.log) · [冻结实测](evidence-task02/w12-review-final.log)

## W6.1 私有交付

- Agent CLI 注册 `agent.targets.list`、`agent.runs.dispatch` 和 `agent.runs.inspect`。handler 只接收受信 `plugin:tasks`，Vault、机器、task/run/attempt 与 dispatchId 都参与校验。有序 eventIds、冻结快照引用、摘要、原输入及目标身份参与持久去重。相同请求重传只读或推进同一操作，同键异内容返回冲突。新建走 W1.2 的稳定启动申请，工作目录、argv 及启动配置重查后才可以建立绑定。当前受控新建要求空环境覆盖。
- 在独立于会话记录的派遣文件中保存本地 `acceptedAt`、Core 写入事实和结构化 provider 收件证据。先将会话输入归属与 `sending` 落盘，再调用 Core。独立输入意图同时保住去重和所有权，派遣文件删除时重传保持待查，该会话仍拒绝其他任务和人工输入。Agent CLI 派遣文件只存正文指纹，输入正文由 Tasks 持有。
- 输入归属由任务、Huhu 人工终端桥和评审共用。任务持有时人工接入为观察者，评审发送和直接终端控制被拒绝。对账发现原进程绑定变化时保持待查。真实已绑定进程结束可释放输入归属。进程退出、终端输出和 Core 写入回包各自保留其原有语义，provider 受理与业务回执有各自的证据。

## 锁定 Core 实测

Windows 11 Pro x64 10.0.26300，Node 24.21.0，Vitest 3.2.7。Core 0.1.19 来自集成目录的 `apps/desktop/resources/herdr/win32-x64/herdr-core.exe`。exe SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`，锁定归档 SHA-256 为 `1cf7de14c862abc49b8eaeed32dc6a60d8146740edb2c244570d1a9f07cb813a`。通过独立 `HC_SOCKET`、临时 Vault、合成 Node provider 和真实 Dispatcher 复跑。夹具在测试进程临时授予所需权限并验证错误调用者与无授予均被拒绝。

- `new` 和已验证合成 provider 的 `existing` 均通过。Core 写入成功但 provider 证据未提供时为 `core_written` 和待核实。合成进程以地址、PID、dispatchId 及正文摘要提供同轮收件证据后，查询才返回 `accepted`。
- 强制丢弃一次真正的 Core send 回包，并保留写前 `sending` 记录，重新打开 Vault 和 Agent CLI Engine 服务。重传保持同一执行绑定、`coreWrite: unknown`，从合成 provider 查得收件证据，独立输入日志仅一条。另一进程正常退出 0 且无结构化证据，仍待核实，输入归属已释放。
- 同键改正文或事件顺序冲突，跨 Vault 拒绝。已接入人工控制时任务为 busy。释放人工控制后两任务同时争用只有一条输入，随后人工观察者和评审均不能写入。旧地址、旧代次请求被拒绝，实际更改 Core 的启动代次标签后只得到待核实。
- 新建进程但未获 provider 就绪时截断其 W1.2 会话文件，重传保持 `launch_unverified`，原 PID 和终端数不变，零正文写入。删除已发送的 W6.1 派遣文件时，独立意图令同键返回 `RUN_UNKNOWN`，其他任务仍为 busy，原进程只读到一次正文。
- 最终冻结使用隔离 Core `ce36e53d7c23b2b5442d2c7f31b912e2`，首次写入 `t2`，丢回包后找回 `t3`，争用胜者使用 `t4`，零退出探针为 `t5`。定向回归 8 文件、89 项通过、6 项条件跳过，含 W6.0 回执合同的 38 项。Agent CLI 全量加帧测试为 96 通过、11 跳过、4 失败。四处均与冻结父的 Windows 基线一致，分别是 POSIX 可执行位断言及三处符号链接 `EPERM`。Agent CLI 类型检查、格式检查及提交间 `git diff --check` 通过。 [W6.1 红灯](evidence-task02/w61-red.log) · [冻结定向](evidence-task02/w61-final.log) · [冻结全量](evidence-task02/w61-full.log) · [类型检查](evidence-task02/w61-typecheck.log)

## 生产接线与能力缺口

以 W6.0 的 `ExecutionBinding` 对齐收件身份，复核了 #5 冻结 `6b43fceceee002bd3141648946e1d907c1d9349c` 的 `TaskDispatchExecutor`。Tasks 的 `accepted` 对应可核对的 provider 已收件。Agent 的本地 `acceptedAt` 和 `core_written` 是独立事实，断线或未证实收件应保留 `unknown`。只有可证明正文未发送时映射 `not_sent`。Tasks 接线应保留原 dispatchId、任务输入快照与事件顺序，查询走 `inspect`。全局权限组和 Task 执行器装配由 Lead 所持范围完成。本批通过实际 Dispatcher 验证私有 handler 的授权，使用测试进程临时权限映射。

当前生产 Claude、Codex、Pi 的清单明确标记缺少已验证收件或进程代次证据。原生 resume、结构化回复／结果及取消个别输入轮次保持不可用，待相应 provider 协议和后续回执切片接线。Core 的 `terminal.send` 回包提供终端写入事实，锁定版本的 send 没有按预期进程代次原子提交的参数。已实现同一 Core 连接内写入前复核，受控验收覆盖 Huhu 终端桥和评审入口。真实 provider 登录、原生历史、独立 hc 写入路径及生产任务执行留待具备相应证据的验收。 [W6.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md) · [W6.0](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.0-receipt-contract.md)

## 冻结环境与清理

分别用 Git 归档冻结 W1.2 和 W6.1 到 `%TEMP%/h80-w12-final` 与 `%TEMP%/h80-w61-final`。工作包指向各自归档，复用集成安装的同版本测试依赖，锁的额外 `apps/cli` `tsx` 条目与本次运行无关。复用 Huhu 的 Space/命令解析、SessionsService、终端桥、W6.0 绑定及 Core RPC。对照本地 ORCA `8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3` 的提交身份与输入归属做法，并核对 Core 源码 `c7517808d64f06609e4ecf0db1757005373cc3a3` 的写入语义，以实际锁定二进制结果为验收依据。

辅助工作树锁文件差异已备份，补丁 SHA-256 为 `869a5fa37032945c3d7d031378687b14bc3b4f1cdb358ac39110f2022465ae60`。确认仅该文件有差异后，在本工作树恢复冻结锁。两个提交均保存在本地，工作树干净。实测使用合成数据，临时 Core、命令和测试查看器均已退出。 [原锁差异补丁](evidence-task02/receipt-pnpm-lock-before.patch)

## Lead 验收

由 Lead 追加。
