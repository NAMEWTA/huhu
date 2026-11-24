# T7.2 · Windows 固定候选独立取证

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t19m`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/report01.md`
- 执行结果 — `done`（本次独立取证已完成）。**T7.2 整段发布验收仍受原生问答阻碍。**

## 候选与执行边界

Windows x64，HUHU `0.0.1-rc.4`，固定提交 `40822efd63d80cdc1bcba1d0f9c7d1219aa5bbd1`。重新计算 NSIS 安装包 SHA-256 为 `3b9d72dd8da98add223243650986ad77a3ba5c50e2b9007e408a049ae1df7521`。从指定的 `win-unpacked/HUHU.exe` 运行，桌面报告提交前缀 `40822efd63d8`。实测使用包内 Herdr Core `0.1.19`、包内 `resources/bin/huhu.cmd` 和本机原生 Codex CLI `0.171.0`，Codex 二进制 SHA-256 为 `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7`。包内 helper 与固定源码的 SHA-256 相同。测试每次新建 Vault、桌面 user-data 和 provider HOME，使用无需账号的回环 Responses 服务。夹具只控制模型的工具选择和最终文本。 [二进制指纹](evidence-task01/hashes.json) · [前序审查](../t187/report13.md) · [原包 smoke](D:/Document/code/huhu/temp/issue-baseline/40822efd-packaged-smoke.log)

## 原生问题在哪一步中断

| 实测入口 | 观测结果 |
| --- | --- |
| 包内 MCP 创建并派遣，Codex 使用默认配置 | 首次模型请求实际公布同步工具 `request_user_input`，说明限 Plan 模式。夹具选择该工具后，第二次模型请求携带 `request_user_input is unavailable in Default mode`。CLI 没有查到问题，终态 run 的 `questions=0`。 包内默认配置（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/packaged-default.jsonl`） |
| 包内同一路径，仅在新 provider HOME 开启 `features.default_mode_request_user_input=true` | 工具说明变为支持 Default 或 Plan。夹具投递同样的一道双选题，下一次请求带回 `{"answers":{}}`，CLI 仍然没有问题。两次模型请求各属于同一轮，结果是夹具随后发出的固定文本。两种配置均未公布 `request_user_input_async`。 [开关状态](evidence-task01/native-features.txt) · 包内启用开关（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/packaged-enabled.jsonl`） |
| 独立 stdio 对照，同一原生程序、同样的线程配置、同一道题，直接记录 app-server 帧 | 开启 Default 模式问答后，原生 `item/tool/requestUserInput` 带 `id=0`、`isBlocking=false`、`isOther=true`、`isSecret=false` 和 Blue、Green 两个选项。独立客户端回复 Blue 后，第二次 Responses 请求确实带回 Blue，原 turn 完成。 原生 Default 协议记录（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/native-default-enabled.jsonl`） |
| 独立 stdio 对照，在 `turn/start` 显式选择 Plan | 原生请求变为 `isBlocking=true`，`isOther=true` 保留。直接回答仍可继续。普通事件流有 `serverRequest/resolved`，包内答案读取器在这次对照中没有提取到工具输出。另一次在隔离进程启用 `experimentalRawEvents`，读取器从真实 `function_call` 与 `function_call_output` 配对提取到 `call_t19m` 和 Blue。 Plan 普通事件（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/native-plan.jsonl`） · Plan 原始事件及包内读取器结果（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/native-plan-raw.jsonl`） |

包内 helper 的 `turn/start` 没有选择 Plan。它仅受理绑定到当前线程、轮次和 item 的单个阻塞问题，要求问题非秘密、没有自由补充选项，且有 2–8 个互异标签。两种不兼容的标志由原生程序构造，公布给模型的工具参数只有问题 ID、标题、题干和选项。helper 对不受理的 RPC 返回 `-32601`。固定候选的包内 CLI 因此没有可用于 `tasks.reply` 的原 request ID 和 version。独立 stdio 的 Blue 只证明 Codex 能续行。包内成功结束的 run 证明结果投递，包内真实答复、重答、原问题暂停／恢复及答案消费 ACK 均未取得。 [包内原文件](C:/Users/cdewta/AppData/Local/Temp/huhu-40822efd-release-8c634516/win-unpacked/resources/codex-dispatch/helper.cjs:198) · [接收与拒绝分支](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:391) · [答案 ACK 条件](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:247)

## 同一包上已走通的业务链

通过实际 MCP HTTP `tools/call` 创建两个 Agent 任务。次日对照任务 `task-mwpirta9p9cs` 的最早派遣为台北时间 11 月 22 日 05:57:09.993。MCP 提前派遣得到 `INVALID_INPUT / not_due`，CLI 读到零次运行。另一任务使用 5 秒一次的包内调度器和真实系统时钟，最早派遣设在本次观测窗口内。以下时间为台北时间 11 月 21 日。 完整调度与双端回执（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/scheduled-durable.jsonl`）

| 业务环节 | 同一现场的观测 |
| --- | --- |
| 暂停、未到期 | 规则保持暂停跨过一个扫描点，零发生、零运行、零模型请求。启用后 05:57:20、25、30 三次扫描均以 `not-due` 跳过两项任务。 |
| 到期与重复扫描 | 近期待执行项于 05:57:32.322 到期，05:57:35 的 occurrence 只受理一次，attempt 为 1。05:57:40 因 `task_occupied` 跳过，45 和 50 秒因 `not-open` 跳过。旁边的次日对照持续为 `not-due`。 |
| 外部读取与持久化 | 包内 CLI `tasks.read` 从原任务读出一条结果评论。`tasks.runs` 返回一个 `succeeded` run，投递为 `delivered`，问题数为 0。Agent 端结果文件与 Tasks 收件记录的 receiptId 相同，收件记录中的 messageId 等于 CLI 读到的评论 ID。 |
| 桌面回到原会话并人工完结 | 从该 run 展开结果，点击“定位原会话”。桌面显示活动 Codex 标签与会话预览，终端连接路径为 `/ws/terminal/sess-mwpiscqpywwu`，与任务结果的 session ID 完全相同。结果投递后任务仍为 `in_progress`；从桌面任务列表选择完成，包内 CLI 回读 `completed`，结果数仍为 1。 任务结果截图（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/result.png`） · 定位原会话截图（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/task01/legacy-7984bff4/evidence-task01/located.png`） |

