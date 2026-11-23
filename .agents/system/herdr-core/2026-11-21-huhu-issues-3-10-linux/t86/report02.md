# 原生启动丢回包后的原尝试恢复

- Core `wta-ubuntu`，Lead `t3p`，worker `t86`。执行范围见 [task02.md](task02.md)。诊断依据为 [t8t 只读分析](../t8t/report01.md) 和 [t8y 独审](../t8y/report01.md)。
- 分支 `impl/huhu-issues-3-10-integration`，报告时 HEAD 为 `c8ead704`，实施改动留在共享工作树。状态为待 Lead 真实入口验收。报告后冻结本轮文件，供串行验证。

## 实施行为

- Agent 在提交原生 Core 终端前持久化 `waiting-host`。首次丢回包且无法核对时返回原请求的 `RUN_UNKNOWN`，原 broker 继续在自己的有限窗口中查找。匹配以同一个 Core、启动标签、cwd、argv 摘要、地址和进程实例为依据。查找期间维持原 session/request/attempt，后台没有第二次 `terminal.run`。
- 核验唯一活宿主后才请求凭据。写 broker 私有 stdin 前，Agent 原子保存 `delivering` 和原 host binding。独立的消费回执保存 `nativeConsumed`，私有启动回执才推进 `started`。旧 `pending`、新 `delivering` 或仅有消费回执的记录重开后仍为 `unknown`。新 `waiting-host` 在原 Engine 已结束或 broker 已过期且能证明未写帧时结算为原尝试失败，保留外层清理待办。按原身份结束和清理 host，未能核对身份时保留待办。 [Agent 启动所有权](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L693)
- Automations 只传非秘密计划、已批准名字、进程内一次性领取和完成回调。等待 host 时释放规则配置队列。实际领取前和 lease 内重新验证原主体、当前授权与工具开放、原 grant、规则和 Space/目标、配置修订和名字。保护值只在该次 lease 内用于 broker，业务记录和回调闭包不保存明文。broker 到期与 run 取消共同约束未交付的领取。等待期间保留原 run 的取消权，完成回调接回原记录结算。配置缺值的请求在受理前明确拒绝。 [Automations 受理与结算](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L549) · [原授权复核](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts#L497)
- 普通 profile 在 Core 连接期间发生版本变化，保存原未发送记录为失败，`attempt` 仍为空，Space 不再被 `launching` 占用。新的纯普通 profile 会话沿用正常输出，重开 Engine 后仍可读。历史既有 `hasEnv` 记录缺少可信的普通/保护区分，继续按旧读取门槛处理。
- 已批准 sh 的 Linux 私有 masker 只把匹配到的保护值替换成 `***`。普通原生终端继续使用 `[REDACTED]`，规则原文里的字面 `[REDACTED]` 保留。Go 私有消息和回执格式沿用原协议。

## 配合与范围

- Lead 已为 `registerTerminalEnvironments` 的第四参数接入现有 `opts.taskScanPrincipalCurrent`。Agent 私有包装的返回签名保留 `{ id }`，延迟完成从私有输入的 `onPending` 传回。Lead 的 `launchApprovedShell` 动态 getter 用 `helperAvailable` 反映当前宿主能力。
- `native-pty.ts` 的原 broker 停止信号、`native/agent-pty/**` 的 masker 与 console 调用点已交 Lead 纳入 t8k 工作树。t86 在收到移交通知后未再写这些文件。provider 安装入口和 Agent 退出后返回 shell 由 t8k 处理，接线参考 [t91 方案](../t91/report01.md)。

## 已运行验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/agent-cli/test/sessions.test.ts -t '普通\|原生'` | 14 通过，27 个范围外用例过滤。覆盖同一 broker 短断续查、写前落盘、消费与旧 pending、重开后原退出对账、空/多匹配和换代、超时/取消/关闭、领取迟到、普通配置版本变化和普通输出重开。夹具使用模拟 broker 与 Core。 |
| `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/automations/test/service.test.ts` | 40 通过。覆盖延期前零读取、恢复一次领取、lease 清理、取消、撤权、轮换、主体失效和工具关闭。测试同时覆盖缺 helper 时批准拒绝、原批准仍可从桌面撤销、普通默认 shell 与普通 sh 仍可启动，以及保护值清空后拒绝派遣。 |
| 定向 oxfmt、Go 格式及 `git diff --check` | 通过。 |

## Lead 串行验收与未运行项

- 用最新 helper 运行 `apps/cli/test/approved-terminal.test.ts`。保留原 Core 回包丢失和 `terminal.list` 暂拒注入。新夹具在目标命令里写入合成计数行，解除故障前断言 0，原运行成功、同意图重投和重开后断言 1。另注入私有 `started` 已保存后的 Agent 返回丢失，并核对第二个意图只增加一次实际执行。定向假 Core 用例独立覆盖消费后缺 `RUNNING` 时维持 `unknown`。真实 CLI/MCP/Core 本轮 worker 未运行，原失败证据仍保留。 [真实入口断言](../../../../../temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts#L190)
- 完成定向 Agent、Automations 和 CLI 类型检查，并运行完整单文件 `sessions.test.ts` 的真实 Core 用例。按 t8k 整合后的 Go 文件运行 Linux build、真实 PTY 夹具和 Windows 编译检查。实际 Windows ConPTY、Linux 桌面/E2E、随包验证、全仓检查和打包均未由本轮 worker 运行。

```sh
bash native/agent-pty/build.sh --test
HUHU_AGENT_PTY_HOST=/absolute/path/huhu-agent-pty \
HUHU_AGENT_LAUNCH_TEST_BIN=/absolute/path/herdr-core \
  pnpm --config.verifyDepsBeforeRun=false exec vitest run apps/cli/test/approved-terminal.test.ts
```

## Lead 验收

由 Lead 追加。

- Lead已保存候选be992934。t94定向类型检查发现4处Promise.withResolvers的lib不匹配，交task03修复；t95已通过Go模块校验、测试和Linux helper构建。真实CLI验收尚未完成。
