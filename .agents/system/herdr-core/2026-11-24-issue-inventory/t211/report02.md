# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t211（本机默认 Core）
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task02.md
- 回执文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report02.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidences/ 与 Inventory 的对应验收报告，由 Lead 写入
- 执行结果 — blocked。实现、定向验证与修订用例已交回。整工作区多分栏迁移、部分 §11 行为和正式验收有待完成。
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1，分支 inv/w3，基线 e3cac81e
- 运行原件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task02/
- 主检出及清单 — 主检出中的跟踪文件与清单均由 Lead 管理。派发时按 Lead 的更正执行。回执发布前已看到 task02 的 active 记录。

## 成果与运行指针

| 票据、提交 | 改动与证据 | 需要 Lead 运行的 Playwright 用例 |
| --- | --- | --- |
| H9.3 · 2f2a756a | `engine/monitor-tools.ts`、`engine/capabilities.ts`、`shared/monitoring.ts`、`ui/MonitorTools.tsx`、`monitor.engine.test.ts`、`public-resources.engine.test.ts`。Linux 从同一次 /proc stat 读取 PID、进程名和 field 22 启动刻度。终止前在原连接重新读取并比较，旧 PID 样本拒绝并提示刷新。Windows 无启动刻度，界面隐藏终止动作。实机 /proc 单测加同名复用夹具。 | `tests/e2e/ssh/monitoring.spec.ts`「Workbench monitors a saved panel in the background and controls the active Pane separately」及「H9.3 原生服务器工具复用原窗口并只取消自身查询」。 |
| H12.2 · aa5f6713 | `tests/e2e/packaged/packaged.spec.ts` 使用打包程序、真实回环 SSH/SFTP 协议、已知指纹、终端回显、文件内容和 SOCKS 监听。退出前断开，退出后检查 Engine PID、回环连接和端口释放。`scripts/accept-linux-candidate.sh` 的 ssh 模式选 1 条，package 套件 6 条。 | 「打包后：SSH 连接回环主机、读回测试文件并在退出后回收」。用 HUHU_PACKAGED_EXE 或候选验收脚本 ssh 模式运行。 |
| H12.1 · eb1f82f4 | `engine/{index,transfers,transfer-recovery}.ts`、`transfer-publication.test.ts`、`tests/e2e/ssh/lifecycle.spec.ts`。原队列只在内存。新增每设备每 Vault 实例的运行快照，原身份仅作历史，未完成任务恢复为同一 ID 的失败终态，提交中的在详情注明结果未知、保留原现场路径。重启不重发任务或重建文件会话。正常停用或关闭沿用原生命周期。 | 「H12.1 Engine 异常退出释放转发并留下唯一传输终态，原工作区可重新连接」及「H12.1 新格式备份恢复主机和跳板路由，重配设备凭据后可连接」。 |
| H5.1 · e1f84a69 | `tests/e2e/ssh/remaining.spec.ts`。夹具的本机 script PTY 没有转发 SSH window-change，less 的逻辑页高超过 xterm 实际显示行数，首行滚出可见区域。夹具在运行真 less 前固定为 8 行 × 60 列，继续验证宽字符和退出后恢复。 | 「H5.1 SSH Linux 真实分页器显示宽字符并还原原终端画面」。 |
| H4.3 · f80b7559 | `terminal-bridge.ts`、`ws-workbench.ts`、`TerminalView.tsx`、`terminal-window.ts`、`SshTerminalWindow.tsx`、`SshModule.tsx`、`WorkspaceRunView.tsx`、桌面 main/preload/renderer。仅当前输入 Socket 可签发一次性交接，目标窗口建立原 shellId 并收到控制后显示。原窗口保有观察视图，目标关闭时同一源 Socket 恢复输入。SSH 既有回放及连接不重建。Web 显示换窗支持范围。 | `tests/e2e/ssh/remaining.spec.ts`「H4.3 原生窗口接管同一 SSH 终端并回放，启动失败保留原窗口输入」。 |
| H5.2 · 04b863e1 | `TerminalView.tsx`、`TerminalActions.tsx`、`WorkspaceRunView.tsx`、`terminal-broadcast.ts`、`shortcuts.test.ts`。显式选择两个以上可见且有控制权的绑定后开始，持续发送键序列。目标名常驻可见，单击停止。任一所选绑定隐藏、锁定、变更或失权即结束广播，桌面与独立 Web 共用终端控制链。原有快捷文本预览与插入不进入广播。 | `tests/e2e/ssh/shortcuts.spec.ts`「H5.2 桌面 键入只广播到显式选定的可输入分栏并可一键停止」和「H5.2 独立 Web 键入只广播到显式选定的可输入分栏并可一键停止」。 |
| H3.1 · 51b8313e | `manager.ts`、`authentication-capability.ts`、`shared/trust.ts`、`AuthenticationDialog.tsx`、`HostAuthoritiesPanel.tsx`、`manager.test.ts`。本机身份文件不可读时，当前尝试暂停，可选择一次性密码或服务器交互认证，答复按原 attempt、跳点和提示 ID 消费一次。继续前复核跳板链版本及指纹；认证回答不留通用幂等回执。已知主机 CA 面板明确标示 Ed25519、KRL 与 @revoked 范围。 | `tests/e2e/ssh/trust.spec.ts`「H3.1 缺失本机身份可重开提示并使用一次性密码，旧回复和凭据不留存」。 |
| H9.3 附加回归 · d867f605 | `monitor.engine.test.ts` 通过真实回环 SSH 证明，取消 HTTP 调用会让远端收到对应 Session 的关闭事件，另一个主机仍可查询。原 E2E 监听的是夹具中从未消费可读流的 Channel，其 close 在 ssh2 中依赖可读端被消费或销毁。E2E 改用 Session 的协议关闭事件。 | 复跑上表的原生服务器工具用例。 |
| H10.1 / H10.2 · b9b7f3d3 | `SshSettingsPage.tsx`、`device-preferences.ts`、`SshStartup*.tsx`、`startup-preferences.ts`、桌面 `workbench.tsx`、`Workspace{RunView,Canvas,PaneTools}.tsx`、`SshTerminal.tsx`、`TerminalView.tsx`、`terminal-content.ts`、`File{DirectoryTree,Table}.tsx`、`FilesPanel.tsx`、`HostEditorDialog.tsx`、`ssh.css` 及对应单测。下面记录 §11 的默认值、存储范围、消费者和剩余差距。 | `tests/e2e/ssh/settings.spec.ts`「H10.1 搜索保存终端高亮与命令补全，工具栏锁定后仍能使用文件和监控」「H10.2 SSH 启动目标和工作区恢复策略在下一次载入时生效」「SSH preferences apply to workspace, terminal, file views and transfer queue」。 |

