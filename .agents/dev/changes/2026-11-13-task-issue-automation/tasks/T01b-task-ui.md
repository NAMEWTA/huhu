# T01b 任务界面：标签筛选、看板与工作目录选择

**规格**：[spec.md](../spec.md) 中的 §2.4（筛选 UI）、§2.5（在表单内选择本地目录或新建 Space；effort 与 fast 按能力显示）、§4.4（看板交互）。

**交付**：
- 列表和看板支持多选标签筛选，语义为全部匹配。
- agent 任务表单可以直接选本地目录作为工作目录，路径相同的 Space 会被复用，没有则新建。
- effort 和 fast 只在 Provider 支持时显示。
- 三列看板的拖拽体验完整。

**依赖**：T01a 已合入（模型和三列看板的最低版本）。另需 [agent-launch-settings](../../../archive/changes/implemented/feature_2026-11-13-agent-launch-settings/plan.md) 的 AL-S1 已合入：它先改 `TaskEditor.tsx:29,38` 的检测读取（改调 `agent.catalog.detect`，模型读共享目录），T01b 在其上重写执行配置区；effort/fast 的可选值按共享目录中所选模型的 `efforts`、`fast` 显示。

**边界**：
- 只**新增** UI，不改变契约，也不引入兼容逻辑。
- 只修改 tasks 的 UI 文件和 `shared/` 下的筛选谓词。
- 不改 tasks 引擎的 handler：handler 在本阶段归 T02 所有。

## 当前代码指针

- 任务 UI：
  - `plugins/tasks/src/ui/TaskEditor.tsx:102-160`：执行配置。
  - `TaskViews.tsx:84-109`：看板，使用原生拖拽。
  - `TasksModule.tsx:45-148`：筛选与搜索。
- Space 与 Provider：
  - `agent.spaces.save` / `list`：`plugins/agent-cli/src/engine/spaces.ts:15-88`。
  - `agent.catalog.detect`（AL-S1 合入后取代 `agent.providers.detect`；原实现在 `providers/index.ts:43-69`）。
- 草稿：`plugins/tasks/src/shared/draft.ts:70`。保存时 `fast` 被固定写为 false，需要改。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| E02 | 选中两个标签 → 只显示同时带这两个标签的任务。列表和看板结果一致 | e2e |
| A02 | 选择一个本地目录：已有同路径 Space 时复用，没有时新建（`agent.spaces.list` 中多出一项）。选 claude 时显示 effort；fast 只在 Provider 支持时显示，保存后写入 `execution` | e2e |
| A01（交互） | 在三列之间拖动卡片，状态写回文件。agent 任务拖到“进行中”时被拒绝，并给出提示 | e2e |

## 完成证据

- 用 `audit` 跑 tasks 的测试和 e2e。
- 用 `dev-verify` 截图三列看板和标签筛选。
