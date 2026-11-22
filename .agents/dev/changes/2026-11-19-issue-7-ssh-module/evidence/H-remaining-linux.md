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

2026-11-22 在 Linux 本机工作树 `temp/issue-worktrees/integration` 实施。定向日志保存在本机 `temp/issue-evidence/huhu-2026-11-22/`。Node 24.21.0，pnpm 12.10.1。SSH 上游文件已对照 Motty v0.4.12 固定版本，见项目台账 R-72 至 R-77。

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
