# t28 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t28
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t28/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t28/report01.md
- 执行结果 — blocked

## 结论

Agent CLI 40 个用户动作和 `tasks.dispatch.targets` 已支持单项开放，初始关闭。Tasks 目标快照在冷、热夹具均通过 CLI 和 HTTP MCP。随包 Herdr Core 的原生回执联验三项通过。

`agent.catalog.detect` 继续供工作台查询，当前保持关闭。t19 第 159 行要求改为 execute。Dispatcher 会在 handler 之前检查幂等键，现有 Agent、Tasks 和 Automations 工作台查询使用 read 路径且不提供该键。该项需 Lead 协调调用方调整。此外，Windows 的受保护宿主成功启动需要在 Windows 实测。本轮 Linux 测了已有工作台预览的脱敏投影和错误批准拒绝。

## 逐 ID 结果

表中的“开”表示 `exposable: true`，“关”表示 `exposable: false`。所有项 `defaultExposed: false`。“稳定键”指 CLI `--intent-key` 或 MCP `_meta["huhu.dev/intent-key"]`。测试列对应 Agent 双入口用例的标题片段，均位于 `plugins/agent-cli/test/tool-exposure.test.ts`。Tasks 和 Core live 的独立文件列在验证中。

| 能力 ID | 开放 / 默认 | 最终 scope / risk | 意图 | 对象校验或关闭理由 | 测试 |
| --- | --- | --- | --- | --- | --- |
| `agent.targets.list` | 关 / 关 | read / normal | 无 | t19 第 144 行，仅 Tasks 内部候选解析 | 默认关闭；Tasks 目标快照 |
| `agent.runs.dispatch` | 关 / 关 | execute / high | 内部 dispatchId | t19 第 145 行，私有执行委托，公共入口为 Tasks 派遣 | 默认关闭；原生回执联验 |
| `agent.runs.inspect` | 关 / 关 | read / normal | 无 | t19 第 146 行，内部受理状态，公共入口为 Tasks 派遣回读 | 默认关闭；原生回执联验 |
| `agent.runs.answer` | 关 / 关 | execute / high | 内部回答标识 | t19 第 147 行，原生回答与输入权仲裁 | 默认关闭；原生回执联验 |
| `agent.runs.answer.inspect` | 关 / 关 | read / normal | 无 | t19 第 148 行，借 Tasks 回读原生回答 | 默认关闭；原生回执联验 |
| `agent.runs.stop` | 关 / 关 | execute / high | 内部 stopId | t19 第 149 行，原轮停止委托 | 默认关闭；原生停止 live |
| `agent.runs.stop.inspect` | 关 / 关 | read / normal | 无 | t19 第 150 行，只为 Tasks 核实原停止动作 | 默认关闭；原生停止 live |
| `agent.spaces.list` | 开 / 关 | read / normal | 无 | 本机 Vault 的 Space 与现有绑定 | 默认关闭、无副作用读取 |
| `agent.spaces.save` | 开 / 关 | write / high | 稳定键 | 已有版本、Vault 内新目录、拒绝活动会话换根 | 外部设置回执脱敏 |
| `agent.spaces.delete` | 开 / 关 | write / high | 稳定键 | 版本与运行或待核实会话，移除 Space 及 Huhu 固定记录 | 外部设置回执脱敏 |
| `agent.catalog.detect` | 关 / 关 | read / high | 无 | t19 第 159 行为待实施 execute / high，需改现有无键调用 | 默认关闭；生命周期范围见阻碍 |
| `agent.settings.get` | 开 / 关 | read / high | 无 | 配置摘要排除命令、参数与环境值 | 默认关闭、无副作用读取 |
| `agent.settings.update` | 开 / 关 | admin / high | 稳定键 | 本机 provider 和可执行文件，整份设置版本 | 外部设置回执脱敏 |
| `agent.launch.environments.preview` | 开 / 关 | read / high | 无 | 工作台预览快照、Space / 环境 / 设置版本，隐藏批准值 | 无副作用读取；会话、布局和审查 |
| `agent.launch.resolve` | 开 / 关 | read / high | 无 | 外部仅预览，隐藏环境、标准输入与本机定制参数 | 默认关闭、无副作用读取 |
| `agent.sessions.recover` | 开 / 关 | write / normal | 原 requestId | 选定 Space、原启动及逻辑会话，查 Core 原回执 | 会话、布局和审查 |
| `agent.sessions.launch` | 开 / 关 | execute / high | requestId | Space 版本、cwd、provider 与逻辑主体。外部自定义 shell 命令拒绝 | 会话、布局和审查 |
| `agent.workspace.launch` | 开 / 关 | execute / high | requestId | 同一启动条件，加布局版本及 tab/leaf 约束 | 会话、布局和审查 |
| `agent.workspace.launchProtected` | 开 / 关 | execute / high | requestId | 已在工作台核对的批准，原环境、cwd、argv 和布局 | 会话、布局和审查，Linux 风险拒绝分支 |
| `agent.sessions.output` | 开 / 关 | read / high | 无 | Space 与进程代次、已有 Core 本地连接及脱敏材料 | 会话、布局和审查 |
| `agent.sessions.release` | 关 / 关 | execute / high | 原内部 requestId | t19 第 169 行，仅 Automations 清理已结束的受保护终端 | 默认关闭；Automations 回归 |
| `agent.sessions.list` | 开 / 关 | read / normal | 无 | 本机现存 Space 和目录内记录，外部不做对账写入 | 无副作用读取；会话、布局和审查 |
| `agent.sessions.interrupt` | 开 / 关 | execute / high | 稳定键 | 原会话代次与任务/人工输入权 | 会话、布局和审查 |
| `agent.sessions.kill` | 开 / 关 | execute / high | 稳定键 | 原会话代次与任务/人工输入权 | 会话、布局和审查 |
| `agent.sessions.rename` | 开 / 关 | write / normal | 稳定键 | Space 版本与会话记录版本 | 会话、布局和审查 |
| `agent.core.status` | 开 / 关 | read / normal | 无 | 仅已有连接或报告空闲/不可核实 | 默认关闭、无副作用读取 |
| `agent.core.restart` | 开 / 关 | admin / high | 稳定键 | 持久 Core ID 与当代 PID，重启后核对 PID 变化 | 会话、布局和审查 |
| `agent.history.list` | 开 / 关 | read / high | 无 | 选择 Space，按本机来源、provider 与目录范围筛选后分页 | 无副作用读取；Pi 历史 |
| `agent.history.read` | 开 / 关 | read / high | 无 | 来源文件标识、native ID、provider、版本及真实目录 | Pi 历史 |
| `agent.history.pin` | 开 / 关 | write / normal | 稳定键 | 已选历史记录、原版本，更新 Huhu 标记 | Pi 历史 |
| `agent.history.resume` | 开 / 关 | execute / high | requestId | 历史来源、版本、provider 支持及目标 Space | Pi 历史 |
| `agent.history.workspaceLaunch` | 开 / 关 | execute / high | requestId | 历史来源与目标布局绑定 | Pi 历史 |
| `agent.history.locate` | 开 / 关 | read / normal | 无 | 原历史、原终端及现有分栏，复用已连接 Core | Pi 历史 |
| `agent.review.diff` | 开 / 关 | read / high | 无 | Space 版本和目录身份，读取工作台缓存的 Git 快照 | 无副作用读取；会话、布局和审查 |
| `agent.review.comments` | 开 / 关 | read / high | 无 | 指定 Space 的原会话记录 | 会话、布局和审查 |
| `agent.review.comment.add` | 开 / 关 | write / normal | 稳定键 | 会话版本、diff 版本、原路径与行 | 会话、布局和审查 |
| `agent.review.comment.delete` | 开 / 关 | write / high | 稳定键 | 会话版本与原评论，待核实发送保留证据 | 会话、布局和审查 |
| `agent.review.send` | 开 / 关 | execute / high | 稳定键 | 会话、输入权、原评论清单和发送标记，dryRun 零终端输入 | 会话、布局和审查 |
| `agent.launch.environments.list` | 开 / 关 | read / high | 无 | 本机环境记录，变量名及状态，外部不接触系统密钥库 | 无副作用读取；外部设置回执脱敏 |
| `agent.launch.environments.save` | 开 / 关 | admin / high | 稳定键 | 环境实体/版本与现有凭据所有权 | 外部设置回执脱敏 |
| `agent.launch.environments.remove` | 开 / 关 | admin / high | 稳定键 | 原环境实体及版本 | 外部设置回执脱敏 |
| `agent.workspace.files.list` | 开 / 关 | read / normal | 无 | Space 版本、真实路径、Vault 外仍限桌面 | 默认关闭、无副作用读取 |
| `agent.workspace.files.open` | 开 / 关 | read / high | 无 | 同一范围与文件身份，保护目录和边界检查 | 默认关闭、无副作用读取 |
| `agent.workspace.get` | 开 / 关 | read / normal | 无 | Space 与已有 Core 本地连接，冷时空布局或不可核实 | 无副作用读取；会话、布局和审查 |
| `agent.workspace.save` | 开 / 关 | write / normal | 稳定键 | Space 版本、布局版本、同 Space 会话 | 会话、布局和审查 |
| `agent.workspace.close` | 开 / 关 | execute / high | 稳定键 | Space、布局、leaf 和会话，结束进程另需 kill 授权及代次 | 会话、布局和审查 |
| `agent.workspace.worktrees.list` | 开 / 关 | read / normal | 无 | 现有 Git 快照与授权 Space 目录身份 | 默认关闭、无副作用读取 |
| `agent.workspace.worktrees.open` | 开 / 关 | write / normal | 稳定键 | 已有仓库、真实成员及其 Vault 范围或现有绑定 | worktree 创建与打开 |
| `agent.workspace.worktrees.create` | 开 / 关 | execute / high | 稳定键 | 仓库、授权空目录及新分支，结果不明时保留 unknown | worktree 创建与打开 |
| `tasks.dispatch.targets` | 开 / 关 | read / normal | 无 | 选定本机 Vault 的 Space，外部路径只读快照 | Tasks 目标快照 |

