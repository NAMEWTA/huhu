# 智能体启动与设置

> 来源 change：`2026-11-13-agent-launch-settings`（已归档）。

- 只支持 Claude Code、Codex、Pi 三个 provider；**没有 Agent Teams** 的启动入口（`provider-claude-agent-teams` 样式是历史遗留）。默认**完全访问**参数；命令行预览与实际启动用同一份 argv 构造（`plugins/agent-cli/src/shared/shell.ts`）。
- 设置页（`AgentSettingsPage.tsx`）：检测状态、默认模型 / 附加提示词、`agents.json` 持久化（**每个 Vault 独立**，不是全局）、重启 Core 需确认。
- 启动环境叠加（env overlay）经 Herdr 的会话环境传入；Herdr 会把环境写进状态文件 `restart_env`，含秘密时必须用完即 `terminal.rm`（见 [tasks-and-automations](tasks-and-automations.md)）。
- 检测会回退到 `~/.local/bin`；测试里要用空 HOME 才能模拟“没装”。
- 新建菜单里悬停智能体打开子菜单，选模型 / 附加提示词后启动。
