# 任务报告 · Issue #7–#10 剩余切片

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t9
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t9/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t9/report01.md
- 执行结果 — done（只读盘点）

## 结论

四个 Issue 均有已集成行为，也均未达到最终组合验收。优先让 t5 续作 H11.2、t6 先处理 Linux 凭据门禁，再按预定的 task02 接 P8.3；Lead 可同时准备 Mail AI 静态登记与同包回归。剩余工程量还集中在 SSH 路由/终端和外部工具闭环、Mail 跨入口/协议与宿主差异、Safe 新格式恢复、看板业务贡献归属。仅合入两条独立分支不能关闭这四项。

按固定基线分布如下。

| Issue | 已验收（阶段） | 待验证 | 独立候选 | WIP | 未开始 | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| #7 | 10 | 13 | 0 | 11 | 6 | 40 |
| #8 | 18 | 8 | 2 | 4 | 1 | 33 |
| #9 | 14 | 6 | 0 | 3 | 2 | 25 |
| #10 | 12 | 19 | 0 | 5 | 1 | 37 |

范围固定为 `4d86c84bc55169bf4faa05867bf6ff2863030b81`。任务数取自四份 plan 的唯一子任务，各行可回到对应任务正文。状态的单位是该片：

- **已验收** 表示实现已在基线且有注明范围的阶段行为记录，平台为 Windows，协议为回环时按回环计。此栏不代表最终候选通过。
- **待验证** 表示基线有实现、但不足以签收全片（包括正文指出的必补实现）。**WIP** 表示有明确工作停点或域内仅做好子集；**独立候选** 尚未集成。**未开始** 指在指定基线和 refs 未找到该交付的直接实现或运行产物，相关旧能力可复用。**已被替代** 用于另有现行规格或集成等价改动的历史对象。
- 表中 `E/` 指本 Issue 目录的 `evidence/`，`W/` 指旧 Windows Core 主题，`B/` 指批次 Change。测试名或文件存在只证明可查入口，实际运行以指向的报告为准。下表中的缺口和派工顺序是根据这些记录与基线代码作出的判断。
- 平台口径：Lead 的 Linux 基线 lint、knip、format、typecheck、build 通过，test 1261 过、15 败、61 跳过（Linux 任务 t6/task01.md 定位到 apps/engine/src/module-credential-host.ts 的 WindowsCredentialProtection.entry() 在非 win32/x64 返回 unavailable）。本 worker 未重跑门禁。Windows `40822efd` 的 NSIS SHA-256 为 `3b9d72dd8da98add223243650986ad77a3ba5c50e2b9007e408a049ae1df7521`，38 项桌面/Web、4 项包内通过。Windows `4d86c84b` 是 66 项定向和 2 项桌面 canary；没有同 SHA 全量包级通过记录。参见 B/evidence/windows-stage-combined-40822efd.md、交接 handoff.nd。本轮使用已保存的 source.md（Lead 于 11 月 21 日核对开放、零评论），八份原型确认见 `6da1b2ec`。

### #7 SSH

下表的工作区用例在 `tests/e2e/workflows/ssh-workspaces.spec.ts`，主机、导入、信任、属性、转发、监控、设置的桌面用例在 `tests/e2e/ssh/*.spec.ts`，Engine 测试在 `plugins/ssh/test/`。基线连接管理器是 `plugins/ssh/src/engine/manager.ts`。

| 计划切片（40） | 状态 | 基线证据或最近相关实现 | 剩余实现或验收动作 |
| --- | --- | --- | --- |
| H1.1 从 Huhu 功能定位到可复用源码与许可 | 已验收 | E/H1.1-upstream-map.md；Motty 2daa9db582e1、Viva a5da67aa6344 | 来源盘点可沿用；H12.2 按实际引入更新台账和 NOTICE。 |
| H1.2 核实单一执行组件的分发前提 | WIP | E/H1.2-windows-executor-reference.md 仅构建参考程序，启动依赖其配置库；生产 manager.ts 使用 ssh2 | 确定并从 Huhu 验证唯一执行层、真实 PTY/SFTP/端口、退出释放和缺资产构建失败。 |
| H2.1 在目录内找到并整理选中的主机 | 待验证 | 7edd015a、efea64af；directory.test.ts；W/t88/report01.md | Engine 搜索、选区、排序、重开有据；桌面补列表/网格、快速连接和拖组多选。 |
| H2.2 保存并按版本修改一台主机 | 已验收 | 5ed0f03e、17625f3d；host-records.spec.ts、host-auth.engine.test.ts | 回归版本冲突、保留/替换/清空及跨库凭据隔离。 |
| H2.3 删除前查看主机引用与处理结果 | 待验证 | host-records.spec.ts；c16acfb3 模板、22fbdc4f 转发均有引用阻挡 | 把跳板、模板、转发的 UI 预览与删除时服务端复查放在同一例，补独立路由引用。 |
| H2.4 预览外部主机配置后按选项导入 | 已验收 | 0839ab75、d036effb、528ff232；import.spec.ts 两个桌面用例 | 原八格式的选中写入、取消、冲突、恢复重跑。 |
| H2.5 区分已存私钥、文件引用与 agent | WIP | 17625f3d；HostEditorDialog.tsx、host-auth.engine.test.ts 已区分粘贴/路径/agent | 补可选择的已存密钥库、公钥复制、路径或 agent 缺失的反馈。 |
| H2.6 用未保存主机表单查看测试反馈 | 未开始 | W/t179/report02.md；HostEditorDialog.tsx 与 ssh.connect 的已存 hostId 路径 | 补不保存的草稿测试，三态、换字段使旧结果失效、取消后零资源。 |
| H3.1 重新打开连接仍能看到当前信任和认证提示 | 待验证 | 9e924607、a17b1c48、24276472；trust.spec.ts | 已测首次、变化、仅本次信任与重开；补多轮交互认证、证书、OTP 和缺身份。 |
| H3.2 编辑并验证目标到直接跳板的关系 | WIP | 3e6b4661；acceptance.spec.ts 的 ACC-SH-04；目标有 jumpHostIds | 补独立路由页、有效链、批量启停与跳过/覆盖。 |
| H3.3 在多跳连接中指出失败位置和代理归属 | WIP | manager.ts、public-resources.engine.test.ts 的第二跳修订；E/H11.1-public-resources-windows.md | 按实际直连与至少三跳逐跳核实信任/认证/取消和代理各模式，接通尚缺路径。 |
| H3.4 区分一次导入和持续配置同步 | 未开始 | 0839ab75 的 engine/import/openssh.ts 为一次性预览；H3.4 任务 | 实现临时配置文件双向差异、用户接受与冲突回滚，验证无重复写。 |
| H3.5 查看辅助代理分享与还原的状态 | 未开始 | E/H8-runtime-windows.md 记录的 SOCKS/HTTP 转发与 H3.5 代理分享生命周期不同 | 补检测、启停、测试和恢复源配置，显示代理归属。 |
| H4.1 用主机列表预览和保存工作区模板 | 已验收 | c16acfb3；E/H4.1-workspace-template-windows.md；工作区用例 H4.1 | 回归六预设、自定义布局、重启与拒绝非法树。 |
| H4.2 启动工作区时独立呈现每个 Pane 结果 | 已验收 | 0e1b1167、a17b1c48；E/H4.2-workspace-launch-windows.md；工作区两个 H4.2 用例 | 新包重跑绑定失败零拨号、单 Pane 失败、同运行重挂及重连。 |
| H4.3 移动分栏时保留运行与焦点 | WIP | WorkspaceLayout.tsx、WorkspaceRunView.tsx；E/H4.2-workspace-launch-windows.md 明列后续 | 补运行中移动、分割、缩放、换窗与焦点，比较 connectionId/shellId。 |
| H5.1 在 Shell 视图辨认输入归属与显示能力 | 待验证 | SshTerminal.tsx、ec0e96aa；工作区 H4.2 支持真实回环 Shell | 双窗控制/观察、真实全屏、IME、宽字符和 resize 需实机验。 |
| H5.2 只向指定 Pane 广播或插入快捷文本 | 未开始 | WorkspaceRunView.tsx 的分栏与 H10-settings-windows.md 的显示设置 | 补选择 Pane 广播、快捷文本插入与发送预览，核对逐 Pane 回显。 |
| H5.3 按会话查看日志和显式录制的回放 | 未开始 | ec0e96aa 有 Shell 输出回放；H10-settings-windows.md、W/t18v/report11.md 列录制限制 | 补显式录制启停、按会话查日志、范围回放与清理。 |
| H5.4 独立选择本机 Shell 或 WSL | 未开始 | W/t18v/report11.md、SshSettingsPage.tsx 说明本机 Shell 能力限制 | 独立于 Agent CLI 的本机 PTY；Windows 加 WSL、发行版与重开，Linux 验收本机 Shell。 |
| H6.1 切换终端时独立双栏仍绑定原会话 | 已验收 | 0d279330；E/H6.1-file-session-windows.md；工作区 H6.1 | 已验工作台独立双栏，需在最终组合按不同设备左右偏好复跑；原生独立窗另验。 |
| H6.2 在绑定文件会话内修改测试文件属性 | WIP | f945970c；file-properties.spec.ts、E/H6.2-H6.4-file-follow-windows.md | 普通属性、移动和链接已做；缺 SCP 回退与文件会话独占的特权 SFTP。 |
| H6.3 编辑远端文本时发现并发修改 | 待验证 | 0d279330；E/H6.3-text-edit-windows.md、工作区 H6.3 | 内置编辑冲突/权限已验；补可表达目标的外部编辑器交接及不支持提示。 |
| H6.4 在空闲 Shell 与文件面板之间同步目录 | 待验证 | 9eb3e7c8；E/H6.2-H6.4-file-follow-windows.md、shell-directory.test.ts | Git Bash 有据；在真实 Bash/Zsh PTY 核实前台/密码输入、重连后失效且不补发。 |
| H7.1 在传输中心找回所属任务 | 已验收 | a1edc22a、6e99e78a；E/H7-batch-windows.md；工作区 H7.1 | 按批量递归、双远端、容量、离页与历史清理复验。原生拖入另需宿主路径支持。 |
| H7.2 在覆盖与续传时保护原目标 | 已验收 | ed17bce6、afd400ef；E/H7-publication-windows.md、transfer-publication.test.ts | 复跑断线、前缀不符、重复暂停、未知发布后重查及原件字节。 |
| H7.3 显示压缩支持与客户端文件归属 | 待验证 | 11d7b576；E/H7-archive-windows.md；工作区 H7.3 | Windows 本机 ZIP/SFTP 已验；补 Linux/mac 后端或明确限制、Web/CLI 客户端来源与导出归属。 |
| H8.1 保存四类转发规则并看清监听位置 | 已验收 | 22fbdc4f；E/H8-config-windows.md、forwarding.engine.test.ts | 四类规则配置回归，保存前后检查端口未占用。 |
| H8.2 从规则列表追踪运行实例和恢复状态 | 已验收 | 96d79929、f6fd6039；E/H8-runtime-windows.md、forwarding.spec.ts | 四类实流、四规则共享专用连接、跳板断线后显式恢复及端口释放已验；真实服务器 Remote 实际绑定另核。 |
| H9.1 观察活动 Pane 的指标与采样缺口 | 待验证 | adca7b97；E/H9-monitoring-windows.md、monitor.engine.test.ts | 实际回环、合成指标；两种真实系统对照指标、暂停缺口和无权限。 |
| H9.2 保存多主机面板并按需共享采样 | 待验证 | adca7b97；monitoring.spec.ts、E/H9-monitoring-windows.md | 回环已测共享 2 秒、暂停后 5 秒及单主机失败隔离；补其余周期、长窗口与真实多主机。 |
| H9.3 查看固定主机的进程和容器工具窗口 | WIP | 95b7352c；E/H9-tools-windows.md、monitor.engine.test.ts | 只读进程/容器摘要；补独立窗口复用、镜像、日志及约定操作。 |
| H10.1 预览布局与终端设置的实际作用域 | WIP | 040a2e01；E/H10-settings-windows.md、settings.spec.ts | 布局和字号等已接；依 H5 补滚屏、光标、行距、广播、录制和本机 Shell 的实际作用域。 |
| H10.2 分开显示即刻生效与下次连接的设置 | 待验证 | 1f438d3d；preferences.engine.test.ts、settings.spec.ts | 超时与文件偏好有据；验证所有字段的当前/下次生效及独立文件窗口。 |
| H10.3 从 SSH 设置查看公共工具选择 | 待验证 | 7367e1f7；settings.spec.ts；be7a8b8e 后出现五个可开放 SSH 描述 | 用真正可开放的 SSH 项在两页改同一修订并实际撤权，替换旧阶段只能用 notes.list 的证明。 |
| H11.1 从每个 SSH 用户动作查到同一资源 | WIP | 621219a3、24276472、be7a8b8e；E/H11.1-public-resources-windows.md | 五项为已知主机摘要及核验/信任；补可移植枚举、其余域动作到 handler 的映射与授权。 |
| H11.2 查询已授权作业和输出游标 | WIP | c23a8258（父 be7a8b8e，集成无此提交）；W/t18v/task15.md 缺 report15.md | t5 续作：持有者、作业重试同 ID、UTF-8 字节游标、上限、取消/断观察、释放；独立复核再集成。 |
| H11.3 分别演练 MCP 和 CLI 的同一操作流程 | WIP | be7a8b8e；public-resources.engine.test.ts，已知 ID 的外部核验后连接即释放 | 待 H11.2、工具读写主机与文件齐备；MCP/CLI 分别全走一次、撤权、旧工具缓存和重试。 |
| H12.1 核查切 Vault 与停插件后的资源归属 | 待验证 | manager.ts、workspace-runs.ts、transfers.ts、forward-runs.ts、monitors.ts；public-resources.engine.test.ts 的停插件清理 | 结合所有所有者验切库/停插件/崩溃、孤儿端口/进程、独立插件会话保持。 |
| H12.2 按平台交接单一执行层及功能证据 | 待验证 | E/H1.2-windows-executor-reference.md、B/evidence/windows-stage-combined-40822efd.md 仅参考程序/阶段包 | Windows x64、Linux x64、macOS arm64 同候选包、授权主机最小往返、缺件负例、台账与用户/工具文档。 |