| 关联字段 | 实际标识 |
| --- | --- |
| occurrence | `occ-f6d3efbf4e04b1bae718fd27dd6c8cf9c6152b95c16ac37aec780400d0b8d772` |
| task / dispatch | `task-mwpirtivqndm` / `scan-7e5358188d5abbdd06843e73c649fdb1ab0183bebdd129ec56a92717497d5484` |
| run / attempt | `run-mwpisclewvpx` / `1` |
| Space / session | `space-mwpirsb15w1n` / `sess-mwpiscqpywwu` |
| native thread / turn | `01a1faf7-0768-71d0-ade2-336538f91a4f` / `01a1faf7-13d2-75f3-8145-a5bf0eb2d9a2` |
| native result / receipt | `msg_huhu_packaged_fixture` / `codex-12d0b0b02eb90db29d4fd435c877aad6c495c85f7ae1ffdc90ece6e5fd54b937` |
| Tasks message | `receipt-340fb06c0714fd43acf798aff80f9f42d6285c0a5093499b15c9534cde6f9bf8` |
| Tasks request / version | 没有生成。独立 stdio RPC 的 `id=0` 属于另一个进程，不能用于此任务。 |

## 跨日与重答的定向验证

在固定提交的临时源码快照复跑 4 项既有用例，4 项通过。真实安装包观察到短周期到期和次日项保持未发，未等待自然跨日，未修改系统时钟。生产 Tasks Engine 用例以注入时钟从 11 月 20 日推进到 21 日，到期前处于等待，到期后执行器仅调用一次。扫描分类另验证台北早上 09:00 前 1 毫秒仍不受理，到点才进入候选。 本次定向运行（历史位置 `evidence-task01/engine-tests.log`，本次未取得原件） · [生产 Engine 跨日用例](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/test/persistence-http.test.ts:389) · [扫描边界](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/test/scan.test.ts:80)

重复回答用例在生产 Tasks Engine 注入合成问题和执行器。两个竞争回复只有一个受理；同一回复重交得到相同回执，以同一 replyId 更改答案得到 `IDEMPOTENCY_MISMATCH`。重启后只对账，执行器收到一次回答，原 run 只有一条回答评论。第四项验证停用期间不补扫、重新启用只追最近一轮。真实安装包尚需用原 request 重验重复回答。 [重复回答用例](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/test/persistence-http.test.ts:791) · [停用与恢复用例](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/test/task-scan-occurrences.test.ts)

## 复现和最小接续

1. 将 [包内探针](evidence-task01/probe.cjs)、[短周期探针](evidence-task01/timed.cjs)、[原生协议探针](evidence-task01/wire.cjs) 和 [固定提交参数](evidence-task01/candidate.json) 复制到新的系统临时目录。从有 Playwright 依赖的 integration 目录执行以下命令。每次运行自动建立独立 HOME 和 Vault，日志写入脚本旁的独立目录。包内探针只向本次 Vault 的 MCP／CLI 授予任务所需能力。

```powershell
# $probeDir 为复制文件后的系统临时目录
$exe = "$env:TEMP/huhu-40822efd-release-8c634516/win-unpacked/HUHU.exe"
$native = (Get-ChildItem "$env:APPDATA/npm/node_modules/@openai/codex" -Recurse -Filter codex.exe | Select-Object -First 1).FullName
$fixed = Join-Path $probeDir 'candidate.json'
node "$probeDir/probe.cjs" $exe $fixed $native default
node "$probeDir/probe.cjs" $exe $fixed $native enabled
node "$probeDir/timed.cjs" $exe $fixed $native durable
node "$probeDir/wire.cjs" $exe $fixed $native standalone
node "$probeDir/wire.cjs" $exe $fixed $native plan
node "$probeDir/wire.cjs" $exe $fixed $native plan-raw
```

2. 产品接续应先验证一个可受理的阻塞模式。实测 Plan 能发阻塞问题，但 Codex 同时声明允许自由补充。若产品批准支持这种问题，可以继续仅接受已公布的选项，并保持对秘密问题和过期绑定的拒绝。还要在原生进程中证明所选答案实际被消费。协议对照已验证一种实验性原始事件来源；其稳定性与支持范围需要产品确认。
3. 在更新候选上重跑同一脚本。只有 CLI 读到真实问题，按原 request/version 回答并重交、同一 turn 回送所选标签、拿到原 run 的答案 ACK 和一条结果，才可签收问答。保留同一组 occurrence、task、run、session、request 和结果标识。

本次曾纠正探针对桌面提交短码长度的断言，以及对“定位原会话”总会打开分栏的假设。最终以实际会话预览和终端连接路径核验。源码定向运行的临时快照补齐 vendor 依赖后通过。取证只写系统临时目录和本任务证据目录；外部代理和模型均在回环地址，未使用真实账号或凭据。包内 Core 停止后 status 为 5，已清理自行启动的 Core 测试窗格。 [清理记录](evidence-task01/cleanup.json)

## Lead 验收