## 产物与改动

- 候选提交 — ，父提交 `d7581825`，工作树分支 `impl/huhu-issues-3-10-g6-agent`。
- 证据 — `.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G-agent-cli-exposure-linux.md`。工作树的 `.agents` 由沙箱设为只读，证据直接写入候选树，快进后可读。
- Engine 装配 — 候选内只有一行 boot 静态声明变化，`registry.declareDescriptors("agent-cli", agentCli.agentToolDescriptors)`。该集合含 41 个 descriptor（上表 Agent 的 40 个开项和 `agent.catalog.detect`）。索引内 `mainAgentDescriptors` 加上启动环境、布局、工作区文件与 worktree 导出的描述，均由领域注册函数 bind 同一对象。8 个内部名使用清单与原注册。Tasks 按原 `taskToolDescriptors.dispatchTargets` declare 和 bind。
- 插件清单补入 `agent.history.locate`、`agent.history.workspaceLaunch`。Tasks 改动限目标入口、其错误传递及目标夹具。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Agent 双入口与 C05 | 13 项通过。10 条参数化 Agent 用例覆盖逐 ID 默认关、开放、撤销、对象错配、热/冷快照、并发与领域回读。持久写项在各自入口重新开放并重启，回放相同 opId，业务快照不变。HTTP MCP 恢复后领域启动重交 unknown，原会话只读回读。 | `/tmp/huhu-t28-replay.log` |
| Tasks/Automations 原矩阵及快照 | 61 项通过。追加的两个真实入口验证冷、热、缺失 Space 与撤销。同一目标查询无 spawn、Core ensure/peek、连接、RPC、实时会话资格核对和 Vault 写入。 | `/tmp/huhu-t28-task-retest.log` |
| 随包 Core 0.1.19 | Agent 定向套件 127 项通过、1 项跳过，其中要求的 `native-receipts.live.test.ts` 三项均通过，最终候选用同一随包二进制单文件复跑仍为 3 项通过。 | `/tmp/huhu-t28-agent-live.log`、`/tmp/huhu-t28-native-final.log` |
| 仓库静态门禁 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 通过，最后的 Agent 测试增强单独复跑 Agent 类型检查。 | `/tmp/huhu-t28-typecheck-final.log`、`/tmp/huhu-t28-agent-typecheck.log`、`/tmp/huhu-t28-{lint,format,knip}-final.log` |
| 全量共享锁门禁 | 1802 项通过、19 项跳过。全量执行时业务代码已固定，随后增强的回放断言由同一工作树的定向矩阵复跑。 | `/tmp/huhu-t28-full.log` |