#### #7 原文 §16 逐项判定

| 原文 | 判定 | 依据与缺口 |
| --- | --- | --- |
| A01 主机目录/导入/认证 | 部分 | H2.1–2.4 有真实目录、八格式导入和表单回读，快速连接、网格/批量及密钥库未齐。 |
| A02 直连与三跳四种业务 | 只能在真实服务完整验证 | trust.spec.ts、forwarding.spec.ts 和工作区夹具覆盖部分链路；缺授权三层拓扑一套账号跑四类操作。 |
| A03 路由与代理 | 部分 | ACC-SH-04 验循环，H3.2–3.5 的独立路由、代理模式/配置同步未完成。 |
| A04 模板与工作区启动 | 部分 | H4.1、H4.2 已覆盖六预设、顺序、单分栏故障、绑定失败零拨号；逐项复核登录命令及实际结构编辑恢复。 |
| A05 多持有者互不误杀 | 部分 | H4.2/H6.1/H8/H9 分域有据，需 H12.1 同主机组合关闭和恢复。 |
| A06 完整终端 | 部分 | Shell 与分栏可用，H4.3、H5.1–5.4 仍缺 IME、真实 PTY 和广播/录制等。 |
| A07 附属与独立双栏 | 已满足（工作台独立视图） | E/H6.1-file-session-windows.md 核对切活动 Pane、固定目标和单独关闭；独立 OS 窗口待核。 |
| A08 传输 | 已满足（Windows 回环绑定双栏） | H7.1/7.2 的批量跨远端、队列上限、暂停续传、冲突和发布故障测试；最终包重跑。 |
| A09 编辑、SCP/sudo、目录跟随 | 部分 | H6.2–6.4 的冲突/权限与 Git Bash；SCP、独立特权通道和真实 PTY 未齐。 |
| A10 四种转发 | 部分 | E/H8-runtime-windows.md 实测四种流量、端口冲突、共享、断跳显式恢复和释放；真实服务端绑定策略待核。 |
| A11 监控与服务端工具 | 部分 | H9.1–9.3 用实际回环和合成返回；完整服务器窗口/真实指标待验。 |
| A12 设置 | 部分 | H10 设置覆盖搜索、保存、实际超时与文件展示；终端和工具作用域待补。 |
| A13 MCP/CLI 各自完成操作链 | 未满足 | H11.1 五项核验、H11.2 WIP；缺持久作业、主机写、SFTP 外部闭环。 |
| A14 全部 UI 动作进入公共目录 | 部分 | H11.1 实际开放五项，其他动作需逐项登记/绑定/验证。 |
| A15 共享工具选择 | 部分 | settings.spec.ts 与 public-resources.engine.test.ts 分别查共享修订、默认关闭及撤权；同一 SSH 工具的双页操作待复验。 |
| A16 重试/游标/取消 | 部分 | 探测按主体与目标复用，传输有发布对账；持久作业和游标依 H11.2。 |
| A17 生命周期 | 部分 | 各域释放测试已存在，组合切库、崩溃、插件互不影响见 H12.1。 |
| A18 三平台执行组件 | 只能在对应 OS 验证 | H1.2 的 Windows 参考构建不能证明生产资产；三平台需分别验证缺资产拦截与包内运行。 |
| A19 文档/许可/真实主机 | 部分 | H1.1 有映射，各 E/ 有 Windows 操作记录；真实目标、实际采用项 NOTICE、工具使用说明待 H12.2。 |
| A20 单一执行层及全部动作可执行 | 部分 | 现用同一个 SSH 管理器；H1.2 分发决定、H5/H9/H11 未完成，尚不能签全项。 |
| A21 脱离 Safe 管理并连接 | 部分 | E/P10-ssh-owner-cutover.md 已验三状态真实回环；两外部入口不能完整新增/替换主机认证再执行。 |

### #8 Mail

Mail 的 Engine、界面与测试分别在 `plugins/mail/src/engine/`、`plugins/mail/src/ui/`、`plugins/mail/test/`。桌面入口在 `tests/e2e/workflows/mail.spec.ts`，早期 Edge 实际组件探针在 E/S1-workbench/workbench-renderer.test.ts。

