# 原生历史派遣返工独立复核

- 任务身份为 t1g0/task01.md，Lead 为 t3p。共享根为 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release。
- 工作目录为 /home/wta/projects/huhu，审查对象为 main 的未提交原生历史代码，以 cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2 为基准。随 Lead 格式化完成后重新跑了两项源码探针，以下定位采用复跑时的行号。
- 报告位置为 /home/wta/projects/huhu/temp/closeout-release/t1g0-report01.md。执行结果为 done。

## 结论

上轮四项中，未发送释放、首次输入配置门槛、受控原生目标目录与退避重试、扫描资格主路径均已有对应修复及定向证据。复用历史匹配和认领引入两处原有入口回归，其中 P2 会让有资格的普通 Codex 历史在列表中无法恢复或 fork，建议 #4 签收前修复。P3 只影响 Pi 两个无关来源并发启动的短暂窗口，可定向处理。

## 规格发现

### P2 普通 Codex 历史列表把另一 profile 的同 UUID 记录标为占用

触发条件为受控隔离 profile 的 Codex 历史正在工作台运行，而普通 profile 中存在相同 UUID、不同 rollout 和 cwd 的有效历史。新版 mayBeSameHistory 对 Codex 只按 UUID 匹配，historyList 直接用它计算 possiblyActive。正常记录被标记为「可能已在运行」，恢复和 fork 均不可用，也从可恢复筛选中消失。相同数据经过后端 historyBusy 时，精确文件比较正确放行。基线对异 cwd 返回 false，本轮的匹配放宽引入了这个异 cwd 案例。应让列表与认领复用对 Codex 来源的精确匹配，并保持原记录 active 优先。 [UUID 匹配](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:584) · [精确认领](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:732) · [列表资格](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:843)

源码探针执行实际列表资格表达式和 historyBusy，两个来源使用不同文件及 cwd，并把其余资格设为有效。得到 active=false、possiblyActive=true，resumeBlocked 和 forkBlocked 都是「可能已在运行，请从会话列表核对」，historyBusy=false。证据覆盖引擎计算，未另跑对应浏览器用例。

### P3 Pi 的同 ID 独立历史在并发认领时互相阻塞

两份 Pi 历史文件可以具有相同 header ID。基线认领键含源 cwd，本轮共用的 historyKey 对 Pi 仅保留 provider 和 nativeSessionId。第一份历史还在启动时，第二份来自不同 cwd 的独立历史在共用认领中收到忙，甚至还未调用实际启动方法。第一份退出认领窗口后第二份可打开。用实际 claimHistory 挂起第一个 launch 回调，第二个同 ID、异 cwd 的回调调用数为 0，释放后重试调用数为 1。后端 launchHistory 将忙值映射为用户可见的「这个原生会话可能已在运行或正在打开」。恢复 Pi 原有认领粒度便可覆盖此回归。 [认领键与取锁](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:720) · [同 ID 独立文件的现有测试](/home/wta/projects/huhu/plugins/agent-cli/test/history.test.ts:195)

## 已复核的返工

- 取消与释放。Tasks 校验本机持久认领、原任务/run/attempt/dispatch 和终态，Agent 再要求原写入记录为 not_sent。继续保留已有持久输入意图的占用，并在 kill 前核对 Core 原进程代次。补充源码探针执行实际 Tasks 状态谓词、Agent owner 和输入仲裁。未发送且已取消释放，Tasks 仍 unknown、Agent sending、Agent unknown，以及保留持久意图但回执不可读的四种情况均维持占用。 [派遣占用](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:115) · [释放与原代次](/home/wta/projects/huhu/plugins/agent-cli/src/engine/sessions.ts:1126) · [持久意图后备](/home/wta/projects/huhu/plugins/agent-cli/src/engine/dispatch-store.ts:212)
- 首轮资格。认证通道后重新验证原 Core 进程。有效 Codex 配置、Space 修订和派遣占用均在写入意图前同步核对，意图落盘与 socket 提交间没有 await。复跑探针得到停用和配置替换均提交 0 次，原提交加重查合计 1 次。已写入状态继续沿原执行凭据对账。 [同步门槛](/home/wta/projects/huhu/plugins/agent-cli/src/engine/sessions.ts:1466) · [受控配置](/home/wta/projects/huhu/plugins/agent-cli/src/engine/codex-dispatch.ts:277) · [复跑来源](/home/wta/projects/huhu/temp/closeout-release/t1fp-postfix-probe.cjs)
- 受控 writer。签名拒绝核对尝试、来源、helper 地址与 PID。确认原进程退出、案件仍未发送才退避，后续使用同派遣身份与原冻结来源，按退避计数产生新的启动请求，已写入派遣只对账。同 cwd 无关会话及明确来自另一 profile 的 rollout 在受控目录中可并行。首次遇见 Vault 之外的 writer 需由 App Server 恢复确认，目录能展示已取得的拒绝证据。Lead 的 Engine live 使用 App Server 夹具覆盖冲突前零 turn、释放后原请求恰好一个 turn。 [签名匹配](/home/wta/projects/huhu/plugins/agent-cli/src/engine/codex-dispatch.ts:293) · [Engine live](/home/wta/projects/huhu/temp/closeout-release/history-boundary-live.log) · [真实固定 Codex 拒绝](/home/wta/projects/huhu/temp/closeout-release/codex-resume-protocol.log)
- 扫描预览与发生调用同一个 classifyTaskScan 和 Tasks 原生资格，采用相同的任务正文、规则指令、受控配置与所选来源。Core 仅 peek/list，预览读现有记录而不启动 Core、恢复 helper、写发生或接受任务。冷启动的配置预检可执行已核对 CLI 的 --version。发生冻结后以已存候选重放。独立重跑 Automations service 单文件定向测试 8/8；Lead 的扫描集成 1/1 覆盖预览无发生和派遣记录、变化后同样跳过，以及有效来源重新入选。集成用替身提供 Agent 目录。 [共同分类](/home/wta/projects/huhu/plugins/automations/src/engine/service.ts:310) · [冻结](/home/wta/projects/huhu/plugins/automations/src/engine/task-scan-occurrences.ts:324) · [集成日志](/home/wta/projects/huhu/temp/closeout-release/history-scan-live.log)

## 规范与验证边界

只读审查业务文件，审查范围内未另发现明确规范违规。亲自运行了原返工 Node 探针、两项源码提取探针、定向 diff --check、两个 CJS 的 node --check 和 Automations service 定向 Vitest。Lead 的 Engine live、扫描及 provider 回归均各 1/1，真实固定 Codex 桌面 C01 1/1。Lead 另报桌面 E2E 与 knip 门禁完成。现有 C01 实测范围为 Linux x64 受控 Codex 0.170.0，来源由真实 App Server 生成并使用本地模型夹具。 [provider 回归](/home/wta/projects/huhu/temp/closeout-release/history-provider-regress.log) · [桌面 C01](/home/wta/projects/huhu/temp/closeout-release/history-boundary-ui/result.json)

### 未运行的验证

本 worker 未启动浏览器、Electron、真实 Codex 或 Core 夹具，未执行打包、构建、全仓类型检查、knip、lint 或全量测试。上述两个回归使用当前引擎源码表达式和受控内存输入复现。本轮未检查前端源码。

## Lead 验收
