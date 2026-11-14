# Change：品牌资产替换、设计系统重构与 Windows 向导式安装

- **来源**：
  - 2026-11-13 用户口头需求，以及 dev-grill 决定（安装范围由用户选择“仅为我 / 所有人”）。
  - 同日补充：用四份 DESIGN.md 完整重构项目设计，提供四套可切换主题；默认主题为 Claude。
- **状态**：**已归档（implemented，2026-11-14）**（见文末“收尾记录”）。品牌与安装器 BR-S1、BR-S2 已实现（安装器向导交互未经 Windows 实机验证）；设计系统 DS-S1 已完成，剩余部分以 [design-system-completion](../feature_2026-11-14-design-system-completion/README.md) 的结果为准（含登记的限度：`core.css` 最大块约 351 条规则未拆、182 条重复选择器登记在案、DSC-02 按字面未通过等），一并归档。
- **基线**：HEAD `8283c5c`；品牌源 `obsidian-huhu@d527f14`；设计参考 `VoltAgent/awesome-design-md@fcc7028`。

| 文件 | 内容 |
| --- | --- |
| [brief.md](brief.md) | 目标、当前事实、范围与非目标 |
| [spec.md](spec.md) | 资产映射、界面品牌位、字体声明、NSIS 向导、验收 BR-01～11、取舍 BR-D1～D7 |
| [design-system.md](design-system.md) | 四套主题的转译规则、token 架构、主题数据与生成器、四套取值表、字体、样式目录、守护规则、验收 DS-01～15、取舍 DS-D1～D9 |
| [design-refs/](design-refs/) | claude、apple、notion、vercel 四份 DESIGN.md 原文，以及上游的 MIT LICENSE |
| [plan.md](plan.md) | 七个切片的依赖、写入边界、代码指针、验证入口与完成边界 |

**设计系统的剩余部分（DS-S2～S4 未完成项）已转入 [2026-11-14-design-system-completion](../feature_2026-11-14-design-system-completion/README.md)**，本 change 保留 BR-S1、BR-S2、DS-S1 与已完成的样式拆分记录。

与 [任务 Issue 化 change](../feature_2026-11-13-task-issue-automation/README.md) 互不依赖。与 [智能体启动设置](../feature_2026-11-13-agent-launch-settings/README.md)、[档案文件夹笔记](../feature_2026-11-13-archives-as-folder-notes/README.md) 有共享文件，约定见 plan。

## 收尾记录（dev-archive，2026-11-14）

- **结果**：implemented（品牌、安装器配置、主题引擎均已实现并有证据；**用户于 2026-11-14 明确表示 Windows / macOS 不需要实机验证，可直接归档**）。**类型**：feature。原路径 `.agents/dev/changes/2026-11-13-brand-and-windows-installer`，归档后路径 `.agents/dev/archive/changes/implemented/feature_2026-11-13-brand-and-windows-installer`。
- **已交付**：品牌资产与窗口 / 打包图标替换（`assets/brand/`，顶栏、启动页、关于页品牌位）；`electron-builder.yml` 的 NSIS 向导式配置（范围“仅为我 / 所有人”、可选安装目录）；DS-S1 四套主题（Claude / Apple / Notion / Vercel × 明暗）与主题引擎（主题即数据、OKLab 生成器、漂移测试、对比度测试、`AppearanceController`）。设计系统的剩余部分在 [2026-11-14-design-system-completion](../feature_2026-11-14-design-system-completion/README.md) 实施。
- **未验证（按用户决定不要求）**：Windows 安装器向导的交互（范围选择、更改目录、升级、卸载）没有在 Windows 实机验证；CI 只构建安装器并跑打包后 e2e。macOS 同样没有实机验证。
- **长期知识**：`.agents/dev/notes/context/design-system.md`。

