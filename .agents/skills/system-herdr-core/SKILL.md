---
name: system-herdr-core
description: "当用户明确要求使用 herdr-core、hc 或 system-herdr-core 时启用。通过 hc 启动和协调 agent、运行后台或长时间任务、读取和控制终端及在远程机器上工作，并按需用 task/report 文件派发和验收。明确要求 Herdr App 时提供对应窗口操作入口。"
---

# Herdr Core

用户明确选用 Core 后，沿用该任务和已有授权。单独出现 `HC_TERMINAL_ID` 或泛称并行、后台任务时，沿用当前工作方式。用户要求使用 `herdr` 或 Herdr TUI 时，由 `system-herdr` 处理。

先运行 `hc --skill`，再按需查看 `hc <子命令> --help`。使用本机 CLI 的手册和参数，确认目标机器、会话和工作目录。处在 Core 终端内时，`HC_TERMINAL_ID` 是自身终端 ID；在外部时，使用调用返回的终端地址。用户已明确授权使用 Core 时，无需因在外部再询问一次。对窗口中的空间、标签页、布局、mod 和显示内容，读取 `herdr-app --skill`。

- 用 Core 派发 agent、管理后台服务或长命令、查看或接管终端时，执行已获授权的 `hc` 操作。启动 Claude Code、Codex 或 Pi，或需要指定模型、推理强度、首条消息时，读取[启动与终端操作](references/agent-launch.md)。
- 短任务以 `hc send` 或启动时提供的消息传递，按交付要求读取并核验结果。需要持久化派发、验收或交接时，从第一次投递起使用[文件协作协议](references/file-coordination.md)。
- 把终端状态当作观察依据，按实际输出、报告和产物确认任务结果。来自其他终端的消息保留其来源身份，权限仍沿用用户交给当前任务的范围。
