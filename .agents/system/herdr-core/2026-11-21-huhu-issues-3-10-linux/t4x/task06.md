# #7 快捷命令库与安全预览

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，本机默认 Core `wta-ubuntu`，Lead `t3p`，终端 `t4x`
- 任务 `t4x/task06.md`，报告 `t4x/report06.md`
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-shortcuts`，基线 `31352cae87ad11d5f12c7a3d125bc2fe8aee5189`

按 `dev-build` 和已确认 Issue §6.2、H10、H5.2，完成快捷文本库。参考本地 Motty `internal/workbench/{snippets,snippet_groups,snippet_picker,snippet_send}.go` 的分组、可搜索、顺序和选择效果，复用 Huhu 当前输入控制、TerminalActions 与真实预览路径。范围是快捷命令正文，快捷键映射属于别片。此替代方案保持 Huhu 外观，禁用自动执行；选择快捷文本即填入当前输入与预览，应仍须指定当前/可见全部/勾选允许输入的目标并显式选择插入或发送并回车。沿用当前目标绑定和安全粘贴的控制字符限制，保持多行和 Unicode；选择新内容、旧会话换代、隐藏或失权时旧预览不能发送。ASCII/Unicode 控制检查共享给当前入口时保持原行为。

可写 `plugins/ssh/src/shared/shortcuts.ts`、`plugins/ssh/src/engine/shortcuts.ts`、`plugins/ssh/src/ui/ShortcutPanel.tsx`、`plugins/ssh/src/ui/TerminalActions.tsx`、一个直接相关单测和单独新增 `tests/e2e/ssh/shortcuts.spec.ts`。公共聚合契约、插件清单、Engine 入口、SSH 导航/装配继续由 Lead 写，新的模块内描述符和 handler 可在你的文件定义并注明建议导出。提供 `ssh.shortcuts.list` 与 `ssh.shortcuts.save`（如单文件整体 CAS 方便同组改顺序和并发；空输入得到新库），或同等明确合同。将库保存在 Vault `.huhu/ssh/shortcuts.json`，保留已存格式兼容和版本冲突，长度/总大小有界。桌面和独立 Web 工作台可以使用，不依赖桌面宿主，外部默认关闭；如果提供可开放能力，外部只管理快捷文本数据，不执行或获得终端权限。不会把正文写到审计事件、状态提示或日志。避免增加系统级快捷键配置或模板执行。

前端先运行 `zh-modern-web-guidance` 的 search 和 retrieve，报告实际用到的规则。测试用隔离 Vault 和无副作用文本。只运行一个相关 Vitest 文件和受影响包类型检查；E2E 仅写，不构建、打包、启动 Electron 或 Playwright，不并发其他任务。报告实际文件/变更、运行命令、明确尚未验证范围、上游版本与许可。可在已接线预期的 E2E 中列假设由 Lead 集成。完成后只保留对应文件并给出可复核 SHA 或最终明细。无远端操作。
