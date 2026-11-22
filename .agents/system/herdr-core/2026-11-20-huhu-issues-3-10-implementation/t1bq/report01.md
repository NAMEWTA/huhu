# W5 原生历史的精确绑定

冻结对象 `7ff591a0ff797c3205e50a3d788173c783164723`。建议先修 Pi 的选择、读取与启动链，同时收紧 Claude 和 Codex 历史抽屉的启动资格。**对已经发生的同路径换件，Pi 可以在提交启动前拒绝。若验收要求覆盖到 CLI 实际打开文件的最后一刻，现有 Pi 参数也只能给出路径级保证。** 两项 P2 都能用隔离样本观察到。[原复核](../t1bh/report05.md) · [W5.2 验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W5.2-history-restore.md)

| Provider | 可保留的用户路径 | 当前历史抽屉的恢复、分支资格 |
| --- | --- | --- |
| Pi 1.5.2 | 同一源文件正常追加后仍可预览、在原 cwd 续开；可在目标 Space 分支，再定位已绑定的原 Pane | 实际 CLI 支持对应路径参数、源文件和源 cwd 身份复查通过时，可保留已有路径启动。需要跨进程原子保证的场景仅预览。 |
| Codex 0.171.0 | 预览选中的 rollout；已有可核实的运行中 Pane 仍可定位 | 当前交互命令按 UUID 查找，恢复和分支均仅预览。实验性显式路径 RPC 已在隔离 legacy 样本走通，可供后续专用入口验证。 |
| Claude Code | 在有效项目存储内按选中文件预览 | 本机 PATH 与 Huhu 默认安装候选目录均未找到真实 CLI。官方交互入口按 ID 或名称恢复，分支沿用该选择。本轮两项动作仅预览。 |

## Pi 的最小改动

