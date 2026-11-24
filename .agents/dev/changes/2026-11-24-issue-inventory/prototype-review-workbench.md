# #14 工作台布局 · 原型走查与用户确认

## 入口与版本

用文件方式打开 [工作台原型](prototype/workbench/index.html)。目录内容 SHA-256 为 `38fc421b99259162bc30a34ed29bf3cb335075caf836d841ae30bfd7391d209d`。随入口保留同目录全部本地资源。右下角「原型演示」可切换故障条件和重置，刷新恢复初始数据。跳转到 [自动化中心](prototype/automations/index.html) 时保留样例计划 ID，跨 HTML 文件各自从样例开始。中心内部的来源页和中心操作同一份计划数据。

- Huhu 基线为 `2af88fd6fc55a9cfd92280e60146b38b634139b7`。沿用 [现有外壳](../../../../packages/workbench/src/shell/AppShell.tsx) 的功能栏、模块导航、标签、路径条和状态区，[Huhu 主题](../../../../packages/ui/src/styles/themes.generated.css)、[品牌图标](../../../../assets/brand/huhu-mark-mono.svg) 和现用 Lucide 图标。外壳基础样式承接已确认 SSH 原型。
- 对照 #14 现场图 01–26 与 U0 在 Linux Electron、独立 Web 的现场记录。图 06 和 17 用于交互参考，原始安装包、窗口缩放和显示设备仍按 U0 已知范围记录。UX11 由 [自动化中心原型走查](prototype-review-automations.md) 承接。
- 文档、邮件、账号、令牌、命令、计划和动作结果均为内置演练样例。保存和重试只改变当前文档内的模拟状态。

## 需求、走查路径与源码

