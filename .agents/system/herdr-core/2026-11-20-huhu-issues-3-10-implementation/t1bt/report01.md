# #4 W5.2 · Windows 上 Codex 历史恢复与分支的真实 TUI 验证

**固定版 Codex 0.171.0 可以让真实 TUI 接入按绝对路径预加载的 legacy 线程。** 在相同 UUID、不同正文、SQLite 指向库外文件的样本里，普通 ID 选择显示 B。专属 AppServer 显式恢复 A 后，TUI 显示 A。显式从 A 分支后，TUI 显示 A、新子 ID 和目标目录。Windows 本地域套接字可以完成这条链路，AppServer 无需监听 TCP。

**建议冻结版继续将 Codex 历史行限于预览。** 在运行中索引改变的对照里，TUI 所示正文、后端返回的路径和再次恢复所得正文出现分歧。另有实际落盘的子线程在 TUI 接入失败后存续。两项结果分别影响“继续写回选中文件”和“同一操作只分支一次”的验收。[D07](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/source.md#L580) · [W5.2](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W5.2-history-restore.md) · [上一轮路径探针](../t1bq/report01.md)

## 环境与现有入口

只读基线为 `897cd78aeb89c4eed9b450265bcb4ec8d704f112`。实测使用 Windows x64 10.0.26300、集成目录的 Herdr Core 0.1.19、Node 24.21.0、本机 Codex 原生 EXE。Codex SHA-256 为 `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7`。每轮单独建立临时用户目录、AppServer 存储、TUI 存储、Space 和 Core 实例。复用上一轮合成 JSONL 与 SQLite 探针，模型提供方指向本机未使用的回环地址，未发送模型回合、读取真实 Vault、历史或用户凭据。

冻结版的历史列表和直接启动 RPC 都经过 `canOpenHistory`，当前仅 Pi 可开。普通 Codex 启动拼接 UUID；受控 Codex 入口只接受新会话，其 helper 通过 stdio 启动 AppServer，固定关闭 shell、设为只读、审批为 never。可复用原生程序校验、一次性启动标记、Core 标签、请求对账与终端读取；交互历史需要独立解析此次启动实际生效的权限、信任和存储配置。[资格检查](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L577) · [CLI 参数](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/launch.ts#L121) · [受控入口](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L383) · [受控启动与策略](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/codex-dispatch-helper.cjs#L462)

本机 `resume --help` 接受 UUID 或名称，`fork --help` 接受 UUID；两者均无 rollout 路径参数。`--remote` 支持显式端点，`app-server --listen` 支持 `unix://PATH`，`app-server proxy --sock PATH` 能在标准输入输出与指定套接字之间转发字节。固定源码把显式端点交给 Remote 后端，`--remote` 与 `--no-daemon` 互斥。探针直接指定自己创建的端点。TUI 按 ID 在该后端执行 `thread/read(includeTurns:false)`；显式源路径来自预加载客户端的实验字段。[CLI 判定](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/cli/src/main.rs#L2541) · [后端选择](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/tui/src/lib.rs#L1043) · [TUI 查找](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/tui/src/lib.rs#L748) · [原生代理](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/cli/src/app_server_proxy.rs#L12) · [路径协议](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L368)

## 实测

A 位于后端 `rpc-home/sessions`，正文为 `selected-A`。B 位于同级 `alternate`，正文为 `alternate-B`。两者 header 的 ID 均为 `7013f001-1234-4234-abcd-000000000001`，源 cwd 均为本轮的 `Space`。数据库行初始指向 B。另两轮显式设置 `CODEX_SQLITE_HOME=<样本>/external-state`，将状态库本身也放在后端 `CODEX_HOME` 之外。TUI 的独立 home 没有样本 rollout。

专属 AppServer 监听本轮私有套接字。预加载客户端用原生 proxy 承载 WebSocket 握手及 JSON-RPC，初始化实验 API，保持连接并只请求一次创建性操作。Core 用 ConPTY 启动真实 TUI，调用形状为 `codex --remote <同一端点> -C <实际工作目录> resume <RPC 返回的 ID>`。分支时这里传子 ID。取证来自 Core 的 `terminal.read`、TUI 内建 `/status`、同一后端的回执和落盘记录。

| 场景 | 观察结果 |
| --- | --- |
| 无预加载的负对照 | 冷读返回库外 B。真实 TUI 同样显示 `› alternate-B`。 |
| 恢复 A，独立状态库 | 冷读 B，`thread/resume(path=A)` 返回原 ID、A、源 cwd。TUI 显示 `› selected-A`。其 `/status` 显示同一本地套接字、原 ID、源目录和 0 token。AppServer / TUI PID 为 37980 / 53256。 |
| 从 A 分支到另一 Space，独立状态库 | `thread/fork(path=A,cwd=BranchSpace)` 返回子 `01a1fb64-12e8-7082-9370-77d14ad93d90`。TUI 显示 A，`/status` 同时显示该子 ID、原父 ID 和 `BranchSpace`。AppServer / TUI PID 为 15076 / 37532。独立重复轮也从生成的子文件 header 核对此三项，子文件含 A，库外 B 保持独立。合成输入只有用户消息，分支屏幕另显示 `Conversation interrupted`。 |
| 活动线程与索引发生分歧 | 预加载 A 后，TUI 接入时数据库又指向 B，`thread/loaded/list` 仍含原 ID。TUI 首屏显示 A，`/status` 的服务器和会话正确。随后 `thread/read` 返回路径 B、正文 A；同服务再次显式恢复 A 的回执返回路径 B、正文 B。磁盘上两文件仍各含自己的标记。两轮观察到首次接入与后续读取的分歧。 |
| 未决定目录信任 | 带明确的 `-C`、暂缓预加载时，原生 TUI 停在 `Trust this folder?`。未作选择，后端已加载线程数为 0。 |
| 源路径不存在 | 显式恢复收到 `-32600 / file does not exist`，加载数 0、Core 终端数 0。 |
| 分支已建，TUI 接入失败 | TUI 连接无效的专属套接字，报 Windows 10061。按已记录的子 ID 仍可从原后端读出 A；关闭后在磁盘核实恰好一个新子文件、正确的父 ID 和目标 cwd。普通 `thread/list` 默认结果未列出该子线程，不能据此判定可重新 fork。 |

正常恢复和分支每轮各有一个 Pane、一个专属业务 AppServer 和一个 TUI；私有套接字实验另有一个字节转发 proxy。关闭后各轮 Core 剩余 Pane 为 0，私有 Core 已停止，原端点重新连接失败。回环 WebSocket 路线也验证了恢复和分支，使用临时随机 capability token，无 token 握手返回 HTTP 401。私有套接字路线的服务 PID 在接入前采样到 0 个 TCP 监听，实查套接字目录 DACL 禁用继承，仅当前 Windows 用户有完全控制权限。[负对照](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/control-3c0c48/result.json) · [库外状态库恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/ext-resume-status-3d76f7/result.json) · [库外状态库分支](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/ext-fork-status-d1f8bc/result.json) · [回执分歧](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/recheck-status-1df4df/result.json) · [信任提示](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/trust-78f627/result.json) · [无源文件](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/uds-missing-db6a8e/result.json) · [接入失败](C:/Users/cdewta/AppData/Local/Temp/huhu-t1bt-dfb640a222/fork-joinfail-41e2e0/result.json)

## 接入 W5.2 的最小前置

1. **固定源文件和实际线程。** 在登记意图时记录所选源、文件身份、源 cwd、目标 cwd、有效存储和原生版本。冷启动的显式路径可能优先于传入 ID，须核对返回的实际身份。恢复要能将文件身份连续绑定到 provider 实际读取及后续写入；分支要能将同一源绑定到一次创建所得的新子。协议提供路径字符串，活动线程校验及随后载入持久化历史是不同步骤。若更换索引、同路径换件或后端重启后无法确认，应停止并要求重选。本轮没有执行模型写回，也未覆盖 paginated、压缩存储或 provider 打开文件时的并发换件。[活动路径校验](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L4846) · [重新载入历史](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L4944) · [paginated 校验](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L5214)
2. **在预加载前核实信任和权限。** 已信任样本中，省略 RPC 的 sandbox 和 approval 覆盖时，两种动作均返回 `readOnly / networkAccess=false / on-request`，TUI 显示 `Read Only (Ask for approval)`。这验证了配置和界面一致；工具执行、Windows 沙盒实际强制、企业策略、自定义可写根和 hooks 仍待验证。未知信任必须先走原生决定，特别是分支的目标目录。若以后采用“信任完成后才处理首个生命周期请求”的接法，还须覆盖前置 `thread/read` 的元数据选择、保留原请求的策略与审批交互，并在接入完成前禁止发送回合。本轮运行的是预加载路线。[原生信任时序](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/tui/src/lib.rs#L1970) · [Remote 恢复参数](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/tui/src/app_server_session.rs#L2802)
3. **限定后端的可访问范围与寿命。** Windows 本地域套接字满足本次无 TCP 的要求；用户级 DACL 仍允许同一用户的其他进程访问。产品若要求仅指定 Pane 能调用完整 AppServer，还需绑定本次进程/端点和私有通道，验证后端退出、重连及同权限进程的访问边界。显式端点与隐式本机 daemon 使用不同的 peer 校验策略。可复用 Huhu 已有 broker 的映像、PID、创建时间和单次交付校验。[Windows 私有套接字](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server-transport/src/transport/unix_socket.rs) · [显式端点策略](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server-client/src/remote.rs) · [原生 broker 协议](../../../../../temp/issue-worktrees/integration/native/agent-pty/PROTOCOL.md)
4. **按同一意图对账两次可能有副作用的操作。** 在首次 resume/fork 前持久化并独占已有 `requestId/attempt`；记录后端进程代次、源身份、返回的子 ID/路径，再用原有 Core 标签对账 TUI。端点或 Pane 建立失败时，若子线程已知，只可找回该子；RPC 已发送但回执丢失时保留“结果未知”，直到能与该次创建作唯一对应。固定版 fork 参数没有客户端幂等键。单独查询父 UUID、默认列表或 Pane 数量不能消除重分支风险。还需在并发同请求及进程崩溃下验证至多一次创建。已有运行中 Pane 可继续走原定位路径。[Core attempt 与发送](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L519) · [fork 参数](https://github.com/openai/codex/blob/rust-v0.171.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L558)

本轮唯一项目写入为本报告。合成样本、原始回执及探针保存在本机临时目录供复核；未改业务代码、安装全局工具、写 Git refs 或访问远端机器。
