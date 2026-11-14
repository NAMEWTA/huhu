# 知识库完整重构：移植 Open Knowledge 编辑器

- **来源**：2026-11-14 用户要求拉取 [issue #2](https://github.com/NAMEWTA/huhu/issues/2)（含用户补充评论）并据此建立 change、完成完整文件文档与设计；`temp/sources/orca` 与 `temp/sources/open-knowledge` 复制复刻，编辑器以 OK 为主，技术栈可完整重构。
- **状态**：**文档与设计完成（2026-11-14），尚未实施，没有写任何产品代码。** 下一步 = S0（来源冻结与三个闸门 spike：SP-1 编译、SP-4 往返、SP-6 真实 Electron 运行时），见 [plan.md](plan.md)。
- **性质**：大型跨包重构（编辑器内核替换）。无法新旧并存；采用垂直切片 + 诚实的整合边界。**任何阶段完成都不是“整体复刻完成”。**
- **对 issue 的订正**：13 条，见 [spec.md](spec.md) §3（来源已在本地、保留 Yjs、HTML 预览不可复制、OK 的隐藏是 `.okignore`、属性面板、阅读模式、范围分类等）。
- **要取代的既有决定**：`D-08`（CM6 单实现 / 否决 Tiptap + Yjs）、`D-09`、`D-31`（编辑器范围）、`product.md` 非目标——后继记录见 [decisions.md](decisions.md) OP-D01，归档时写入 `notes/decisions/`。

## 文档

| 文件 | 内容 |
| --- | --- |
| [source-issue-2.md](source-issue-2.md) | issue #2 与评论的**原文存档**（未改动） |
| [brief.md](brief.md) | 需求简报：目标、来源、当前事实、范围、成功条件 |
| [spec.md](spec.md) | 行为契约：采纳 issue 的细则 + 13 条订正 + 新增验收 G（来源 / 许可 / vendor）、H（技术栈接入 H01–H07）+ 待决问题 Q1–Q10 |
| [design.md](design.md) | 架构与接口：会话 / 本地 Y.Doc 管线、宿主适配、资源目录与隐藏、标签与档案、文件树、评论适配、属性、查看器（PDF / 隔离 HTML）、样式 / i18n / 构建、vendor 策略、删除清单、风险 |
| [decisions.md](decisions.md) | 18 条决定（OP-D01～D18）：依据、被拒绝的替代、代价、回头检查（含写死的闸门阈值） |
| [ui-design.md](ui-design.md) | 界面设计记录：布局、状态表、键盘 / 响应式、验收与交接 |
| [reuse.md](reuse.md) | 复用核对（Huhu → 来源 → 依赖 → 适配 → 自研）与明确不复制清单、依赖增量 |
| [plan.md](plan.md) | 切片 S0–S8、依赖、并行与唯一写入者、整合边界、停止条件、规格覆盖 |
| [tasks/](tasks/) | 九份切片任务（00–08；S2 分 2a-1/2/3、2b、2c），每份可独立接手 |
| [verification.md](verification.md) | 验证层、验收 → 验证归属、样本与夹具、对照 OK 基线的方法、环境限制、切片门禁 |
| [progress.md](progress.md) | 进度与证据入口（实施时维护；现为起点记录） |
| [evidence/](evidence/) | `e0-source-survey.md`（本次调查证据）；后续：closure-manifest、parity / endpoint 矩阵、spike 结论、各切片证据 |

## 与其他 change 的关系

- 基线是已归档的 `feature_2026-11-14-design-system-completion`（样式层序 / 前缀 / 守护）与 `feature_2026-11-13-archives-as-folder-notes`（档案规范）；本 change 会**更新**设计系统规范（`ok-*` 层与 Tailwind 作用域）。
- 与 #1 相关的任务评论 / 讨论能力必须不退化（D06）。
- 不触碰：任务 / 自动化 / agent-cli 等业务；Windows 安装器、品牌资产。

## 需要用户确认（不阻塞文档与 S0）

十项（Q1–Q10），见 [spec.md](spec.md) §9。其中会改变“能否宣布复刻完成”的是 **Q2（OK 里不属于本地编辑核心的功能分类）**与 Q10（分屏 / pane）；会改变对外接口的是 **Q8（`vault.tree` / `notes.files` 删除影响 MCP / CLI / 权限组）**；Q1（许可证，建议无变化）。