## 阻碍与接续

- `agent.catalog.detect` 还需迁移 `plugins/agent-cli/src/ui/Agent{CliModule,SettingsPage}.tsx`、`plugins/tasks/src/ui/TaskEditor.tsx`、`plugins/automations/src/ui/RuleEditor.tsx` 及无键读调用测试。协调后可把当前主动探测定为独立 execute 工具，并给工作台保留纯读取的探测快照入口，或者在现有工作台调用明确使用 execute 所需的幂等键。
- Windows 的真实受保护启动成功链路待验证。Linux 双入口检查工作台快照的安全投影与错误批准拒绝。Git 与受保护预览快照靠工作台产生，冷路径无已核实快照时显示不可用。
- 工作台原审查预览仍通过 `agent.review.send` 的 dryRun 回传正文。对外持久操作使用安全投影。若要把工作台预览移出旧逐请求幂等缓存，需要同步工作台改用读入口。

## Lead 验收

## Worker 补记

候选提交对象为 `18fe0ca72cc9b2284281f57a1e42dc112edcaa35`，父提交为 `d7581825`。上文候选提交栏的 SHA 在发布时留空，以此处为准。

Lead 验收（2026-11-22）：通过。候选 `18fe0ca7` 快进到 `impl/huhu-issues-3-10-g6-agent`，合入集成 `eaa5545a`；合入后 agent-cli+tasks（含 native-receipts live）200 过 1 跳过。保留：`agent.catalog.detect` 维持关闭（工作台读路径无幂等键，迁移工作台调用后再开）；Windows 受保护启动成功链路待 Windows。终端 t28 关闭。
