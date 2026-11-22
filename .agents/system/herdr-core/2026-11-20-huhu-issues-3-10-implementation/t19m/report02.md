# T7.2 Windows Codex 原生问题接入诊断

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t19m`
- task — [task02.md](task02.md)
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/report02.md`
- 执行结果 — `done`。本项交付为诊断。原发行候选的 T7.2 仍采用 [report01 的未通过结论](report01.md)。

## 结论

**Windows x64 固定版 Codex 0.171.0 可以保留 Default 执行模式，回答一个原生固定选项问题，并在同一个 turn 内消费一次。** 实测最小通路是受控进程启用 `default_mode_request_user_input`，线程启用 `experimentalRawEvents`，helper 仅为经过核验的原生问题形态开放固定选项。包内 Engine、Core、MCP 和 CLI 配合一份系统临时 helper 副本，得到一个 `accepted` 回复、一条回答评论和一条结果。去掉原始事件后，同一流程仍能产生结果，但回复保持 `unknown`。 [正向实验](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/helper-raw-1795212190367/events.jsonl>) · [关闭原始事件的对照](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/helper-noraw-1795212190367/events.jsonl>)

本次使用 [前次固定候选及原生二进制指纹](evidence-task01/hashes.json)。包内 Core 为 `0.1.19`，实际 Codex 程序 SHA-256 为 `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7`。Engine 由候选包内 `app.asar/out/main/engine.js` 的独立入口启动，指向临时 helper。业务树、候选包和原用户 Codex HOME 未作更改。模型推理由只监听回环的 Responses 夹具提供。每个程序使用新 HOME，网络代理只接受本机连接并拒绝转发，正向实验记录两次后台代理请求被拒。八个诊断窗格均退出 0 并已移除，两次临时包内 Core 停止后的状态码均为 5。 [试验入口](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/helper-probe.cjs>) · [运行与隔离目录清理](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/runs.json>) · [窗格清理](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/cleanup.json>)

## Default 模式实际如何等待

| 试验 | 原生观测 |
| --- | --- |
| 保留问题不答 65 秒 | RPC `id=0`，`isBlocking=false`、`autoResolutionMs=null`，单题、两个选项、`isOther=true`、`isSecret=false`。回复前仅有一个模型请求，原 turn 仍在途。对原 RPC 与题目 ID 回复 Blue，随后同一线程报告请求 resolved，同一 turn 的原始工具输出包含 Blue。第二次模型请求携带该输出，最终只有一个 turn 完成。 [延迟回答全序列](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/default-enabled-1795212084916/events.jsonl>) |
| 同一模型响应给出两个不同 call ID | 在这一批次中，Codex 在第一个 RPC 回答并 resolved 后才发第二个 RPC。第一项 `call_t19m / rpc 0 / direction` 收到 Blue；第二项 `call_t19m_second / rpc 1 / other_route` 收到 Green。模型续行一次，两项输出分别关联原 call ID。 [两个请求的顺序](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/multi-1795212216567/events.jsonl>) |
| 挂起后中断，不提交答案 | 第 3.5 秒请求 interrupt。工具输出为中断文本，turn 进入 `interrupted`，随后仍有 `serverRequest/resolved`。答案读取器没有提取到答案，也没有下一次模型请求。 [中断对照](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/default-interrupt-1795212084917/events.jsonl>) |

这里的依据是隔离 app-server 对这个具体函数调用的等待行为。65 秒是观测窗口。若出现自动解决计时器、一个 RPC 中有多道题、其他客户端可接管请求、未能绑定的并发请求或不同的工具语义，单轮等待结论需要重新验证。遇到停止、换代或失去绑定时，原请求应失效，不能补发到下一轮。

## 同一回答如何被证明

包内 MCP 创建并派遣任务，CLI 从 `tasks.questions.list` 得到原请求。运行显示 `waiting_input`。CLI 提交未列出的答案得到 `INVALID_INPUT`，错误版本得到 `VERSION_CONFLICT`，两者都发生在第二次模型请求之前。合法 Blue 才产生回复写入。同一 replyId 重交得到原记录，换键竞争被拒。两端落盘记录给出如下关联。 [CLI、Agent 与 Tasks 记录](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/helper-raw-1795212190367/events.jsonl>)

| 对象 | 正向实验中的身份 |
| --- | --- |
| Huhu task / run / attempt / session | `task-mwpizk9p6le7` / `run-mwpizkawo534` / `1` / `sess-mwpizkg4nrg1` |
| 原生 thread / turn | `01a1fafc-2a7d-7792-ab7d-8ab81a04b616` / `01a1fafc-388f-7822-bf26-8bdb0bea808c` |
| 原生调用 | `request_user_input`，RPC 整数 `0`，`itemId=call_id=call_t19m`，题目 `direction` |
| Tasks request / version / replyId | `codex-question-f1eec46da8ccc9d243fb0d6b6869ff25397b9d397bc797a19fc27fe58f7fee17` / `1` / `t19m-selected` |
| 最终产物 | 原生问题及结果各有一份 delivered 回执；一次 answer-write、一次 answer-ack，重读原回复为 `accepted`。CLI 只读到一个成功 run、一条 answer 评论和一条 result 评论。 |

**接入后应保留两项独立证明。** 一是本进程在原 thread 收到匹配 RPC ID 的 `serverRequest/resolved`。二是同一 thread/turn 上，原 `request_user_input` 调用的 call ID 与问题 item ID 相同，且工具输出解码为本次唯一题目 ID 和选中标签，内容与已提交答案逐项一致。真实原始输出可省略工具名，要先用同一 turn 的原始调用建立工具名和 call ID 的映射。新接入的非阻塞形态宜要求这对调用和输出都已观察到；命名空间或身份有歧义即保持待核实。临时实验沿用现有读取器；未穷举其他可选事件编码。普通结果、助手回显、发送成功和单独的 resolved 均不足以写答案 ACK。 [读取器](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:12>) · [两项证据汇合](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:241>) · [无原始事件仍保持 unknown](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/helper-noraw-1795212190367/events.jsonl>)

