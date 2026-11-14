# Change：设计系统收尾（样式归属、类名治理与真实分层）

- **来源**：2026-11-14 用户要求，把设计系统剩余部分另开 change。接手 [品牌、设计系统与 Windows 安装](../2026-11-13-brand-and-windows-installer/README.md) 中 DS-S2～DS-S4 未完成的部分（见该 change 的 progress.md“未做”）。
- **状态**：**已实施（2026-11-14）**。S0～S4、S2b、S5c 完成，S5a / S5b / S6 部分完成并在 [progress.md](progress.md) 如实记录偏差。性质是行为保持型重构：外观不变，结构变化，每一步用“渲染等价性”证明；最终与冻结基线的计算样式、宽度矩阵、像素均零差异。
- **基线**：HEAD `8283c5c` + 工作区快照 `51681e7`（`origin` 基线，见 progress.md）。起点数字观察于 2026-11-14。
- **不包含**：主题数据 / token / 字体（已完成并验证）；Windows 安装器与真实 CLI 验证（上游遗留，与样式无关）。

| 文件 | 内容 |
| --- | --- |
| [brief.md](brief.md) | 问题、范围、当前事实、约束 |
| [spec.md](spec.md) | 目标契约（文件与归属、层序、类名规则、等价性验证）、验收 DSC-01～16、取舍 DC-D1～D9、待决问题 Q1～Q5 |
| [verification.md](verification.md) | 等价性验证方案：命令、屏幕清单、计算样式快照、像素比对、层叠冲突报告、每切片操作规程 |
| [plan.md](plan.md) | 十个切片（S0、S1、S2a、S2b、S3、S4、S5a、S5b、S5c、S6）的依赖、边界、规格覆盖、复用核对、风险与停止条件 |
| [tasks/](tasks/) | 每个切片一份可独立接手的任务文件 |
| [progress.md](progress.md) | 进度与证据（实施时维护；现在只有起点记录） |

## 一句话路线

先把“证明样式没变”的工具做成仓库资产（S0）→ 查清上一轮分层回归的根因，特别是运行时注入的第三方样式（S1）→ **全量入层，覆盖第三方的规则进不分层白名单**（S2a）→ 去 `!important`（S2b）→ 规则按使用者归位（S3）→ 类名统一并强制前缀（S4）→ 按组件拆分（S5a）、去重与同义类合并（S5b）、PurgeCSS 核查（S5c）→ 64 组主题人工验收与文档（S6）。每个切片只做一种结构变化，结束时与冻结的 `origin` 基线比对为 0 差异。

## 与其他 change 的关系

- 上游：[brand-and-windows-installer](../2026-11-13-brand-and-windows-installer/README.md)（其 DS-S1 已完成）。本 change 完成后，上游的 DS-S2～S4 与“按 plan，rc 前必须通过”的约束以本 change 的结果为准。
- 与 [task-issue-automation](../2026-11-13-task-issue-automation/README.md)、[archives-as-folder-notes](../../archive/changes/implemented/feature_2026-11-13-archives-as-folder-notes/README.md)、[agent-launch-settings](../../archive/changes/implemented/feature_2026-11-13-agent-launch-settings/README.md) 共享 TSX 与样式文件：从 S0 生成 `origin` 基线起到 S5c 结束需要冻结窗口，见 [plan.md](plan.md)“与其他 change 的冲突与冻结”。

## 需要用户确认（不阻塞文档，阻塞实施）

1. **“`hu-` 类名统一”**：按上游已定规则理解为——共享组件 `hu-`、工作台用区域前缀、插件用插件 id 前缀，而不是把全部类名改成 `hu-` 开头。
2. **“按组件重写共享样式”**：理解为按组件拆成 `components/<name>.css` 并去重、合并同义类，**规则内容以渲染不变为准**；不按新设计重新设计样式。
3. **冻结窗口**：S0 生成 `origin` 基线前，其他三个 change 的界面代码要稳定（先提交，或同意冻结期内不改界面与样式）。提交需要用户授权，本 change 不会擅自提交。
4. **有意改变外观**：本 change 不允许；若实施中发现“新结果更合理”的差异，会停下来问用户，批准后才记入“已批准差异”表。

## 收尾状态（2026-11-14）

**实施完成，未归档。**核心目标（样式归位、类名统一、真实 `@layer`、与冻结基线渲染零差异的等价性验证）已达成；仍有如实记录的未完成项（`core.css` 未再细拆、PurgeCSS 与覆盖率未运行、规则级去重未做、64 组主题截图未逐张人工核对、DSC-05 / 09 / 10 / 15 的偏差），详见 [progress.md](progress.md)。保留在 `changes/`，等用户决定“接受缩减范围后归档”或另开后续 change。
