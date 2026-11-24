# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report03.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{023-tw0,032-tw1,034-tw3}.md
- 执行结果 — done，交 Lead 验收。TW3 的 GitHub 原始作者授权待 TW4 接入，真实冷恢复有待实跑。

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，起点 `bf82c8fe284fd50946789536d54e815a1e1a2247`。TW0 调查写在本回执。TW1 和 TW3 各有一个提交，均含 `Refs: #17`。运行原件在 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task03/`。

### TW0 · 现状、证据与复用

派发基线已含 #5 的 Task 输入快照、Task/Agent 的持久受理、原生 ACK 重交、已绑定 stopId 的停机核实。查阅 #5 归档的 `evidences/T0.1-provider-evidence.md`、`T2.2-inspect-stop.md` 与 `verification/T7-cutover-linux.md`。Windows Codex/Pi 的早期单轮探针只证明对应结构化事件，Linux 的 Codex 0.170.0 + Core 0.1.19 证明新会话与已存活原会话的限定链路，使用回环合成模型。后续归档的同一物理 rollout 与 writer 负例是固定二进制的协议探针，完整 Engine 冷恢复仍需 C01。

| 能力／配置 | 当前依据 | 本批及接续 |
| --- | --- | --- |
| Linux x64 Codex 受控派遣 | Engine 开启有效配置后只装配 Codex 原生 App Server；生产受控入口锁定 0.170.0 ELF SHA-256 `880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971` 与独立私有 CODEX_HOME。默认新会话是 ephemeral、只读，关闭 shell、web 与 MCP。已绑现存会话可明确接续。 | 本批用随仓 Core 0.1.19 和故障注入 App Server 夹具验证闭环，本机当前 Volta ELF 为 0.172.0，不符合固定指纹。C01 保留针对固定 ELF 的原物理历史验证入口。 |
| Windows／Mac Codex | 代码可检测并要求 0.171.0；Windows 已知指纹才启用指定原生问题桥，冷恢复生产入口为 Linux x64。 | 用户定的 Linux/Web 范围外。本批没有运行。 |
| Claude / Pi | 独立交互启动、各自历史代码仍在；没有默认安装二者的受控派遣 adapter。注入的 PTY adapter 仅作夹具。 | TW2 按目标、配置与 API 证明能力。Gemini 没有本批执行适配。 |
| 能力展示与工具 | `agent.targets.list`／`tasks.dispatch.targets` 及 `automations` 消费原目标，原生回答、停止分别校验实际绑定。当前目标 DTO 的统一能力布尔值仍保守。 | 建议 C10 明确每个 target/profile 的能力及不可用原因。真实写工作区、获准命令、MCP 与 provider 联验归 TW2/#12 P6。 |

复用先查本仓库 `codex-dispatch-helper.cjs`、`dispatch.ts`、`execution-receipts.ts`、Tasks 的 `agent-dispatch-executor.ts`、`receipt-inbox.ts`、`native-replies.ts`，以及 Gateway 主体、Automations 规则槽及 Web UI 的既有入口。共享 `temp/sources` 核查了 `agent-autoloop` 本地 HEAD `9a6826ab89e1` 与原单固定 `d1ec2d8e48de`（MIT，Codex/Claude adapter、插件消息、问题与回复），`herdr-core` `ce81486e3d40`（Apache-2.0，绑定会话与控制），`orca` `7041ea022826`（MIT，会话界面），`deepseek-harness` `fcc0ad462172`（MIT，问题与本地模型夹具），`homarr` `b440fdd574c9`（Apache-2.0，其他批次界面复用）。前四个检出进入工作前已有根 LICENSE 删除，用各自 Git 树核验原件。实际沿用 Huhu 的协议、会话和收件实现，未复制上游代码或引入依赖。

基线故障注入运行了 `plugins/agent-cli/test/native-stop.live.test.ts` 的扩展夹具。`tw0-baseline.log` 证实只回 RPC 不释放输入权、按原 stopId 重开后核实 stopped。新增外因分支在旧测试默认 1 秒的 ownerActive 探测超时，未到达其余 Tasks 投影断言，因此仅记为基线部分复现；失败、无 final 和外因不发领域回执另有 helper 源码证据，修复后由本批正式夹具覆盖。AT-A01 的 9 用例筛选中，通过正文版本、配置回读、普通评论零派遣、冻结正文、错过/占用和同 ID 重交。配置编辑影响编辑版本与冻结配置，`inputRevision` 仍由实际正文变化驱动。

交公共 owner 的字段建议：

- C10 保存 Vault、Task、dispatch、run/attempt、session/processGeneration、thread/turn、request/version、accept/terminal/result 的证据、结果合同、停止归因以及认证主体。领域暂复用原 `ExecutionReceipt` 版本。
- C11 由 TW4/TW5 固定认证连接主体与经验证的来源 actor、来源实例/对象/事件、问题授权、意图关联以及投递/回声身份。Gateway 对连接主体的授权不等于 GitHub 评论作者被授权。
- C12 沿用单 Engine/Vault 写者。保存启动实例、工作模式、发现和原会话绑定；可重新连接、物理历史冷恢复与无证据的 unknown 分别核对。

### TW1 · ece3e21ed25db3f4c02dae64e6f98cf12059816c

- Agent CLI 修改 `codex-dispatch-helper.cjs`、`codex-dispatch.ts`、`dispatch-store.ts`、`dispatch.ts`、`sessions.ts`、`execution-receipts.ts` 和 `index.ts`。绑定已受理的原线程/轮次，保存签名终态，使用稳定 ID 进入原 Agent 和 Tasks 两段 ACK。保存有效的结构化 provider 错误代码与文字，缺原因时明确标注。中断以原 stopId 和签名写入凭据归因；确认结束但缺所需 final 投影为带结束时间的 unknown。派遣前固定的 Agent 内部 `allow_no_update` 合同可确认合法空结果，当前 Tasks 通常仍要求 final。
- Tasks 修改 `dispatch.ts`、`receipt-inbox.ts`、`TaskDispatchPanel.tsx` 和 `i18n.ts`。结束时间用于释放对应活动占用并关闭原生暂停，保留 Task 业务状态。旧 attempt 已保存的同一回执可重交，新迟到回执只入档，不改变当前运行或新增评论。外部中断和结果待核实在已有任务详情中可见。项目公共 contracts 文件没有这批改动；`failed` 中三个 Codex 专用领域码是当前 wire 兼容处理，公共 C10 如增正式类型时统一映射。
- 夹具及验收入口修改 `plugins/agent-cli/test/fixtures/{codex-receipts-provider.cjs,codex-responses.ts}`、`plugins/agent-cli/test/native-stop.live.test.ts`、`plugins/tasks/test/persistence-http.test.ts`、`tests/e2e/workflows/task-journey.spec.ts`。
- 定向命令见下表。实际 Core 与 Node 合成 provider 验证失败（有／无结构化原因）、外因中断、人工停止、required final 缺失和事先获准的 `no_update`。故意丢失失败回执 ACK 并重开后，原失败只出现一次。真实 Tasks 持久化夹具证明旧 attempt 的两次重交与一条新迟到结果不会污染第二次尝试。

### TW3 · 8a12a6e0a6779b71215f3d39940e36152de38c9d

- Tasks 的 `response-actor.ts`、`dispatch-store.ts`、`dispatch.ts`、`index.ts`、`native-replies.ts` 从 Gateway 记录认证 caller/subject，关联原任务、执行、问题版本及回答或补充的持久身份。Desktop、Web、CLI、MCP、HTTP 的时间线取自认证入口。旧记录读取兼容。普通评论只进讨论；答复和补充仍需明确提交。外部工具按同一派遣所有者限制受理和查询；本机授权 MCP 保留读取本机 CLI 发起问题的既有组合，写权限仍核对原归属。调用载荷里的自报主体被拒绝。
- Agent CLI `sessions.ts` 区分能复核的已退出或换代与暂不可达，原生问题不能换另一进程回答。已确认回答继续按旧 ACK 回读。合格持久历史继续使用现有显式 resume 路由；验证用例确认原 App Server 先退出，关闭／重开 Engine 后再选旧物理来源，并加入来源修改与已占用来源的负例。未追加自动把旧会话的答复改投到新会话的路径。
- 修改 `plugins/tasks/test/persistence-http.test.ts`、`plugins/agent-cli/test/native-receipts.live.test.ts`、`plugins/agent-cli/test/fixtures/codex-receipts-provider.cjs` 和 `tests/e2e/workflows/task-journey.spec.ts`。真实 HTTP/MCP 及 CLI 命令路径使用 Core 0.1.19 与合成 provider。普通／原生答复的两个认证主体竞争、版本失效、请求身份重交、原进程终止和拒绝再投均有定向证据。
- 原单 AT-A08 涉及的 GitHub 来源实例/仓库/原作者授权及凭据与作者双写，等待 TW4/C11 的可信事件与作用域合同。本批的外部主体通过 Huhu Gateway 验证，未把它当作 GitHub 原发评论人的证明。

### 已运行的验证

表中命令均在 Linux 工作树运行，前缀为 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run`。各次一个文件，检查系统与 cgroup 可用内存、磁盘与 inode。带 Core 夹具的文件用 `HUHU_AGENT_LAUNCH_TEST_BIN=$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core`。没有使用真实用户历史或线上模型。

