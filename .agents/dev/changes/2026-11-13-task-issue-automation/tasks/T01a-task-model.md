# T01a 任务模型 schema 2（整合切片）

**规格**：[spec.md](../spec.md) 中与本切片相关的部分：
- §2：全部，标签筛选 UI 除外，见 T01b。
- §3.1–§3.3：只做 `<task>` 区段；`<comments>` 区段只解析，不写。
- §4.1：human 任务的状态流转。
- §4.4：关闭、重开、拖动守卫，以及“agent 任务不能手动改为进行中”。
- §9：`tasks.read` 中的 `references`、`problems`，以及任务自身原因导致的 `dispatchBlockers`。

**背景**：用户决定任务只有 human / agent 两类、三种状态，不兼容旧文件（TD-01），关联统一改用正文双链（TD-13）。本项删除 `completed` 布尔、`execution.kind` 和 frontmatter `resources`，并一次改完所有使用方。

**交付**：
- 任务文件写成 schema 2 加 `<task>` 区段，schema 1 文件明确报错。
- 用户能在三种状态间切换。看板临时改成三列，同时用状态下拉框替代勾选框。标签可以在文件和编辑表单中读写。
- 外部调用方无法创建或修改 agent 任务。

**依赖**：无。

**边界**：
- **这是整合切片**：删除旧字段会让所有使用方同时编译失败，不能再拆成可以单独运行的中间提交。合入 `main` 前整合点必须完整通过 `audit`。
- 本项**唯一负责建立** `packages/vault/src/markdown/codeRanges()`。T03 只负责把旧调用方迁移到它。
- **不做**：
  - 标签筛选 UI、看板交互打磨、本地目录建 Space、fast 的 UI（T01b）。
  - 评论写入与时间线（T04）。
  - `@` 补全与改写（T03）。
  - 权限组与委托链（T02）。
  - 派发联动、删除旧动作（T05）。

## 当前代码指针（基线 `8283c5c`，实施前复核）

- 契约：
  - `packages/contracts/src/kinds/task.ts:4-45`
  - `packages/contracts/src/dto/task.ts:6-41`（目前是非 strict 的 zod 对象）
  - `packages/contracts/src/events.ts:13`
- tasks 插件：
  - `plugins/tasks/src/engine/service.ts`：toDto `:39-47`、list `:55-74`、create/update `:76-117`、setCompleted `:120-134`。
  - `plugins/tasks/src/engine/index.ts`：`assertAgentAllowed` `:20-22`，注册 `:45-148`。
  - `plugins/tasks/src/shared/{input,draft,categories,resources}.ts`。
  - `plugins/tasks/src/ui/{TaskEditor,TaskDetail,TaskViews,TasksModule}.tsx`。
- automations 的最小适配：
  - `plugins/automations/src/engine/scan.ts:4-10,50-55`
  - `service.ts:248-256`（快照映射）
  - `service.ts:359`（`as unknown as TaskDto` 绕过了类型检查，**必须手工改**，typecheck 发现不了）
  - `worker.ts:29-35`（`writeContext` 读取 `resources`）
