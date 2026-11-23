# Issue #5 Linux 原快照重试与生产切换

基准为 `369efcfd`。在 `impl/huhu-issues-3-10-t5-tasks` 的 `agent-linux` 工作树验证。切片定案来自批次 `decisions-2026-11-21.md` 和已确认的 #5 原型。

## 本地验证

Node 24.21.0、pnpm 12.10.1，测试使用临时 Vault 和独立 `XDG_RUNTIME_DIR`。三次调用串行执行，每次只传一个文件。

| 命令 | 结果与观察 |
| --- | --- |
| `pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts` | 37 项通过。原派遣重传仍是 attempt 1。重试保留 runId、快照和哈希，新派遣身份为 attempt 2。明确未发送的预检失败可重做。未证实终态、关闭任务及损坏派遣拒绝重试。修改后走新输入生成新 run。既有测试核对台北次日 UTC、提前确认和原生暂停释放及取回规则执行槽。 |
| `pnpm exec vitest run plugins/tasks/test/ui-shared.test.ts` | 9 项通过。任务往返保留带秒的最早派遣 instant 和独立截止日。 |
| `pnpm exec vitest run plugins/automations/test/task-scan-occurrences.test.ts` | 29 项通过。工作台重交同一意图只返回一个发生，规则改期、Engine 重开后仍能查询原发生与派遣。模板只建一次任务。启用规则编辑后保持启用，旧版本更新冲突。既有测试覆盖定时、原生恢复与指定目标的预检，以及 #6 CLI/MCP 权限和身份重交。 |

完整日志位于本机 `/tmp/huhu-t31-node24.gjIvtG`。各测试文件对应同名 `.log`。

## 调用方核对

- `Scheduler` 定时 Agent 路径进入 `TaskScanOccurrences.scheduled`。工作台立即运行提交所见版本和意图键。外部任务扫描入口继续使用原有会话归属和授权。
- 扫描与模板持久记录原规则、候选及并发上限，再由 Tasks 受理和预检。`automations.activations` 和 `automations.activations.dispatches` 关联发生及派遣。运行抽屉取 Tasks 的最近运行，任务详情保留原任务下的各次派遣。
- Engine 的 Automations 装配按当前 Agent CLI 服务查询工作区和 CLI 探测结果。原会话不可用的派遣保留原目标。
- 复用 Huhu 已有持久派遣、Croner、执行槽、回执和时区候选算法。查阅 `temp/sources` 的已有重试实现后保留本项目的任务与执行身份设计。

## 待集成验收

`tests/e2e/workflows/task-journey.spec.ts` 已写入，实施者未启动 Playwright 或 Electron。

1. **T7.2 Linux 实际定时与手动运行共享同一 Tasks 派遣，原目标不可用时可人工关闭**。用墙钟数秒等待真实定时器，跨日固定时钟取证由 Tasks HTTP 用例覆盖。
2. **T4.1 与 T5.5 在工作台处理 DST 回拨与缺口、保留启用状态并预览三次新触发**。包含表单清空保留截止、保存冲突及取消。
3. **T7.2 候选安装包：后台到期、原生问题同会话继续、一次结果与人工完成**。需 W8.3 候选包与匹配 SHA、支持原生选择的真实 Codex、专用测试配置及显式 opt-in。用例关联 Agent 持久 ACK 与原任务回执、时间线消息。
4. **T7.2 候选安装包：停用 Tasks、丢失一次消费 ACK 和原生进程恢复**。显式跳过。随包当前缺少可截断内部 Tasks ACK 的验收夹具。已有隔离 Core 的 `plugins/agent-cli/test/native-receipts.live.test.ts` 提供协议层入口。Windows 原生恢复、随包焦点和窄窗验收仍需实际运行。

安装包干净环境的权限默认值、撤销 Web 邀请、Vault 包恢复和损坏包验收留在同一集成候选的 W8.3/T7 门禁。

## 集成版本复查

2026-11-22 在 `690e9097` 核对 `d2601f83`、`7cfed9bf` 和 `1c2f8089` 均为祖先。运行抽屉从 `tasks.dispatch.recent` 读取任务运行，任务详情用 `tasks.dispatch.list`，终端规则列表保留独立终端记录。定时和手动规则通过 `TaskScanOccurrences` 交给 Tasks。

在隔离 Vault 串行运行 `pnpm exec vitest run apps/engine/test/engine.test.ts -t "Agent 任务自动化的预览和立即运行|恢复 Engine 时只查询新任务派遣"`。两项通过，48 项由筛选排除。重交保留一个发生与派遣，旧监督文件原字节保留，四个旧能力返回不存在。日志在本机 `temp/issue-evidence/huhu-2026-11-22/t71-cutover-690e9097.log`。安装版 W8.3 与 W8.2、T7.2 的独立签收仍待共同候选。

## T7.2 原生夹具复查

