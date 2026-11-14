# T04 任务文件内的评论时间线

**规格**：[spec.md](../spec.md)
- §3.1–§3.3：`<comments>` 区段的写入与转义。
- §5：全部。
- TD-05、TD-12。

**交付**：
- 用户可以在任务详情底部发表评论，评论追加在该任务文件的 `<comments>` 区段。
- 时间线按来源区分人、Agent、系统、外部。
- 运行中的问题以请求卡片形式显示，可以“回复并继续”，也可以“前往处理”。
- 编辑任务内容的同时追加评论，不会丢失任何一方的修改。

**依赖**：
- T01a：区段解析与条件写。
- T02：调用者类别、`tasks.comment.system` 权限组。
- 评论输入框的 `@` 补全复用 T03 的扩展。T03 还没合入时先不启用，由 T07 做整合检查。

**边界**：
- 负责：
  - `tasks.comments.add`、转义。
  - 时间线 UI、请求卡片、回复并继续、前往处理入口。
  - **人工状态流转产生的系统评论**：开始处理、关闭、重开（spec §4.1）。
  - `tasks.read` 的 `attention` 字段：从 `tasks.runs` 派生。
- **运行事件写评论**（问题、结果、失败、对账补写）由 T05 负责，本项只提供能力和渲染。
- 不改 notes 的 CommentsService。

## 当前代码指针

- `plugins/tasks/src/ui/TaskDetail.tsx`：现有 `RunRecords` 在 `:156`，其中 `:169` 调用了 `automations.runs.answer`。
- `plugins/automations/src/engine/service.ts:627-670`：`answerRun`，只有在 `waiting_input` 状态下可以回答。
- `packages/vault/src/semantic/repository.ts:131-156`：`patch`，带版本条件。
- 评论样式参考 notes 的评论组件，以 `plugins/notes/src/ui` 下实际使用的组件为准，复用样式类，不复用存储。
- 拟新增：`tasks.comments.add` 能力；`plugins/tasks/src/ui/Timeline.tsx`（文件名由实施时决定）。

## 实施要点

- **`tasks.comments.add({taskId, body, id?, ask?, run?})`**：
  - `source` 由调用者推导：desktop 为 `human`；具备 `tasks.comment.system` 的内置插件为 `agent` 或 `system`（由参数选择）；外部调用为 `external`，且只允许评论 human 任务。
  - 未传 `id` 时由服务端生成；传了 `id` 且已存在时视为成功，不重复写入。
- **转义**：凡是会被识别为结构标签的行，在行首加 `\`；渲染时去掉。
- **追加位置**：插入在 `</comments>` 之前；文件中还没有 `<comments>` 区段时，在 `</task>` 之后创建。
- **请求卡片的状态**：从 `tasks.runs` 和运行记录派生，评论本身不保存状态。
- **回复并继续**：
  1. 先追加回复评论（`ask` 指向该请求）。
  2. 再调用 `runs.answer`，幂等键为 `runId + requestId`。
  3. 失败时显示“未送达，可重试”，重试必须带原回复文本。
- **前往处理**：Herdr 会话聚焦到原终端（复用现有会话 UI 的入口）；headless 运行只提供“查看运行记录”。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| B01 | 在未开始和进行中的任务上各发一条评论 → 文件中追加 `<comment source="human">`；`inputRevision` 不变；没有进程启动 | 服务测试 + e2e |
| B03 | 假 CLI 产生问题后点“回复并继续” → 续跑一次；连续点两次或模拟网络重试 → 只续跑一次；让 answer 失败 → 显示“未送达”，重试后成功 | 服务测试 + e2e（acceptance 中现有的假 Codex 流程改写） |
| B06 | 已解决或已过期的请求卡片没有可点击的批准按钮；关闭任务后请求仍显示为未解决 | e2e |
| B09 | 用户在 `<task>` 编辑器中未保存时并发追加 3 条评论，然后保存 → 4 处修改全部保留；外部编辑器同时改动文件 → 冲突重试后不丢消息；停用 notes 插件后，评论照常可用 | 服务测试（并发）+ e2e |
| B10 | 通过网关发表的评论正文含 `</comment>` 和 `<comment source="human">` 两行 → 文件中这两行已转义，解析后仍是 1 条评论，来源不变 | `regions.ts` 与服务测试 |
| D03（评论） | 外部调用者评论 agent 任务 → 拒绝；请求体中自报 `source:"system"` → 被忽略 | tasks 测试 |
| §4.1（人工） | 开始处理、关闭、重开各追加 1 条系统评论；重复点击不会重复追加 | 服务测试 |
| A06（评论） | 在外部编辑器里修改某条评论正文 → 界面刷新后显示新内容 | e2e |
| A07（评论） | 评论缺少 `id` 或 `at`、`id` 重复、`</comments>` 未闭合 → 文件级问题，agent 任务进入不可派发状态 | `regions.ts` 与服务测试 |

## 完成证据

- `audit` 跑 tasks、vault 测试和 e2e。
- `dev-verify` 截图时间线的四种来源和请求卡片。
- 结果记入 `progress.md`。