候选提交为 b9b7f3d3，worker 工作树干净。两项 Lead 回报的失败均修订了测试。取消请求的 SSH 协议行为已用引擎单测复核，分页器实际画面仍待 Lead 复跑。

## §11 字段核对

| 类别 | 当前默认、归属与实际作用 | 差距或与 Inventory 的取舍 |
| --- | --- | --- |
| 通用与布局 | 设备参数。标签上方、纵向分组和初始收起默认关闭，导航默认可见。工作区工具栏默认上方、小号、文件优先，允许键盘或指针移动。保存锁定会移除移动入口，工作区内恢复会重置位置、顺序、尺寸和锁定。保存可按类别恢复。 | 新增初始收起和展开控制，与既有同路由标签归组共用。 |
| 终端外观和输入 | 设备参数。13 号主题字体、标准行距、闪烁方块、回滚 5000、输入时滚到底部。保留 xterm 键盘复制粘贴，新增选中即复制和右键选词，二者默认关闭。原有选词分隔符、链接激活、回滚搜索与本机 Shell 选择仍是实际入口。高亮默认空，通过 xterm 装饰标记当前可见行内的字面关键词。 | Huhu 全局外观统一负责配色，SSH 没有另一套色板。高亮当前为单个字面关键词，跨行和 Motty 多规则编辑仍缺。 |
| 终端快捷操作、通知和记录 | 从快捷命令补全、响铃通知默认关闭，均是设备参数。命令补全使用本 Vault 快捷命令库，通过按钮或 Ctrl+Space 查选并仅插入当前有控制权的终端。响铃通知由实际 ANSI BEL 触发。录制默认可启动、上限 60，保存在 Vault 设置。 | Motty 基于 Shell 光标上下文的即时联想、SSH 专用快捷键重绑定和系统级响铃通知未交付。Huhu 已有快捷命令和回滚搜索入口。 |
| 连接超时、重试、保活、共享 | 已有当前 Vault 的 20 秒超时、保活间隔与计数继承、断线自动重连一次默认关闭、SSH 连接共享默认打开。主机填写值优先，显式 0 保持原义，新拨号采用设置。路由逐跳状态、Vault 默认代理、首段主机覆盖及 OpenSSH Config 双向同步沿用现有入口。 | 当前实现使用一次自动重连策略，Motty 可配置的多次重试计划仍缺。 |
| 启动目标与恢复 | 设备和 Vault 共同隔离的本地存储，默认无启动主机、手动重连。可选最多 8 台和手动、上次或已保存工作区三种策略，在桌面启动或重新载入 Vault 时生效。待连接工作区上限为总计 12 个 Pane，原有启动目标若已包含在恢复运行中则去重。首次信任和交互仍走当前提示流程。新建主机默认密码，可从设备设置更改，新建表单消费，已保存主机保留原认证。 | 工作区恢复专注于已保存的 SSH 运行；Motty 的本地 Shell 启动目标和主动重连时避免呈现确认过程的独立策略未复刻。OpenSSH IdentitiesOnly、多个 IdentityFile 和 agent 内具体可选身份范围仍属 H05/H07 认证模型差距。 |
| 文件视图和启动位置 | 设备参数。默认显示隐藏文件、名称排序、远端在右、Tab、附件默认关闭且位于下方，路径栏输入模式、目录树关闭，大小/修改时间/权限都显示。可改为路径导航、展开目录树、左右停靠附件、调整列显隐。远端起始目录为空时从登录目录进入，新增设置仅用于新文件视图。默认下载目录为空，配置后仅为桌面下载表单预填绝对路径，仍由用户提交。双向目录跟随原默认分别为开、关。 | 文件表用户拖动列宽仍缺。Web 的本地下载位置由浏览器管理，独立原生窗口与外部编辑器由桌面已有入口承担。 |
| 文件传输 | Vault 并发默认 2，消费端为当前队列。保留显式覆盖、续传或跳过选择，提交前核验原版本和时间戳。 | 未增加自动覆盖和禁用时间戳的偏好。Inventory S3 与 #7 F05–F06 要求覆盖经决定，文件发布保留与验证时间戳。 |
| MCP 与凭据 | 复用当前 Vault 的能力网关服务状态、HTTP/stdio 示例及复制、SSH 能力筛选、授权对象、调用状态与审计。SSH 主机私有的密码、文件、密钥、passphrase、Agent 和主机指纹沿用已有界面。设备路径和密钥可用性仍按设备处理。 | KRL 和其他证书算法支持范围见 H3.1。Huhu 统一语言、主题、托盘与网关规则。 |

