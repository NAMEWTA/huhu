# #6 统一工具与 Web 工作台 · 原型走查与用户确认

## 入口与版本

用文件方式打开 [prototype/index.html](prototype/index.html)，保留同目录的六个文件。内容 SHA-256 为 `e607f23a157edbf03aa83177dc613a7dd865d25b75155e8f3cc5dc73515c6ca6`，用 `dev-prototype/scripts/fingerprint.mjs` 计算。页面右下方「原型演示控制」可注入故障或复位。刷新整个 HTML 也会重置内存中的样例。

- Huhu 基线为 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。沿用 [Huhu 外壳](../../../../../../packages/workbench/src/shell/AppShell.tsx)、[主题及尺寸](../../../../../../packages/ui/src/styles/themes.generated.css)、[共享尺寸](../../../../../../packages/ui/src/styles/tokens.css)及[品牌图标](../../../../../../assets/brand/huhu-mark-mono.svg)。
- 行为依据见[规格](spec.md)、[设计](design.md)、[原 Issue](source.md)、[实施切片](plan.md)及[本轮用户决定](../../../../../system/herdr-core/2026-11-19-huhu-prototypes-and-slices/topic.md)。
- 能力管理沿用 [GatewayModule](../../../../../../packages/workbench/src/gateway/GatewayModule.tsx) 的两级导航、表格、状态标签和对话框。浏览器视图沿用同一工作台外壳。URL、Vault、目录数据和设备均为内置样例。

## 需求与场景

| 规格范围 | 走查步骤及预期 | 源码定位 |
| --- | --- | --- |
| A01–A07、B01–B05、C02–C07 | 干净安装显示 0 项开放。逐项开放、筛选匹配结果或跨页勾选后预览。批量包含明确 ID、所有者、作用、风险与计数。授权和可用性分列。停用邮件插件可保留其选择。模拟保存失败保留整批，重试成功。版本或目录变化时退出并重取范围。 | [prototype.js](prototype/prototype.js) 的 `catalogView`、`batch`、`policy`、`verdict` |
| A02、C01、E07 | 通过 MCP、CLI 和外部 API 查当前发现列表与判定。停止 MCP 后其发现清空，CLI 保留已授权项。CLI 启动器状态单列。 | `serviceView`、`verdict` |
| E01–E03、E07 | Web 服务默认停止，首次首选局域网，也可仅本机。开启后显示分配端口与有效地址。端口占用保留配置可重试，拨号中可取消。 | `webView`、`web-config` 提交、`stopWeb` |
| E02、E07、G6.3、G6.4 | 启动后取用邀请 D-001，浏览器 A 和 B 分别通过它进入。另建 D-002 后让 C 加入。撤销 D-001 并确认后，A/B 断开、旧链接拒绝重新连接，C 仍可操作。停服务或切换 Vault 后剩余 Web 会话失效。 | `makeLink`、`join`、`revoke`、`stopWeb` |
| D 系列、E03–E06 | 在浏览器提交任务、勾选状态、编辑笔记、添加或取回演示附件。查看「桌面同步结果」，其他已连接设备读取同一内存数据。笔记冲突保留草稿，重取后可重新保存。 | `browserView`、`webBusiness`、`task-add`、`note-save` |

## 实际走查

- 2026-11-19，Microsoft Edge 157.0.4341.60，Playwright Core 1.65.1。本机直接打开 `file:` 地址，浏览器上下文离线。两个视口均加载 Huhu 标志、样式和交互脚本，全程未记录非本地文件请求、资源失败或 JavaScript 错误。
- 1440 × 1000 浅色。验证默认零开放、Escape 取消与焦点回到原按钮、逐项提交、MCP 启停与 CLI 共用策略、批量写失败整批保留后重试、策略版本冲突。验证 Web 端口占用、取消启动、重启、选取链接、A/B 重复加入、C 使用独立邀请、取消及确认撤销、撤销后的重入失败、C 的笔记冲突与恢复、附件、切 Vault 和停 Web 失效、复位。
- 390 × 844 深色。检索「保存笔记」只显示一行，能滚动表格并完成开放。从窄屏启动仅本机 Web 并进入浏览器工作台，页面无横向溢出。
- 保留模拟端口自动取 43127、三个设备槽及独立另建邀请的演示约定。生产验证由 G1–G8 切片覆盖，包括完整 descriptor 与工具调用、真实落盘与并发、请求重放/对账、各业务工具端到端、设备文件流、深链、真实 LAN、控制端点隔离和终端流。本轮未运行 Electron、第二类浏览器、实际服务或所有筛选/故障组合。

## 用户反馈与确认

2026-11-21 用户在批次会话确认采用八份完整原型。本页对应资源包指纹为 `e607f23a157edbf03aa83177dc613a7dd865d25b75155e8f3cc5dc73515c6ca6`，实施按本 Change 与 Issue 的验收场景推进。

用户确认采用本页指纹 `e607f23a157edbf03aa83177dc613a7dd865d25b75155e8f3cc5dc73515c6ca6` 对应版本中的逐项与批量授权、MCP/CLI 可用性说明，以及 Web 分享、邀请重用和按邀请撤销反馈。沿用开箱零开放，撤销邀请时断开该邀请建立的全部会话。

## 修订与交接

按本页的 SHA-256 打开相同资源。按[实施切片](plan.md)逐条对照上面的交互入口。受保护对象、真实调用和授权生命周期以规格和真实应用验证为准。SSH 的外部授权是否额外按主机缩小范围仍为 Q6-3。