| 需求与现场图 | 可操作路径及预期 | 源码定位 |
| --- | --- | --- |
| UX01 编辑排版 · 01、07 | 知识库默认打开当日日记。实时预览、阅读、源码往返核对标题、段落、引用、任务条目、代码和进度块。编辑和选区保留焦点反馈。 | [knowledge.js](prototype/workbench/knowledge.js) `noteBlocks`、`showNotes`；[module.css](prototype/workbench/module.css) `.note-paper` |
| UX02 保存反馈 · 04 | 在源码连续输入。演示区分别注入写入失败、回执丢失或远端冲突。重试失败保存、核实原请求、比较两边版本；保存中继续编辑保留后续改动。尝试离开并保留草稿后返回。 | `saveNote`、`noteStatus`、`guardNote` |
| UX03 单条批注 · 02、03 | 选中一段文字、添加批注、定位、解决与删除。修改或移除锚定原文后显示失锚状态。旧批注示例合并为一条正文并保留两个署名。 | `annotate`、`noteCommentList`、`showNotes` |
| UX04 常驻日记月历 · 05、06 | 左侧切月、今天、切换中英月份与星期。方向键选日，已有日记直接打开，新日期确认后创建，再打开仍为同一个日记。 | `calendarView`、`renderCalendar`、`changeNote` |
| UX05 任务窄栏 · 08、09 | 用长中文、多标签填写窄表单。个人待办可切换为 Agent；选择 Space 和时刻。注入提醒登记失败后修复原关联计划。普通评论不解除原问题，显式答复会更新原任务。 | [workflow.js](prototype/workbench/workflow.js) `taskEditor`、`showTasks`；[shell.css](prototype/workbench/shell.css) `.form-container` |
| UX06 快速捕获 · 10 | 模态中输入斜线，方向键、鼠标或 Enter 选命令，Esc 先关闭菜单。保存完整正文，转换结果未知后核实同一捕获。待处理入口回到原任务或邮件投递。 | `captureEditor`、`convertCapture`、`showInbox` |
| UX07 邮件三栏 · 11 | 账户、会话、阅读三栏。宽时调整会话列，窄时沿返回逐级操作。回复可保留草稿，发件结果分开显示已接收和未送达地址，可只重试未送达收件人。账户设置从独立入口进入。 | `showMail`、`mailComposer`、`accountDialog`；`.mail-columns`、`.column-divider` |
| UX08 终端分栏末行 · 12 | 分栏支持上下左右。模拟输出多屏、拖动分隔线、放大字号、切换会话；终端状态行有独立占位，可查看内容尺寸估算和末行。 | [workspace.js](prototype/workbench/workspace.js) `splitTerminal`、`showAgent`；`.terminal-canvas`、`.terminal-pane` |
| UX09 会话导航 · 13、14 | 比较两个 Space 的同名 Codex。树与全局会话行共同定位现有终端，切换 Space 后分栏状态保持。 | `agentTree`、`selectSession` |
| UX10 两级启动器 · 15–17 | 从第一级进入 Agent，用键盘或鼠标搜索模型、选择可用推理档位、填写提示，返回或关闭后归还焦点。 | `openLauncher`、`providerCatalog`；`.launch-popover` |
| UX12 公共控件 · 19、20 | 任务表单内打开日期子层，按文档语言展示月份，支持确定、清空和今天。日期与纽约本地派遣时间分别处理；不存在与重复时刻给出反馈。 | `commonDatePicker`、`taskEditor`；`.host-dialog` 与 `::picker(select)` |
| UX13 HTTP MCP | 设置 → MCP 服务。复制当前生效 URL 或配置，修改端口后先等待重启；冲突保留实际地址。用演示令牌检查成功、错误令牌、错 Vault 和停用。 | [settings.js](prototype/workbench/settings.js) `showGateway`、`endpointConfig` |
| UX14 工具授权 · 21 | 选择多项、查看所选数量、授权或确认撤销。演示区可切换空目录、只读或来源不可用，SSH 项需要指明演示主机。 | `showTools`、`toolCatalog` |
| UX15 同步表单 · 22 | 分别填写长远端 URL、同步模式和多行排除规则，保存后重新进入。周期操作到指定自动化计划。 | `showSync`、[workflow.js](prototype/workbench/workflow.js) `planLink` |
| UX16 保险箱三栏 · 23 | 左侧选条目，中间直接选第二个账号，右侧按需显示。返回、切换账号和锁定清理当前明文；窄屏按条目、账号、详情逐级返回。 | `showSafe`、`safe.entries`；`.safe-columns` |
| UX17 外观 · 24 | 切换四套主题、明暗、字号与密度。缩窄窗口后主题卡自然重排，再放大时充分使用现有内容宽度。 | `showAppearance`；`.theme-grid` |
| UX18 看板编辑 · 25 | 拖动相邻两张卡，拖动边角或用键盘调整。取消还原；模拟冲突保留编辑，重试保存后返回首页核对相同位置和尺寸。 | [dashboard.js](prototype/workbench/dashboard.js) `moveCard`、`showDashboard`；`.dashboard-grid` |
| UX19 添加卡片 · 26 | 按用途或来源搜索，选择分类，查看尺寸与添加状态。恢复原隐藏实例，单例不可重复添加；演示邮件来源停用。 | `addWidget`、`widgetCatalog`；`.widget-directory` |

## 实际走查

- 2026-11-25 在 Linux 上用 Playwright 1.65.0、Chromium 158.0.8127.18，从 `file:` 地址依次走查 13 条旅程。浏览器离线，记录到的请求均为本地文件，无资源失败或 JavaScript 异常。测试窗口以 1440 × 1000 浅色与 390 × 844 深色为主，补测 700 × 844 外壳和外观页缩窄再放大。页面没有横向溢出。
- 检查了四类关键反馈：保存失败、回执未知和冲突时保留草稿；命令、日期和启动器分层 Esc 与焦点；三栏逐级返回；卡片鼠标拖动、键盘缩放、失败保留及保存后重新打开。带原文件正文的任务及笔记转换各核实一次，重进仍为同一个转换结果。
- 走查中修正了带连字符的导航键取值、原生表单的可访问名称，以及启动器收起后因鼠标留在原处重新展开的问题。最终在窄屏测量子菜单边界，全部区域在视口内。
- 走查脚本与结果在 `temp/dev/2026-11-24-issue-inventory/runs/t1ht/task06/` 的 `walkthrough.cjs`、`walkthrough-final.log` 和 `prototype-walkthrough-final.json`。这些结果仅覆盖文件原型。磁盘、真实 PTY、系统中文输入法、邮件、Git、Vault 凭据与 MCP 监听由真实应用继续验收。

## 用户确认
