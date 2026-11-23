# 智能体启动与设置

2026-11-23 核对 `fc43ceef`。2026-11-13 的启动设置归档仍解释 Vault 内设置和 CLI 检测。原先“启动环境全部经 Herdr 会话环境传入”的说明只适用于普通环境。

- 产品目录支持 Claude Code、Codex 和 Pi。普通新会话从目录和每 Vault 的 `agent-cli/agents.json` 取默认值，用户参数覆盖目录默认参数。预览与实际启动共用 `resolveAgentLaunch`，预览遮蔽环境值。Claude/Codex 原生历史在无用户参数时省略普通新会话的全权限默认参数，并拒绝覆盖原生身份的设置。 [启动目录](../../../../plugins/agent-cli/src/shared/catalog.ts) · [设置](../../../../plugins/agent-cli/src/engine/settings.ts) · [启动解析](../../../../plugins/agent-cli/src/engine/launch.ts)
- GUI 启动时的 PATH 不完整，检测会补查安装目录，包括 `~/.local/bin`。设置页可检测 CLI，重启 Core 需确认。 [CLI 探测](../../../../plugins/agent-cli/src/engine/detect.ts) · [设置页](../../../../plugins/agent-cli/src/ui/AgentSettingsPage.tsx)
- Core 会话与原生历史各有身份。恢复或分支前重新核验原生记录、资料目录及工作目录，Pi 使用确切会话文件。Claude/Codex 绑定原生历史；Codex 另经桌面 helper 确认原生历史操作。收纳当前标签属于工作区布局，导出恢复的布局保留标签与分割，终端叶子去除会话绑定，恢复后再启动本机终端。 [会话能力](../../../../plugins/agent-cli/src/engine/index.ts) · [原生历史](../../../../plugins/agent-cli/src/engine/history/scanner.ts) · [布局包](../../../../plugins/agent-cli/src/engine/workspace-package.ts)
- 普通环境会进入 Core 启动参数，应按普通配置处理。受保护值由 Agent CLI 或 Automations 各自管理，经审批和本机受保护启动路径交目标进程，缺少支持时报告失败。预览、布局和可恢复的 Core 启动环境只保存其各自所需的信息，受保护值留在专用通道。原先依赖 `terminal.rm` 删除 `restart_env` 的做法属于旧 Safe 引用方案；会话退出清理仍由运行记录驱动。 [交互环境](../../../../plugins/agent-cli/src/engine/interactive-environment.ts) · [会话启动](../../../../plugins/agent-cli/src/engine/sessions.ts) · [受保护启动](../../../../plugins/agent-cli/src/engine/protected-launch.ts)

现有证据覆盖 Linux 真实 Core、固定包工作区流程、两种 Codex 发行入口的本机协议探针和合成 provider 的桌面历史路径。实际线上 provider 及 Windows/macOS 的安装和凭据后端仍待实机核验。任务派遣和回执见 [任务与自动化](tasks-and-automations.md)。
