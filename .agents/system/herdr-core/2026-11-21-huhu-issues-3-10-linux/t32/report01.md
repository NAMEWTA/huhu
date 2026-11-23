# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t32（manifest 登记），实际执行终端 t3x
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t32/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t32/report01.md
- 执行结果 — done（代码与 E2E spec 交付，安装包执行验收待 Lead）

## 结论

| 切片 | 基线分类 | 本轮结果 |
| --- | --- | --- |
| W5.2 | 部分。Pi 已有确切 transcript 的恢复、分支、分栏目标和启动回执。 | 新启动提交原文件身份及版本，并分别展示恢复和分支的资格原因。原文件追加后，同一个已发送请求回读原会话，继续使用原分栏。Claude、Codex 保留扫描及预览，现有 ID 参数无法把启动绑定到所选文件，因此显示仅可预览的原因。 |
| `agent.catalog.detect` | 部分。已有缓存，冷读和旧刷新参数会执行版本探针。 | 工作台只读已缓存的可执行文件状态。显式工作台动作调用 `agent.catalog.refresh`。外部读取可逐项启用，`exposable: true`、`defaultExposed: false`，只返回可用性摘要。外部刷新继续关闭。 |
| W8.2 | 部分。多 Space、分栏、历史、任务、共享已有分段 spec。 | 新增 Linux x64 候选包连续用例，覆盖四向分栏、任务页人工派遣、原生问题、定位同一会话、工作区评审、退出重连、关闭及任务手工完成、关闭目标失败和 Pi 历史恢复。 |
| W8.3 | 部分。#5 T7.1 的已切换调用方和随包正常签收 spec 都在基线，截断内部 ACK 的 spec 此前固定跳过。 | 保留现有调用方，复用回环 Responses 夹具。以指定派遣为范围，持久消费后截断内部 ACK，重新启用 Tasks 后检查相同回执、原会话与唯一评论。E2E 同时检查 helper 的 `agent_received` 和 Agent 的 `tasks_consumed`。 |

## 产物与改动

- 候选 `664996ad1cdaaf06f92938157bdf8614091e33c5`，父提交 `7cfed9bf6adafcb4843d3356c7dfbe3e85a40e8a`。工作树为 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-w4-agent` 仍指向父提交。业务工作树与候选逐文件一致，普通索引保持基线。未推送。
- 候选含 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/evidence/W5.2-W8-linux.md`。沙箱将工作树的 `.agents/` 置为只读，证据通过临时索引写入候选树。
- Tasks 消费路径单列。夹具位于 `plugins/tasks/src/engine/receipt-inbox.ts`。需本地进程显式设置 `HUHU_E2E_TASK_RECEIPT_ACK_GATE`、提供匹配的 `dispatch-id`，才在读取已提交的结果回执后暂扣 ACK。暂扣生成 `held.json`，移交回包由 `release` 恢复。
- 本轮无 Engine 装配改动。T7.1 当前生产路径由 Tasks 现有执行器进入 Agent CLI 内部入口。依照原有 #6 身份和策略，其消费能力仍不对外开放。

## 验证

每次用 Node 24.21.0、pnpm 12.10.1 和新建的 `XDG_RUNTIME_DIR` 运行 `pnpm exec vitest run <单文件>`。共 92 项通过。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 检测缓存、并发刷新、设置变更与启动参数 | 24 项通过 | `plugins/agent-cli/test/agent.test.ts`，`/tmp/huhu-t32-agent.test.log` |
| 源历史身份、修改与历史正文 | 13 + 4 项通过 | `plugins/agent-cli/test/history.test.ts`、`plugins/agent-cli/test/transcript.test.ts`，`/tmp/huhu-t32-history.test.log`、`/tmp/huhu-t32-transcript.test.log` |
| CLI/HTTP MCP 默认关闭、只读缓存与 Pi 来源版本重新读取 | 12 项通过 | `plugins/agent-cli/test/tool-exposure.test.ts`，`/tmp/huhu-t32-tool-exposure.test.log` |
| 隔离 Core 的显式刷新与启动回执，真实 Linux Codex 原生问答 | 1 + 1 项通过。使用 Core 0.1.19、受控 Codex ELF 0.170.0 与回环 Responses 夹具。 | `plugins/agent-cli/test/launch.live.test.ts`、`plugins/agent-cli/test/codex-native.live.test.ts`，`/tmp/huhu-t32-launch.live.test.log`、`/tmp/huhu-t32-codex-native.live.test.log` |
| Tasks 收件箱持久化、ACK 截断、重开回读和评论去重 | 37 项通过 | `plugins/tasks/test/persistence-http.test.ts`，`/tmp/huhu-t32-tasks-receipt.log` |
| 候选与工作树一致 | 临时索引核对，Git 空白检查通过 | 候选提交，证据文件按上述沙箱例外写入 |

