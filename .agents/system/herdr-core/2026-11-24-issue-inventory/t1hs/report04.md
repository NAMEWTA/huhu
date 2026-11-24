# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task04.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task04.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report04.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{027-f15,028-f16,029-f17,030-f18}.md`
- 执行结果 — done（worker 交回）

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `b289ac3f`，交付 HEAD `5d484a97`。四个独立提交均带 `Refs: #13`。`git diff b289ac3f..HEAD --check` 通过。7 个定向测试文件的最终结果共 160 项通过。定向测试按共享锁串行完成，测试终端已移除，工作树干净。

### F15 — `0f06ed70`

- 文件 — `packages/kernel/src/dispatcher.ts`、`packages/kernel/test/dispatcher.test.ts`。
- Dispatcher 在入口、参数解析后和实际调用 handler 前核对 signal，命令子调用同时受父命令生命周期和请求 signal 约束。已取消的入口返回 `INVALID_INPUT` 和 `outcome: not-accepted`，不会写入审计、普通幂等记录或持久操作受理。对已进入 handler 的非只读调用，中断且没有已完成回执时返回 `outcome: unknown`，持久操作仍可按原键查询。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/dispatcher.test.ts`，F15 提交阶段 26 项通过，最终 F15–F17 组合 29 项通过。新增覆盖 read/write/execute/admin、插件调用、解析过程中取消、零审计与零回执、已受理后的取消。
- 这票使用 Dispatcher 真实入口与合成 handler 锁定受理边界，未增加 Playwright 专用用例。

### F16 — `69208531`

- 文件 — `packages/kernel/src/{dispatcher.ts,capabilities/define.ts}`、`packages/kernel/test/dispatcher.test.ts`、`apps/engine/test/engine.test.ts`。
- 执行结果在统一出口按定义的 output schema 投影，普通缓存、持久操作重交、回执查询也按当前输出契约处理。读结果不合规返回可重试 `INTERNAL`。副作用类结果不合规时返回不可重试的 `unknown`，持久回执以 `invalid-output` 可查询，原始不合规字段不会作为成功结果或新回执落盘。写路径新结果只校验一次。输出 schema 的投影需稳定，以便持久结果按同一规则回读。
- 对 Engine、Kernel 与插件 Engine 的 251 个源文件做静态盘点，识别 431 个带 output 的声明。直接对象字面量与内联输出属性对照未发现遗漏字段。间接返回值通过 Engine 与 Notes 工具集成测试抽查，未逐一执行所有提供者。Engine 首轮发现历史测试依赖「最近两条都是命名版本」这一假设。断言改为按已有 `checkpoint` 来源识别命名版本，最后一轮 50 项通过。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/dispatcher.test.ts`，29 项通过。合成递归联合样本 100 次调用、20,000 个叶节点各校验一次，单次运行的样本约 18 ms。该样本计入调用和断言开销，未做生产路径性能对照。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/domain-exposure.engine.test.ts`，11 项通过，含真实 CLI、MCP 和工作台经统一 Dispatcher 的读写与重启。
- Lead 执行 `tests/e2e/workflows/external-task-web.spec.ts` 中「D09 同包 CLI 创建与 MCP 修改的同一任务刷新到桌面和 Web」，以及 `tests/e2e/workflows/write-and-restore.spec.ts` 中「写作与恢复：批注、版本、恢复，重开后一致」。

### F17 — `005b05b4`

- 文件 — `packages/kernel/src/{dispatcher,idempotency}.ts`、`packages/kernel/test/idempotency.test.ts`。
- 普通幂等调用先同步持久化受理，再进入 handler。同键并发等待同次执行。回执写入不明时返回原受理的 `unknown`，重启后同键继续查到受理，变更输入仍返回冲突。明确可重试的失败持久释放原键。日志缺少最后换行时，保留完整结果并清掉撕裂尾后再追加。中部损坏保留原件与可读回执，新键拒绝受理，直到日志修复。超过 24 小时的普通记录从内存清理，并在后续写入时按时限和行数阈值原子压缩文件。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/idempotency.test.ts`，6 项通过。覆盖真实文件的撕裂尾、中部损坏、持久受理后注入结果写失败、窗口边界与 20,000 条过期记录的回收。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/dispatcher.test.ts`，29 项通过。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts`，40 项通过，含超过网关窗口后仍沿用任务域自身的 dispatchId 记录。
- 磁盘故障注入和重启读取由单测覆盖，未增加 Playwright 专用用例。未做设备掉电与文件系统强制卸载测试。

### F18 — `5d484a97`

- 文件 — `apps/engine/src/boot.ts`、`apps/engine/test/engine.test.ts`；`packages/kernel/src/gateway-tokens.ts`、`packages/kernel/src/server/{http-app,ws-events,ws-workbench}.ts`、`packages/kernel/test/server.test.ts`；`tests/e2e/workflows/web-share.spec.ts`。
- 回环控制端的工作台原始事件使用桌面凭据，独立 Web 入口使用当前邀请会话。CLI、MCP、HTTP、插件凭据不接纳原始事件，重连补发也经过同一入口检查。凭据撤销绑定其自己的 signal，删掉整角色断开接口 `RunningServer.closeConnectionsOf` 和 `GatewayTokens` 的撤销回调。已更新仓内调用方。事件帧协议保留 `hello`、`seq`、`epoch` 和 `resync`。入口源码注释记录权限和重连语义。
- 每连接应用发送积压上限 1 MiB。补发同时受 1,000 条和 4 MiB 编码字节约束。无法排入一个连接预算的补发和超大事件使用 `resync` 让工作台重取快照。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/server.test.ts`，20 项通过。实测在 Linux 回环暂停一个客户端读取，发布 128 个 64 KiB 合成载荷。发送前队列加下一帧估算的峰值为 985,515 B，低于 1,048,576 B 上限。慢连接断开，快连接按序收到全部 128 帧，旧序号重连收到 `resync`。该数值只计应用积压和帧开销，未采集 OS TCP 缓冲或总 RSS。实测原件 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task04/f18-loopback.txt`。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/web-share.test.ts`，4 项通过。覆盖获邀 Web 会话、撤销单份邀请及停止分享。
- Lead 执行 `tests/e2e/workflows/web-share.spec.ts` 中「Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开」，包括新增步骤「F18 HTTP 凭据从工作台事件流隔离，撤销一枚后另一枚仍可使用」。

### 批次回归与未运行项

- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/engine.test.ts`，50 项通过。包含真实 Engine 控制端、HTTP 工具与凭据、MCP 传输、市场插件和终端桥回归。
- 待 Lead 逐包类型检查 `@huhu/kernel`、`@huhu/engine`，并在整合版本核对消费者 `@huhu/workbench` 的事件契约。没有新增 ES2024 API 或依赖。
- 待 Lead 执行列出的 Playwright 用例。全量测试、构建、打包、全仓和逐包类型检查、全仓 lint、knip 和截图取证均未运行。Windows、macOS 和独立外部 provider 未验证。

## 阻碍与接续

无实施阻碍。待 Lead 在整合版本验收后回写业务验收记录。

## Lead 验收

- Lead 2026-11-24：F15–F18 合入 main，kernel/engine 等类型检查通过（Lead 修 1 处测试类型），E2E 通过。清单转 task05。