| 计划切片（33） | 状态 | 基线证据或最近相关实现 | 剩余实现或验收动作 |
| --- | --- | --- | --- |
| S0.1 确认可复用源码与 Huhu 的差异 | 已验收 | E/S0.1-source-baseline.md；one-mail d1be24d5bb83 | 后续按真正采用的文件补 ledger、NOTICE、UPSTREAM 与发行说明。 |
| S0.2 确定首条收发路径的协议后端 | 已验收 | E/S0.2-transport-probe.md；同一回环比较 TS/Rust，生产 imap-connection.ts、smtp.ts | 沿用 TS Engine 传输决策，在真实目标收集服务差异。 |
| S1a.1 用预设发现文件夹并保存邮箱 | 已验收 | 97040034、34610456、b5b3c610；accounts-engine.test.ts；W/t4z/report09.md | 18+1 预设/合成目录发现、NAMESPACE 过关；真实服务器参数分提供商验。 |
| S1a.2 从所选邮箱读到首封 IMAP 邮件 | 已验收 | 29c6f328、77edc5bd；E/S1-S2-mail-reader.md、messages-engine.test.ts | 原账号/目录取首封回环 IMAP 已验，真实邮箱列 S9。 |
| S1a.3 在账号栏切换邮箱并修复认证 | WIP | ca6e6e31；E/S1a.3-account-repair.md、MailModule.tsx | 修复、分组、窄窗已验；补拖动栏宽、hover/右键及 OAuth 重授权完整路径。 |
| S1a.4 预览影响并删除指定邮箱 | 已验收 | 7fd88b74；E/S1a.4-remove-account.md、outbox-engine.test.ts | 复跑删除预览、处理中断、保留可能已接受事实及其他账号不变。 |
| S1b.1 离线写一封富文本并继续编辑 | 待验证 | 45ae8500、48ffa5e0、cd1bd9a0；E/S1-workbench.md、drafts-engine.test.ts | 离线富文本、失败后离场重试有据；查只读/过期草稿、显式丢弃及关闭的全部选择。 |
| S1b.2 添加、移除并恢复草稿附件 | 已验收 | b48e37c1、cbf98559；E/S1b.2-desktop-attachments.md、draft-attachments-engine.test.ts | 桌面原生选择、修订、重开/删除复验；浏览器来源单列 S8.2。 |
| S1b.3 同一草稿版本只启动一次投递 | 已验收 | 50580696、8dc4bbb4；W/t161/report04.md、outbox-engine.test.ts | 回环 SMTP 同草稿只占一次；外部并发待 S8.1。 |
| S1b.4 在发件箱核对部分成功与未知投递 | 已验收 | 415efe99；W/t162/report03.md、outbox-engine.test.ts | 回读部分接受/未知、仅重试允许的收件人，最终候选重新统计 SMTP DATA。 |
| S2.1 按公开参与者浏览单人及多人对话 | 已验收 | e5de8840、0e3d6a5e；E/S2.1-contacts.md、E/S2.1-public-reader.md、conversations-engine.test.ts | 回归多方归组、公开字段、Bcc 与撤出目录的迟到正文。 |
| S2.2 跨账号搜索并定位到具体邮件 | 已验收 | 288ec99d、2394440a；E/S2.2-search-locate.md、search-command.test.ts | 回归时间筛选、跨账号同 ID、快捷键与原信焦点，在缓存范围内验。 |
| S2.3 展开正文与原文，按单封控制外部资源 | WIP | 77edc5bd；E/S1-S2-mail-reader.md、MailReader.tsx | 可看正文/原文、外图默认屏蔽；缺仅对该封授权远图的宿主实现与证明。 |
| S2.4 让用户知道已读是否同步到服务器 | 已验收 | 77edc5bd、d02355ce；E/S1-S2-mail-reader.md、messages-engine.test.ts | 回归 IMAP 服务器确认、失败/仅本地覆盖与刷新持久性。 |
| S2.5 从原信引用回复或回复全部 | 已验收 | b854b7bc；E/S2.5-replies.md、outbox-engine.test.ts | 复跑回复全部、原账号/线程、引用编辑和焦点。 |
| S2.6 转发原信并区分附件元数据和实际字节 | 已验收 | 46a770ed；E/S2.6-forward.md、prepare-forward.ts | 复跑转发编辑、附件仅有元数据以及有受管字节两条分支。 |
| S2.7 在联系人上下文另起新话题 | 已验收 | 46a770ed；W/t17c/report08.md、E/S2.6-forward.md | 复验联系人上下文开新题不带旧线程，原会话保留。 |
| S3.1 添加并重新授权 Google 邮箱 | 待验证 | 4563a422、649fe2e7、c6abb258；E/S3.1-S4.1-mail-oauth.md、oauth-engine.test.ts | PKCE/待答、取消、重启对账有回环证据；注册的 Google 客户端实测同意/拒绝/续权。 |
| S3.2 沿 Gmail 实际传输读信和回信 | 待验证 | d02355ce；E/S3.2-gmail-history.md、oauth-engine.test.ts | 回环测分页、history 失效、正文和回复；授权 Gmail 实号验实际传输/回退。 |
| S4.1 添加 Outlook 账号并说明可用权限 | 待验证 | 4563a422、704f8271；E/S3-S4-oauth-session-review.md、oauth-engine.test.ts | 真实租户分别验证 consent、权限不足、重授权与原账号绑定。 |
| S4.2 按 Outlook 实际路径读正文和回复 | WIP | 7170a7b5；E/S4.2-outlook-imap.md；oauth-engine.test.ts | Exchange IMAP/SMTP 回环有据；获批全权限 Graph、deltaLink、正文/发送路径仍缺，逐租户记录范围。 |
| S5.1 调整刷新周期并从断线恢复 | 已验收 | 4f301953；E/S5-imap-refresh-and-notification.md、sync-engine.test.ts | 回归账号内串行、断线恢复、更新周期/停插件和迟到结果。 |
| S5.2 从新邮件通知回到目标消息 | 已验收 | 4f301953；E/S5-imap-refresh-and-notification.md、mail.spec.ts | 回归去重通知、目标失效、打开原账号消息及焦点。 |
| S6a.1 导出一致的邮件子集或整 Vault 包 | 待验证 | bb259e39、5a83942b、bc371828；draft-attachments-engine.test.ts、E/S6b.1-subset-restore.md | 整包字段/附件快照及子集已有测试；补当前包并发草稿/发件事实、取消/缺件和 P8.3 实际 Git 候选。 |
| S6a.2 从整 Vault 新格式备份恢复邮件 | 待验证 | draft-attachments-engine.test.ts 的 ZIP 字节恢复；W/t162/report03.md、packages/vault/test/package.test.ts | 整包在新物理目录/新 VaultId 核原草稿、未知投递、零发送、按范围缺附件与非空目标失败。 |
| S6b.1 预检并恢复 Huhu 新格式邮件子集 | 已验收 | 04bd14e4、1af317fe；E/S6b.1-subset-restore.md | 新格式子集预检、同地址保留、取消/重试、缺件、无自动发信；装包重跑。 |
| S7.1 配置并验证 Mail 专用 AI 服务 | 独立候选 | b739090e；W/t1c2/report01.md；分支 evidence-S7.1-mail-ai-settings.md | Lead 在 boot.ts 同时声明描述并传 aiCatalogDeclared，核对 mail.ai 定义与主机密钥恢复隔离。 |
| S7.2 只向已选择的 AI 服务提交选定邮件内容 | 独立候选 | 5c1c52a9；W/t1c2/report01.md；分支 evidence-S7.2-mail-ai-selection.md | 按原候选复验选段、目的地、取消/撤权、失败后保留、采纳为草稿且零投递；补已登录 Web 与同包。 |
| S7.3 查看占用并清理可重建邮件缓存 | 已验收 | dcf1848a、c1204976；E/S7.3-cache-settings.md | 回归仅清缓存、无意外投递，草稿/本地覆盖/已发保留，空缓存重建。 |
| S8.1 通过获开放的工具操作同一邮箱 | WIP | 44358105、oauth-catalog.test.ts；drafts.ts 的 workbenchDraft/authorize；167632b7 | 按 §8.2 补业务能力及静态登记，CLI/MCP 分别授权、发现、读写、投递去重、按项撤销。 |
| S8.2 从 Web 工作台传送草稿附件 | 未开始 | desktop-attachments.ts、E/S1b.2-desktop-attachments.md；web-share.spec.ts 的通用文件流 | 接入 Mail 草稿专属上传句柄、修订/主体/大小校验，第二设备传 >8 MiB 后核哈希。 |
| S8.3 从另一台设备跟进同一次 OAuth 授权 | 待验证 | 649fe2e7、c6abb258；E/S3-S4-oauth-durable-outcome.md、mail.spec.ts | 宿主回环与迟到 ACK 有据；oauth-sessions.ts 将 actor 绑定实例/caller/subject，非原主体无权读取。补第二设备发起、宿主完成，明确 Web 与 CLI 经授权可见的账号结果和禁止跨主体取回会话的边界。 |
| S9.1 核验 Mail 的平台、来源与完整流程 | 待验证 | B/evidence/windows-stage-combined-40822efd.md、E/S0.1-source-baseline.md、W/t1c2/report01.md | 同一包连通 S0–S8；主题/键盘/窄窗截图，来源/许可与数据恢复说明，三平台及真实邮箱矩阵。 |

#### #8 原文 §13 逐项判定

原文以分组内的勾选项列要求，以下编号按原顺序对应。one-mail 旧库迁入在现行 spec.md 的「新格式备份与恢复」中已被 Huhu 新格式子集恢复替代。

| 原文项 | 判定 | 证据和边界 |
| --- | --- | --- |
| 功能 1 · Mail 独立启停、Inbox 保留 | 已满足（集成路径） | cd1bd9a0 注册独立模块；bb259e39 测 Mail 停用/启用，原 inbox 插件仍独立注册。 |
| 功能 2 · 18+1 预设/边界 | 部分 | presets.ts、W/t54/report05.md 验 18+1 定义；图标出处、别名与真实服务支持需 S9 矩阵。 |
| 功能 3 · 管理账号全周期 | 部分 | S1a.1–4 和 S3/S4 回环证据，在线 OAuth 重授权未验。 |
| 功能 4 · 分组/交互/窄屏 | 部分 | E/S1a.3-account-repair.md、E/S2.1-contacts.md，栏宽、hover、上下文菜单待补。 |
| 功能 5 · 公开参与者合并与隐私 | 已满足（已缓存样本） | E/S2.1-public-reader.md、conversations-engine.test.ts 覆盖公开本地已发、排除 Bcc 与失效读区。 |
| 功能 6 · 搜索和引用焦点 | 部分 | E/S2.2-search-locate.md、mail.spec.ts 有快捷键与消息定位；右键引用回复及跨宿主焦点单验。 |
| 功能 7 · 正文、原文与图片 | 部分 | E/S1-S2-mail-reader.md，单封远图放行未接。 |
| 功能 8 · 写信至发件箱 | 部分 | 草稿、回复、Cc/Bcc、受管附件与逐收件人回执有 S1b/S2 证据；内联/浮层、丢弃与全部焦点路径待验。 |
| 功能 9 · 转发与能力边界 | 已满足（回环组件入口） | E/S2.6-forward.md 区分已有字节与元数据；删除本机账号/发件记录不执行远端删除。 |
| 协议 1 · IMAP/Gmail/Graph | 部分 | E/S3.2-gmail-history.md、E/S4.2-outlook-imap.md；Graph 完整实现/授权和真实供应商端到端缺失。 |
| 协议 2 · 游标、分页及对账 | 部分 | sync-engine.test.ts、oauth-engine.test.ts 覆盖 IMAP 代次/Gmail history；Graph delta 和真实异常未验。 |
| 协议 3 · 已读状态 | 已满足（已实现传输） | E/S1-S2-mail-reader.md、E/S3.2-gmail-history.md 明确服务器确认与本地覆盖。 |
| 协议 4 · 调度与恢复 | 已满足（Windows 回环） | E/S5-imap-refresh-and-notification.md，账号串行、周期与断线恢复。 |
| 协议 5 · 跨入口投递防重 | 部分 | outbox-engine.test.ts 验 SMTP 不确定与重启，当前外部工具不能与 UI 发起同一提交。 |
| 协议 6 · Mail 自管密码/OAuth/AI | 部分 | 97040034、649fe2e7；AI 仍在 5c1c52a9，Linux 本机保护失败影响此项。 |
| 协议 7 · 清理/只读 | 已满足（已实现数据类） | E/S7.3-cache-settings.md 核对本地标读、草稿、附件、投递记录与只读拒绝。 |
| 协议 8 · 附件限制/跨设备流 | 部分 | cbf98559、draft-attachments-engine.test.ts 约束本机路径和大小；S8.2 尚待接线。 |
| 协议 9 · HTML 隔离 | 部分 | mail-html-tree.ts、MailReader.tsx 与 E/S1-S2-mail-reader.md 有过滤及默认屏蔽；对 CSS/URL 与按封放行在真实宿主复核。 |
| 协议 10 · 旧格式迁入/新格式恢复 | 部分（原迁入已被替代） | 04bd14e4 完成现行 Huhu 子集；整包失败矩阵与机器凭据恢复按 S6a.2。 |
| 协议 11 · 停插件/换库/通知 | 部分 | E/S5-imap-refresh-and-notification.md、S3/S4 的取消/回执及 bb259e39；联合检查所有订阅/晚到结果。 |
| 工程 1 · UI/CLI/MCP/API 矩阵 | 未满足 | S8.1，大量 drafts.ts/registration.ts 的能力仅工作台可调用。 |
| 工程 2 · 主题/明暗/键盘/动效 | 部分 | E/S1-workbench/ 有实组件截图和窄宽样例，四主题、减少动效与全部焦点路径缺矩阵。 |
| 工程 3 · 门禁与打包 | 部分 | 40822efd 阶段包；4d86c84b Linux test 有 15 败，最终全量待验。 |
| 工程 4 · 源样例、夹具与在线矩阵 | 部分 | S0/S3/S4 有固定来源、回环断言；真实服务、日期、账号类型、路径需授权环境。 |
| 工程 5 · 三平台安装/实际 UI | 只能在对应 OS/真实服务验证 | 有 Windows 阶段包，Linux 未做本组安装 UI 验收，macOS 未测。 |
| 工程 6 · 操作录像/截图 | 部分 | E/S1-workbench/、S6b.1；AI 部分在独立分支，统一版本补 OAuth 错误等全部场景。 |
| 工程 7 · 来源与使用/恢复文档 | 部分 | E/S0.1-source-baseline.md 与批次 sources.md 有映射；按采用源码核出处、许可、UPSTREAM/NOTICE、配置限制与用户工具说明。 |

### #9 Safe 与模块自有凭据