## 定向验证

所有命令使用同一 `/home/wta/projects/huhu/temp/dev/verify.lock` 串行，Node 24.22.1。执行前检查 MemAvailable 与磁盘空间；沿用本检出原有 vendor 类型产物。以下命令均以 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1` 为前缀。

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run plugins/ssh/test/monitor.engine.test.ts` | 7/7，通过 Linux 实取刻度、同名旧样本拒绝、请求中止与其他来源隔离。 |
| `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts` | 63/63，通过。 |
| `pnpm exec vitest run plugins/ssh/test/transfer-publication.test.ts` | 9/9，通过。 |
| `pnpm exec vitest run plugins/ssh/test/terminal-runtime.test.ts` | 7/7，通过。 |
| `pnpm exec vitest run plugins/ssh/test/shortcuts.test.ts` | 6/6，通过。 |
| `pnpm exec vitest run plugins/ssh/test/manager.test.ts` | 34/34，通过。 |
| `pnpm exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` | 10/10，通过。 |
| `pnpm exec vitest run packages/ui/test/terminal-content.test.ts` | 3/3，通过。 |
| `pnpm --filter @huhu/plugin-ssh run typecheck`、`pnpm --filter @huhu/ui run typecheck`、`pnpm --filter @huhu/kernel run typecheck`、`pnpm --filter @huhu/desktop run typecheck` | 逐包串行，最终各 0 错误。 |

本地也通过 `bash -n scripts/accept-linux-candidate.sh`、改动 E2E 文件的 Node `--check` 及 `git diff --check e3cac81e..b9b7f3d3`。验证用的临时 Core 终端已移除。

## 阻碍与接续

- H4.3 验证范围是活动终端或工作区分栏移到原生窗口，源工作区保有观察视图和运行绑定。整工作区多分栏一起迁移及整体还原未完成。
- H10 §11 剩余差距见对照表。H5.2 广播覆盖实际 xterm 键事件，系统 IME、剪贴板和程序化粘贴没有广播回归证据。
- H12.1 运行文件不可写时会记录告警。异常退出会保留传输发布现场，由用户核对原目标后从新连接重新发起。恢复记录不等待旧会话或自动清理远端暂存。
- H9.3 的采样与终止检查能拒绝已观察到的 PID 复用。Linux 通用远程 shell 的复查和发信号之间仍存在极短间隔。
- E2E、打包候选、缺失 Herdr 资产反证、真服务、Windows/macOS、Zsh 和系统级 IME 未运行。Lead 最终验收以同一实际候选为准。

## Lead 验收