## 最小改动、能力探测与回退

1. **在受控 Codex 启动入口核定能力。** 保留现有版本、启动绑定、二进制及配置戳检查。对已验证的 Windows 构建，可仅向本次子进程传 `--enable default_mode_request_user_input`，不改全局配置，也不改变任务的 collaboration mode。实际执行 `experimentalFeature/list` 并传入新建 threadId，按游标查到该项的 `stage=underDevelopment`、`defaultEnabled=false`；有无启动参数时分别读回 `enabled=true/false`。工具目录在关闭时仍可能列出该函数，因此仅查名字不足以开放能力。再以本报告的回环同轮消费与中断对照核定对应构建。 [开启时的实际返回](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/features-on-1795212285839/events.jsonl>) · [关闭时的实际返回](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/features-off-1795212285839/events.jsonl>) · [现有版本检查](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch.ts:97>)
2. **收窄 helper 的新增分支。** 只处理原生 `item/tool/requestUserInput`，允许经过上述核定且 `isBlocking=false`、`autoResolutionMs=null`、`isOther=true`、`isSecret=false` 的单题。沿用 2–8 个不同的有效标签、非 Other 选项、绑定及防重检查。此处题目级 `isOther=true` 表示 Codex 还允许客户端提供补充文字；Huhu 的问题回执只投影已列标签，并且 Tasks 和 helper 各自再检查答案精确等于原标签。纯自由文本题、秘密题、标为 Other 的候选、审批和 MCP elicitation 继续走原来的拒绝或现场路径。15 项隔离守卫检查调用了临时 helper 中的实际判定函数；秘密标志和无选项题使用合成输入，原生正例与 CLI 非法答案另有实测。 [守卫检查](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/guard-matrix.json>) · [Tasks 选项校验](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/native-replies.ts:142>) · [helper 发送前校验](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:253>)
3. **在同一受控线程开启原始事件，沿用现有账本。** `thread/start.experimentalRawEvents=true` 是固定版生成协议中标注供内部使用的实验字段。只在内存提取相关工具身份和答案证明，沿用现有签名回执、消费 ACK、稳定 replyId 及按原身份查询的流程。保留原执行绑定，等待期间按既有规则让出槽，回答前重新获取槽。用户停用能力、构建未获验证或线程无法使用所需事件时，停止承诺结构化答复；已尝试的写入缺少消费证据则保留 `unknown`，只对账。确认可定位的阻塞可以引导至原现场。已结束的普通业务问题沿用带 parentRunId 的同会话后续轮次。 [原始事件字段](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-ecd69da340a844428c449b5068e64251/schema/v2/ThreadStartParams.ts:83>) · [规则槽与等待](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/dispatch.ts:692>) · [回答仲裁](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/native-replies.ts:215>)

只核验了上述 Windows x64 二进制、特定受控 app-server 配置和本地 Responses 夹具。其他 Codex 版本、同版本不同构建、不同平台、其他 provider、远端模型是否会选择该工具、无限期等待、进程丢失后的原请求恢复，均不能据此承诺。新候选仍须用未经改动的随包 helper 做独立 T7.2 验收。

## 替代入口与产品约定

- **Plan** 的对照能产生阻塞请求，但仍有 `isOther=true`，普通事件流同样缺少可信工具消费输出。强制 Plan 会改变任务的协作模式及执行约束。上述 Default 路径已在同一轮验证，Plan 仅适用于显式选择计划工作的场景。 [Plan 对照](evidence-task01/native-plan.jsonl) · [Plan 原始事件](evidence-task01/native-plan-raw.jsonl)
- **若不能依赖内部原始事件**，还实测了 Default 线程私有注册的固定选项 dynamic tool。原生 `item/tool/call` 带 thread/turn/callId/tool/RPC；等待 4 秒后回答，普通 `item/completed(dynamicToolCall)` 给出相同 call ID、工具名、`success=true` 及准确答案，模型在原 turn 继续。这个实验没有观察到该请求的 `serverRequest/resolved`，需要为这个不同的协议单独定义确认依据。现有 helper 拒绝此方法，它属于范围更大的替代适配；不可把所有动态工具或批准请求开放给通用回答。 [原生动态工具对照](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/dynamic-1795212124874/events.jsonl>)
- 已确认的 #5 原型区分普通讨论、同会话后续轮次、原生答复继续原轮以及敏感阻塞前往现场。#4 的规格要求分别证明执行受理和结果，并在断线时保留原绑定。这些约定支持上述固定选项投影和待核实状态。无需增设 UI、工具网关权限或回答通道。 [#5 规格](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md:13>) · [#5 已确认原型](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/prototype-review.md:15>) · [#4 规格](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/spec.md:20>) · [#4 已确认原型](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/prototype-review.md:35>) · [#4 较早原生试验](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W6-windows-codex-native-turn.md>)

复查时，从 integration 目录执行临时目录的 `run.ps1`。原生持有实验参数为 `default-enabled 65000 delay.cjs`，Engine 正反对照分别为 `helper-raw 0 helper-probe.cjs` 与 `helper-noraw 0 helper-probe.cjs`。脚本另行建立新 Vault、HOME 及临时 helper。原始日志与诊断脚本留在系统临时目录，系统清理后可依据本报告中的标识和协议序列复核结论。 [复跑入口](<C:/Users/cdewta/AppData/Local/Temp/huhu-t19m-task02-743c766a/run.ps1>)

## Lead 验收