个人模型测试在 `plugins/safe/test/`，宿主测试在 `apps/engine/test/module-credential-host.test.ts`，Windows 原生保护的适用范围限制下游 #7/#8。成员目录将证据直接命名为 `evidence-*.md`。

| 计划切片（25） | 状态 | 基线证据或最近相关实现 | 剩余实现或验收动作 |
| --- | --- | --- | --- |
| P0.1 验证模块能在本机独立保存和取用认证 | 待验证 | 64788547；W/t1b/report01.md、W/t4z/report10.md、module-credential-host.test.ts | Windows x64 原生保护已有阶段验收。t6 核 Linux 正常及不可用状态，macOS 单独验本机保护和重开。 |
| P0.2 替换模块认证失败后仍可使用原配置 | 已验收 | 84a3d42a、2758912e；W/t4z/report04.md、packages/kernel/test/credentials.test.ts | 契约/事务已验；换平台原生适配再测失败保留原绑定、回收与只读。 |
| P1.1 初始化、解锁并锁定新保险箱 | 已验收 | a7c51d9a；W/t4z/report13.md、safe.engine.test.ts | 回归初始化/锁定/重开、损坏拒写及锁定代次。 |
| P1.2 一次保存网站及其多个账号 | 已验收 | 7f7c5547；W/t13x/report01.md、personal.engine.test.ts | 三账号五字段、同名独立、磁盘/索引无明文，最终包重开。 |
| P1.3 只更新选中账号或条目公共信息 | 已验收 | 8ee7643d；W/t13x/report01.md、personal.engine.test.ts | 原 ID 修改、版本失败、其他账号保持、重启一致。 |
| P1.4 改主密码后按对应版本解锁 | 待验证 | safe.test.ts 含「主密码轮换只替换包裹，同一账号密文及清单字节保留」、改密发布前锁定；SafeSettingsPage.tsx | 从设置改密后重启验旧/新密码、两次导出各配当时密码，衔接 P8.2。 |
| P2.1 管理彩色标签及已有条目关联 | 已验收 | d282fffc；evidence-p2.1-p2.2.md、safe-tags.spec.ts | 回归标签复用、改色/名、解除共享关联。 |
| P2.2 组合标签和搜索定位到账号 | 已验收 | d282fffc；evidence-p2.1-p2.2.md、safe-tags.spec.ts | 回归标签交集、无标签、账号定位及锁定清空。 |
| P3.1 从列表进入多账号表单并保存 | 待验证 | 1bee36b5、d282fffc；evidence-p3.1-p3.3.md、EntryEditor.tsx、shell.spec.ts | 三账号新建/窄窗冲突有据；补已有条目追加账号、长字段、换库清除草稿。 |
| P3.2 安全删除指定账号或整个条目 | 已验收 | 1bac3348；W/t1bh/report09.md、personal.engine.test.ts、shell.spec.ts 的最后账号确认 | 主链通过；补对删除动作本身在发布前后撤权的交错。 |
| P3.3 显式显示指定账号的密码并重新遮罩 | 已验收 | 1bee36b5、0b30323e；evidence-p3.1-p3.3.md、shell.spec.ts | 按会话定点 reveal、切换/锁定遮罩；同包验迟到响应。 |
| P3.4 复制选中账号并反馈系统结果 | 未开始 | PersonalWorkspace.tsx 无个人账号复制动作；packages/workbench/src/settings/host.ts 有 copyText | 接入选中账号、复制与清除反馈，桌面/浏览器成功/拒绝/不可用、在锁定后丢弃迟到结果。 |
| P4.1 向指定 Git HTTPS remote 配置与使用认证 | 已验收 | 0f5bbeb7、40822efd；evidence-p4-versioning-cutover.md、plugins/versioning/test/ | Windows 系统 Git HTTPS 回环，改 remote 不沿用秘密；换平台复验。 |
| P4.2 修复 Git 认证后恢复同步 | 已验收 | 8dc4a5f2、40822efd；同 P4.1 与 W/t12p/report06.md | 回归修复原 revision 后恢复、Safe 解锁零额外网络。 |
| P5.1 只用 SSH 主机配置建立连接 | 已验收 | 5ed0f03e、e289ca7e；#7 E/P10-ssh-owner-cutover.md、host-auth.engine.test.ts | 三种 Safe 状态已验；Linux 凭据后复跑 SSH 密码与私钥。 |
| P5.2 从获授权工具完成主机交互 | WIP | 24276472、be7a8b8e；#7 public-resources.engine.test.ts | 已验外部核验信任；等 #7 H11.2/11.3 接上外部新增认证、执行、对账。 |
| P6.1 用 Agent CLI 自己的环境启动会话 | 已验收 | 2d964099、3eed4e0c、5ee1a705；module-credential-host.test.ts、shell.spec.ts 的真实终端；40822efd 包内记录 | Windows 原生受保护环境已验，Linux/macOS 单独验证真实 PTY/退出、不持久化秘密。 |
| P6.2 用规则自有认证派遣一次运行 | 已验收 | 74015354、d667d1ac、c3d5b7ff；tasks/P6.2-automation-run-env.md、acceptance.spec.ts | 同包核对一次性票据与取消、日志脱敏，#5 派遣保持单路径。 |
| P7.1 邮箱账号和 AI 的认证各归 Mail | WIP | 4563a422、649fe2e7 的邮箱身份；5c1c52a9 的 mail.ai 在独立线 | 等 S7.1/7.2 接入后验两个 owner 不串用，停用/锁 Safe 后照常或明确缺少本机认证。 |
| P8.1 导出同一代个人资料和脱敏模块定义 | 待验证 | 1bac3348、5a83942b、bc371828；engine.test.ts 的 ACC-SY-08、draft-attachments-engine.test.ts | 原收集器串代/引用缺失已修，重验最终新增 AI 等全部模块定义，包内只含允许的密文/脱敏字段。 |
| P8.2 把新格式保险箱恢复到新目录 | 待验证 | apps/engine/test/engine.test.ts:1239 已用当前 safe.entries.create 在新目录/新 ID 恢复一个账号；packages/vault/test/package.test.ts | 补 Google 三账号+标签、改密前后两包、缺 keyring/错误密码和机器凭据重绑，具有 UI 证据。 |
| P8.3 验证 Git 暂存只包含可同步资料 | 未开始 | origin/impl/huhu-issues-3-10-safe-git 与基线同 SHA；W/t1c2/task02.md 无 report02.md | t6 完成 Linux 凭据 task01 后接 task02；用真实 Git index/出站树验证当前 keyring/密文同代、并发改标签、不拼接双边代、保留无关已暂存文件，排除机器秘密、缓存、ASKPASS。 |
| P9.1 从空白测试 Vault 完成首次使用 | 待验证 | a7c51d9a、1bee36b5、shell.spec.ts 干净 Web/桌面初始化 | 从新安装空 Vault 连续完成首次设置、三个账号、各模块未配置空态和重开，不操作真实旧库。 |
| P10.1 分别控制个人管理和敏感读取 | 已验收 | 0b1f7395、558af632；evidence-P10.1-safe-tools.md、external.engine.test.ts | 跨入口普通管理与显式敏感读取独立可撤销；旧报告曾临时绕过白屏；b3833a20 已补 Automations 来源 manifest，需在标准组合包复跑。 |
| P10.2 验证所有现行消费者已切到所属模块 | WIP | e289ca7e、40822efd、558af632；evidence-p4-versioning-cutover.md 与 #7 P10-ssh-owner-cutover.md | 按消费者追踪旧符号、帮助与清理，外部 SSH、Mail AI、暂存与同包五模块证据待齐。 |

#### #9 原文 §9 逐项判定

| 原文 | 判定 | 依据和边界 |
| --- | --- | --- |
| A01 三账号重启后字段 | 已满足 | personal.engine.test.ts 的「桌面工作台一次保存三个账号…」及 P1.2。 |
| A02 只修改选中账号 | 已满足 | 8ee7643d、personal.engine.test.ts，其他账号逐字一致。 |
| A03 公共字段/同名账号 | 已满足 | P1.2、P1.3 的稳定 ID 及 P2.1 标签事务。 |
| A04 增删及最后账号 | 部分 | 1bac3348 和 shell.spec.ts 验最后账号另行确认；已有条目内新加账号需补。 |
| A05 彩色标签 | 已满足 | evidence-p2.1-p2.2.md，解除关联保留条目。 |
| A06 标签+检索 | 已满足 | safe-tags.spec.ts、personal.engine.test.ts，命中账号和无标签视图。 |
| A07 遮罩、显隐及复制 | 部分 | P3.3 有据，P3.4 缺选中账号的复制 UI。 |
| B01 磁盘及索引无明文 | 已满足（个人字段测试） | personal.engine.test.ts 读真实隔离 Vault 和索引，P8.3 另管 Git。 |
| B02 手动/自动/离开锁定 | 部分 | safe.engine.test.ts、shell.spec.ts 证明会话代、离开、显隐清理；真实计时及 UI 切库/迟到复制仍缺。 |
| B03 改密及损坏保护 | 部分 | safe.test.ts 验轮换及旧包装保护；改密前后备份恢复还缺端到端。 |
| B04 整包后恢复完整个人库 | 部分 | 基线 ACC-SY-08 已从旧条目夹具更新为当前格式账号，仍缺三账号/标签/双快照和缺 keyring 的交互证据。 |
| B05 旧数据保全 | 已满足（现行范围） | spec.md 取消旧迁入；safe.test.ts 的退役库及 #7 e289ca7e 合成旧文件逐字节保全。 |
| C01 SSH 脱离 Safe | 已满足（Windows 回环） | host-auth.engine.test.ts 分三种状态实拨。 |
| C02 单用 MCP/CLI 管理再执行 | 部分 | H11.1 只有既有目标信任核验；P5.2/H11.3 待完成。 |
| C03 Git 自管 HTTPS | 已满足（Windows 回环） | evidence-p4-versioning-cutover.md 以真实 Git 验目标变化与修复。 |
| C04 Agent 与自动化自管 | 已满足（Windows 受保护启动路径） | P6.1、P6.2，包内真实终端及票据验证；其他 OS 待验。 |
| C05 Mail 自管账号、OAuth 和 AI | 部分 | 邮箱/OAuth 已集成，AI 候选未合。 |
| C06 同数据、敏感权限分离 | 已满足（Safe 自身） | 558af632、external.engine.test.ts 覆盖 CLI stdin、HTTP、两种 MCP 和已登录 Web。 |
| D01 清理运行时旧依赖 | 部分 | 基线域内搜索显示 Safe 自身仍发布 safe.unlocked，Automations 的 service.ts/index.ts 仍识别/剥离旧 envRefs；需区分保护旧记录与实际取密/调度路径，按所有生产调用者复核。 |
| D02 Git 暂存与包扫描 | 部分 | 5a83942b、bc371828 加强 ZIP 验证；P8.3 真正暂存索引尚缺。 |
| D03 冲突、在途锁与取消 | 部分 | credentials.test.ts、external.engine.test.ts、module-credential-host.test.ts 有分域覆盖；最终同包扫描进程环境、日志与恢复文件。 |
| D04 清单、目录、帮助统一 | 部分 | P10.1 已清理 Safe 普通/敏感路径；P10.2 跨模块文档、SSH 工具及 Mail AI 仍须核对。 |
| D05 真实页面与关键入口 | 部分 | Windows 的 shell.spec.ts、Git HTTPS、SSH 回环与受保护终端有据；缺同候选以及 Linux/macOS 本机保护实证。 |

