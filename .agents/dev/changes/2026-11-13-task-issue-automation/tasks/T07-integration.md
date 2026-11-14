# T07 整合、清理与交付

**规格**：[spec.md](../spec.md) §10、§11 全部、§14（Issue）完成定义；验收 D05、D06。

**交付**：
- 新功能在真实应用中走通 Issue §14 闭环：写任务 → 配置 → 定时派发 → 进行中 → 提问 / 结果追加到原任务 → 用户在原任务或原现场处理 → 关闭。
- 旧模型无残留。
- 文档、示例、来源台账同步更新。
- 交付报告逐条区分“已验证”“仅静态检查”“未验证”。

**依赖**：T01a、T01b、T02–T06 全部合入。

**边界**：本项只做整合验证、清理残留和交付记录，不新增功能。发现缺陷时回到对应切片修复，并在那个切片补上验收。

## 实施要点

- **残留检查**：以下 grep 结果应为零（排除无关命中，如 `trigger: "manual"`、Codex JSON 中的 `item.completed`）：
  - `setCompleted`、`completedChanged`、`execution.kind`、`TaskResourceSchema`、`ResourcePicker`
  - `scan_agent_tasks`、`agent_prompt`、`scriptId`、`automations.scripts`、`ensureBuiltin`、`taskQuery`
  - 任务语义的 `completed:` 字段
- **跨切片组合**：
  - 评论输入框中的 `@` 补全（T03 + T04）。
  - 派发后评论中的引用可以点击。
  - 独立会话建立的任务能被正常关闭。
- **文档**：
  - 更新 spec §10 的最终取代清单。
  - 更新 reuse.md 结论。
  - 如有复制代码，更新 `docs/upstream/ledger.md` 和 `THIRD_PARTY_NOTICES.md`（由 `pnpm notices` 生成）。
  - 更新 agent-guide 的 CLI 示例。
  - 更新 `examples/plugins/daily-review`。
- **测试夹具**：demo vault 目前没有任务文件。是否加入一份示例任务（`<task>` + `<comments>` 格式）由实施者按 e2e 需要决定，不作为强制交付。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| 闭环（假 CLI） | 在真实应用中依次完成：新建 agent 任务（`@` 引用一篇笔记）→ 建规则 → 立即运行 → 任务变为进行中 → 假 CLI 提问 → 回复并继续 → 结果评论 → 关闭；文件内容与界面一致 | `dev-verify` 驱动应用，截图 + 任务文件快照 |
| 闭环（真实 CLI，可选） | 本机有 claude 或 codex 时，同一流程使用真实 Provider；Agent 能按提示词中的 Vault 路径读取被引用的笔记 | `dev-verify`，记入 evidence；没有环境时标为“未验证” |
| D05 | reuse.md 的每个缺口都有结论；没有任何“未检查”被写成“无可复用” | 文档审查 |
| D06 | 上述残留 grep 为零；spec 与代码一致；没有兼容分支 | grep + `audit` |
| 全量回归 | lint、typecheck、单元测试、e2e（三平台 CI），打包后 E2E 子集 | `audit` + CI |

## 完成证据

- 按 CLAUDE.md 的顺序：`audit` 全量通过 → 把 audit 结论原文、改动文件和快照 SHA 交给顾问复核 → 向用户交付。
- 交付报告引用 `progress.md` 和 evidence 中的实际记录。
