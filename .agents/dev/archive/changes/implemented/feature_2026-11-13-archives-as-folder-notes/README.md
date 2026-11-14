# Change：档案改为“文件夹笔记”形态

- **来源**：2026-11-13 用户在任务 Issue 化讨论中提出；同日两轮 dev-grill 定案
- **状态**：规格已定稿，拆成 AR-S1～AR-S3 三个切片。尚未写代码，等待实施授权
- **基线**：HEAD `8283c5c`

| 文件 | 内容 |
| --- | --- |
| [brief.md](brief.md) | 用户目标、已作出的决定、当前实现事实、范围与依赖 |
| [spec.md](spec.md) | 文件形态、命名与随机码、文件夹笔记规则、笔记模块中的档案视图、能力表、验收 AR-01～17 |
| [plan.md](plan.md) | 切片、共享文件约定、代码指针、测试清单 |

依赖 [任务 Issue 化 change](../../../../changes/2026-11-13-task-issue-automation/README.md) 的 T03（文件夹引用与改写）。

## 收尾记录（dev-archive，2026-11-14）

- **结果**：implemented（约定的实现范围已完成并有证据）。**类型**：feature。原路径 `.agents/dev/changes/2026-11-13-archives-as-folder-notes`，归档后路径 `.agents/dev/archive/changes/implemented/feature_2026-11-13-archives-as-folder-notes`。
- **已交付**：档案 = `Archives/<类型>/<名称>/index.md` 的文件夹笔记，档案 UI 并入知识库，旧档案插件与实体种类删除；AR-01～AR-20 逐项有单元 / e2e 证据（见 progress.md）。
- **未交付 / 未验证**：档案视图“拖动排序以外的字段类型转换”未做（见 progress.md 的“未验证 / 未做”）；只在 Linux 上验证。
- **长期知识**：`.agents/dev/notes/context/archives.md`。
- 验证快照：`a49dac2092bd366ae959df03dd7f434318d07314`（typecheck、lint、695 个单元测试、构建、105 个 e2e 通过）。