### #10 首页看板

画布代码在 `packages/workbench/src/home/`，布局模型在 `packages/contracts/src/home.ts`，存储/校验在 `packages/kernel/src/capabilities/home-dashboard*.ts`。本节的 acceptance.spec.ts 均指 `tests/e2e/workflows/acceptance.spec.ts`。

| 计划切片（37） | 状态 | 基线证据或最近相关实现 | 剩余实现或验收动作 |
| --- | --- | --- | --- |
| W01-01 用同一布局样本比较网格实现 | 未开始 | 任务 W01-01、design.md 的 PoC 判据；实际 dashboard-layout.ts 自行计算碰撞/重排，Dashboard.tsx 实现指针手势 | 未找到 RGL/GridStack/Homarr 同样本运行和择优记录。先补坐标、性能、键盘、取消/卸载对比，决定是否保留现实现。 |
| W01-02 走查完整看板与默认首屏 | 已验收 | 6da1b2ec、prototype-review.md（e0583379…） | 原型与默认布局已获确认；产品 UI 单独验，对照此指纹。 |
| W02-01 读取新格式布局并区分首次与空板 | 已验收 | 1057af93；packages/kernel/test/home-dashboard.test.ts；B/progress.md | 重开区分无文件的默认种子、合法空板、已存板和损坏板。 |
| W02-02 原子提交一份完整新布局 | 已验收 | 922df362、78aa04f2；E/W02-02-atomic-board.md；apps/engine/test/dashboard-save.test.ts | 生产入口重跑原子整板、只读拒绝、业务文件不变。 |
| W02-03 核实并发或失联保存结果 | 已验收 | 57f3becd；dashboard-save.test.ts、B/windows-shell-dashboard.md | 回执丢失、同意图回放、并发旧 revision 冲突复验。 |
| W02-04 备份可核验的新格式布局 | 已验收 | 57f3becd、db4fb826；acceptance.spec.ts 只备份已提交布局 | 核对备份时磁盘已提交版与编辑草稿独立。 |
| W02-05 从新格式备份恢复已提交布局 | 已验收 | f8fb9f55、a8ba335b、db4fb826；E/W02-05-board-recovery.md、dashboard-recovery.test.ts | 复验确认、同 revision 字节被换、未知格式与原件保全。 |
| W03-01 从目录查找可用的小组件类型 | 已验收 | 98907e70、65bd6eba；W/t4z/report03.md、plugins/ssh/test/home-widget.test.ts | 签收的可信贡献契约可复用；真实提供方逐个验清单漂移和权限。 |
| W03-02 为同一类型添加两张独立卡 | 待验证 | Dashboard.tsx 的 add/insert、HomeWidget.tsx（SSH）；acceptance.spec.ts 验 SSH/Git 两种卡 | 同型而不同目标的两张卡，保存/重开核对各自业务数据与 ID，取消不写。 |
| W03-03 复制卡片并单独修改配置 | 待验证 | Dashboard.tsx 使用 createRequestId 和 structuredClone；home-dashboard.test.ts | 复验复制 A 后将副本改为 B，非法配置、单例拒绝与取消。 |
| W03-04 隐藏并找回布局实例 | 待验证 | Dashboard.tsx 的隐藏与显示已隐藏卡片、home-dashboard.test.ts | 验证隐藏/找回同一 ID/位置、隐藏单例不复制、取消不写业务文件。 |
| W03-05 停用或缺失插件后找回原卡 | 待验证 | 65bd6eba、2e50eae4；acceptance.spec.ts 的停用 SSH 实例，B/windows-shell-dashboard.md | 已验停用重启用；补缺定义期间编辑其它卡、实例原样与查询/订阅计数。 |
| W03-06 在单卡内修复错误并重试 | 待验证 | 2e50eae4；acceptance.spec.ts 的概览失败单卡重试 | 查询失败已验，补抛渲染异常、坏配置修复、无权限零请求。 |
| W03-07 配置已有实例并保留身份 | 待验证 | Dashboard.tsx 的 configureWidget、plugins/ssh/src/ui/HomeWidget.tsx | 已存 A 改名/换 B 保存重开，原 ID/格位未变，取消与已失效目标反馈。 |
| W03-08 只移除选中的布局实例 | 待验证 | Dashboard.tsx 的移除、useDashboard.ts；home-dashboard.test.ts | Dashboard.tsx 移除按钮直接过滤草稿实例和格位；补任务要求的动作确认/取消，再验保存为空板及业务文件保全。 |
| W04-01 编辑并保存或取消同一份草稿 | 已验收 | 78aa04f2；B/windows-shell-dashboard.md、acceptance.spec.ts | 回归整份草稿、显式保存前零写和取消恢复。 |
| W04-02 跨列跨行移动卡片并保留空位 | 已验收 | f4e397a0；B/windows-shell-dashboard.md、acceptance.spec.ts 宽屏拖动 | 跨列行移动、预览/取消与保存重开复验。 |
| W04-03 按尺寸约束缩放卡片与内容 | 待验证 | f4e397a0；同宽屏用例、dashboard-layout.ts | 已有实际把手缩放；补各定义 min/max、窄/宽卡体内控件及边界重开。 |
| W04-04 仅用键盘完成布局编辑 | 待验证 | Dashboard.tsx 提供移动、尺寸选择/反馈；acceptance.spec.ts 有 Escape | 桌面全程键盘与指针产生相同几何，窄屏顺序、屏读播报和 reduced-motion 待实测。 |
| W04-05 窄屏调整顺序与尺寸后在桌面恢复 | 已验收 | 78aa04f2；acceptance.spec.ts 的窄屏调序宽屏重开，B/windows-shell-dashboard.md | 回归主动修改顺序/尺寸、仅缩窗不写坐标。 |
| W04-06 保存冲突后对照已提交布局 | 已验收 | 57f3becd、78aa04f2；acceptance.spec.ts 的其他会话先保存 | 同 revision 竞争后草稿可读，仅显式采用新版本才写。 |
| W04-07 带改动离开时可保存、放弃或继续编辑 | 待验证 | 78aa04f2；tests/e2e/knowledge/session-flush.spec.ts、B/windows-shell-dashboard.md | 继续编辑和保存离开有实证；安装包补放弃、保存失败、菜单退出/系统 X、笔记最后输入保全。 |
| W04-08 切换 Vault 后隔离迟到的布局与业务结果 | 待验证 | useDashboard.ts、apps/engine/test/dashboard-recovery.test.ts | 实际双库带不同实例/业务选区；延迟 A 查询、保存或事件至 B，验证不串库且拒写留 A。 |
| W04-09 恢复默认看板前可以反悔 | 已验收 | 6ab4e2b9；E/W04-09-reset-defaults.md、acceptance.spec.ts | 确认只改草稿、Esc 返回、保存后仅启用定义重开。 |
| W05-01 在两张任务卡按各自筛选完成任务 | WIP | HomeModule.tsx 的 renderTasks；2e50eae4；acceptance.spec.ts 的 ACC-WB-05 | 任务业务已可用但仍属 widget:kernel:tasks；迁到 tasks 贡献，跨时区两实例独立计数、行内完成。 |
| W05-02 从最近笔记卡定位所选笔记 | WIP | HomeModule.tsx 的 mainNodes.notes、requestOpenPath；2e50eae4 | 已有点击具体文件；定义和取数迁到 notes，验失效路径与另一卡可用。 |
| W05-03 从待处理捕获卡回到收件箱 | WIP | HomeModule.tsx 的 mainNodes.inbox；contracts/src/home.ts | 收件箱预览/跳转已在共享首页；迁回 inbox，核对待处理数量、选择、停用与重新启用。 |
| W05-04 专注计时跨模块持续并在关窗时暂停 | 待验证 | FocusCard.tsx、FocusPauseOnClose.tsx；acceptance.spec.ts 的关窗暂停、B/windows-shell-dashboard.md | 验证隐藏/跨模块仍计时、多个挂载/离开下全局暂停一次。 |
| W05-05 独立显示习惯并保留打卡记录 | 待验证 | HabitsCard.tsx、packages/kernel/test/home.test.ts；B/windows-shell-dashboard.md | 已有打卡与重开；独立显隐、取消/删除布局不动习惯文件需串测。 |
| W05-06 按模块浏览最近活动 | 待验证 | 2e50eae4；HomeModule.tsx 的 ActivityFeed | 完整页可筛选，卡体用 compact；验实例内模块筛选/时区/错误及首页收口。 |
| W05-07 按实例显示主机列表或指定主机 | 待验证 | 98907e70；plugins/ssh/src/ui/HomeWidget.tsx、plugins/ssh/test/home-widget.test.ts、acceptance.spec.ts | 可信 SSH 贡献存在；两个已选主机、删除其中一台与停用恢复在同板验。 |
| W05-08 从版本卡查看当前 Vault 的 Git 状态 | 待验证 | plugins/versioning/src/ui/HomeWidget.tsx；acceptance.spec.ts 已从目录添加 Git | 有贡献与业务入口；补 Git 不可用、切真实仓库查看分支/变更数、停用不查询。 |
| W05-09 从自动化摘要查看真实规则或运行 | 待验证 | 2e50eae4；plugins/automations/src/shared/home-widget.ts、acceptance.spec.ts 的规则摘要 | 旧审查所报缺失已有补丁；验证真实规则/运行、停用时不挂载、独立入口不触发调度。 |
| W05-10 从看板进入 Agent CLI | WIP | HomeModule.tsx 的 widget:kernel:agent，contracts/src/home.ts | 已有导航；定义/卡体归 agent-cli，按启用/授权呈现，无活动会话时不造状态。 |
| W05-11 从指标概览核对四项业务数量 | 待验证 | HomeModule.tsx 的 metrics；2e50eae4；acceptance.spec.ts | 实际四指标与源各自核对，验证插件停用及单项查询失败。 |
| W05-12 首次首页显示已启用的默认卡 | 待验证 | packages/contracts/src/home.ts、1057af93、6ab4e2b9；E/W04-09-reset-defaults.md | 缺文件首开与已存空板有基础；不同启用组合验证默认板、空板首卡入口和恢复一致。 |
| W06-01 一次切换到单一首页并验收 | WIP | 78aa04f2、2e50eae4；apps/desktop/src/renderer/main.tsx 的 today/activity 与 HomeModule.tsx 的独立 ActivityFeed | 按单一首页要求收口旧入口、完成业务归属；同包 ACC 全矩阵、视觉/性能/许可与 #3/#6 联验。 |

#### #10 原文 §9 逐项判定

