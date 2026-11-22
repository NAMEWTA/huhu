# SSH 剩余切片 Linux 实施证据

- 任务身份为 `t34/task01.md`，执行终端 `t4c`，基础提交 `82f0d188`。
- 回环 SSH/SFTP、合成密钥、合成口令、临时 Vault。OpenSSH 源文件和本机 HTTP 代理测试均在临时夹具中。
- UI 对照原型 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。保持 Huhu 的对话框、表单、终端渲染和宿主接口。

| 切片 | 基础状态 | 候选行为及证据 | 余项 |
| --- | --- | --- | --- |
| H2.5 | 部分 | 现有主机私钥、身份文件、agent 增加独立密钥库。生成加密 Ed25519、粘贴/文件导入、公开摘要和复制、引用校验、删除。回环认证、错误口令和公开配置脱敏通过。 | 新能力接线后需验证桌面操作与真实系统 agent。 |
| H2.6 | 缺失 | 草稿测试复用 SSH 路由与指纹检查，认证通过、等待信任或认证、失败可区分。取消及编辑使原结果失效。回环验证无目录、连接、审计和信任副作用。 | 新能力接线后跑桌面用例。 |
| H3.1 | 部分 | 保留原指纹流程，增加工作台键盘交互多问、多轮与 OTP，按 attempt、hop、promptId 一次消费。回环测试拒绝过时和错误跳点的回答。 | 接线后合并 t47 的外部主体分支。OpenSSH CA 和用户证书、缺本机身份交互式恢复仍缺。 |
| H3.2 | 部分 | 单目标直接跳板可独立编辑、筛选、按中枢分组、预览、生效和停用。回环测试验证环拒绝、停用后下一次直连且旧连接路径保留。 | 多目标事务式设置尚缺。 |
| H3.3 | 部分 | 工作台保存实际逐跳历史、经过的身份来源、连接 ID 和 Shell 数，异常定位到当时的 hop。 | 全局代理继承、主机覆盖、ProxyCommand/ViaShell 和跨监控、转发的一致路径展示尚缺。 |
| H3.4 | 缺失 | 独立源文件比较、稳定主机 ID、文件指纹、主机版本和逐字段双向同步。回环夹具验证 ProxyJump、保活、冲突、过时确认和解析行号。 | 显式预览和应用。范围为单一字面 Host 块，拒绝影响映射的 Include、Match、多身份文件或活跃 ProxyCommand。未验证桌面文件选择和真实 OpenSSH。 |
| H3.5 | 缺失 | 独立检测、分享、检查、复制和停止。回环用例验证关闭监听后保留 SSH 连接，拒绝远端非回环绑定。 | 远端 Linux 需要 `ss`。测试以 HTTP CONNECT 响应为边界，未验隧道内 TLS。 |
| H4.3 | 部分 | 分栏布局和关闭采用独立布局版本。交换、拖放、分割方向与根比例、最大化和方向导航保留其他 paneId、shellId。回环测试验证非法布局和旧版本拒绝。 | 桌面新窗口宿主接线、跨窗口恢复和完整焦点验收尚缺。 |
| H5.1 | 部分 | SSH 专用终端桥按当前 WebSocket 检查输入、resize。测试覆盖观察者、交接、晚到写入。沿用共用 xterm 渲染。 | 需换入新桥并验中文 IME、宽字符、备用屏幕、图像及键盘协议。 |
| H5.2 | 部分 | 可见且拥有控制的目标才可预览、插入和发送。锁定使用观察模式，布局设置沿用设备偏好。 | 共用终端需提供输入回调，工具栏拖动、分组和快捷库管理仍缺。 |
| H5.3 | 缺失 | 显式录制并按精确 Shell 筛选、读取及文本回放。保留起止和截断边界，跨 UTF-8 字节保真，常规日志排除认证答复。 | 录制上限 256 KiB、最多保留 60 条。当前为文本回放。终端内实时搜索、时间轴回放和原图像协议未覆盖。 |
| H5.4 | 缺失 | 本机 Shell、Windows PowerShell/WSL 发现、按原环境重连、Herdr Core 启停与 framed PTY 适配。替身测试验证原 argv、单次停止、缺失环境不回退。 | 需注入真实宿主 Core 与 attachTerminal。Linux 实际 PTY、禁用 Agent CLI 后重连和 Windows WSL 实测待做。 |
| H11.3 | 部分 | 基线上已有 CLI/MCP 资源与作业实证。并行 `b25c6322` 另有外部会话/字节传输。增加 CLI 和 HTTP MCP 各一条串联凭据更新、信任、字节上传下载、作业读回、关闭和撤权的规格。 | 串联规格已做语法检查，需在汇合版本运行。 |

