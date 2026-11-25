# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task08.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task08.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report08.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 `069-tw7.md`、`033-tw2.md` 和 `046-tw6.md`
- 执行结果 — done

## 成果与运行指针

- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，起点 `21e3e7fc`。
- 提交 — TW7 `8206568a`，TW2 `d6bb2a29`，TW6 `31a7f1b7`。每票完整文件列表可用 `git show --stat <提交>` 查阅。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task08/`。
- 定向文件逐一运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`，每次启动前核对 `MemAvailable ≥ 12 GiB`。测试使用 Node 24.22.1；TS 保持 ES2023。

### TW7 · 同 Engine 常驻

- 改动包括 `apps/cli/src/{connect,main}.ts`、`apps/engine/src/{boot,main,local-control}.ts`、`packages/vault/src/engine-endpoint.ts`、`apps/desktop/src/main/engine-supervisor.ts` 和 Linux 安装启动脚本 `apps/desktop/resources/bin/huhu`。
- `huhu engine start --vault <路径> [--mode temporary|resident]` 默认常驻。使用 `huhu engine status --vault <路径>` 和 `huhu engine stop --vault <路径>` 查询或有序停止。三条命令均支持 `--json`；普通 CLI 无现有 Engine 时仍走 60 秒空闲退出。
- 发现记录绑定物理 Vault 根、Vault ID 和本次实例。桌面 Main 通过同一 OS 用户私有 Unix socket 握手，退出或切换 Vault 时解除附着。已经运行的常驻进程继续服务。桌面自行启动的临时 Engine 仍走原有有序停止。生命周期写入和回收使用原有 Vault 写者锁，Engine listener 沿用 UX13 的实际端口。
- 真实 Linux 子进程覆盖并发重复启动、普通 CLI 附着、模式不兼容、跨 Vault 复制描述后的拒绝、固定端口重启、临时空闲退出。无页面时触发了 Automations 通知，任务停机期间到点后在重开时补发，停用的任务提醒保持关闭。再次重开只保留各一次通知。
- 待 Lead 运行 `tests/e2e/workflows/engine-lifecycle.spec.ts` 的「TW7 桌面附着当前常驻 Engine，退出工作台后同一端点继续服务」。组合 J18 仍需核对独立 Web、实际桌面重开，以及跨领域计划的删除和离线补偿语义。

### TW2 · 目标与真实执行

- 改动包括 `packages/contracts/src/kinds/task.ts`、`plugins/agent-cli/src/engine/{dispatch-capabilities,dispatch-store,dispatch,capabilities,index,spaces,sessions,codex-dispatch}.ts`、`plugins/agent-cli/src/engine/codex-dispatch-helper.cjs` 和 `plugins/tasks/src/engine/{index,agent-dispatch-executor}.ts`。
- 新 Task 配置可选择 `read-only` 或 `workspace-write`，旧记录按只读默认使用。当前可验证的写入路径为 Linux x64、固定 Codex 二进制、受控新会话。专用 Space 的本机批准由桌面身份调用 `agent.spaces.dispatchWriteApproval`，绑定 Space 修订和目录身份；可随时撤回。候选、会话启动和首轮发送核对相同范围，Helper 启动时检查 App Server 实际返回的沙箱和权限。撤回后停止该写入会话。已有可写会话不会被只读目标复用。
- `tasks.dispatch.targets` 返回目标与 profile 的能力状态及原因，分别表达交互、派遣、会话、结构化证据、停止、工作区、命令和 MCP。厂商未知能力标为条件限制、待运行确认或不支持。MCP 范围留待 P6 的任务级授权联验。 [Codex App Server 沙箱协议](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/permissions.rs)
- 真 Herdr Core 和官方 Codex 0.170.0 使用隔离 HOME、真实临时工作区和本机 HTTP 响应夹具。工作区命令实际创建 `proof.txt`，范围外的写入被拒，工具回包可查。批准前和撤回后写入能力不可用，撤回后原会话退出。原生问答还覆盖新会话和复用已验证活会话。
- 本票新增行为通过定向 Vitest 验证。候选联验可用 `tests/e2e/workflows/external-agent-desktop.spec.ts` 中的「CLI-only 同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果」和「HTTP MCP-only 同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果」，以及 J16 的本地、内置和受控外部三类工具证据。

### TW6 · 上下文与资源

