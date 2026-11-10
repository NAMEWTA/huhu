# W17 能力网关与 Agent 指南

## W17.1 MCP 服务（stdio 与 HTTP）

- 目标：外部 MCP 客户端通过 `huhu mcp` 或 HTTP 使用已开放能力、资源、模板与提示词；开放状态与插件启停实时生效。
- 依据：[plugins](../modules/plugins.md) §3；[interfaces](../interfaces.md) §2（MCP 额外暴露）；ACC-PL-01（MCP 部分）、05、06；ACC-SF-06。
- 前置：W03.6、W16.1。
- 位置：`plugins/mcp/{huhu-plugin.json,src/engine/{server,resources,prompts}.ts}`、`apps/cli/src/mcp-stdio.ts`、`packages/kernel/src/server/mcp-route.ts`。
- 复用：R-03（`mcp-http.ts`）、R-04（`cli/src/mcp/`）。
- 实现要点：工具由 `capabilities.list` 的可见集合生成（输入 schema 来自 zod 导出）；`tools/list_changed` 通知；资源 `huhu://vault/summary`、`huhu://notes/recent`、模板 `huhu://notes/{id}`；提示词 `daily-review`、`knowledge-synthesis`；stdio 模式 stdout 只写协议帧（pino 输出到 stderr）。
- 异常：Engine 断开时 stdio 进程返回工具错误并尝试重连；未开放能力返回错误结果。
- 测试：用官方 SDK 客户端的集成测试：列工具、调用、开放状态变化、插件停用；ACC-PL-05、06、ACC-SF-06。
- 完成：上述 ACC 通过。

## W17.2 CLI 命令集与安装

- 目标：interfaces §6 全部 CLI 命令；能力网关 CLI 页的安装与测试台。
- 依据：interfaces §6 CLI；plugins §3 CLI。
- 前置：W03.6、W08.1、W10.1。
- 位置：`apps/cli/src/commands/`、`apps/desktop/resources/bin/`、`apps/desktop/src/main/cli-install.ts`、`packages/workbench/src/pages/gateway/CliPage.tsx`。
- 复用：R-04、R-54。
- 实现要点：便捷命令映射到 `call`；`--json` 输出；退出码；`--skill` 输出内置指南；安装按平台（release §6）且需用户确认；测试台在 Engine 内用同一命令解析器执行（不启动子进程）。
- 异常：PATH 写入失败提示手动方式。
- 测试：每个命令的集成测试；安装脚本在三平台 CI 的冒烟。
- 完成：命令测试通过；`huhu --version` 与应用版本一致。

## W17.3 HTTP 服务、令牌、测试台与调用记录

- 目标：能力网关的服务端页、桌面宿主页、测试台、调用记录。
- 依据：plugins §3；ACC-PL-08。
- 前置：W03.4。
- 位置：`packages/kernel/src/gateway/`、`packages/workbench/src/pages/gateway/`。
- 复用：R-54。
- 实现要点：HTTP 服务开关、端口冲突处理、令牌创建（仅显示一次）与撤销；测试台 JSON 编辑器（CodeMirror JSON）；调用记录 DataTable 与清空。
- 异常：端口占用显示“端口冲突”并允许修改。
- 测试：ACC-PL-08；令牌撤销后旧令牌 401。
- 完成：ACC-PL-08 通过。

## W17.4 Agent 指南维护

- 目标：三份指南文件的生成、状态判定、自动维护与设置页操作。
- 依据：plugins §4；ACC-PL-07。
- 前置：W04.2、W17.2（CLI 命令表作为指南输入）。
- 位置：`plugins/agent-guide/{huhu-plugin.json,src/engine/{guide-state,maintain}.ts,src/ui/AgentAccessPage.tsx}`、`scripts/gen-guide.mjs`、`apps/desktop/resources/agent-guide/`。
- 复用：R-53。
- 实现要点：构建时由能力注册表与 CLI 命令表生成三份文件；状态八种判定；基线与备份；只操作三份文件；history 恢复设 needs-check（versioning 恢复 `.agents/skills/huhu/*` 时调用 agent-guide 服务）。
- 异常：只读 Vault 不写；写失败 error 并保留原文件。
- 测试：状态判定单元测试（原型 `builtin-guide-model.js` 的场景全部转为测试）；ACC-PL-07。
- 完成：ACC-PL-07 通过；ACC-WB-01 中指南文件创建部分通过。