1. **在扫描文件的同一个打开句柄上建立快照。** 将 `headLines(file)` 改为对已打开 fd 的有界读取；用 `fstatSync(fd, {bigint:true})` 检查普通文件，复用 `filesystemIdentity` 的 `dev:ino`，加上可用且稳定的 `birthtimeNs` 以降低文件号复用风险。核对路径仍在配置的规范存储根内、路径身份与 fd 一致，拒绝链接换向。以带版本的元组生成对外仍为 64 位十六进制的选择摘要，包含来源机器/存储、provider、native ID、规范文件路径、文件身份、header 原始绝对 cwd 及其规范 cwd。原始字符串可区分被改写到同一目录的别名；规范 cwd 用于 Space 归属，目录换代需要防护时复用 `directoryInstance`。按打开句柄取得的 mtime 排序；大小、mtime、ctime、全文摘要均不参与稳定选择身份。引擎显式投影公开字段，仅返回摘要及展示所需数据。[冻结扫描器](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L149) · [项目已有身份函数](../../../../../temp/issue-worktrees/integration/packages/vault/src/identity.ts#L5)
2. **把列表当时的选择带到 read、pin、locate 和两种 launch。** `historyReference` 收到摘要后，按当前配置和可见 Space 重新打开候选，重新计算并精确比对。旧摘要过期时提示重新选择；缺摘要的旧调用只能重新枚举供用户确认。三秒列表缓存只服务展示。预览核验 header 与身份之后，将同一个 fd 传给现有 `readTail`，按当时长度有界读取，并在 finally 关闭。这样把路径换成另一个文件也读不到替换件；若需要检测读取期间已经换名，返回前再次核对路径与 fd，失配时丢弃结果。无稳定文件身份时可显示列表时已截取的有界只读预览；若未保存该快照，应刷新重选，绝不能用旧行打开此刻的同名文件。[选择与缓存](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L559) · [现有尾部读取](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/transcript.ts#L43)
3. **把源 cwd 与启动 cwd 分开冻结。** `launchHistory` 在 Engine 内构造来源证明，随现有 `history.sourceId`、规范文件路径和 requestId 进入 launch intent。续开用源 cwd 和 `--session <source>`；跨 Space 分支保留源 cwd 作校验，启动 cwd 取目标 Space，仍传 `--fork <source> --session-id <child>`。保留 Space revision、布局版本、请求去重及已有 attempt 的对账语义。新 attempt 在首次登记前及 `identifyCore` 返回后、提交 `terminal.run` 前各复查一次；第一次失败不登记，第二次走 `confirmNotCreated`，均不发启动 RPC。受控/其他入口若将来接收历史，也须在自己的最终提交路径执行校验。新分支绑定新 child，不能把父 historyId 登记为子记录；拿到生成文件时核对 child ID、目标 cwd 与 `parentSession`，再关联子文件。定位沿用现有唯一运行会话、Core 归属、terminal 与布局叶子检查。[历史构造](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L583) · [参数](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/launch.ts#L149) · [两次复查及提交](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L481)
4. **旧 pin 继续作为书签。** 现有 `pins.json` 按 Space 保存，既有旧摘要 `H(provider,id,path,realCwd)`，也有更早的 `provider:id`。扫描时可计算旧别名，只在相应范围能无歧义映射时作旧书签展示；用户明确重新固定时写入新版摘要，并一次清理命中的旧别名，取消固定也清理这些键。旧 pin 只有位置或 ID 线索，无法证明升级之前的物理文件。若要求旧 pin 本身绝不随换件出现，则保留为待重新选择书签，不能静默迁移。新版 pin 只认新版摘要；旧启动请求、旧活动记录也不能靠书签、局部唯一或相同 cwd 升格为精确绑定。缺来源证明的在运行会话仍可从现有会话列表回原 Pane。[当前兼容逻辑](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L641) · [pin 写入](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/pins.ts#L24)

**交接给 CLI 的边界。** Pi 的 fd 属于 Engine；Core 启动的 CLI 会再次打开命令行里的路径。在最后一次检查后发生换件，两次乃至更多次 stat 都无法把检查与 CLI 的 open 合为一次。持有普通 fd 也没有跨平台的路径排他保证。若必须覆盖这个窗口，需要 provider 消费已验证句柄或在其实际 open 上验证预期文件身份，并让后续写入维持同一绑定。本轮未发现 Pi 1.5.2 的这种接口。把源文件复制到临时位置会改变原地续写或分支的父路径语义。文件身份解决的是换件；同一 inode 原地覆写且保留 header 是另一种情况，如需识别，可单独验证选择时已有字节的前缀，仍允许正常 append。

## 存储环境与 Codex、Claude 的入口

冻结版扫描从 `opts.history.env` 或 Engine 环境取根；启动时读取当前 settings 和实际可执行文件，在 `launch.ts` 合并 catalog 与用户 env，最后由 Core 启动。缓存只按 Space roots 区分。`canOpenHistory` 目前将 Pi 直接判可开，其余只看查询内唯一与 UUID 格式。其计数已受 Space、Claude bucket 筛选和每 provider 2000 文件上限影响。即使扩大扫描范围，也不能替代原生解析器。[环境读取](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L77) · [扫描范围](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L188) · [环境覆盖](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/launch.ts#L163)

最小做法是复用现有启动解析，将每个 provider 的**实际存储配置**提供给扫描、缓存和启动复查。配置包括可执行文件及版本、决定存储的有效 home、`CODEX_HOME`、`CLAUDE_CONFIG_DIR`、Pi 的 `PI_CODING_AGENT_SESSION_DIR` / `PI_CODING_AGENT_DIR` 以及能改变选择的参数（例如 Pi 的 `--session-dir` 优先于环境变量）。单独处理 Core 与 Engine 基础环境不同、Windows 环境键大小写、相对根随 cwd 改变及 wrapper/远端后端无法确认的情况。可将已确定的绝对存储根显式传给同一次启动；有歧义则仅预览。缓存按有效存储配置区分，设置改变时丢弃旧资格，只散列所需配置，不向客户端暴露环境秘密。列表及直接调用 `history.resume`、`history.workspaceLaunch` 共用同一资格判断，分别给出每个动作不可用的原因。CLI 缺失、停用、版本/所需选项未知或来源失效均不能产生新 Pane。已验证可定位的活动 Pane 走原有 locate 路径。

**Codex 的 UUID 解析确实可能跨出 sessions。** 本机 `resume --help` 标明 ID/名称，`fork --help` 标明 UUID，均没有选中 rollout 文件的交互参数。固定版 TUI 对 UUID 调 `thread/read(includeTurns:false)`。本地 store 的优先顺序包括活动 writer、SQLite、文件回退；`rollout/src/list.rs` 对 DB 路径读到相同 header ID 即可提前返回，随后才构造 sessions 搜索根。正常的 `thread/revert` 也可以保留 thread ID、切换 rollout。预检返回相同 id/path/cwd 只证明这一次读取；另起 TUI 会自行查找。即使禁止配置覆盖、扫描所有 Space 或在启动前直接读 SQLite，也无法锁定随后的选择。[TUI UUID 查询](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/tui/src/lib.rs#L748) · [store 优先级](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/thread-store/src/local/thread_rollout_resolver.rs#L68) · [固定版 list.rs](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/rollout/src/list.rs#L1290)

**Codex 有显式路径 RPC，但其输入仍是路径。** 固定版 `thread/read` 只接受 thread ID 与 includeTurns。`thread/resume.path`、`thread/fork.path` 是实验字段；对冷 legacy 会话可按路径载入。运行中的 resume 会核对活动路径，paginated 会话还要核对当前 rollout，再按 ID 载入模型上下文或准备分支。路径读取会重开文件，并容许压缩表示切换。协议没有设备号、文件号、预期 fd 或“比较文件身份并启动”的条件参数。后续若接入，应让**实际交互 Pane 使用执行该 RPC 的同一后端和返回的线程**，限定验证过的版本、存储类型与模式，并验证返回的路径、原始 cwd、源/子 ID 及绑定。fork 返回子路径与父 ID，出现同 ID 多源时，单看父 ID 仍有歧义。冻结版 `sessions.prepareLaunch` 只接受受控 Codex 新会话，另起一个普通 `codex resume <uuid>` 不能继承证据。[协议](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L368) · [按路径读与 paginated 核对](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L5126) · [fork 载入](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L5611) · [路径重解析](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/thread-store/src/local/read_thread.rs#L223)

**Claude 的当前证据止于存储与选择语义。** 官方说明 `--resume` 按 ID 或名称恢复，`--fork-session` 为恢复内容生成新会话 ID。Agent SDK 可按项目目录与 ID 读取、复制分支。官方说明未给当前交互入口提供按文件身份启动的契约。Orca 的参考代码处理旧 selector 和 shell 参数拼接，同样不能证明 CLI 打开了哪一个文件。本机未找到可复测的真实 Claude Code，因此没有本地 help 或原生启动结果。未来开放动作要以实际配置的 CLI 在隔离双库、重复 ID 和换件样本上的证据为准。[Claude CLI](https://code.claude.com/docs/en/cli-reference) · [官方 SDK 会话浏览与分支示例](https://platform.claude.com/cookbook/claude-agent-sdk-05-building-a-session-browser) · [Orca 参考实现](../../../../../temp/sources/orca/src/shared/agent-launch/startup/agent-resume-launch-command.ts)

## 实测与验收

| 本轮隔离实测 | 观察结果 |
| --- | --- |
| 冻结扫描器与 transcript 读取器，Windows、Node 24.21.0。同一 Pi 文件追加消息，再以相同 header 的独立文件替换原路径 | 追加后旧 historyId 与 `isPiHistoryFile` 均通过，物理身份相同，读到 `append-A`。关闭文件后换件，旧两项仍通过，物理身份改变，按旧选择读到 `replacement-B`。 |
| 真实 Codex 0.171.0。A 位于合成 CODEX_HOME/sessions，B 位于库外，两者有相同 UUID、cwd 及不同消息。以 stdio 初始化 app-server | 首次 `thread/read(includeTurns:true)` 返回 A 路径与 `selected-A`。只在隔离 `state_5.sqlite` 将该 UUID 的 `threads.rollout_path` 设为 B，重开服务后相同请求返回 B 路径与 `alternate-B`。 |
| 真实 Codex 实验性 RPC，在同一组 legacy 样本显式传 A 的绝对路径 | `thread/fork` 返回新子 ID、原父 ID，子历史包含 `selected-A`。另一轮先在同一服务读到 B，再调 `thread/resume(path=A)`，返回原 ID、A 的规范路径及 `selected-A`。额外更换原线程的 model provider 会被 CLI 拒绝，成功轮沿用原 provider。只初始化、查询与打开线程，未发起 turn、登录或调用外部模型。未检验 RPC 并发换件、paginated 历史或真实交互 Pane 接管。 |
| 本机 Pi 命令能力 | 版本为 1.5.2，help 明列 `--session <path\|id>`、`--fork <path\|id>`、`--session-id`。实际分支、续开和跨 Space 定位沿用任务单已有证据，本轮未重跑桌面构建。[已有桌面断言](../../../../../temp/issue-worktrees/integration/tests/e2e/shell.spec.ts#L1261) |

冻结结束后，建议用两个有区别的正文标记做最短回归。先取列表快照，在 read 前、选中后及 Core 连接等待期间分别换件，验证旧选择不显示 B、两种启动入口提交次数为零、布局不添叶。对同一 A 追加合法记录，验证 historyId、pin 与活动定位稳定，Pi 续开保留原字节前缀；跨 Space 分支核对 child header 的 cwd、ID 和 parentSession。再覆盖配置根 A→B、超出扫描上限的同 ID、CLI 缺失、旧 pin/旧会话及同 requestId 重试。Codex 回归必须包含库外 DB 路径样本；若未来声称能保证跨进程原子绑定，再加入在 RPC 提交后、provider open 前同步换件的受控用例，观察到底打开哪个文件。

本轮仅读取冻结 Git 对象与本机 CLI 程序，在系统临时目录运行合成历史探针。唯一写入的项目交付物是本报告；集成工作树、Git refs、真实用户历史及正在运行的冻结构建均未操作。
