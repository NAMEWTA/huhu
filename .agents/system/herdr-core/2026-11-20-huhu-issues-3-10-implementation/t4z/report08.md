# #4 W1.2 防重复启动及 W6.1 边界独立复核

- terminal_address — t4z
- task — task08.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。清单指向 `t4z → task08.md → active`。
- 执行结果 — done（独立复核完成，发现两项可复现的生命周期缺陷）
- 冻结序列 — `db0a562fd7c15a031509e7ac1477228de5e4bfd3 → a20128b8389da6bc404532c8c666d308320ca49c → 4fe97901d7952709f1371432bb0327ef0bdaf958`。两个箭头均为直接父子关系。

## 合入建议

| 切片 | 规格轴 | 规范轴与建议 |
| --- | --- | --- |
| W1.2 `a20128b` | 原 P1 的会话记录截断重复启动已修复。会话删除、缺 state、junction 消失的重查通过。新发现同一 Vault 内插件停用并重新启用可让旧 handler 覆盖新一轮真实绑定。 | 私有索引和意图对账的归属合理。实例内并发控制覆盖不到插件重新启用。**将 W1.2 单独返工、复跑并签收，当前冻结提交暂缓独立合入。** W6.1 的生产受理取证无需成为 W1.2 的前置。 |
| W6.1 私有底层 `4fe9790` | 真实 Core 与 Dispatcher 的合成 new/existing、三类事实分离、去重及输入仲裁通过。独立实测发现停用后，旧请求仍可能向 provider 提交正文。 | 私有能力、写前意图及所有权边界成立。**先补停用收尾，再签收私有发送切片。** 生产 provider 受理、原生 resume 与生产 Tasks 装配继续待核实。 |

复核依据为冻结 W1.2/W6.1 规格、t54 原复核和 t80 交付。两项新增问题均在隔离夹具中触发，业务提交和工作树只读。 [W1.2 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W1.2-launch-reconcile.md) · [W6.1 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md) · [t54 原复核](../t54/report04.md) · [t80 交付](../t80/report02.md)

## W1.2 规格轴

- **原 P1 红绿重放。** 将修复版的真实 Core 夹具原样放入父提交归档。丢弃一次成功 run 回包，先找回原操作，再截断会话文件，重开同一 Vault 并提交完全相同的请求。父版返回成功，独立 Core 查询发现同一 launch 标签下 `t3 / PID 50468` 与 `t4 / PID 29784`。修复版用同一夹具重放，截断和删除均返回 `RUN_UNKNOWN / launch_receipt_unavailable`，只剩原 `t3 / PID 14176`。未破坏时同一 session、attempt、地址、PID 与创建时间可找回。W6.1 冻结链顶也复跑通过。 [父版红灯](evidence-task08/parent-independent.log) · [W1.2 冻结实测](evidence-task08/w12-live.log) · [链顶回归](evidence-task08/w61-live.log)
- **其余原回归。** 缺 state、live 带已结束字段、finished 缺结束时间均保留 `RUN_UNKNOWN / process_unverified`。补入匹配的结束字段后绑定原进程及退出码 7。这是协议故障注入。真实 Windows junction 移除后同字面请求找回 `t4`，重指向不同真实目录返回 `IDEMPOTENCY_MISMATCH`。空列表、多候选、快照失败、spawn_pending 及 holder 超时留待查，得到明确未创建才续发。 [W1.2 冻结实测](evidence-task08/w12-live.log)
- **新增 P1 · 插件重启覆盖真实绑定。** 在真实 Dispatcher 的首次 `agent.sessions.launch` 进入 Core 连接前暂停。保留同一可写合成 Vault，释放插件作用域、重新应用插件，再用不同网关幂等键重传同一业务 requestId。新 handler 成功绑定 `t5 / PID 39120`。释放旧 handler 后，只有一个实际进程，但持久记录被写成旧 handler 的不同 attempt，终端地址变为 null。第三次重查返回 `RUN_UNKNOWN / no_match`，原进程仍在 Core。另用两个 `SessionsService` 加协议夹具同时启动同键，观测到不同 attempt 和 2 次 `terminal.run`；真实 Core 探针只证明 1 个进程且失去绑定。 [真实重启探针](evidence-task08/w12-reload-live.log) · [双服务协议探针](evidence-task08/w12-index.log)

## W1.2 规范轴

- 以 requestId 摘要定位独立索引，`wx` 排他建档并刷新，核对 Vault、机器、session 和两种意图指纹。列表可跳过坏记录，启动重查按索引保守失败。独立把索引本身截断，受影响键报告 `RUN_UNKNOWN`，另一键正常启动。恢复索引后原键找回原 session，总计两次 run 对应两个不同请求。核对 `a20128b:plugins/agent-cli/src/engine/sessions.ts:155–240,268–316`。 [索引探针](evidence-task08/w12-index.log)
- 既有索引指向同一 session 时准许继续，服务实例各有自己的 `inflight`。连接 Core 的异步窗口中，已持久化的 session 还没有 attempt。重启后两个 handler 可各自通过检查，旧 handler 返回时仍能覆盖新绑定。Vault 单写者锁在同一 Vault 对象内无法隔离这两代插件实例。正式 `PluginManager.disable()` 先标记停用，再释放插件作用域。建议在生命周期边界建立共享或可持久校验的启动归属，在写 attempt、调用 Core 及晚返回写回前核验归属。用同一探针复验同键只启动一次、迟到 handler 不能覆盖原绑定，并保持明确未创建时可安全续发。核对 `a20128b:plugins/agent-cli/src/engine/sessions.ts:165–182,307–316,377–440` 与 `packages/kernel/src/plugin-manager.ts:112–126`。