| ACC-DASH | 判定 | 依据或缺口 |
| --- | --- | --- |
| 01 首开默认布局 | 部分 | 默认种子与停用过滤见 W02-01、W04-09，W05-12 补不同启用组合和合法空板。 |
| 02 拖到其他行列并恢复 | 已满足（Windows 阶段） | f4e397a0、B/windows-shell-dashboard.md，几何写入与重载。 |
| 03 缩放与卡体适配 | 部分 | W04-03 把手和持久化有据，定义边界与内容适配未全验。 |
| 04 取消不写盘 | 部分 | W04-01/09 有草稿字节证明，补复制/移除等每类编辑与关窗拒写。 |
| 05 两个同型实例 | 部分 | 可信目录、实例配置存在；W03-02/W05-07 双目标需产品入口证明。 |
| 06 复制/单独配置 | 部分 | W03-03/07 有 clone 与配置控件，缺重开后展示不同目标。 |
| 07 隐藏/移除不改业务数据 | 部分 | W03-04/08 待同时比对布局、目标业务文件及其他实例。 |
| 08 停用/恢复 | 部分 | acceptance.spec.ts 证实 SSH 停用与重启用；两插件和零查询/订阅待核。 |
| 09 单卡失败隔离 | 部分 | 2e50eae4 增补查询错误/重试，渲染抛错、配置修复等仍需核对。 |
| 10 切 Vault 后隔离 | 部分 | W04-08 核双库真实看板及延迟回包。 |
| 11 只读/写失败 | 已满足（存储合同） | dashboard-save.test.ts、dashboard-recovery.test.ts、B/windows-shell-dashboard.md；关窗失败留草稿另验。 |
| 12 旧偏好迁移/损坏恢复 | 已满足（现行规格） | 原 hidden/order 转换已被替代；spec.md 要求保全旧/未知格式，用新格式备份恢复。E/W02-05-board-recovery.md、dashboard-recovery.test.ts 验确认修复、拒绝未知和保全。 |
| 13 查看模式业务控件 | 部分 | ACC-WB-05 与 Dashboard.tsx 的编辑把手；输入、滚动、选字不触拖拽尚缺完整交互样本。 |
| 14 尺寸/主题 | 部分 | W04-05 已验宽窄共享布局；需 1024×768、1366×768、宽屏/最小窗、四主题明暗、DPI 与字体。 |
| 15 键盘/减少动效 | 部分 | W04-04 缺完整键盘指针等价、屏读与减少动效结果。 |
| 16 快速连续编辑/性能 | 部分 | 持久化、防重复注册与指针预览分别有证；W01-01/W06-01 需连续手势渲染轨迹和监听计数。 |
| 17 清单/注册一致 | 部分 | 65bd6eba 已验可信定义与清单归属；任务、笔记、收件箱、Agent 仍为 kernel 定义。 |
| 18 旧业务回归/单一首页 | 部分 | 2e50eae4 已恢复独立规则摘要与若干失败态；owner 迁移和 today/activity 旧路径收口未完成。 |

### 跨成员依赖与派发顺序

| 契约 | #7–#10 的提供者/消费者 | 基线可依赖的部分 | 仍需共同签收 |
| --- | --- | --- | --- |
| #4 回执、#5 受理与 ACK | #9 Agent/规则注入沿同一启动链；#10 任务卡、Agent 入口和规则摘要消费业务状态。#7 SSH 作业与 #8 Mail 投递各有自己的受理记录。 | 1b3b3857、95d5d4c3、79b495a2；native-receipts.live.test.ts 和 persistence-http.test.ts 覆盖按稳定 run/attempt 匹配回执，持久验收才 ACK。下游可依现有读模型开发。 | 各域对账保持原执行身份；联验①仍须分别用每个入口走全链并桌面定位。 |
| #5 T7.1 → #4 W8.3 | 直接依赖在 #4/#5；#9 P6.2 与 #10 W05-09 分别验证凭据和运行摘要。 | 4c8fe523 切生产入口、35dc2bf8 退役旧监督器、f207e8e1 对账，#5 evidence/T7.1-terminal-occurrence-recovery.md 有阶段证据。 | 先在同候选核实 T7.1 所有生产调用者/公开入口，再由 W8.3 提供原会话和包摘要；W8.2、T7.2 分别验同一包。40822efd 的自动化包内测试可复用。 |
| #6 能力目录与授权 | #7 主机/探测/信任，#8 账号及投递，#9 Safe 管理/reveal，#10 贡献资格和 Web 页面 | 0fdfbb56、9d6ad33b 提供静态描述与 Vault 选择；运行时按主体/令牌、插件、transport 重验。SSH 五项、Safe 独立敏感权限已有真实入口。 | #7 H11.1/11.3 扩展其余动作，Q6-3 主机粒度仍待定；#8 S8.1 补可用 handler。#10 区分无权/停用/定义缺失。Lead 统一登记描述。 |
| #9 本机模块凭据 | #7 SSH、#8 Mail/API/AI、Git、Agent、Automations 各持有自己的定义与秘密 | P0.2 定义修订及保留/替换/清空、快照与失败回滚可用；64788547 Windows 原生宿主有证。 | Linux 宿主影响 15 项；macOS 未验；P8.3 暂存、P8.2 重绑和新 AI owner 同包核对。Safe 锁定态与本机保护不可用分别返回真实状态。 |
| #10 Widget 贡献 | #7 SSH、#5 Automations、Versioning 已有可信贡献；#4 Agent、Tasks 等仍需移交 owner。#8 按 program 提供可用业务，不在 W05 擅增邮件卡。 | 98907e70、65bd6eba 决定 manifest、定义、配置 schema 和组件归属。2e50eae4 已补规则摘要。 | 同型实例读真实目标，缺权/停用时不挂载。依赖已有数据动作即可迁移组件，无需等 #7/#8 全部功能。 |
| #3 退出事务与 #6 Web | #10 先处理看板草稿，#3 等结果再结算文档；#8 草稿保存失败也要阻止离场 | 78aa04f2、cd1bd9a0、session-flush.spec.ts；Web 邀请与看板已在 Windows/Edge 阶段联验。 | 同包验系统 X/退出菜单、失败/放弃、两库和浏览器撤销。Web 文件与 OAuth 需走宿主支持的真实入口。 |

**推荐派发清单。** 规模 S 表示定向复验或小范围接线，M 表示一个域的端到端切片，L 表示多域或多平台。行内列出可拆的子片。Lead 独占 Engine/Renderer 装配、插件注册、Vault 包收集器、静态能力目录和根锁文件；表内写“Lead”表示 worker 提供域内改动后由 Lead 接相应共享文件。最多四个 worktree，当前 t5、t6 继续用已有 worktree，后续按空位轮转。

| 顺序/子片 | 建议写入范围 | Lead 独占点 | 规模、依赖及可并行项 |
| --- | --- | --- | --- |
| 1a #9 P0.1/P8.3 Linux 凭据与 Git 暂存 | 先处理 apps/engine/src/module-credential-host.ts 及其宿主测试，再做 plugins/versioning/ 的真实暂存与出站树 | t6/task01 特准 boot.ts 的 BootOptions 和宿主创建点；其余装配/包收集/根锁由 Lead | M+M，t6 先做平台后做 P8.3；可与 1b/1c 同时，先恢复真实 Linux 消费者门禁。 |
| 1b #7 H11.2 验证/完成作业 | plugins/ssh/src/engine/、plugins/ssh/test/；同主体有界输出、取消与复查 | 共享描述或 boot 由 Lead | M，t5 进行中，不再另派同一 WIP；与 1a/1c 并行。 |
| 1c #8 S7.1/7.2 收候选 | plugins/mail/、已有分支证据、tests/e2e/workflows/mail.spec.ts | Lead 在 apps/engine/src/boot.ts 静态目录+mail.apply，核对 ZIP owner；仅锁文件有实差时更新 | S–M，独立候选可先复核，与 1a/1b 并行，Linux 端到端等 1a。 |
| 2a #7 H1.2、H2.1/3/5/6、H3.1–3.5 | plugins/ssh/src/engine/、ui/，tests/e2e/ssh/；先执行层验证，再目录/草稿，然后路由与代理；按 H 号分工 | 执行组件资产、宿主接口、依赖锁若有变动 Lead 接 | L，可边验执行层边做不拨号的目录，路由/认证共享 manager.ts 要串行。 |
| 2b #7 H4.3、H5.1–5.4、H10.1 | plugins/ssh/src/ui/Workspace*.tsx、SshTerminal.tsx、engine/ 及 SSH e2e | 本机 PTY/独立窗的桌面装配由 Lead | L，依 H1.2/H4.2；可与 Mail/看板并行，广播与录制各自验。 |
| 2c #7 H6.2–6.4/H7.3、H8.2、H9.1–3、H10.2 | plugins/ssh/ 的 file-sessions、SFTP、archives、forward-*、monitor-* 和对应测试 | 新宿主能力/客户端流登记由 Lead | L；文件域、转发、监控可分轮次，与 2b 先约定会话 ID；H7.1/2 已有实现不需重写。 |
| 2d #8 S1a.3/S1b.1/S2.3、S3–5/S8.3 | plugins/mail/src/ui/、engine/oauth-*、gmail-history.ts、sync-schedule.ts、Mail 测试 | 宿主浏览器/Renderer 资源策略由 Lead | L；阅读/账号 UI 与协议域可并行；Graph/在线 consent 和第二设备需要对应环境，可先跑回环。 |
| 2e #9 P1.4、P3.1/3.4、P9.1 | plugins/safe/src/ui/、engine/，tests/e2e/shell.spec.ts 内 Safe 用例 | 剪贴板复用现有宿主；需扩展公共宿主时 Lead 接 | M；可与 2a/2d/网格 PoC 并行，和 3c 共享现行数据代契约。 |
| 2f #10 W01-01；W03-02–08、W04-02–06/08 | 网格比较使用既有 sources；packages/workbench/src/home/、packages/kernel/test/；tests/e2e/workflows/acceptance.spec.ts | 若确需依赖，根锁由 Lead；不占 Engine 注册 | M–L；先测现有几何与候选库再决定适配。卡体用例可并行，画布同一写者。 |
| 2g #10 W05-01–12、W06 单一首页 | plugins/tasks、notes、inbox、agent-cli、ssh、versioning、automations；packages/workbench/src/home/、packages/contracts/src/home.ts | Lead 接各 plugin 清单/注册、Engine/Renderer 装配与原有布局类型兼容 | L；按提供者拆，先稳定旧实例 ID/配置再切；共享 HomeModule 交单一写者，与各域不重叠处并行。 |
| 3a #7 H10.3/H11.1/11.3，#9 P5.2 | plugins/ssh/ 的描述/handler、CLI/MCP 实际调用夹具、tests/e2e/ssh/ | Lead 接 #6 静态目录和真实 transport 注册 | L；主机和探测可先验，完整链依 1b、文件传输和授权规则。 |
| 3b #8 S8.1/8.2 | plugins/mail/ 的账号/草稿/投递/附件、Web 入口、相应回环测试 | Lead 接 #6 静态目录、授权文件流与 Renderer 装配 | L；与 3a 独立域可并行，#6 共享登记串行；第二设备核大附件与失效句柄。 |
| 3c #9 P8.1/2、P7.1/P10.2 与 #8 S6a.1/2 | plugins/safe、mail、versioning 的域内可移植定义与取样用例；packages/vault/test/、apps/engine/test/ | 整库收集器、boot 装配、静态目录由 Lead 独占 | M；依 1a/1c，P8.2 双密码双包、S6a.2 零自动发送，和纯 UI 可并行。 |
| 4 #7 H12.1/12.2、#8 S9.1、#9 P10.2、#10 W04-07/W06-01 | 固定组合提交的 tests/e2e、包内验收、各 Change/evidence 与实际采用项 docs/upstream/ | Lead 统一并入当前 main 的 #2 收尾、冻结候选、全门禁、打包与 SHA | L；前序完成后按 OS/目标独立跑同一源码；最终记录通过、失败、未测，不能混加旧包与候选结果。 |