`2ece5866` 为候选包用例准备独立 HOME、Vault、Core 套接字和回环模型响应。T7.2 先创建原生会话，定时任务接续同一会话，期望一个可核对的提问、一次用户回答和一条最终结果。回环服务返回合成内容，真实 Codex 负责原生问答和会话处理。E2E 仍需要同一 W8.3 安装包和匹配的 SHA，模型响应由测试自带。

Linux x64 的 Codex ELF 通过仓库指纹 `880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971` 核验，版本为 0.170.0，Herdr Core 0.1.19。定向执行 `pnpm exec vitest run plugins/agent-cli/test/codex-native.live.test.ts`，新会话和原会话两项通过。Playwright 能枚举 T7.2 和 W8.2/W8.3 两条安装包用例。日志为 `temp/issue-evidence/huhu-2026-11-22/t72-original-session-preflight.log`。定时、安装包、真实工作台和最终联验仍待运行。


## 2026-11-22 候选身份与回执中断顺序

源码提交 `2b438bc7` 补充接收前中断、停用／启用 Tasks、仅丢一次消费 ACK 的验收夹具和包用例。单文件定向回归 `pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t "包验收先阻止接收|持久验收原回执"` 实际 2 项通过、36 项过滤。日志 `temp/issue-evidence/huhu-2026-11-22/task-ordered-receipt-regress.log`。它证明持久收件、原评论和重交行为，尚未证明最终安装包旅程。

`candidate-package.ts` 从 `HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT` 指向的 AppImage 计算摘要，对照 `HUHU_TASK_JOURNEY_PACKAGE_SHA`，自行解包并推导程序位置。需提供完整 `HUHU_CANDIDATE_GIT_SHA`。每次启动检查 packaged 状态、实际路径、Linux x64、正式页面来源与构建提交。记录 ASAR、可执行文件、随包 Core、CLI 和派遣 helper 摘要。W8.2、T7.2 仍分别执行并使用同一份制品。

Lead 对四个相关 E2E 文件进行了单独 TypeScript 检查，包含桌面宿主类型和 ES2024.Promise 夹具库，复查退出 0，记录于 `temp/issue-evidence/huhu-2026-11-22/acceptance-types-recheck.log`。测试列表枚举成功不计为 E2E 通过。跨日测试时钟和原报告其它缺口继续保留，最终候选包尚未构建。


## 跨日验收的在线触发路径

包用例为临时规则选一个合法固定偏移时区，让当前瞬间位于当地午夜前 30–90 秒，任务 availableAt 与 cron 同为次日零点。创建后的 Engine createdAt 必须属于前一天，启用前校验还未到期且 provider 仍只有 seed 请求，之后要求唯一 schedule occurrence 与精确 scheduledFor。系统时钟、Engine 装配和生产 Croner 均不修改；这是规则时区内的真实跨日，包实跑仍待最终候选。

已在 Node 24.21.0 与本机安装的 Croner 验证偏移时区。单文件测试 `pnpm exec vitest run plugins/automations/test/scheduler.test.ts -t "固定偏移时区"` 用测试时钟验证 23:59:59.999 不派遣、次日零点在线派遣一次，1 项通过、6 项过滤。证据 `temp/issue-evidence/huhu-2026-11-22/cross-day-scheduler.log`。本轮 E2E 仅枚举，类型检查遇到 t86 在途原生接口尚未完成，留待其完成后复查。

依据为 [Intl.DateTimeFormat 的 offset identifiers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat) 与项目当前 Croner 的实际 nextRun/在线回调观察。该方法替代了需要隔离客机调时或改造生产调度器的初步建议。

### 最终包验收入口（尚未运行）

`bash scripts/accept-linux-candidate.sh <模式> <AppImage> <SHA-256> <完整提交> <固定 Codex ELF>` 提供三种独立模式：`tasks` 对应 T7.2，`workspace` 对应 W8.2/W8.3，`credentials` 对应 CLI/MCP 与 Mail/Safe。三次必须使用同一制品、摘要和提交，不以各自通过的不同包拼成组合通过。

入口要求干净工作树与提交相符，校验固定 Codex 摘要，使用独立 HOME/XDG、D-Bus Secret Service 和 Xvfb，并以 `/tmp/huhu-heavy.lock` 串行执行。每次只选择一项包用例，JSON 报告必须为 1 项通过、0 失败、0 跳过、0 重试后通过。报告保存在 `temp/candidate-acceptance/<模式>.<随机目录>/result.json`，测试附件记录实际运行程序与随包资源身份。命令和脚本存在不代表已经完成验收；待最终代码与审查完成、构建同一候选后填写实际命令及结果。

`native` 模式另外接收第六个参数（同源码构建的 `native/agent-pty/bin/linux-fixture`），在同一候选包检查两项 Linux Agent 桌面用例；该模式要求 2 项通过、0 跳过，其余三种模式仍各要求 1 项。入口记录夹具二进制摘要，仍不替代最终实际执行记录。