| 前缀后的文件与筛选 | 结果 |
| --- | --- |
| `plugins/agent-cli/test/native-stop.live.test.ts` | 1 通过。日志 `tw1-native-stop.log`。 |
| `plugins/tasks/test/persistence-http.test.ts -t 'inputRevision 只随\|Human、缺配\|Automations 停用后\|超过网关 24 小时\|确认失败后\|持久验收原回执\|输入变化、窗口过期\|规则空出原生\|原轮停止'` | 9 通过。日志 `tw0-tw1-persistence.log`。 |
| `plugins/tasks/test/persistence-http.test.ts -t '回答只消费\|普通回答重开\|只派发显式\|原生回答先落盘\|同一轮只显示\|逐项开放、撤销'` | 8 通过。日志 `tw3-actors.log`。 |
| `plugins/agent-cli/test/native-receipts.live.test.ts` | 5 通过。日志 `tw3-native-receipts.log`。 |
| `plugins/agent-cli/test/dispatch.live.test.ts` | 1 通过。真实 Core 上仅 PTY 写入时保持 unknown；仅用原身份核实，竞争输入为零。日志 `tw1-pty-dispatch.log`。 |

### 未运行的验证

- Lead 需跑 `tests/e2e/workflows/task-journey.spec.ts` 的 **TW1 已受理的 Codex 失败显示在原任务且业务任务仍打开**，以及 **C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答（TW3 Engine 重开与 Web）**。需批准指纹的 Linux 0.170.0 独立 profile、桌面和浏览器。两条使用真实 ELF 和回环合成模型。外部 App Server 占用同一物理来源和 ephemeral 冷恢复拒绝仍需补足实机证据。
- 类型检查交 Lead 串行，涉及 `@huhu/plugin-agent-cli`、`@huhu/plugin-tasks`、`@huhu/engine` 和 Playwright TS 入口。未运行 E2E、打包及真实 GitHub/线上模型。Windows、macOS 按用户指定排除。

## 阻碍与接续

TW3 的可验证本地及工具入口已经提交。GitHub 来源等 TW4/C11，物理历史完整验收等固定生产二进制与 Lead 的 Linux/Web 验收。前序已核对的工作树基线在 Lead 合入其他并行批次后自然向前，交回分支保留原起点供合并。C12base 现有证据继续独立归原验收报告。

## Lead 验收

- Lead 2026-11-24：TW0/TW1 验收通过；TW3 的 C01 E2E 在官方 0.170.0 下超时，转 task05 返工。