## 未运行的验证

- `tests/e2e/workflows/task-journey.spec.ts` — **W8.2/W8.3 候选安装包：跨 Space 分栏、原生会话重连、消费 ACK 重交与历史恢复**。需 Linux x64、`HUHU_AGENT_WORKSPACE_ACCEPTANCE=1`、`HUHU_PACKAGED_EXE`、`HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT`、`HUHU_TASK_JOURNEY_PACKAGE_SHA` 和 `HUHU_CODEX_DISPATCH_BIN`。用例自建临时 provider HOME 和 Pi 输入，记录实际包 SHA、Core/Codex 版本、原生会话与回执身份。
- `tests/e2e/workflows/task-journey.spec.ts` — **T7.2 候选安装包：后台到期、原生问题同会话继续、一次结果与人工完成**。现有正常签收 spec 继续由 `HUHU_TASK_JOURNEY_ACCEPTANCE=1` 与候选包、SHA、独立受控 Codex 配置启用。
- `tests/e2e/shell.spec.ts` — **Agent CLI 历史：列出 Space 目录下 Claude 与 Codex 的原生历史会话（只读扫描），其他目录的会话不出现**。新增行操作禁用原因的可访问描述断言。
- `tests/e2e/shell.spec.ts` — **Agent CLI 历史：在 Windows 原生 Pi 上分支、恢复并跨 Space 定位原分栏**。现有真实 Pi 用例依赖 `HUHU_PI_HISTORY_E2E` 与本机 Core。
- 构建、打包、全仓门禁、Web/SSH 共享、平台和性能矩阵留待 Lead 使用同一安装候选验证。

## Modern Web Guidance

- `accessibility`。我用 `aria-describedby` 将恢复和分支按钮关联到可见的阻碍原因，沿用现有按钮和 Dialog（“programmatically associate it with the element using the `aria-describedby` attribute”）。所用属性可用于 Electron 与独立 Web 端。浏览器行为留待上述 E2E。

## 阻碍与接续

实施范围内无阻碍。候选包未生成，随包和跨平台验收待 Lead 在最终主线执行。

## Lead 验收

Lead 验收（2026-11-22）：通过。候选 `664996ad` 合入集成 `1c2f8089`。Lead 补跑：agent-cli/tasks/workbench/engine tsc、oxlint、oxfmt 通过；定向 vitest 与 E2E 见后续记录。注：`receipt-inbox.ts` 的 `HUHU_E2E_TASK_RECEIPT_ACK_GATE` 为生产代码中的环境变量测试缝，需绝对路径与匹配 dispatch-id 才生效，按随包验收夹具接受并记录。
  Lead 补跑（集成 `1c2f8089`）：vitest agent-cli 全目录 + tasks persistence-http + tool-access：15 文件 167 过，5 个 live 文件 8 项按环境跳过（实施者已带夹具跑 launch.live、codex-native.live）；`pnpm build`；shell.spec「Agent CLI 历史」Linux 用例 1 过，Windows Pi 用例跳过。W8.2/W8.3/T7.2 候选安装包用例留待最终 main 打包后执行。
