# Change：品牌资产替换、设计系统重构与 Windows 向导式安装

- **来源**：
  - 2026-11-13 用户口头需求，以及 dev-grill 决定（安装范围由用户选择“仅为我 / 所有人”）。
  - 同日补充：用四份 DESIGN.md 完整重构项目设计，提供四套可切换主题；默认主题为 Claude。
- **状态**：**实现完成，未归档**（见文末“收尾状态”）。品牌与安装器 BR-S1、BR-S2 已实现（安装器向导交互未经 Windows 实机验证）；设计系统 DS-S1 已完成，剩余部分已转入 design-system-completion。
- **基线**：HEAD `8283c5c`；品牌源 `obsidian-huhu@d527f14`；设计参考 `VoltAgent/awesome-design-md@fcc7028`。

| 文件 | 内容 |
| --- | --- |
| [brief.md](brief.md) | 目标、当前事实、范围与非目标 |
| [spec.md](spec.md) | 资产映射、界面品牌位、字体声明、NSIS 向导、验收 BR-01～11、取舍 BR-D1～D7 |
| [design-system.md](design-system.md) | 四套主题的转译规则、token 架构、主题数据与生成器、四套取值表、字体、样式目录、守护规则、验收 DS-01～15、取舍 DS-D1～D9 |
| [design-refs/](design-refs/) | claude、apple、notion、vercel 四份 DESIGN.md 原文，以及上游的 MIT LICENSE |
| [plan.md](plan.md) | 七个切片的依赖、写入边界、代码指针、验证入口与完成边界 |

**设计系统的剩余部分（DS-S2～S4 未完成项）已转入 [2026-11-14-design-system-completion](../2026-11-14-design-system-completion/README.md)**，本 change 保留 BR-S1、BR-S2、DS-S1 与已完成的样式拆分记录。

与 [任务 Issue 化 change](../2026-11-13-task-issue-automation/README.md) 互不依赖。与 [智能体启动设置](../../archive/changes/implemented/feature_2026-11-13-agent-launch-settings/README.md)、[档案文件夹笔记](../../archive/changes/implemented/feature_2026-11-13-archives-as-folder-notes/README.md) 有共享文件，约定见 plan。

## 收尾状态（2026-11-14）

**实现完成，未归档。**品牌资产与图标、NSIS 向导式安装配置、四套主题与主题引擎（DS-S1）已实现；设计系统的剩余部分（样式分层、归位、类名统一等）已转入并在 [2026-11-14-design-system-completion](../2026-11-14-design-system-completion/README.md) 实施（含如实记录的偏差）。保留在 `changes/` 的原因：
- BR-10 / 安装器向导交互（选择“仅为我 / 所有人”、更改安装目录、升级、卸载）**需要 Windows 实机验证，没有证据**；CI 只会构建安装器，不会操作向导。
- 设计系统部分仍有未完成的验收项（PurgeCSS、64 组主题截图人工核对等），见 design-system-completion 的 progress。
长期知识：`.agents/dev/notes/context/design-system.md`。
