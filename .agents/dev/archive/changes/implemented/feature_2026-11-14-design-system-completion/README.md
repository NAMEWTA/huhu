# Change：设计系统收尾（样式归属、类名治理与真实分层）

- **来源**：2026-11-14 用户要求，把设计系统剩余部分另开 change。接手 [品牌、设计系统与 Windows 安装](../feature_2026-11-13-brand-and-windows-installer/README.md) 中 DS-S2～DS-S4 未完成的部分（见该 change 的 progress.md“未做”）。
- **状态**：**已实施并归档（2026-11-14）**。S0～S6 与 DSC-09～13 都有结论，其中 S5a（最大的一块顺序耦合规则仍在 `core.css`）、S5b（182 条重复选择器登记在案）、DSC-13（缺启动页）有如实记录的限度，见 [progress.md](progress.md)。性质是行为保持型重构：外观不变，结构变化，每一步用“渲染等价性”证明；对 rc.3 基线（Claude 主题含状态矩阵）计算样式、宽度矩阵、像素等价（仅构建哈希文字不同）；对冻结的 `origin` 基线的差异只来自 rc.3 的内容 / 功能改动，已在 progress.md“已登记的非样式差异”列出——**这些差异没有经过逐项批准**；状态矩阵只覆盖 Claude 主题。
- **基线**：HEAD `8283c5c` + 工作区快照 `51681e7`（`origin` 基线，见 progress.md）。起点数字观察于 2026-11-14。
- **不包含**：主题数据 / token / 字体（已完成并验证）；Windows 安装器与真实 CLI 验证（上游遗留，与样式无关）。

| 文件 | 内容 |
| --- | --- |
| [brief.md](brief.md) | 问题、范围、当前事实、约束 |
| [spec.md](spec.md) | 目标契约（文件与归属、层序、类名规则、等价性验证）、验收 DSC-01～16、取舍 DC-D1～D9、待决问题 Q1～Q5 |
| [verification.md](verification.md) | 等价性验证方案：命令、屏幕清单、计算样式快照、像素比对、层叠冲突报告、每切片操作规程 |
| [plan.md](plan.md) | 十个切片（S0、S1、S2a、S2b、S3、S4、S5a、S5b、S5c、S6）的依赖、边界、规格覆盖、复用核对、风险与停止条件 |
| [tasks/](tasks/) | 每个切片一份可独立接手的任务文件 |
| [progress.md](progress.md) | 进度、偏差、验证证据与未交付清单（最终状态） |

## 一句话路线

先把“证明样式没变”的工具做成仓库资产（S0）→ 查清上一轮分层回归的根因，特别是运行时注入的第三方样式（S1）→ **全量入层，覆盖第三方的规则进不分层白名单**（S2a）→ 去 `!important`（S2b）→ 规则按使用者归位（S3）→ 类名统一并强制前缀（S4）→ 按组件拆分（S5a）、去重与同义类合并（S5b）、PurgeCSS 核查（S5c）→ 64 组主题人工验收与文档（S6）。每个切片只做一种结构变化，结束时与冻结的 `origin` 基线比对为 0 差异。

## 与其他 change 的关系

- 上游：[brand-and-windows-installer](../feature_2026-11-13-brand-and-windows-installer/README.md)（其 DS-S1 已完成）。本 change 完成后，上游的 DS-S2～S4 与“按 plan，rc 前必须通过”的约束以本 change 的结果为准。
- 与 [task-issue-automation](../feature_2026-11-13-task-issue-automation/README.md)、[archives-as-folder-notes](../feature_2026-11-13-archives-as-folder-notes/README.md)、[agent-launch-settings](../feature_2026-11-13-agent-launch-settings/README.md) 共享 TSX 与样式文件：从 S0 生成 `origin` 基线起到 S5c 结束需要冻结窗口，见 [plan.md](plan.md)“与其他 change 的冲突与冻结”。

## 需要用户确认（文档阶段提出；**这四项在 change 目录里没有留下明确的确认记录**，实施按各项“理解”进行，实施中没有发现需要批准的有意外观变化）

1. **“`hu-` 类名统一”**：按上游已定规则理解为——共享组件 `hu-`、工作台用区域前缀、插件用插件 id 前缀，而不是把全部类名改成 `hu-` 开头。
2. **“按组件重写共享样式”**：理解为按组件拆成 `components/<name>.css` 并去重、合并同义类，**规则内容以渲染不变为准**；不按新设计重新设计样式。
3. **冻结窗口**：S0 生成 `origin` 基线前，其他三个 change 的界面代码要稳定（先提交，或同意冻结期内不改界面与样式）。提交需要用户授权，本 change 不会擅自提交。
4. **有意改变外观**：本 change 不允许；若实施中发现“新结果更合理”的差异，会停下来问用户，批准后才记入“已批准差异”表。

## 收尾记录（dev-archive，2026-11-14）

- **归档结论**：`implemented`（主类型 `feature`：新增的是守护与验证能力 + 样式结构，外观不变）。用户明确：Windows / macOS 实机验证不是归档条件。
- **已交付并有证据**：层叠分层与不分层白名单（`check-css-layers`）、73 → 34 处 `!important`（带说明）、规则按使用者归位（`check-css-ownership`）、类名前缀统一（`check-css-classes`）、共享样式拆成 16 个文件、24 处重复选择器合并并登记其余 182 条（`components/*.css` 按同一文件计）（`check-css-duplicates`）、无用样式核查（PurgeCSS + Chromium 覆盖率，结论：无可据以删除的规则）、渲染等价性验证入库（`pnpm visual:*`、`tests/visual/`）。拆分与去重对 rc.3 基线 0 差异；四主题完整比对与最终审计见 [progress.md](progress.md)“最终审计”。
- **没有交付 / 没有验证（如实）**：最大的一块顺序耦合规则（≈351 条）仍在 `core.css`，小文件多为 `*-etc.css` 混合命名，没有做到规格字面的“一个组件一个文件”；182 条历史重复选择器、57 个历史类名、36 个跨包共用类只是登记，没有清零；5 个无用规则候选（`.board-card*`、`.hu-callout` 的 warning / success / info）没有删除；`!important` 保留 34 处，其中覆盖 CodeMirror / sonner 的 14 处超出规格允许的两类；没有用 stylelint 的 `selector-class-pattern` / `no-duplicate-selectors`（用自写检查器与登记表代替）；**DSC-02 按规格字面未通过**（对 `origin` 的 3 类非样式差异没有逐项批准，以对 `rc3` 基线 0 差异代替）；DSC-14（DS-06 / 07 / 12 / 13 / 14 单独运行证据）与 DSC-15（perf p95、CSS 字节数）没有重做；启动页、自动化规则编辑器、档案字段编辑对话框、新建菜单不在视觉验证屏幕清单，DSC-13 的“下拉菜单”用命令面板顶替；Windows / macOS 渲染、`e2e:packaged`、真实 claude / codex 路径未验证。完整逐条 DSC 状态见 [progress.md](progress.md)“未做 / 未验证”。
- **值得保留的结论**：已写入 [notes/context/design-system.md](../../../../notes/context/design-system.md)（层与文件规范、拆文件 / 去重方法、守护脚本）与 [notes/errors/css-layering-and-refactor-pitfalls.md](../../../../notes/errors/css-layering-and-refactor-pitfalls.md)（层序先于特异性、运行时注入样式、PurgeCSS 对模板片段误判、简写 / 长写冲突等）。
