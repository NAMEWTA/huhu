# #6 D01 单入口任务链测试交付

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- 会话 — Lead t3p，worker t10f，wta-ubuntu
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10f/task01.md
- 报告文件 — /home/wta/projects/huhu/temp/issue-worktrees/agent-linux/temp/final-audit/t10f-report01.md
- 执行结果 — done，已补写用例并静态复核，待 Lead 运行验收
- 工作树 — agent-linux，分支 impl/huhu-mail-graph-completion，基线 4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030

## 产物

[plugins/agent-cli/test/native-receipts.live.test.ts](../../plugins/agent-cli/test/native-receipts.live.test.ts#L446) 新增两个参数化用例。每个用例有独立的测试 Vault、Engine 和 Core，通过现有合成 Codex App Server 与真实 Tasks 回执通道完成一条任务链。

- `CLI-only creates, edits, dispatches, answers and reads one result in the original Core session` 使用 CLI 的 `run` 命令入口，指定测试 Vault，验证来源为 `external/cli`。
- `HTTP MCP-only creates, edits, dispatches, answers and reads one result in the original Core session` 使用实际 `/mcp` HTTP 会话和 `tools/call`，验证来源为 `external/mcp`。
- 桌面令牌用于测试环境准备（获取测试 Space、停用 Automations、配置网关授权）。Core RPC 与本地回执文件提供独立旁证。原 MCP／CLI 交叉链、现有 provider 夹具和生产文件均未改动。没有暂存或提交。

## 覆盖映射

| 验收要求 | 用例中的断言 |
| --- | --- |
| D01 / G5b.1 授权和身份 | HTTP MCP 默认 404，开启后建立 MCP 会话。两条链都在创建、编辑、派遣和回答各自授权前检查拒绝。通用 `tasks.create` 开放时仍需单独授予 `tasks.agent.create`，才能创建指定 Space 的 Agent 任务。 |
| D01 创建与稳定意图 | 通过支持持久意图的 `tasks.create` 创建 Agent 任务，CLI 用 `--intent-key`，HTTP MCP 用 `_meta["huhu.dev/intent-key"]`。同键重交返回同一任务和操作 ID，同键异载荷报 `IDEMPOTENCY_MISMATCH`，任务列表只有该任务。 |
| D01 编辑与派遣 | 同入口用 `tasks.update` 修改标题和正文，确认读回新正文、版本、输入修订及输入哈希。旧输入派遣报 `VERSION_CONFLICT / stale_input`。编辑后的正文与原生 provider 接收回执的 SHA-256 相符。重复派遣保留原任务、派遣、事件、运行及尝试。 |
| D01 原问题与回答 | `tasks.questions.list` 取得原运行的原生问题与选项。首次回答提交后丢弃 CLI 输出或取消读取 HTTP 响应体，再按原任务、运行、会话、问题版本与回答 ID 对账。缺少匹配 provider 证据时为 `unknown`，重交沿用原回执，异回答冲突。匹配证据到达后为 `accepted`，保留原受理时间。 |
| G5b.1 重复取消 | 原轮已经运行时，两次排队取消返回同一 `cancelRequested` 回执。原轮继续完成并读回结果。 |
| D01 原 Core 会话与唯一结果 | 从同一入口读取关闭的问题、唯一回答与唯一结果，运行显示 `succeeded/delivered`。真实 Core 返回原实例和终端地址，Tasks 的两份 `tasks_consumed` ACK 绑定同一 Vault、运行及会话。合成 provider 日志正好一条 turn 输入和一条对原生请求 0 的指定选项回答。 |
| 独审第 1 项 | 两条业务链分别从单入口走完，每条都包含编辑，原交叉链保留。 |

首次回答回执丢失模拟发生在 Engine 存活时。新 HTTP MCP 用例沿用其已认证会话，原交叉链继续覆盖 Engine 重启后对账。这两条用例使用合成 App Server。真实 provider、安装包和 D09 桌面／Web 刷新证据由其他场景验收。静态排查未发现需要修改生产接口的确定性阻碍。

## 验证

已格式化该单文件，并检查实际 diff 与 `git diff --check -- plugins/agent-cli/test/native-receipts.live.test.ts`。改动限于文件头导入与新增用例。

### 未运行的验证

- 新增 CLI-only、HTTP MCP-only 用例，及同文件原有用例。Lead 可在资源释放后使用 `HUHU_AGENT_LAUNCH_TEST_BIN=<随包 Herdr Core 的绝对路径> pnpm exec vitest run plugins/agent-cli/test/native-receipts.live.test.ts -t 'creates, edits, dispatches, answers and reads one result'` 定向运行。
- 单元及集成套件、全仓类型检查、Electron／Playwright E2E、构建和打包均未运行。本交付没有为上述验证记录通过。

## Lead 验收

待 Lead 验收。
