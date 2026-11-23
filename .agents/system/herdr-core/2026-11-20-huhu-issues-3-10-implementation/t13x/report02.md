# #5 T2.1 · Tasks 到 Agent 的生产接线独立复核

- 任务 [t13x/task02.md](./task02.md)
- 执行结果 **done**。最终串行复跑两份测试文件，3 项全部通过，Vitest 退出 0。
- 候选 `ff0afc5866e85b399143574f9e62f6820d4a90c1`，直接父提交 `3bd2e245d0eff8ffef8eb94f80c6106d73047ba9`。
- Windows x64、Node.js 24.21.0、Vitest 3.2.7。固定 Core 0.1.19，二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。

## 实测

真实 Engine 的 `boot()` 通过 `PluginManager` 启用 Tasks 和 Agent CLI，使用生产默认的 Tasks 执行器及同一 `Dispatcher`。夹具加快 Tasks 检查周期，正向路径配置本地 Node 合成 provider，实际进程由隔离的固定 Core 启动。任务受理、终端 WebSocket、输入仲裁、收件确认、持久回执和任务状态均走候选代码。

| 场景 | 观察结果 |
| --- | --- |
| 生产入口的 provider 无证据 | 走 Engine HTTP 受理 `new` 和显式 `resume`，两者都得到 `blocked / target_unsupported`。任务保持 `not_started`，零会话启动、零系统评论、无 Agent 派遣凭据。 |
| 回包丢失与重复派遣 | 固定 Core 先实际执行一次启动及一次输入，夹具各丢弃一次回包。无 ACK 时，Tasks 为 `unknown / awaiting_confirmation`，任务保持未开始且仅保留原人工评论。重开同一 Vault 后回读原 `run-mwor9z2hjhbh`、`sess-mwor9z4p4no8`、隔离 Core 终端 `t1` 与原 PID `50576`。重复相同业务派遣返回原 run。合成 provider 共收到一次输入，匹配 ACK 后任务进入进行中且只有一条派遣系统评论。 |
| 指定已有会话和原绑定 | 人工终端 WebSocket 占用输入时，指定的 `t2` 处于等待且零输入。释放后原会话收件一次。Core 已写入但尚无 ACK 时，回执记录 `core_written`，任务仍未开始。匹配 ACK 后才进入进行中。Space revision 失效和同地址代次变化均保留原选择，所检输入计数均为零。 |
| 停用与取消 | Automations 停用后仍可人工派遣，重开继续保持停用。在 provider 就绪等待期间停用 Tasks，夹具观察到 `AbortSignal` 已撤销，原轮当时零输入。重新启用后同一个 run 对账，最终收到一次输入。 |
| 私有权限 | 真实 Dispatcher 允许 `plugin:tasks` 枚举目标，拒绝 desktop 和 `plugin:automations`，CLI 和 MCP 得到 `CAPABILITY_NOT_EXPOSED`。源码中内置 `agent.task-input` 权限仅由 Tasks 清单声明，三个 Agent 能力均设置为不公开并校验门面提供的 `plugin:tasks` 身份。 |
| 冻结输入与 ACK | 适配器夹具核对原 Space／模型设置、冻结正文与规则补充指令、事件和快照引用。提交将 CRLF 转为 LF，原快照保留原字节。错误正文摘要使结果保持 `unknown`，相同执行身份与正确正文摘要的 ACK 返回 `accepted`。 |

## 传输键、调用者与派遣身份

- 外层 `tasks.dispatch` 沿用通用网关幂等回执，按调用者、能力名与传输 `idempotencyKey` 查询。HTTP 夹具在重复同一业务派遣时使用新的传输键，Tasks 用输入的 `dispatchId` 找回其持久受理记录、原 run 和快照。
- Tasks 在插件间调用中将业务 `dispatchId` 同时填入 Agent 输入和传输 `idempotencyKey`。插件门面独立提供 `plugin:tasks` 调用者，转发取消信号。Agent 处理器以该调用者执行授权，再以 Vault、机器、任务、派遣、run、attempt 和输入摘要核对受理及原会话绑定。
- 在候选的 `apps`、`packages`、`plugins` 中，唯一实际注册的 `idempotency: "handler"` 是私有 `agent.runs.dispatch`。执行类能力仍检查传输键。此能力由 Agent 自身按业务身份和请求指纹持久去重，并从写入意图与回执返回当前结果。已写或待核实的记录沿原绑定对账。这样回包丢失后可观察当前 ACK，而通用网关回执不会冻结此能力的早期状态。

## 复跑与清理

- 从候选 Git 对象建立隔离归档，应用锁文档与本机已安装依赖锁逐项比对一致。归档中 102 个工作区链接指向候选源码，297 个第三方依赖链接指向已安装的 Windows 包。测试前后的归档锁 Git 对象均为 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`。
- 首轮在仓库内的临时目录复跑，2 项通过。正向 HTTP 用例的 8 秒轮询在 `test/task-dispatch.live.test.ts:189` 超时，受理仍为 `sending`。同盘单独复跑仍在同一断言超时。将合成 Vault 和 Core 状态移到 Windows 系统临时目录中的新建子目录后，定向用例用时 6.071 秒通过。随后整组串行复跑用时 17.06 秒，2 文件、3 项全部通过。所有轮次保留候选夹具的原断言和超时。
- 最终隔离 Core ID 为 `4851787876a42ad98628aa97bc07300b`。清理观察为 `livePids: []`，临时 Vault 根计数为 0。验证窗格 `t14f`、`t14h`、`t14k`、`t14n` 已在退出后移除，归档和临时目录已清理。候选差异的 `git diff --check` 通过。本轮未创建 worktree，未改业务源码或锁文件。

归档根目录下的最终复跑命令如下。环境变量 `HUHU_AGENT_LAUNCH_TEST_BIN` 指向经校验的 Core，`TMP` 和 `TEMP` 指向新建的隔离子目录。

```powershell
node node_modules/vitest/vitest.mjs run apps/engine/test/task-dispatch.live.test.ts plugins/tasks/test/agent-dispatch-executor.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

复核覆盖上述既有 Engine 和适配器夹具，正向 provider 为合成进程。具备真实 provider 收件证据的原生 resume、Renderer 详情定位与焦点走查属于各自后续验收范围。

依据 [T2.1 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T2.1-dispatch-cli.md)、[W6.1 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md) 和 [T2.1 实施报告](../t135/report01.md)。

## Lead 验收
