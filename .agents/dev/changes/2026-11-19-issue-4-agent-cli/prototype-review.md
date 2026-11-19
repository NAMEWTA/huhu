# #4 Agent CLI 原型走查与用户确认

## 入口与版本

- 直接用浏览器打开 [prototype/index.html](prototype/index.html)。左栏切换工作区和待处理 Agent，中间操作标签与窗格，右侧查看现场、历史、文件及变更。底部「演示控制」可注入故障并复位。复位或刷新重建业务样例，复位保留当前外观选择。
- 原型包共 6 个文件，SHA-256 为 `f8cdbb30afecde1ee492ebc44ffb2ab6349f74f24c5b1feed23d46aca6867d9c`。指纹由 `node .agents/skills/dev-prototype/scripts/fingerprint.mjs .agents/dev/changes/2026-11-19-issue-4-agent-cli/prototype` 生成。交付版本为本目录中的完整资源，当前工作树无本轮提交。
- 依据为 [Issue 快照](source.md)、[规格](spec.md)、[设计](design.md)、[计划](plan.md)和 [本批上游版本](../2026-11-19-huhu-issues-3-10/sources.md)。上游核对了 herdr-app `317e673f1f15` 的布局、模型和镜像结构，herdr-core `c7517808d64f` 的会话协议，以及 ORCA `8bc232f5ed8b` 的新建入口组织。
- Huhu 基线为 `feature/issue-fix@9f870c0`。继承 [工作台](../../../../packages/workbench/src/shell/AppShell.tsx)的窗口栏、模块栏与状态区，[Agent CLI](../../../../plugins/agent-cli/src/ui/AgentCliModule.tsx)的会话与工具层级，以及现有 [设计规范](../../notes/context/design-system.md)。资源包带有 Huhu 的主题令牌与品牌图标，默认 Claude 浅色，可切四套主题和明暗。

## 需求与场景覆盖

| 需求及入口 | 操作和可见结果 | 异常与恢复 | 源码定位及真实验证 |
| --- | --- | --- | --- |
| 工作区、标签与新建目标 | 左栏切三处示例目录。新建或打开同一路径、编辑名称和顺序。标签新建、空窗格填充、相邻分栏均带明确目标。启动入口支持搜索、状态、模型、参数与目录。 | 取消保留原布局。目录不合规保留表单。延迟返回只改原工作区。 | [`#spaces`、`#tabs`、`#editor`](prototype/index.html)；[`openLaunch`、`runLaunch`、`start`](prototype/agent.js)。真实目录授权和 resolver 由规格启动章节验证。 |
| 四向分栏与生命周期 | 四向连续展开同一原窗格，保留其他窗格 ID。拖拽或键盘调比例、换位、放大与恢复。关闭窗格或标签要确认，末标签关闭后可从最近位置重开。 | 取消调整还原比例。关闭目标后迟到运行可在原工作区找回并手动放入当前标签。 | [`#pane-tree`](prototype/index.html)；[`addLeaf`、`removeLeaf`、`removeTab`、`changeRatio`](prototype/agent.js)。跨标签移交、父子进程退出、窗口间镜像由生产验收覆盖。 |
| 运行、等待、失败、断开与重接 | Agents 列表定位等待现场，互动查看可回模拟文本，只读只展示输出。失败按原启动意图重试，结果未知先对账。断线和重接保留原窗格。 | 保活可变为新 Shell 并明确标出原 Agent 丢失。布局版本冲突保留原布局并给出状态。 | [`#agents`、`#connection`](prototype/index.html)；[`renderInspect`、`start`、`reconcile` 分支](prototype/agent.js)。Core 进程、输入仲裁、真实只读权限和事件幂等需生产验证。 |
| 历史会话 | 可搜索、按当前或全部工作区过滤、分页、固定、预览、回现场、恢复到这里、分支到新的标签。Pi 示例显示只读原因。 | 未找到会话时显示空态。恢复仍走同一模拟启动流程。 | [`renderInspect`、`openLaunch`](prototype/agent.js)。真实原生历史扫描、祕钥与同名目录碰撞由规格历史和安全章节验证。 |
| 文件、变更与窄窗 | 右栏按当前工作区显示模拟文件、worktree 和评审；窄窗按阅读顺序排列导航、窗格、辅助栏。 | 评审遇输入占用时提示等待。原型文件与进程信息均为演示数据。 | [`renderInspect`](prototype/agent.js)；[布局及窄窗断点](prototype/agent.css)。 |

## 实际走查

2026-11-19 使用本机 Microsoft Edge 157.0.4341.60，由 Playwright 操作 `file://` 页面。桌面 1440 × 920 为 Claude 浅色，窄窗 390 × 844 为 Claude 深色。桌面也切换到 Notion 并返回 Claude。启用断网和减少动效，3 份样式及本地品牌图标均加载，浏览器未记录脚本、控制台或资源加载错误，未见 HTTP(S) 请求。

- 在发布评审标签的 PowerShell 点击「向右」，搜索 Claude 后按 Escape，启动窗关闭且焦点回原按钮。再次打开选 Codex，验证它进入原窗格右侧。用键盘方向键切换 Tab，再回原 Tab。
- 对同一原窗格依次向左、上、下插入 PowerShell，见 6 个嵌套窗格。键盘改根分隔比例为 60%，放大时显示单一窗格，恢复后仍有 6 个。另一次拖动时按 Escape，恢复到起始 55%。调换窗格后核对首个窗格身份。
- 注入明确启动失败，按原配置重试，核对启动 ID 一致。注入确认丢失，对账后仍用原 ID。断开、重连后原窗格数及现场保留。
- 延迟派起 Codex 后切到「服务与接入」，回执到达时页面留在该 Space，返回原 Space 可见新窗格。注入目标过期后原工作区出现「可找回的终端」，放回后窗格增加一个。只读现场没有输入框。
- 搜索灰度历史、预览并分支，新增一个标签。取消关标签时数量保留。关闭独立验收目录的末标签，从最近工作区重新打开后见保留的布局和空窗格。
- 390 像素窄窗切工作区、返回产品与工程、进入空标签、填充 PowerShell，成功后页面宽度未横向溢出。走查发现 Chromium 搜索字段会先清空文字，已修正该字段的 Escape 行为并复测。

真实 Electron、CLI、PTY/TUI 帧流及高频渲染、父子终端、跨窗口/跨 Vault、保存或重置仓库数据、完整历史文件和屏幕阅读器留给生产阶段。浏览器脚本未逐项走完四主题和各级系统缩放、真实中文 IME 及所有历史、评审分支。

## 用户反馈与确认

**待用户确认。** 尚无用户对这一指纹版本和具体场景的确认。演示采用两项可逆约定。目标过期的终端先列入原工作区「可找回的终端」，需要时手动放回。窄窗把横向窗格按当前位置顺序下排，窗口变宽时恢复原相对位置。Vault 数据包是否包含纯布局快照维持待决，确认稿只展示本视图中的关闭与重开。

实施和验收以 [计划](plan.md)的切片对照上述入口、摘要和对应源码。确认后在复用前以记录的指纹复核完整资源。

