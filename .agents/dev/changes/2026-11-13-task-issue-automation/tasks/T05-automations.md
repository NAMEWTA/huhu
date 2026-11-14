# T05 三类自动化、派发联动与运行事件回写

**规格**：[spec.md](../spec.md) §3.5、§4.2–§4.4、§6（全部）、§8.1、§9；对应 TD-04、TD-06、TD-08、TD-14。

**交付**：
- 自动化只保留三类：Agent、终端命令、提醒。
- 定时规则按筛选条件逐条派发 agent 任务。派发成功后任务变为“进行中”，Agent 的问题、结果、失败都追加到原任务的评论。
- 终端命令在可见的 Herdr 终端中运行。
- 提醒可以发通知、建任务，或两者都做。

**依赖**：
- T01a：任务模型和 `setStatus`。
- agent-launch-settings 的 AL-S1：`resolveAgentLaunch` 和智能体目录。
- T02：权限组和委托链。
- T04：`tasks.comments.add`。

**边界**：
- 负责：
  - automations 契约、引擎、UI。
  - `tasks.markDispatched`。
  - `automations.runs.activeFor`。
  - agent-cli 的 `ProviderPref.permission`，以及 `agent.sessions.launch` 的 shell / command / envRefs 扩展。
  - 删除脚本管理。
  - automations 与 versioning 改用能力调用。
- **不做**：Herdr 等待状态的 watcher（T06）。

## 当前代码指针

**契约与内置规则**

- `packages/contracts/src/kinds/automation.ts:4-42`：动作定义、运行记录的 `actionKind`。
- `plugins/automations/src/shared/builtin.ts:4-14`。
- `service.ts:179-182`：`ensureBuiltin`；`index.ts:97-98` 调用它。

**引擎 `plugins/automations/src/engine/`**

- `service.ts`：
  - `:233-246`：preview / classify。
  - `:291-318`：activate，单规则互斥。
  - `:303-310`：动作分发。
  - `:321-350`：script。
  - `:352-361`：prompt。
  - `:398-431`：scan 派发与回滚，其中 `:428-430` 是回滚。
  - `:453-470`：`completeTaskRun`。
  - `:485-558`：reconcile。
  - `:627-670`：`answerRun`。
  - `:683-743`：cancel / retry。
- `scan.ts:42-85`：processingKey、classify。
- `claims.ts:5-62`：claim 文件名会把 `:` 替换为 `_`，**不能按文件名前缀判定 taskId**。
- `worker.ts`：
  - `:20-35`：`buildPrompt` / `writeContext`。
  - `:54-66`：`headlessCommand`，claude 写死了 `acceptEdits`。
  - `:111-128`：finalizeRound。
- `scripts.ts`：
  - `:19`：`ScriptStore`。
  - `:89-129`：`runScript`。
  - `:98`：`redact` 闭包。
- `index.ts:20-28,59-81,121-139`：注册、脚本能力、注入 `taskQuery` / `agentCli`。

**UI**

- `plugins/automations/src/ui/RuleEditor.tsx:37-179`。
- `AutomationsModule.tsx:38-40,123-126,133,170,239-259`。
- `RunsPanel.tsx`。

**agent-cli**

- `plugins/agent-cli/src/engine/prefs.ts:4-8`。
- `providers/index.ts:34-67`。
- `sessions.ts:62-75,140-200`。
- `index.ts:126-141`：launch 的入参。

**进程内服务调用方**

- `taskQuery`：`plugins/automations/src/engine/service.ts:47,238,249,386,405,474,509,674,715`、`plugins/versioning/src/engine/index.ts:113-114`。
- `agentCli`：`apps/engine/src/boot.ts:268,295`。

## 实施要点

**1. 契约**

- 动作改为 `agent{input: tasks|prompt}`、`terminal`、`reminder`。
- 删除四个旧枚举，以及 builtin、`ensureBuiltin`、脚本能力和存储、`script` 分支。
- 已存在的旧规则文件按 0→1 约定处理：视为无效文件并报错，不做转换。

**2. 派发**

- 引擎内设一把全局派发互斥。持锁后依次执行：预检 → claim → `markDispatched`。
- `markDispatched` 的幂等键用本次 claim 的 `runId`。条件是：任务状态为未开始，且完整 processingKey 一致（spec §4.2）。
- 失败时复用 `:428-430` 的回滚。之后成功派发，追加系统评论 `sys-<runId>-dispatched`。
- Space 判定：同一 Space 内有活动的 task-run 或 automation-run，就视为冲突。
- `activeFor`：每次扫描只 `claims.list()` 一次，按 `claim.taskId` 分组。

**3. 启动对账**

- 处理 queued claim 时，先检查任务状态，再决定是否 drive：
  - 任务是 `not_started` → 补调 `markDispatched`。
  - 任务已 `completed` → 取消该运行。
  - 补调失败 → 回滚。
- terminal 运行纳入对账：按 Herdr 会话的实际状态更新运行记录。

**4. 快照与提示词**

- 整份任务文件复制到运行目录，不再生成 `context.md`。
- 提示词第一条写明 Vault 绝对路径、快照路径和格式约定。
- task-run 记录快照的 SHA-256 和末条评论 id。
- `effort`、`fast` 传入 worker。
- worker 通过 `resolveAgentLaunch({agentId, mode:"headless", model, effort, fast, prompt, sessionId, resume})` 组装启动参数（契约见 spec §3.5，实现在 agent-launch-settings change 的 AL-S1），删除 `headlessCommand` 中写死的 argv。`--disallowedTools`、`--session-id`、codex `exec resume` 与末尾 `-` 都由组装函数给出；worker 把返回的 `env` 叠加到继承环境上，把 `stdin` 写入子进程。
- 任务详情中，环境类的不可派发原因（Space、CLI）调用 `automations.preview` 获取。