## W6.1 规格轴

- **受信调用及目标。** 冻结夹具经实际 Dispatcher 注入临时权限。仅授权的 `plugin:tasks` 能调用私有能力，desktop、Automations、未授予 Tasks 及跨 Vault 均拒绝。三条 handler 同用调用者检查；机器校验由 `assertScope` 与执行绑定共同实施。旧地址、不同 processGeneration 和真实 Core 代次标签变化未写入；机器负例以源码确认。new 复核启动配置后绑定，existing 使用原执行身份，resume 显式不可用。 [W6.1 冻结实测](evidence-task08/w61-live.log)
- **受理、重传与记录遗失。** 本地 `acceptedAt`、Core 的 `core_written` 与 provider 结构化收件为三个事实。正文写入且未见结构化回执时保持 `unknown`。丢弃真实 Core send 回包并重开 Vault，持久 `sending` 退为 `coreWrite: unknown`。只有合成 provider 按本轮执行身份和正文摘要证明收到时，结果才升为 `accepted`，读取日志只有一条正文。无回执退出 0 仍待核实，原归属释放。相同派遣重传保持原执行，改正文、事件顺序或 attempt 冲突。丢失派遣文件时独立输入意图阻止重送，其他任务仍为 busy。W1.2 会话损坏时 `launch_unverified`，正文发送次数为零。 [W6.1 冻结实测](evidence-task08/w61-live.log)
- **输入仲裁及异常。** 人工控制存在时任务 busy。释放后两个任务并发，胜者只写一次，其他任务 busy，人工以观察视图接入，评审发送和会话 kill 被拒绝。Core 写调用异常进入待核实，provider 就绪失败不发送，收件查询失败保留未证实状态。已绑定进程换代仍待核实；已证明原进程终止后才解除持久归属。故障处理与用户可见的后续恢复仍由各自能力验收。 [W6.1 冻结实测](evidence-task08/w61-live.log)
- **新增 P1 · 停用后旧请求仍提交正文。** 在真实 Dispatcher 请求的合成 provider 就绪检查处阻塞，随后标记 Agent CLI 停用并释放其插件作用域。新调用得到 `PLUGIN_DISABLED`。释放就绪检查后，旧 handler 返回 `accepted / core_written`，隔离 provider 的实际收件计数为 1，预期为 0。夹具复现已知生产停用顺序，provider 与其就绪延迟为合成。该红灯不依赖生产 provider 登录。 [停用探针](evidence-task08/w61-independent.log)

## W6.1 规范轴及生产边界

- Agent CLI 持有执行身份、输入占用、发送凭据和结构化收件，Tasks 保有业务正文。写正文前持久化 `sending` 及独立意图，会话桥和评审共享所有权检查。用相同 Core 连接在写前复核进程绑定。锁定 Core 0.1.19 的 `terminal.send` 无按预期进程代次原子校验并发送的合同，进程核对与写入之间仍有窗口。实测范围为 Huhu 桥和评审入口。核对 `4fe9790:plugins/agent-cli/src/engine/dispatch-capabilities.ts:31–74`、`dispatch-store.ts:132–198`、`input-ownership.ts:4–26`、`sessions.ts:577–622`。
- 停用当前只断开 Core，已进入 handler 的信号仍可用，旧服务可重新打开连接。建议在插件作用域终止时取消未开始的发送，并在持久领取权及实际发送点核查作用域存活。已跨过发送边界的请求继续保存原意图和待核实状态，重新启用后只观察原派遣。复验停用前尚未发送为零、发送后丢回包绝不重发。核对 `4fe9790:plugins/agent-cli/src/engine/index.ts:62–79`、`herdr-core.ts:39,87,121–124`、`dispatch.ts:144–178,188–212`、`packages/kernel/src/dispatcher.ts:65–76,131–153`。
- 生产装配缺已验证 provider 适配器。本轮栈覆盖真实 Dispatcher、Core 和隔离 Node provider。Claude Code、Codex、Pi 已收正文、原生历史/恢复、真实账户、生产 Tasks 权限及执行器、外部 hc 写入均未验收。下游以匹配的 provider 收件证明映射 `accepted`，丢回包和待核实保持 unknown。

## 验证与清理

- Windows x64 build 26300，Node 24.21.0，Vitest 3.2.7。锁定 Core 0.1.19，exe SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。三个版本各从 Git 归档，工作区包指向冻结源码，第三方依赖复用 Windows 集成安装。冻结锁相同，测试开始时集成提交只额外登记本轮无关的 CLI `tsx`。 [归档方式](evidence-task08/archive.ps1) · [冻结清单](evidence-task08/layout.json)
- 定向命令使用 `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 --reporter verbose`。W1.2 运行 launch、reconcile、sessions、frames 四文件，45 通过、6 条件跳过。W6.1 另加 dispatch.live 与 execution-receipt，84 通过、6 条件跳过。独立夹具为对隔离归档的叠加，生成脚本可重建。报告源路径保留了预期红灯及直接日志。 [探针生成脚本](evidence-task08/probes.ps1) · [W1.2 定向](evidence-task08/w12-live.log) · [W6.1 定向](evidence-task08/w61-live.log)
- 两个增量均通过 `git diff --check`。六个可从日志定位的隔离 Core 管道复查均已关闭，退出码 5 / os error 2。三份临时归档已清理，保留脱敏合成证据。未打包、未写主集成、未创建 worktree。发布前观察到集成 `2ceec67` 尚无这两个冻结提交。 [版号、隔离管道及清理日志](evidence-task08/validation-cleanup.log)
