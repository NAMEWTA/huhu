# #5 T1.1 正文身份返工与 T1.2 持久受理

- 执行结果 — 两个本地候选已提交，Tasks 独立后端已在 Windows 通过 HTTP 和合成执行器验收。
- 终端 — `t6n`，已核对 `HC_TERMINAL_ID=t6n`。任务声明的会话为 Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`。
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/tasks`，分支 `impl/huhu-issues-3-10-tasks`，提交后 `git status --short --branch` 仅显示分支。
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/report01.md`

| 切片 | 父提交 | 本地候选 | Git 树 |
| --- | --- | --- | --- |
| T1.1 正文身份 | `a5d82cb704cdd44fbae387518f7d1c4246908fb1` | `6cc99edd0feefe75e601e8aded0e4329fa927f56` | `445dd878f5033e13321b0f97912c07a045444a87` |
| T1.2 持久受理 | `6cc99edd0feefe75e601e8aded0e4329fa927f56` | `6b43fceceee002bd3141648946e1d907c1d9349c` | `2fb6b9c0b9871d7e4e8cd3be9faf53c66cfd68da` |

## T1.1 红绿

在基线上用真实 `POST /api/v1/call` 保存加首尾 CRLF/LF 的 `原正文`。返回正文仍是 `原正文`，`inputHash` 仍是 `929a1f99b1999ca9`，`inputRevision` 从 1 误升为 2。红测在这个断言失败。独立候选先用 `replaceTaskSection` 生成实际待写正文，再用 `parseTaskBody` 提取区段后计哈希。四项 HTTP 回归全过，覆盖纯补空行身份稳定、真正改正文推进、重开读回以及零次 `spawn`。 [红测日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/t1.1-red.log) · [绿测日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/t1.1-green.log) · [回归入口](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:135)

## T1.2 实现边界

- 到达 `tasks.dispatch` 的桌面指令经真实 Dispatcher 授权。`taskDispatch.acceptRule` 是供受信内置规则调用方接线的进程内接口，接受规则 ID、当时版本和 occurrence 及窗口。受理记录冻结调用来源、请求和读回的文件版本、`inputRevision`、`inputHash`、正文、配置、正文引用和显式规则指令。仅参与运行的输入变化会使原意图失效。普通评论保留在原 Task。 [能力与服务](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/index.ts) · [接受与快照](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/dispatch.ts:31)
- 每个 `dispatchId` 映射一个稳定 event。接受先由 Vault 原子写入 `stateDir/tasks/dispatches/evt-<SHA256>.json`，再在同一记录上提交 `claimed` 和 `sending`。领取时一次性物化 run 投影和占用，复用 TaskRun 的 attempt 约束及 `tasks.runs` 汇总入口。文件有版本检查、输入快照指纹和损坏校验。Markdown 业务状态与系统评论继续走 Tasks 条件写。 [持久存储](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/dispatch-store.ts:78) · [Task 条件写](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/service.ts)
- Tasks 的修改、评论、领取和取消共用 taskId 写队列。发送前再核对原输入与任务状态。发送写入之后丢回包时只按原 event/run/attempt 核查，明确未送达才允许继续。活动和未知轮保持 task 占用。作用域停止时中止执行器信号并等待本地写队列，迟到回调无法替重开的实例写结果。旧 Automations 首次派遣的 `markDispatched` 在 Tasks 受理已占用时被拒绝。 [领取与对账](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/dispatch.ts:189) · [写队列](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/write-queue.ts)

## 实际验收

| 行为 | Windows 观察 |
| --- | --- |
| 人工和规则竞争、待资源 | 通过真实插件入口停用 Automations。以一个桌面 HTTP 和两个受信规则调用竞争同一 task，只有一个 event/run/attempt 1，另外两个返回已有占用的关联 ID。重开后资源忙时无合成发送且看板状态为 `not_started`，实例确认接受后有一个 `running` run 和一条系统评论。只加评论时，用原文件版本提交成功，记录中保留接受时新版本和原正文快照。 [夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:274) |
| 重交和 24 小时 | Automations 停用时两次并发 HTTP 重交复用同一凭据。关闭 Engine 后将隔离 Vault 中原网关缓存条目回拨 25 小时，注入相应 Tasks 时钟，再用相同 HTTP 幂等键重放，读到 Tasks 当前的已取消凭据。换网关键时，同 `dispatchId` 异文件版本或异 task 均返回 `IDEMPOTENCY_MISMATCH`。 [夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:330) |
| 中断和回读 | 接受落盘后关闭，重启领取原快照。另在 `claimed` 落盘后注入 `sending` 写入故障，记录中只有一个 runId 和 attempt 1，发送为零。再次重开后发送一次，`sending` 时关闭并释放晚到响应，磁盘状态仍是 `sending`。下一次重开只 `inspect` 原快照、run 和 attempt，再读到同一运行。 [夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:369) |
| 取消和阶段 | `pending` 或已 `claimed` 但尚未发送可单项取消，取消重交读原状态。发送未知时取消只持久记录 `cancelRequested`，重开保留占用，合成执行器确认 `not_sent` 后读取 `cancelled`。 [夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:426) |
| 输入、时间和占用 | 正文变更后旧接受成为 `stale_input`，旧哈希与原文留存。规则 `notBefore` 未到时拒绝，等于 `expiresAt` 时旧待领成为 `expired`。关闭任务时待领成为 `cancelled`。改正文后旧 `running` 或 `unknown` 仍阻止第二次派遣。 [时间与未知夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:426) · [活动占用夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:274) |
| 权限及损坏 | 外部 CLI 网关调用、桌面伪造规则来源、只读 Vault 受理分别返回 `CAPABILITY_NOT_EXPOSED`、`INVALID_INPUT`、`READ_ONLY_VAULT`。截断持久文件后返回带 eventId 的 `WRITE_PARTIAL`，执行器发送零次。目前损坏文件可能无法识别 taskId，读取队列时会保守冻结领取。 [夹具](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:472) |

Windows 最终回归为 12 个文件、148 项通过、11 项为现有 Windows 条件跳过。Contracts、Tasks、Automations、Engine 的 TypeScript 检查通过，暂存文件的 oxlint、oxfmt 和 `git diff --cached --check` 通过。HTTP 夹具用隔离 Vault、空 Agent 探测和合成执行器。命令通过本地执行会话完成，未新增命令 pane。 [回归日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/t1.2-regression-final.log) · [静态检查日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/t1.2-checks-final.log)

本工作树的 pnpm `12.10.1` 冻结安装在锁文件解析后停滞。验证复用集成检出中由 pnpm 安装的第三方依赖，两个 `pnpm-lock.yaml` 的 Git blob 均为 `e7c2876017054b1a8944cf954b2cec97981bfdc0`，工作区包链接指向本 Tasks 检出。Node 为 `24.21.0`，Vitest 为 `3.2.7`。 [安装日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/install-retry.log)

## Lead 接线与后续验收

- 生产 `TaskDispatchExecutor` 由 T2.1 / #4 W6.1 接入 Engine，需要实际 Space/session 绑定、输入所有权和可长久查询的 dispatch 凭据。T2.2 / #4 W6.2 负责已发送轮次的精确停止。T3 的真实回执、结果投递与终态释放占用，以及 T1.4 已证实失败后的新 attempt，仍需后续切片。
- 当前 TaskRun 的共享 Markdown 合同要求字符串 `ruleId` 与现场字段。本切片的 run 事实保存在 Tasks 受理记录，由 `tasks.runs` 投影。共享 TaskRun 的 nullable `ruleId` / 来源字段、语义文件归属、稳定 ID 的 Markdown 落盘和 Vault 包对 Tasks 持久域的收集及恢复，请 Lead 核定后接入。
- 双规则竞争通过 Tasks 的进程内入口验证。真实规则运行由 T5.3/T7.1 调用同一入口。旧 `AutomationsService.retryRun` 可直接 `drive`，应在开启生产执行器前切换该入口及旧自动化执行所有权。 [旧重试入口](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/automations/src/engine/service.ts:965)
- 任务详情的立即派遣按钮、已有会话选择及显示反馈依赖原型确认和 UI 接线。真实 Task `availableAt`、提前派遣覆盖和规则窗口计算分别依赖 T4.1/T4.2。T1.3 后续验收关闭/快速重开以及已经绑定的取消结果。本次关闭任务的待派清理通过领取预检验证。

## Lead 验收

由 Lead 追加。

Lead 接收 `6cc99ed` 和 `6b43fce` 及验证记录。`t54/task03.md` 独立复核持久受理。`t6n/task02.md` 接续处理正常编辑并发与 UTF-8 的独立反例。
