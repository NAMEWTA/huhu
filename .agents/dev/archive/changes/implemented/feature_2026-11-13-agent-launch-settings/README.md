# Change：插件设置页规范化与智能体启动设置

- **来源**：2026-11-13 用户在任务 Issue 化的 dev-grill 中提出，附 orca 截图两张（复刻 orca 的智能体设置与新建菜单）；第三轮 grill 决定
- **状态**：规格已定稿（顾问两轮复核），拆成 AL-S1～AL-S4 四个切片。尚未写代码，等待实施授权
- **基线**：HEAD `8283c5c`；参考源 `temp/sources/orca`（MIT）

| 文件 | 内容 |
| --- | --- |
| [brief.md](brief.md) | 目标、用户决定、orca 与 HUHU 的当前事实、范围与非目标 |
| [spec.md](spec.md) | 设置贡献点与导航、智能体目录、`agents.json`、`resolveAgentLaunch`、新建菜单、智能体设置页、验收 SF / AG / LA / LM |
| [plan.md](plan.md) | 四个切片的依赖、写入边界、代码指针、验证入口与遗留项 |

[任务 Issue 化 change](../../../../changes/2026-11-13-task-issue-automation/README.md) 的 T05 依赖本 change 的 AL-S1；与 [品牌与安装器 change](../../../../changes/2026-11-13-brand-and-windows-installer/README.md) 互不依赖。

## 收尾记录（dev-archive，2026-11-14）

- **结果**：implemented（约定的实现范围已完成；真实 CLI 的验证项明确列为未验证）。**类型**：feature。原路径 `.agents/dev/changes/2026-11-13-agent-launch-settings`，归档后路径 `.agents/dev/archive/changes/implemented/feature_2026-11-13-agent-launch-settings`。
- **已交付**：数据驱动的智能体目录（Claude Code / Codex / Pi）、`resolveAgentLaunch`、`agents.json`、设置页与命令行预览、新建菜单、按 Vault 保存的插件设置页框架。
- **未验证**（没有授权用用户账号跑真实 CLI，所以保持未验证）：codex 的 `service_tier=priority` 在真实 codex 上的效果；Herdr 环境变量叠加在真实 CLI 上的逐项实测。验证用的是假 CLI + 真实 Herdr 0.1.19。
- **长期知识**：`.agents/dev/notes/context/agent-launch.md`。
- 验证快照：`a49dac2092bd366ae959df03dd7f434318d07314`（typecheck、lint、695 个单元测试、构建、105 个 e2e 通过）。