**5. 运行事件回写评论**

- 问题、结果、失败都调用 `tasks.comments.add`，评论 id 规则见 spec §5.3。
- reconcile 按运行记录幂等补写。
- 写入前用 `redactSecrets` 脱敏。

**6. 能力调用迁移**

- automations 和 versioning 不再使用 `service("taskQuery")`，改为调用 `tasks.list` / `tasks.read`（需相应权限）。
- `agentCli` 的业务调用改为调用 `agent.*` 能力（使用 `agent.run` 权限组）。
- 确实必须保留的进程内服务，在 reuse.md 中登记理由。

**7. 终端命令**

- launch 支持 `shell`、`command`、`envRefs`，执行时 `argv=[shell, -c|-Command, command]`，env 经 `terminal.run` 注入。

**8. 提醒**

- `deliver` 可以是 `notification`、`task` 或 `both`。
- 建任务时以 `<ruleId>:<scheduledFor>` 作为幂等键。
- 设置了 `taskId` 时只追加评论，不新建任务。

**9. UI**

- 规则编辑器只提供三类动作。
- 新建对话框提供模板“定时派发 Agent 任务”。
- 预览显示派发和跳过的原因。
- RunsPanel 显示终端会话入口。

**10. 保留不动的行为**

holds、宽限补激活、立即运行、失败后同 key 重试（spec §10）。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| C01 | 规则编辑器只有三类动作；仓库中搜不到旧枚举、`ensureBuiltin` 和 scripts 能力；新 Vault 不会自动出现内置规则 | e2e + grep |
| C02、A02 | 派发后，task-run 记录的 provider、model、effort、fast、cwd 与任务配置一致；提示词第一行含 Vault 绝对路径；claude 的 argv 含 `--dangerously-skip-permissions`（permission=full 时） | 服务测试（检查假 CLI 收到的 argv 和 stdin） |
| C03、E03 | 规则建好后再新建匹配的任务，下一次触发会选中它；同一套夹具下，预览结果与实际派发结果一致；预览前后文件树哈希不变 | 服务测试 |
| C04 | 以下情况都会被跳过并给出原因：没有候选、任务已进行中、已完成、有 unknown 状态的 claim、已有成功的终态 claim；同一激活中第二条同 Space 的任务被跳过；两条规则同时激活时，同一 Space 不会并发 | 服务测试（并发激活） |
| A04 | 用桩让 `markDispatched` 失败 → claim 和 task-run 被删除，任务保持未开始，下次触发可以正常派发；启动对账遇到 queued 且任务未开始 → 先补状态再启动；任务已关闭 → 取消运行 | 服务测试 |
| A08 | 运行期间修改 `<task>` 或追加评论 → 运行目录中快照的哈希与 task-run 记录一致，且不会触发第二次派发 | 服务测试 |
| A04（只读） | 把 Vault 设为只读后触发 → `markDispatched` 失败并回滚；恢复可写后再次触发 → 正常派发，不会被幂等缓存卡住 | 服务测试 |
| A05（agent） | 假 CLI 成功返回 → 任务仍然是进行中，并追加结果评论；只有用户关闭后才变为已完成 | 服务测试 + e2e |
| B01（快照） | 派发前发表的 3 条评论全部出现在本次快照文件中；task-run 记录的末条评论 id 与快照一致 | 服务测试 |
| B06（脱敏） | 保险箱中的值出现在 Agent 输出里 → 写入评论的内容已替换为 `***` | 服务测试 |
| B02、B07（任务） | 假 CLI 提问、成功、失败 → 原任务分别追加 1 条评论；重复对账不会重复追加；不会新建任务 | 服务测试 + e2e |
| B08 | 关闭有活动运行的任务 → 界面提示，进程不会被终止；晚到的结果只追加评论，不会重开任务；有活动运行时重开 → 回到进行中，且不会启动第二次 | e2e |
| C05 | 两条任务的目录和 CLI 不同，各自用自己的配置；补充指令出现在两份提示词中 | 服务测试 |
| C06 | 同一计划时间重复激活、重启恢复 → 只产生一次派发；failed 状态不会自动重放，`retryRun` 可以在同 key 下 attempt+1 | 服务测试 |
| C07 | 终端命令在 Herdr 中可见；`terminal.get` 的结果不含 env；任务正文里的 `; rm -rf` 不会被拼进命令；重启后 running 状态被对账更新 | 服务测试 + 真实 Herdr 冒烟 |
| C08 | 提醒 `both` → 产生一条通知和一条 human 任务（`origin=automation`）；重试不会重复建任务；设置 `taskId` 时只追加评论 | 服务测试 |
| C09、D04 | 暂停规则不会终止正在运行的进程；停用 automations 后，任务的基本操作照常；恢复后能补写缺失的评论 | 服务测试 + e2e |
| D01 | automations 和 versioning 中不再有业务用途的 `api.service(` 调用（登记过的例外除外） | grep |
| 回归 | holds（ACC-AU-12）、宽限补激活（ACC-AU-09）、立即运行；engine 测试 `:804-823` 改为三类动作后等价通过 | 现有测试 |

## 完成证据

- `audit` 跑 automations、agent-cli、tasks、versioning、engine 的测试和 e2e。
- `dev-verify` 用假 CLI 走一遍 Issue §14 闭环：派发 → 提问 → 回复并继续 → 结果 → 关闭。
- 本机有 claude 或 codex 时，用真实 CLI 再走一遍，结果记入 evidence。