- 其余使用方的完整清单见 [s0-findings.md §3](../s0-findings.md#3-改动面全部使用方)：versioning、首页、archives、notes inspector、agent-guide、CLI、engine boot 与测试、examples、e2e、perf、event-log、query 失效。
- 拟新增：
  - `packages/vault/src/markdown/codeRanges.ts`
  - `packages/vault/src/markdown/regions.ts`（区段解析与转义）

## 实施要点

**1. schema 与写入形状**
- `type` 和 `status` 都没有默认值。
- 严格要求 `huhu.schema === 2`，不符时报错“旧版任务文件（schema 1）不再支持”。
- `TaskWritable` 用 strict 模式，`body` 字段就是 `<task>` 区段的内容（spec §2.5）。inbox 现在传入的 `{title, body, due}` 无需改动。

**2. agent 守卫（安全，不能等到 T02）**
- `assertAgentAllowed` 改为：只要满足 `type === "agent"` 或带有 `execution`，就只允许 desktop 调用。
- 否则在 T01a 合入之后、T02 合入之前，外部调用方可以传 `{type:"agent"}` 绕过守卫。

**3. `origin`**
- 按 spec §2.2 的映射，由 caller 推导种类。
- 本项还没有 `onBehalfOf`，因此明细 ID 暂时为空：
  - 内置插件统一写 `{kind:"inbox"}` 或 `{kind:"plugin", id}`。
  - CLI / MCP / HTTP 写 `{kind:"external", caller}`。
- T02 合入后补上明细 ID。

**4. 状态变更**
- `tasks.setStatus` 替代 `setCompleted`，`task.statusChanged` 替代 `task.completedChanged`，同步修改 event-log 文案和 query 失效逻辑。
- 拒绝把 agent 任务从未开始改为进行中。
- 活动运行守卫暂时读取 task-run 状态，T05 改为调用 `activeFor`。

**5. 派生字段**
- `references`、`problems`，以及任务自身原因导致的 `dispatchBlockers`（结构错误、缺少 `execution`、引用越界或有歧义）由 tasks 引擎计算，不调用 `agent.*`。

**6. `inputHash`**
- 只覆盖 `<task>` 区段和 `execution`。

**7. 其他使用方**
- versioning：恢复时保留当前的 `status`、`completedAt`、`origin` 和 `<comments>`，拒绝恢复 schema 1 版本。
- CLI：`--completed` 改为 `--status`，并同步修改 agent-guide 中的示例。
- 首页、档案页、笔记 inspector：勾选改为“关闭 / 重开”。
- `examples/daily-review`：改为 `{status:["not_started","in_progress"]}`。

**8. automations 最小适配（过渡语义）**
- 保留内置扫描规则和四个旧动作，T05 再删除。
- `classify` 改为判断 `type==="agent" && status==="not_started"`。
- worker 改为写入 `<task>` 区段内容，不再读取 `resources`。
- **过渡期行为**：派发后，任务**保持未开始**（还没有 `markDispatched`）。由 succeeded 状态的 claim 防止重复派发；失败时由 failed claim 跳过。这与 spec 的 A04 不一致，所以**在 T01a 合入之后、T05 合入之前不发 rc**。

**9. 保持不变**
- 逾期与“未来 7 天”分类、月历视图、提醒。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| A01（模型） | 新建 human 和 agent 任务，并在三种状态间切换 → 文件中的 `status` 正确；列表、详情、三列看板显示一致 | 服务测试；`shell.spec.ts:92-115` 改写后通过 |
| A03 | 保存 agent 任务不会启动进程；缺少 `execution` 或 `<task>` 时，详情显示 `dispatchBlockers` 中的原因 | 服务测试 + e2e |
| A05（human） | human 任务可以开始和关闭；agent 任务不能被 `setStatus` 改为进行中，看板拖动会被拒绝并提示 | 服务测试 + e2e |
| A06（`<task>`） | 外部编辑器修改 `<task>` 后界面刷新；界面保存后，区段外的内容和未知键逐字节保持不变 | 服务测试（比较字节） |
| A07（结构） | 代码围栏中的 `<task>` 不被识别；缺失、重复、未闭合时报出文件级问题 | `regions.ts` 和 `codeRanges.ts` 单元测试 |
| A09 | 包含 schema 1 文件的夹具 → 报错且文件字节不变；缺少 `type` 或 `status` 时报错；versioning 拒绝恢复 schema 1 | 服务测试 + versioning 测试 |
| 安全 | 外部 HTTP 调用 `tasks.create({type:"agent"})` 或带 `execution` → 拒绝；`tasks.create({foo:1})` → `INVALID_INPUT` | engine 测试 |
| E01 | 标签按规则规范化，外部修改 `tags` 后界面正确显示 | `shared` 单元测试 |
| 过渡 | `acceptance.spec.ts:525-586`（W-A 假 Codex 闭环）改写后通过：用 `type:"agent"` 替代 `execution:{kind}`，用状态断言替代勾选框断言；派发成功后任务保持未开始，下一轮不会重复派发 | e2e |
| 回归 | 逾期、7 天、月历、提醒；versioning 的 ACC-VS-03（改为 status 加 comments）；首页、档案页、笔记 inspector 中的任务显示 | 现有测试改写 |
| 残留 | `git grep -nE "setCompleted\|completedChanged\|execution\.kind\|TaskResourceSchema\|ResourcePicker"` 为零；任务语义的 `completed:` 为零 | grep |

## 完成证据

- 用 `audit` 跑 lint、typecheck、全部单元测试和 e2e，要求整合点完整通过。
- 记录残留 grep 的输出。
- 结果记入 `progress.md`。