### 三条组合联验的现有自动化与补验

| 链路 | 可复用测试文件与用例名 | 实际覆盖与最后缺口 |
| --- | --- | --- |
| ① 创建/派遣/查询/答复/读回 | `plugins/agent-cli/test/native-receipts.live.test.ts` · `Windows MCP and CLI dispatch and answer through the same Core session and production Tasks inbox` | 同一 Windows Core、实际 CLI 和 MCP HTTP、生产 Tasks 收件箱，隔离 provider 夹具。首轮由 MCP 建 Task，CLI 派遣，MCP 查问，CLI 答复和读取，后续有反向组合。验证 run/session 相同、回答仅一次。目标要求另以全 MCP、全 CLI 各建一个新任务，记录两条独立链。 |
| ① 断线与重复回执 | 同文件 · `Windows Engine recovers both lost ACKs for the same native receipt without another input`；`plugins/tasks/test/persistence-http.test.ts` · `持久验收原回执后才 ACK，重开补送原评论一次且不重新执行` | 故障注入验证原 ACK 匹配、重开补送和业务计数。新包应对两个入口分别在送达前/后断开，重连后比对 taskId、runId、sessionId、输入与评论数。 |
| ① 工作台定位/本组相关性 | `tests/e2e/packaged/packaged.spec.ts` · `打包后：自动化发生、运行抽屉与任务详情使用同一笔派遣`；B/evidence/windows-stage-combined-40822efd.md 的实 Codex 组合记录 | 包内用例含失联原目标，后续 Windows 阶段另有桌面定位；目标仍需同一候选两条外部链均刷新定位原会话。#7/#8 不承担 Task 所有权，#9 P6.1/2 检查凭据不复制进回执；#10 检查任务卡读到相同业务状态。 |
| ② 默认关闭/按需启用/撤销 | `apps/engine/test/tool-access.test.ts` · `两个 Vault 分开保存工具选择，重启保持版本，未配置的新工具关闭，损坏时失败关闭`、`两份工具预览只有同一版本的首个提交能整批生效，发现、撤销和落盘共用策略`；`plugins/safe/test/external.engine.test.ts` · `同一保险箱条目经工作台、CLI stdin、HTTP 与两种 MCP 修改和读取，逐项授权可撤销` | 有干净策略、并发版本、普通/敏感能力分别开放。用相同新 Vault 和安装包核每个新增 SSH/Mail 工具的初态、获准/撤销后旧缓存实际调用，并验证内部工作台仍可使用。 |
| ② Safe 锁定后仍能认证 | `plugins/ssh/test/host-auth.engine.test.ts` · `Windows SSH 自有密码在 Safe 三种状态可用且备份只带可恢复定义`；`plugins/ssh/test/public-resources.engine.test.ts` · `first trust stays with the original attempt, route and external subject through policy and token revocation`；`tests/e2e/shell.spec.ts` · `Agent 受保护启动在 Safe 未初始化、锁定和停用时接入真实终端`；`tests/e2e/workflows/acceptance.spec.ts` · `终端规则在桌面配置和清除受保护环境，Safe 停用后仍可运行` | SSH/Git 和 Agent/终端规则有 Windows 真协议/进程子链，Git 证据另见 #9 evidence-p4-versioning-cutover.md。Mail 有真实 Engine 回环 SMTP/IMAP、OAuth 夹具，AI 为独立候选。待 Linux 凭据、H11/S8 权限就位，在一个包与同一 Vault 依次锁定、授权、调用、撤权并读回各自状态。 |
| ② 新格式备份恢复 | `apps/engine/test/engine.test.ts` · `ACC-SY-08：导出受管数据包 → 在新目录导入：Markdown 与保险箱密文哈希一致，保险箱用原主密码解锁；导出结果的 SHA-256 与文件一致`；`plugins/mail/test/draft-attachments-engine.test.ts` · `整库备份不会发布引用新 Mail 附件却遗漏附件目录的数据包`；`plugins/mail/test/outbox-engine.test.ts` · `Mail ZIP 预检拒绝覆盖，确认后恢复选中的持久数据并可重开重试` | 同代、拒绝不一致快照及新目录可解锁有据。最终包要扫描 staged/ZIP、三账号/标签跨改密、各模块恢复后补认证、Mail 未知投递不重发，且验证子集和整包各自的缺件行为。 |
| ③ 菜单、文档与看板关窗 | `tests/e2e/knowledge/session-flush.spec.ts` · `应用菜单保存当前文档，关窗先处理看板草稿再结算文档`、`TB-14/15 关窗缺少保存回执时保留编辑和 Engine` | Windows 阶段真实菜单动作、文档字节及继续编辑/保存的落盘先后已验，原生弹层由夹具选择。补同包系统 X/菜单退出、放弃只丢布局、看板保存拒写/冲突保留窗口和文档；在 Linux/macOS 验实际菜单和焦点。 |
| ③ 两邀请、三会话与布局 | `tests/e2e/workflows/web-share.spec.ts` · `Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开`；`apps/engine/test/web-share.test.ts` · `桌面启用分享后，独立浏览器会话可访问同一 Vault 并按邀请撤销`；`apps/engine/test/dashboard-save.test.ts` · `W02-03/04 断开前后的整板重读、原意图回放和已提交备份` | B/windows-shell-dashboard.md 有 Edge 三独立上下文、同邀请二次使用、另一邀请仍在线与布局恢复；监听/浏览器均在同机。最终候选补浏览器重开/刷新与桌面读同 revision、撤销后的在途操作，物理第二设备单列（尤其 Mail 文件/OAuth）；Web 用例缺浏览器二进制时会 skip。 |


### 远端 impl 分支逐一核对

只读检查本机已获取的 refs/remotes/origin/impl/huhu-issues-3-10-*。共 58 条，50 条存在基线不可达的 SHA，8 条已在基线祖先链（含同 HEAD）。下表分支名均省略 origin/impl/huhu-issues-3-10-。检查每条的 git log 4d86c84b..ref，逐提交找基线对应并比较 git patch-id --stable。

映射左方是源 SHA，右方是基线可达 SHA；= 为稳定 patch-id 相同，≈ 为拣选后上下文/实现有差异或组合收纳。≈ 依据提交说明、涉及路径及集成实现判断内容已被承接，不声称分支树逐字相同。重复出现在不同分支的 SHA 只是一份工作。