- 改动包括 `plugins/tasks/src/engine/{dispatch-store,dispatch,receipt-inbox,service,index,agent-dispatch-executor}.ts`、`apps/engine/src/boot.ts`、`packages/vault/src/device-dispatch-budget.ts` 和 `plugins/agent-cli/src/engine/{sessions,index}.ts`。
- 进度摘要沿用任务评论。工作台可在 `tasks.dispatch` 明确选取消息和关联文本产物，受理时冻结选中内容及文件版本。派遣中等待、重开、同意图重交均沿用该快照。进行中的任务可用 `newRound: true` 明确开始独立新轮次并保留前序关系。仍活动或待核实的原轮次会阻止新轮次，原生待答继续由旧会话处理。摘要不改 Task 输入修订。
- 在同一 Linux OS 用户下，本机配置使用 `$XDG_CONFIG_HOME/huhu/dispatch-limits.json`，缺省查找 `~/.config/huhu/dispatch-limits.json`。可分别设置 `active` 与 `retained`。未配置时沿用现有调度，无设备上限数值。启动时读取配置，使同一配置下的 Vault 共享设备名额。更改后重新启动相关 Engine。活动名额与规则名额共同核对，保留进程名额在启动前争用。没有终止证据的未知运行保持占位，原生等待释放活动名额但仍计入保留进程。
- `tasks.dispatch.resources` 读取 Vault 侧活动、原生等待、待核实和排队数量及最早记录时间，同时给出设备侧配置值和实际占用。调度轮复用一次回执扫描，资源查询不发起新的 Core 观察。
- 测试覆盖两个 Vault 的两条规则竞争同一个活动名额、原生等待释放、未知占位、八个并发查询无新增 Core 调用，以及重启后所选文本版本和新会话的派遣身份。真 Codex 测试核对活动为零时仍有一个保留进程，以及确认退出后保留名额归零。
- 本票新增行为通过定向 Vitest 验证。J22 的真实多页面成本及展示应使用组合候选，现有 `tests/e2e/workflows/external-task-web.spec.ts` 的「D09 同包 CLI 创建与 MCP 修改的同一任务刷新到桌面和 Web」只复核跨宿主任务投影。上下文选择和资源展示由后续页面任务消费已交付接口。

### 定向验证

| 文件 | 最终观察 |
| --- | --- |
| `apps/cli/test/engine-lifecycle.test.ts` | 1 通过 |
| `apps/desktop/test/engine-supervisor.test.ts` | 6 通过 |
| `apps/engine/test/endpoint-contract.test.ts` | 4 通过 |
| `apps/engine/test/engine.test.ts` | 50 通过 |
| `apps/cli/test/cli.test.ts` | 17 通过 |
| `plugins/agent-cli/test/codex-native.live.test.ts` | 3 通过，含本地命令与保留进程 |
| `plugins/agent-cli/test/spaces-package.test.ts` | 3 通过 |
| `plugins/agent-cli/test/tool-exposure.test.ts` | 12 通过 |
| `plugins/tasks/test/agent-dispatch-executor.test.ts` | 3 通过 |
| `plugins/tasks/test/persistence-http.test.ts` | 45 通过 |
| `plugins/automations/test/task-scan-occurrences.test.ts` | 29 通过 |
| `plugins/automations/test/service.test.ts` | 46 通过 |
| `apps/engine/test/task-dispatch.live.test.ts` | 2 通过 |
| `apps/engine/test/codex-dispatch.live.test.ts` | 1 失败，TW2 前后的同一夹具均未列出指定冷恢复目标 |

- Core 测试设置 `HUHU_AGENT_LAUNCH_TEST_BIN=$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core`。真实二进制配本地模型响应的测试另设 `HUHU_CODEX_NATIVE_TEST_BIN=/home/wta/projects/huhu/temp/dev/codex-0.170.0/codex-x86_64-unknown-linux-musl`，启动时按固定 SHA-256 核对。
- TW7 日志在运行根及 `tw7-recheck/`。TW2 的冷恢复夹具对照在 `tw2-baseline/` 与 `tw2-recheck/`。TW6 首次合并调度扫描后发现回答重放与规则名额缓存不同步，修复后文件 45 通过，见 `tw6-rule-recheck/`。最终原生验证见 `tw6-committed/`，其余回归见 `tw6-final/`。

## 阻碍与接续

- 冷恢复合成用例 `apps/engine/test/codex-dispatch.live.test.ts` 在 `8206568a` 和 TW2 均走过原回执后，未找到测试预设的历史目标。待按 J18 核对正式候选的真实持久历史及原 App Server 确已退出。上述已通过的活会话复用使用不同证据。
- 本批未运行 Playwright、浏览器性能采样、打包、类型检查和全量验证。真实线上模型、Claude/Pi 受控执行、外部 MCP 委派和服务均未验证。CLI 常驻宿主的桌面专用邮件附件 IPC 与浏览器 OAuth 桥接仍需联验。
- 建议 Lead 串行检查 `@huhu/contracts`、`@huhu/vault`、`@huhu/engine`、`@huhu/cli`、`@huhu/desktop`、`@huhu/plugin-agent-cli`、`@huhu/plugin-tasks` 和 `@huhu/plugin-automations`。

## Lead 验收

- Lead 2026-11-25：TW7/TW2/TW6 通过（类型修复 497f84ca 已合入）；codex-dispatch.live 失败经 bisect 归 F09，转 task09。清单转 task09。
