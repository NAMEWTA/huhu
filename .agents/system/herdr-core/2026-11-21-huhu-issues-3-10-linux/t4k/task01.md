# task01.md #7 本地 SSH Shell 的 Herdr Core 装配分析

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic 与 manifest — 同共享根下的 `topic.md`、`manifest.tsv`
- terminal_address — `t4k`，本机 `wta-ubuntu` 的默认 Core
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4k/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4k/report01.md`
- Lead — `t3p`，按同号报告收件。终稿发布后可用 `hc send t3p` 回告其路径。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`
- 接续依据 — 共享根 `t34/report01.md` 的真实终端宿主和 #7 H5.4。现有 SSH 候选文件正在合并，Lead 单独负责。

## 目标与输入

确定 #7 H5.4 如何复用现有 Herdr Core，使 SSH 本地 Shell 在关闭 Agent CLI 插件时仍可用。沿 `apps/engine/src/boot.ts` 的真实组装、`plugins/agent-cli/src/engine/herdr-core.ts`、`plugins/ssh/src/engine/{local-pty-herdr,local-shell}.ts`、`packages/herdr-client` 和 Engine 生命周期检查所有权。对照 Issue #7 H5.4 及 Huhu 已有实现。

## 读写范围与产物

- 业务代码只读。仅写本报告和同目录临时稿。Lead 独占 Engine 装配、共享描述符、插件注册和 TerminalView。
- 不运行 Node 应用、Vitest、E2E、构建、打包、全仓门禁或其他会启动引擎的命令。不调用真实凭据、Vault、服务或 Agent 历史。不修改分支、索引、远端，不启动子 agent。
- 报告给出适用的复用方案、确切接口和文件位置。说明 Core 的启动、停止、重启及 Vault/插件切换的归属，确认是否能复用一个 Core 配置目录，真实 attach 协议与 SSH 会话的重挂/关闭是否匹配。列最小有判别力的验证和仍未知事项。

## 验收与验证

以文件、行号、实际发行版本与调用链为证据。区分当前已有行为和建议改动，遇到架构选择列出选择理由。报告单列未运行的验证。按 Core 文件协作协议核对当前任务和不中途覆盖同号报告。

## Lead 验收

由 Lead 在复核后填写。