| 分支 | 独有数 | 对应关系（源 → 集成） | 处置 |
| --- | ---: | --- | --- |
| agent-environment | 1 | 7c1d1ee8 = 2d964099 | 已被替代，沿用集成实现 |
| agent-lifecycle | 10 | ec581b32 = 3bd2e245、ba5f3481 = 59c97def、4fe97901 = 95d5d4c3、a20128b8 = 571ac026、db0a562f = 6c2cc928、5cda8418 = 30da8fe6、ce5289dd ≈ 9d36640e、5daf0486 = 1b3b3857、9a8225f1 = 3ffd0698、3804140c = 414d042c | 已被替代，沿用集成实现 |
| agent-pty | 2 | f4f68fd3 = 5ee1a705、cfcea984 = 3eed4e0c | 已被替代，沿用集成实现 |
| agent-space-package | 1 | 331defdb = 27f8b636 | 已被替代，沿用集成实现 |
| automation-tools | 0 | 1eb37eea | 已包含 |
| capability | 5 | c70a9872 = 79f95f90、cc736e5f = 82ef3280、29a6e8f1 ≈ 9d6ad33b、6e6240d5 = 0fdfbb56、2dfd7624 = ca8290d0 | 已被替代，沿用集成实现 |
| credentials | 3 | 47f854b4 = 2758912e、86f810e8 = 5e255d36、7174fc8d = 84a3d42a | 已被替代，沿用集成实现 |
| dashboard-geometry | 1 | 3eeb62d7 = f4e397a0 | 已被替代，沿用集成实现 |
| dashboard-restore | 1 | 95ecb232 = f8fb9f55 | 已被替代，沿用集成实现 |
| follow-up | 2 | 35e13890 = e632027c、ccbda0bd = c600ef35 | 已被替代，沿用集成实现 |
| integration | 0 | 4d86c84b | 已包含 |
| mail | 1 | be12ca89 = 97040034 | 已被替代，沿用集成实现 |
| mail-ai | 2 | 5c1c52a9、b739090e | 独立候选，两笔均未合，需 Lead 装配 |
| mail-api-sync | 2 | 119d19c8 = 7170a7b5、4c491cc0 = d02355ce | 已被替代，沿用集成实现 |
| mail-confirmed-ui | 11 | 2524d695 ≈ 288ec99d、2a627f54 ≈ 0e3d6a5e、d941065b ≈ e5de8840、b1aafd92 ≈ 46a770ed、4e6daf08 = 24438602、f4e43d5e ≈ 7fd88b74、46b9047a ≈ 2ea0bda8、6a75ccd7 ≈ b854b7bc、44941ecd ≈ ca6e6e31、94dc30a5 = 77edc5bd、20567cc2 = 48ffa5e0 | 已被替代，沿用集成实现 |
| mail-data-settings | 3 | 6c88b90b ≈ 04bd14e4、6ce5a850 = c1204976、1127e370 = dcf1848a | 已被替代，沿用集成实现 |
| mail-drafts | 4 | bf37a4ea ≈ 415efe99、564a9b68 = 50580696、5ab72a2b = b48e37c1、37bcc525 = 45ae8500 | 已被替代，沿用集成实现 |
| mail-oauth | 1 | 03b8ccc0 = 4563a422 | 已被替代，沿用集成实现 |
| mail-oauth-outcomes | 1 | e01b5b06 = 649fe2e7 | 已被替代，沿用集成实现 |
| mail-oauth-review | 3 | d7f1cff2 = 44358105、1fd570c7 = 704f8271、cfd76b9c = 5ee5fa1c | 已被替代，沿用集成实现 |
| mail-repair | 2 | 6d9fde65 = 34610456、be12ca89 = 97040034 | 已被替代，沿用集成实现 |
| mail-sync | 1 | 251baeef = 4f301953 | 已被替代，沿用集成实现 |
| native-existing | 0 | 43fdad6c | 已包含 |
| normal-reply | 1 | 6d4b6623 = 3ab02fe5 | 已被替代，沿用集成实现 |
| production-cutover | 17 | 1f7ceec8 ≈ 0d279330、8ff3549b ≈ 0d279330、7ae257b2 ≈ 0e1b1167、14a95f7f ≈ c16acfb3、3f479b89 = b55c94c8、9198c349 = a4fe0262、815d9917 = db61ce53、69776e68 = aa9952bb、7aafa47b = 623608c7、311ba0c8 ≈ d667d1ac、5bdaff66 = e13d8d6d、49b9cea8 = 38ab7f27、0ca39e6a = ea252571、bbc3f014 = 301dee75、82b5ec95 = f207e8e1、6d51ad28 = 35dc2bf8、1f5a472a = 4c8fe523 | 已被替代，沿用集成实现 |
| protected-env | 1 | fb562efe = 74015354 | 已被替代，沿用集成实现 |
| receipt | 8 | 4fe97901 = 95d5d4c3、a20128b8 = 571ac026、db0a562f = 6c2cc928、5cda8418 = 30da8fe6、ce5289dd ≈ 9d36640e、5daf0486 = 1b3b3857、9a8225f1 = 3ffd0698、3804140c = 414d042c | 已被替代，沿用集成实现 |
| reminders | 1 | 3b08dc44 = 927536f2 | 已被替代，沿用集成实现 |
| safe-confirmed-ui | 2 | ec781688 = d282fffc、e2f84e9d = 1bee36b5 | 已被替代，沿用集成实现 |
| safe-git | 0 | 4d86c84b | 同基线，P8.3 未开始 |
| safe-personal | 3 | aaeed7f8 = 8ee7643d、1910acc0 = 7f7c5547、6b11b63c = a7c51d9a | 已被替代，沿用集成实现 |
| safe-tools | 0 | 1bac3348 | 已包含 |
| scan-cutover | 1 | 35e46623 = 0514c1a2 | 已被替代，沿用集成实现 |
| ssh | 1 | 38891343 = 7edd015a | 已被替代，沿用集成实现 |
| ssh-confirmed-ui | 3 | 4f771358 = 9e924607、ff3221aa = 17625f3d、3b837a7d = 528ff232 | 已被替代，沿用集成实现 |
| ssh-exec-jobs | 1 | c23a8258 | WIP，未合且旧验证缺失 |
| ssh-file-follow | 0 | 295c052b | 已包含 |
| ssh-forwarding | 2 | f19a3a9e = 96d79929、e69a8580 = 22fbdc4f | 已被替代，沿用集成实现 |
| ssh-host-auth | 1 | 65742887 = 5ed0f03e | 已被替代，沿用集成实现 |
| ssh-import | 1 | a12309b8 ≈ 0839ab75 | 已被替代，沿用集成实现 |
| ssh-import-confirm | 1 | 588bece5 = d036effb | 已被替代，沿用集成实现 |
| ssh-monitoring | 3 | 9c55c07e ≈ 95b7352c、c2e3605d ≈ adca7b97、006d42a9 = e289ca7e | 已被替代，沿用集成实现 |
| ssh-public-resources | 0 | be7a8b8e | 已包含 |
| ssh-settings | 5 | 6ba3c6bd = 7367e1f7、f8f00159 = 1f438d3d、22e86fd3 = 040a2e01、ed7ef6f7 = 5f277163、89d84e3d = f6fd6039 | 已被替代，沿用集成实现 |
| ssh-transfers | 5 | 895ae975 = afd400ef、731b50cc = 11d7b576、5e3e59de = 6e99e78a、0fe4f1bb = ed17bce6、568fbbe5 = a1edc22a | 已被替代，沿用集成实现 |
| task-executor | 6 | da653169 ≈ 264699e1、162fa0dc = 1a735971、15b34b45 ≈ af2305b3、77a52b6b ≈ 79b495a2、9b34df69 ≈ c839daf6、ff0afc58 ≈ c0c70e67 | 已被替代，沿用集成实现 |
| task-occurrence | 6 | 3174c325 = 5273a390、4d030749 = ee2cf74c、7734b844 = 964fd1ce、d14e5159 = f9ad06b7、61b02ab4 = 53003e14、3d9f6079 = 764e324b | 已被替代，沿用集成实现 |
| task-recovery | 6 | 3c79467e = 9761f2a1、29d68b3a = e940403b、4b4d4f32 = d2e929f3、6b43fcec = 1379c777、6cc99edd = dd514483、a5d82cb7 ≈ 96f53d35 | 已被替代，沿用集成实现 |
| task-run-ui | 1 | 2b693b4e = 2f848859 | 已被替代，沿用集成实现 |
| task-supplement | 0 | 7d1a869b | 已包含 |
| task-terminal-view | 3 | 33e2d230 = 891c20e1、b909fc4a = 264699e1、1641ff69 = cd39e857 | 已被替代，沿用集成实现 |
| task-tool-access | 1 | 315c75d1 = 34088404 | 已被替代，沿用集成实现 |
| tasks | 5 | 29d68b3a = e940403b、4b4d4f32 = d2e929f3、6b43fcec = 1379c777、6cc99edd = dd514483、a5d82cb7 ≈ 96f53d35 | 已被替代，沿用集成实现 |
| versioning-auth | 2 | bb6f450b = 8dc4a5f2、f5a92e68 = 0f5bbeb7 | 已被替代，沿用集成实现 |
| versioning-owned-auth | 1 | df0fca91 = 40822efd | 已被替代，沿用集成实现 |
| web-share-ui | 1 | 464c0e03 = dcc95e63 | 已被替代，沿用集成实现 |
| widgets | 2 | 7e9cedaa = 65bd6eba、15403bd7 = 98907e70 | 已被替代，沿用集成实现 |
| window-chrome | 3 | 688122c1 = cfbce161、51facc51 = efc33768、b48d3555 = 82f34b95 | 已被替代，沿用集成实现 |

其中 production-cutover 的 8ff3549b（绑定文件会话）及 1f7ceec8（版本化编辑）合并收在 0d279330，对应 H6.1/H6.3 文件和工作区 e2e 都存在。ssh-monitoring 的独立 Playwright 注册已改用 tests/e2e/ssh/monitoring.spec.ts。task-executor 的 79b495a2 提交说明记录复用既有私有 Tasks 回执授权。mail-drafts 的 415efe99 多接 manifest；Mail UI 系列在当前宿主/快照上下文拣入。余下源 SHA 已列明对应目的提交，未发现第三条需要整支重新合入的功能分支。

handoff/huhu-issues-3-10-mail-cache-stash 的 f4a4c158 为 stash 归档，在 impl 过滤范围外。origin/main 上 #2 收尾由 Lead 单独合并回归，不作为本清单的独立功能候选。

## 产物与改动

交付文件为本报告。业务代码、计划、Git refs 和各 worker 的现场均未改动。四份计划、原始 Issue 和阶段记录可从以下位置复查。

| 成员 | 计划与原文 | Windows 证据入口 |
| --- | --- | --- |
| #7 | [SSH 计划](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-7-ssh-module/plan.md) · [原文 §16](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-7-ssh-module/source.md:361) | [五项 SSH 外部资源](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H11.1-public-resources-windows.md) |
| #8 | [Mail 计划](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-8-mail-module/plan.md) · [原文 §13](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-8-mail-module/source.md:440) | [工作台与探针](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1-workbench.md) · [AI 候选报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/report01.md) |
| #9 | [Safe 计划](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/plan.md) · [原文 §9](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/source.md:256) | [Safe 权限](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-P10.1-safe-tools.md) · [Git 认证](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p4-versioning-cutover.md) |
| #10 | [看板计划](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/plan.md) · [原文 §9](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/source.md:253) | [桌面/Web 与退出](/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b/.agents/dev/changes/2026-11-19-huhu-issues-3-10/windows-shell-dashboard.md) |

## 验证

| 验收要求 | 实际检查与结果 | 证据位置或复查方法 |
| --- | --- | --- |
| 身份和只读范围 | Linux Core 自身变量为 t9；开始时清单为 t9 / task01.md / active，未发现已有终稿。无联网、子 agent、运行测试或业务写入。 | 本主题 topic.md、manifest.tsv 与 t9/task01.md。 |
| 逐片与原文 | 四个计划 40+33+25+37，共 135 个唯一子片；分别按原文 21、27、23、18 条核对。明确标出现行规格对旧数据迁入/转换的替代。 | 四份 plan.md 的 tasks 链接、各 task 的验收、source/spec/design/prototype-review 与上述代码/测试。 |
| 固定基线 | 实现、测试及资源取 archive 4d86c84b，Git 对应仓库 /home/wta/projects/huhu。Windows 日志摘要是历史记录，Windows 本机临时日志/安装包原件在此机不可复验。 | B/progress.md、B/windows-stage-{packaging,combined-3bd2e24,combined-3290af1,combined-9bb7efaf}.md，B/evidence/windows-stage-combined-{78e180b7,40822efd}.md，主仓 B/handoff.nd。 |
| 历史失败隔离 | W/topic.md 载 t17b error，manifest 为 blocked 且无 report01；t18v/task13 是 delivered-partial。最新活跃 t18v/task15、t1c2/task02、t1bh/task11 均无同号终稿，未作为通过证据。后续明确修复依赖其真实提交和后续测试。 | W/manifest.tsv、W/topic.md、W/t1bh/report09.md、report10.md，以及 5a83942b、bc371828。 |
| 本机 refs 完整性 | 以 `git -C /home/wta/projects/huhu branch -r --list 'origin/impl/huhu-issues-3-10-*'` 枚举，逐项检查 `git log 4d86c84b..REF`、基线 log、stable patch-id；有偏差的对照变更路径、提交内容及产品入口。 | 上方映射；组合收纳可用 `git show --stat 0d279330`，拣选适配可用 `git range-diff SOURCE^! TARGET^!`（在主仓只读运行）。 |
| Linux 与组合链 | 采用 Lead 的同 SHA Linux 门禁计数；Windows 受限测试有 skipIf，不能用 Linux 的跳过代替 Windows pass。各链已列精确用例、夹具、输入身份和未测项。 | t6/task01.md、B/program.md 的「组合验收」、B/evidence/windows-stage-combined-40822efd.md、上方三条联验表。 |

## 阻碍与接续

盘点已完成。当前最大的取证限制是缺最终组合包、跨平台本机凭据与真实服务证据。旧 Windows 本机临时产物、新 Linux 候选的运行结果、真实邮箱授权及第二台设备均不能从本快照反推。按派发清单先验三个已有接续点，再在同一固定候选汇总成员结果和三条联验。对缺环境的项目保留平台、服务及缺少的观察量。

## Lead 验收

由 Lead 追加。

Lead 验收（2026-11-21）：通过。抽查 mail-ai（b739090e、5c1c52a9 未入集成）、ssh-exec-jobs（c23a8258）、safe-git（=4d86c84b）与 Lead 的 `git log` 结果一致；其余 50 条有独有 SHA 的分支按 patch-id 映射判为已被替代，清理阶段按此表复核后删除。派发清单 1a/1b/1c 已在执行（t6、t5、Lead）。集成已合入 origin/main 为 `2b280794`，后续切片以它为基线。终端关闭，不复用。
