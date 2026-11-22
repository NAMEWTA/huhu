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