## 上游来源台账

所有条目固定为 Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0，版权 2026 Motty contributors。固定提交和许可证在临时检出核对。下表可追加到 `docs/upstream/ledger.md`。 [Motty 固定提交](https://github.com/t8y2/motty/commit/102228261703d8f22c5eb98b1c500e2a24889dee) · [LICENSE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE) · [NOTICE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/NOTICE)

| 切片 | 上游路径 | 本地落点及改动 |
| --- | --- | --- |
| H2.5 | `internal/keyidentity/generate.go`、`internal/workbench/stored_keys.go` | `engine/key-library.ts` 移植粘贴规范化规则，复用 ssh2 的 Ed25519 生成及解析，由 ModuleCredentials 提供本机保护。 |
| H2.6 | `internal/workbench/host_test_connection.go` | `engine/draft-connection.ts`、`engine/manager.ts`、`ui/HostEditorDialog.tsx` 参照三态、30 秒窗口和草稿所有权。适配现有 ssh2 跳板、信任和 Engine 调用。 |
| H3.1–H3.4 | `internal/sshconn/auth.go`、`internal/sshconn/conn.go`、`internal/workbench/host_jump_row.go`、`internal/sshconfig/edit.go` | `engine/manager.ts`、`ui/RoutePanel.tsx`、`engine/config-sync.ts` 参考逐轮问答、逐跳路径和配置保留。沿用 Huhu 主机版本、Vault 与现有 OpenSSH 解析器。 |
| H3.5 | `internal/workbench/local_proxy_tunnel.go`、`internal/workbench/local_proxy_ui.go` | `engine/proxy-share.ts` 移植远端回环检查规则，复用 Huhu ForwardListener 并核对已有连接 ID，以固定非特权端口与 HTTP CONNECT 测试适配。 |
| H4.3–H5.3 | `internal/workspace/spec.go`、`internal/workbench/terminal_input_guard.go`、`internal/workbench/terminal_recording.go`、`internal/sessionlog/store.go` | `WorkspaceCanvas.tsx`、`terminal-bridge.ts`、`terminal-recordings.ts` 借鉴阅读顺序、输入与录制生命周期。复用 Huhu TerminalView、SSH Shell 与本机运行目录。 |
| H5.4 | `internal/localshell/discovery_other.go`、`discovery_windows.go`、`wsl_windows.go` | `local-shell.ts`、`local-pty-herdr.ts` 参考设备和 WSL 探测，PTY 复用 Huhu 的 Herdr Core API。 |

## 定向验证

Node 24.21.0，pnpm 12.10.1。单独运行四个 Vitest 文件，均使用 `--maxWorkers=1`。候选 SSH 单包类型检查和新增 E2E 文件语法检查通过。日志目录为 `/tmp/huhu-t34-checks.TPPZz3`。E2E、Electron、xvfb、截图、打包和全量测试由 Lead 按任务边界另行执行。

## Lead 合并与接线

2026-11-22 在 Linux 本机工作树 `temp/issue-worktrees/integration` 实施。定向日志保存在本机 `temp/issue-evidence/huhu-2026-11-22/`。Node 24.21.0，pnpm 12.10.1。Motty v0.4.12 和 ssh2 的固定来源、改动与许可见项目台账 R-72 至 R-81。 [上游台账](../../../../../docs/upstream/ledger.md)

| 阶段 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 合并 `ade79b58` | 父提交为 `cc671b5f` 和 `53e516ca`。串行运行 `pnpm exec vitest run` 的 `manager.test.ts`、`public-resources.engine.test.ts` 和 `draft-and-keys.test.ts`，分别通过 20、46、8 项。 | `h7-merge-vitest.log` |
| 能力注册 | SSH 和 Engine 单包类型检查通过。`terminal-runtime.test.ts` 3 项、`domain-exposure.engine.test.ts` 2 项、`capability-catalog.test.ts` 2 项通过。目录与插件清单相符，CLI 与 MCP 初次发现保持关闭。 | `h7-wiring-static.log` |
| 真 PTY | 定向运行 `pnpm exec vitest run apps/engine/test/web-share.test.ts`。初次打开失败，0.1.19 的 `terminal.run` 拒绝超过 32 字符的名称。移除名称参数并保留完整标签后，两项通过。停用 Agent CLI 后 `/bin/sh` 可运行，resize 为 29 行×101 列，关闭视图后以同一 PID 重挂。Web 邀请会话接入同一 ID 时关闭码为 4404。停用 SSH 后 PID 和私有套接字均已消失。 | `h7-native-before.log`、`h7-native-after.log` |
| PTY 复查 | Engine 单包类型、`terminal-runtime.test.ts` 的 3 项及 `attach.live.test.ts` 的 1 项通过。分栏 E2E 文件语法检查通过。桌面实际 Chromium 为 152.0.7977.167。 | `h7-wiring-recheck.log` |

待验项目包括 `tests/e2e/ssh/remaining.spec.ts` 的密钥和草稿流程及分栏内快捷文本，`tests/e2e/ssh/entry-parity.spec.ts` 的 CLI 和 HTTP MCP 两条串联记录，以及 Electron 实际窗口、Windows WSL 和 macOS。新增动作的默认关闭已复核。授权后的外部调用需逐项对应外部对象与业务处理，部分候选处理仍仅接受工作台身份。OpenSSH CA、批量路由、出站代理与跨窗口仍需按切片实现或复核。#7 的 Issue 验收仍在进行。

## 外部草稿试连

CLI 与 HTTP MCP 可用 `ssh.hosts.testDraft` 测试已授权的保存主机。外部调用提交主机和路由版本，草稿只能使用同一主机地址、账户与路由。外部工具不能通过草稿任意选择设备上的身份文件或密钥。首次遇到未知指纹时返回可达，不保存信任、不注册连接，也未发送认证。正式外部连接仍通过外部主体的原信任应答。

使用隔离 Vault 和两个回环主机运行 `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t "can test a draft only at its authorized SSH route"`。修复前两项拒绝新的路由字段，修复后两项通过，46 项由筛选排除。验证了工具默认关闭、按主机开放、过期路由版本、改写端口或账户、选择本机身份、首次可达、撤权与目录状态。SSH 单包类型检查和草稿及密钥文件的 8 项回归通过。本机日志为 `h7-public-draft-before.log` 与 `h7-public-draft-after.log`。

## SSH 本地 Core 套接字隔离

随包 Herdr Core 0.1.19 在权限 1777 的隔离目录中创建的 Unix socket 权限为 0775。SSH 本地 Core 现将 socket 放入只对当前用户开放的真实目录，拒绝不可信的目录。路径长度预留 holder 后缀。

Engine 真 PTY 用例在公共运行目录中先因父目录存在组或其他用户权限而失败，修复后通过。它同时验证 shell 仍能打开并重挂，停用 SSH 后连同私有目录下的活动套接字一起释放。Engine 单包类型检查通过。本机日志为 `h7-private-socket-before.log` 与 `h7-private-socket-after.log`。异常启动取消、主动脱离 PTY 的子进程回收以及 Windows 命名管道仍有待验项。

## 分栏审查返工

三台回环夹具复现关闭自定义分栏时把比例从 70% 改成 50%，以及重连后仍能用旧布局版本关闭新会话。现在只折叠被关闭的叶子，重连生成新布局版本。定向回归验证其余分栏的比例、方向、身份和活动 Shell。SSH 单包类型检查与 `draft-and-keys.test.ts` 的 8 项通过，日志为 `h7-layout-before.log`、`h7-layout-revision-before.log` 和 `h7-layout-after.log`。工作台连接卡片改为统计工作台自己的活动终端，页面交互留待 Electron 验收。

## 录制回放和保存重试

实施记录 `t4x/report01.md` 对应提交 `4eade18a`，合入集成为 `67d1f008`。停止后的录制支持播放、暂停、时间定位和会话筛选。时间点和文本有上限，可按原捕获时间读取净化文本。旧录制和无效时间轴继续显示正文。安装环境的 SSH 单包类型检查、`manager.test.ts` 22 项及 `remaining.spec.ts` 语法检查通过，日志为 `h7-playback-67d1f008.log`。Electron 的回放、搜索、会话隔离和原 Shell 无新增输入仍待 E2E。

强制使临时文件重命名失败时，首次复查显示丢失「待保存」状态。修复后可在日志页用同一记录重试，原始停止点和文本保留，停止后输出仍未录入。定向运行 `manager.test.ts -t "录制"`，4 项通过，19 项由筛选排除。SSH 单包类型检查通过。本机日志为 `h7-recording-retry-before.log` 与 `h7-recording-retry-after.log`。

## 快捷文本、Core 路径及外部布局

| 集成提交 | 已复核行为 | 定向证据 |
| --- | --- | --- |
| `4198354d` | 只在当前受控终端写入快捷文本。按是否启用分段粘贴校验制表符和换行，拒绝其他终端控制字符，按目标显示写入结果。 | `packages/ui/test/terminal-paste.test.ts` 由 3 项失败变为 3 项通过，UI 与 SSH 单包类型检查通过。日志 `h7-shortcut-before.log`、`h7-shortcut-after.log`。真实桌面多目标用例仍待跑。 |
| `96b22c0a` | 随包绝对路径和仅在 PATH 上的 Core 均可打开真 PTY。缺失二进制时返回不可用。已启动的 Core 可在 PATH 变化后正常停止。 | `apps/engine/test/web-share.test.ts` 3 项通过，Agent CLI 的 `findOnPath` 回归 1 项通过，23 项由筛选排除。Herdr 客户端、Agent CLI、SSH 和 Engine 定向类型检查通过。日志 `h7-herdr-path-before.log`、`h7-herdr-path-after.log`。 |
| `f2159c2e` | CLI 和 HTTP MCP 只调整本主体持有、当前主机路由仍授权的运行。换栏保留原会话，单独关闭分栏后，其余路由及 Shell 保留。回执绑定原授权、代次和布局版本。 | `public-resources.engine.test.ts -t "changes only the owned SSH workspace layout\|isolates SSH terminal I/O"` 4 项通过，46 项由筛选排除。SSH 单包类型检查及工作台分栏过滤回归 1 项通过，7 项由筛选排除。日志 `h7-external-layout-before.log`、`h7-external-layout-after.log`。 |
| `3456b450` | 本机 PTY、由桌面选择的 OpenSSH 文件与工作台认证应答保留可用能力登记。CLI 和 MCP 的认证应答走自己的连接挑战入口。 | `domain-exposure.engine.test.ts` 2 项、Engine 本机 PTY 2 项、OpenSSH 同步 1 项、CLI/MCP 外部认证 2 项通过。剩余过滤用例数见 `h7-device-policy-before.log`、`h7-device-policy-after.log`。 |

私有 Core 在标准关闭路径的测试不覆盖 Engine 崩溃、启动被中断、Unix 上主动脱离 PTY 的后代或 WSL 来宾进程。本机生命周期分析见批次协作记录 `t5h/report01.md`。密钥、录制、代理分享的外部权限合同仍需核对。

`951fe442` 处理丢失 `terminal.run` 回复后的首次对账。重新查询本地 Core，按唯一启动标签回收，跳过不匹配或属于另一 Core 的终端。断线或空列表时返回启动和回收结果待核对。替身桥、正常启动与回收回归 5 项通过。Engine 的两条原生 PTY 启动路径仍通过，一条 Web 分享用例由筛选排除。日志 `h7-local-launch-before.log`、`h7-local-launch-after.log`。持久清单、异常进程与退出共同时限仍需实现和验证。

## 后续集成复验

| 集成提交 | 入口及观察结果 | 证据 |
| --- | --- | --- |
| `29c3fe32`、`526699ef` | 路由页的关联和启停使用一个 Vault 定义事务。工作台能力按现有主机版本校验。真实写入队列中的取消保留原定义和本机凭据快照，原请求可重新发起。已有工作台 Shell 保留实际旧路由。 | SSH 路由 9 项、Kernel 凭据 18 项，Kernel 类型检查通过。执行 `pnpm exec vitest run plugins/ssh/test/route-edits.test.ts` 与 `pnpm exec vitest run packages/kernel/test/credentials.test.ts`。`h7-batch-routes-integration.log`、`h7-route-cancel-before.log`、`h7-route-cancel-after.log`、`h7-route-credentials.log`。H3.2 Electron 用例只有枚举证据。 |
| `bb7b9b6a` | CLI 和 HTTP MCP 在合法后续编辑完成后，重交原布局意图收到该意图原始结果。关闭分栏只发生一次，当前布局仍保留后续修改，撤权后旧回执拒绝读取。 | `public-resources.engine.test.ts -t "changes only the owned SSH workspace layout\|isolates SSH terminal I/O"` 通过 4 项，46 项由筛选排除。SSH 类型检查通过。`h7-layout-receipt-before.log`、`h7-layout-receipt-after.log`。 |
| `d4544abb`、`6f1b6cd3`、`717ae0a4` | 私有 Core 经当前 RPC 停止并核对套接字与 holder。异常停用后 SSH 不再接收新调用，插件列表和停用响应显示回收待核对。移除测试 holder 后可以复查停用和重新启用。启动等待、run、framed hello 与 attach 可取消，剩余回收有时限。 | `herdr-core.test.ts` 3 项、真实 `attach.live.test.ts` 1 项、`terminal-runtime.test.ts` 5 项、Engine `web-share.test.ts` 4 项，Herdr 客户端和 Engine 类型检查通过。`h7-core-stop-after.log`、`h7-cleanup-feedback-after.log`、`h7-attach-cancel-after.log`。Unix 脱离进程、跨进程恢复、Windows holder 和 WSL 仍待验证或实现。 |
| `c4281b1c`、`e71f47b0` | 工作台连接和草稿对选中设备身份匹配 Ed25519 伴随证书。在 Linux OpenSSH 10.2p1 回环服务上，用加密身份和证书执行命令。服务端拒绝证书时，即使另行授权同一裸钥，连接仍返回认证失败。移除证书后，通过裸钥对照验证服务端配置。 | `HUHU_TEST_OPENSSH_SSHD=/usr/sbin/sshd pnpm exec vitest run plugins/ssh/test/identity-certificate.test.ts` 10 项通过，SSH 类型检查通过。`h7-user-cert-openssh.log`。外部对象入参透传由替身验证。主机 CA 及其他用户证书算法仍待实施。 |
