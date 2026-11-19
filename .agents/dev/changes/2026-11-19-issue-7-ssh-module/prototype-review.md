# #7 SSH 客户端与工作区 · 原型走查与用户确认

## 入口与版本

用文件方式打开 [prototype/index.html](prototype/index.html)，保留同目录的六个文件。内容 SHA-256 为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`，用 `dev-prototype/scripts/fingerprint.mjs` 计算。页面右下方「原型演示控制」可注入故障或复位。刷新整个 HTML 也会重置内存中的样例。

- Huhu 基线为 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。沿用 [Huhu 外壳](../../../../packages/workbench/src/shell/AppShell.tsx)、[主题及尺寸](../../../../packages/ui/src/styles/themes.generated.css)、[共享尺寸](../../../../packages/ui/src/styles/tokens.css)及[品牌图标](../../../../assets/brand/huhu-mark-mono.svg)。
- 行为依据见[规格](spec.md)、[设计](design.md)、[原 Issue](source.md)、[实施切片](plan.md)及[本轮用户决定](../../../system/herdr-core/2026-11-19-huhu-prototypes-and-slices/topic.md)。
- Huhu 的[主机、终端与文件入口](../../../../plugins/ssh/src/ui/SshModule.tsx)和[现有 SSH 样式](../../../../plugins/ssh/src/ui/ssh.css)决定模块外壳与密度。交互依据为[本批次来源清单](../2026-11-19-huhu-issues-3-10/sources.md)中的 Motty `main@2daa9db582e16edf60a60b7ada26f47f808f973c` 与 Viva `main@a5da67aa63440ee836c37a5aa1c70e3eb317401c`。抽查 Motty 的工作区预设与回滚、SFTP 传输状态、转发与监控周期。上游固定 Issue 版本保留出处。界面采用 Huhu 资源。
- 连接、文件、指纹、指标与 Shell 输出均为内置虚构样例。主机表单无需密码。模拟终端只生成预设文本。

## 需求与场景

| 规格范围 | 走查步骤及预期 | 源码定位 |
| --- | --- | --- |
| H01–H05、H09–H10 | 搜索或按组筛选，列表/网格切换，批量连接或移动。新建、编辑或复制主机，测试未保存输入，编辑后旧结果消失。内置导入预览、模块密钥和已知主机操作可取消。删除受引用主机列出相关对象。 | [prototype.js](prototype/prototype.js) 的 `hostView`、`hostDialog`、`dependencies`、`auxiliaryView` |
| H06–H08、R01–R06 | 新建跳板路由，自指和循环无法保存。启动工作区后各跳先信任后认证，单分栏取消或失败后可重试。密钥变化阻止连接，独立核对并移除记录后重新确认新指纹。停用路由仅改变下一次连接。 | `routeDialog`、`routeHops`、`begin`、`verify`、`authenticate` |
| W01–W06、终端 | 创建或启动模板，切换布局、活动分栏、最大化、添加或关闭分栏。从活动分栏显示文件和监控，广播仅向当前可见的就绪分栏生成模拟输出。结构故障有回滚，单分栏故障留下已就绪分栏。 | `workspaceDialog`、`launch`、`workView`、`paneCard`、`simulatedOutput` |
| F01–F08、传输 | 打开独立双栏后切换工作区分栏，独立视图保留源会话。双向发起样例传输，冲突可保留、覆盖、续传或跳过。前缀不符或网络失败后旧文件保留，重试成功才提交。演示暂停、继续、取消、编辑冲突和 SCP 功能边界。 | `attachedFiles`、`fileView`、`conflictDialog`、`startTransfer`、`editFile` |
| P01–P07、监控 | 转发规则保存后再启动。静态模式和动态模式使用各自字段，显示回环监听、借用/专用来源、状态与计数。失败、停止和显式恢复可见。监控可选主机、周期与保留时间，可取样、暂停及失败重试。 | `forwardDialog`、`toggleForward`、`forwardView`、`monitorView`、`configureMonitor` |
| 设置、日志与工具 | SSH 模块内切换通用、终端、连接、文件与 MCP 设置，保存选择。独立查看本次日志、演示密钥、已知主机及可用预设操作。 | `settingsView`、`auxiliaryView` |

## 实际走查

- 2026-11-19，Microsoft Edge 157.0.4341.60，Playwright Core 1.65.1。本机直接打开 `file:` 地址，浏览器上下文离线。两个视口均加载 Huhu 标志、样式和交互脚本，全程未记录非本地文件请求、资源失败或 JavaScript 错误。
- 1440 × 1000 浅色。验证未保存测试随字段变更失效、保存主机、路由拒绝自指与恢复、双分栏独立失败、首次信任、生成预置终端输出、认证取消后重连、文件独立绑定与附属文件跟随。验证同名冲突取消、续传前缀不匹配、网络失败保留旧目标并重试成功、暂停与取消。验证端口占用重试、流量、停止、监控失败重试及暂停、变化后的指纹须经独立移除再确认，以及复位。
- 390 × 844 深色。搜索预检节点后进入，首次信任、取消认证、重连与打开附属文件均可操作，页面无横向溢出。
- 原型按「先解引用再删除」表现 Q7-1。预设自定义分栏比例、独立文件视图同页切换、固定模拟拨号时长及手动样本推进属于演示约定。
- 未运行真实 SSH、PTY、SFTP、代理、转发、系统 Shell、密码储存或其他浏览器。全导入器、认证协议、工作区自定义分割树/多窗口、文件系统完整操作、监控历史及进程/Docker、原生发布与 CLI/MCP 同源调用由 H1–H12 实施切片覆盖。当前只覆盖表中可演练的用户路径。

## 用户反馈与确认

**待用户确认。** 本轮走查证据覆盖列出的浏览器路径。主机引用删除规则和演示约定待确认。

## 修订与交接

保留本原型 HTML、资源和 SHA-256 用于工作区、信任、传输、路由、转发与监控体验对照。按[实施计划](plan.md)验证真实连接身份、传输原子提交、进程与会话生命周期和跨入口授权。原型采用新模型与 SSH 模块独立认证，按用户决定省略旧配置兼容路径。
