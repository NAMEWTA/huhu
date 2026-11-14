# T02 权限组、委托链与任务字段守卫

**规格**：[spec.md](../spec.md) §8.2、§8.3、§8.4；TD-09、TD-10。

**交付**：
- 内置插件只要被授予内置专用权限组，就能调用 `exposable:false` 的能力。
- 外部调用者（CLI / MCP / HTTP）与第三方插件仍受暴露开关约束，只能写 human 任务。
- 内置插件发起的写入和执行调用会带上委托链，并写入审计。

**依赖**：T01a 的 `origin`、`type`、`status` 契约，以及过渡期守卫。Dispatcher 部分可以先行开发，tasks 侧的矩阵等 T01a 合入后再做。

**边界**：
- 负责 kernel 的权限、Dispatcher、`api.call` 上下文，以及 tasks 侧 handler 的守卫。
- 统一以下 4 处只按 caller 判断的检查：
  - `assertNoAgentAction`
  - `assertAgentAllowed`
  - `assertNotAutomationsDir`
  - inbox 的 `sourceFor`
- **不做**：automations 的能力调用迁移（T05）、评论来源（T04 使用本项提供的调用者类别）。

## 当前代码指针

- `packages/kernel/src/dispatcher.ts`：
  - `:42`：审计时跳过所有 `plugin:*` 调用。
  - `:115-124`：authorize。
  - `:79-84`：幂等。
- `packages/kernel/src/permissions.ts:7-27`：`PERMISSION_TABLE`、`isGrantable`、`permissionsAllow`。
- `packages/kernel/src/plugin-manager.ts:48`：`permissionsOf`。
- `packages/kernel/src/plugins/external.ts:156,194`：外部插件安装时校验权限。
- `packages/kernel/src/context.ts:71-108`：`api.call` 包装。
- `apps/engine/src/boot.ts:374,388`。
- 只按 caller 判断的检查：`plugins/automations/src/engine/index.ts:25-28`、`plugins/tasks/src/engine/index.ts:20-22`、`plugins/notes/src/engine/index.ts:14-15`、`plugins/inbox/src/engine/service.ts:33-38`。
- inbox 转换路径：`plugins/inbox/src/engine/index.ts:21-41`，权限声明在 `plugins/inbox/huhu-plugin.json:9`。
- 内置插件的判定需要一个 `origin=builtin` 字段。S0 没有确认 plugin-manager 是否已经区分内置与外部；实施时先查，没有就从插件加载来源推导，不在清单中新增字段。

## 实施要点

- **Dispatcher 按插件来源分流**：
  - 内置插件：只看 `permissionsAllow(granted, cap, scope, origin)`。
  - 第三方插件：保持 `exposable && permissionsAllow`。
- `permissionsAllow` 和 `isGrantable` 增加 `origin` 参数。内置插件可以使用 `execute` 范围；现在 `isGrantable` 对 `execute` 一律返回 false。
- 新增内置专用权限组：`tasks.dispatch`、`tasks.comment.system`、`agent.run`、`automations.runs.internal`。不能叫 `automations.runs.read`，它与现有能力名冲突，见 `permissions.ts:16`。
- **授予表**：内置插件清单里的 `permissions` 目前都是 `[]`，本项按下表写入各插件清单。

  | 插件 | 授予的权限组 | 用途 |
  | --- | --- | --- |
  | automations | `tasks.read`、`tasks.write`、`tasks.dispatch`、`tasks.comment.system`、`agent.run`、`notifications`（如有现成的组） | 查询与派发任务、回写评论、启动运行、发送提醒 |
  | tasks | `automations.runs.internal`、`agent.read`（Space 与 Provider 查询，如没有现成的组就新增只读组） | 活动运行守卫，以及表单中的 Space 和 CLI 查询 |
  | versioning | `tasks.read` | 原来通过 `taskQuery` 读取，改为调用能力 |
  | agent-cli | `tasks.write`、`tasks.comment.system` | 独立会话建任务、追加请求评论（T06） |
  | inbox | `tasks.write`（现有） | 不变 |

  组的实际名称和所含能力，以 `PERMISSION_TABLE` 的现有命名为准；实施时如果改名，先在 spec §8.2 更新。
- `isGrantable(perm, origin)`：外部插件声明内置专用权限组时，安装失败并给出明确错误。
- `onBehalfOf`：
  - `api.call(name, input, {onBehalfOf?})` 写入 handler 的上下文。
  - tasks 用它补全 `origin` 的明细 ID（`captureId`、`ruleId`、`activationId`、`sessionId`），对照 spec §2.2。
  - Dispatcher 把它和调用者一起传给 handler，并写入审计。
  - 审计只记录内置插件发起的 write 和 execute 调用。
- tasks 侧落实 §8.3 矩阵的每一行，包括 duplicate、delete、inbox；`fields` 中的 `type`、`execution`、`origin` 一律忽略。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| D02 | 内置插件获授 `agent.run` 后，可以调用 `exposable:false` 的 `agent.*`；外部 HTTP 调用同一能力，返回 `CAPABILITY_NOT_EXPOSED` | 拟新增 `dispatcher.test.ts` 用例 |
| D02 | 未获授权的内置插件调用 → 拒绝；外部插件清单声明 `tasks.dispatch` → 安装失败 | dispatcher 与 external-plugins 测试 |
| D03 | 外部或第三方插件以下操作全部被拒：创建 agent 任务、修改 agent 任务的 `<task>`/标签/`execution`、复制 agent 任务、删除 agent 任务；对 human 任务的同类操作成功 | tasks 测试逐行覆盖 §8.3 矩阵；engine 测试走 HTTP |
| D03 | inbox 转换时传入 `type:"agent"` → 只生成 human 任务，且 `origin={kind:"inbox"}` | inbox 与 engine 测试 |
| 回归 | 现有外部入口不能创建 scan / agent_prompt / notify 规则的测试（`engine.test.ts:804-823`）继续通过，或在 T05 改为三类动作后等价通过 | 现有测试 |
| 审计 | 内置插件的 write 调用产生审计记录，记录中有 `onBehalfOf`；read 调用不产生记录 | dispatcher 测试 |

## 完成证据

- `audit` 运行 kernel、tasks、inbox、engine 的测试。
- 实际结果记入 `progress.md`。
