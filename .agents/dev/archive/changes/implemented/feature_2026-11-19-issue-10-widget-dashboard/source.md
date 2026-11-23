# GitHub Issue #10 [首页看板重构] 复刻 Homarr 的插件驱动 Widget Dashboard：拖拽缩放、独立实例、布局持久化与生命周期

- 原报告 — https://github.com/NAMEWTA/huhu/issues/10
- GitHub 对象 ID — I_kwDOVmq61M8AAAABf-Y3mA
- 状态 — OPEN
- 作者 — NAMEWTA
- 创建时间 — 2026-11-17T08:43:55Z
- 更新时间 — 2026-11-17T08:43:55Z
- 标签 — 

## 正文

# 目标与交付边界

把 Huhu 首页从「固定两列卡片 + 指标条 + 显隐/同列上下排序」重构为 **插件驱动、用户可编排的 Dashboard（智能网格画布）**。首页只负责布局、Widget 容器、实例与用户配置；具体业务 Widget 由各功能插件或 kernel 系统能力提供。用户可以添加、拖拽、跨列移动、缩放、配置、复制、隐藏和移除小组件，保存后在同一 Vault 中完整恢复。

**整体交互优先复刻 Homarr 当前成熟的 Dashboard / Widget 设计，布局引擎优先验证 React Grid Layout；样式、组件、主题、数据和权限继续严格使用 Huhu 现有技术栈与规范。**

本 Issue 仅定义待实施的完整产品/架构/验收需求，**尚未修改代码、运行应用或验证端到端结果**；所有“应当”均指目标状态。不要以“只是把卡片拖起来了”判定完成。

**一期完成范围：一张可编辑的首页看板 + 内置插件 Widget 类型与多实例 + 实际可用的业务交互 + 布局持久化与恢复。** 不引入无限白板、独立 Dashboard 后端、另一套插件运行时、三方任意 JS UI 执行或多看板管理器。阶段拆分仅用于开发，不等于可以交付一半需求后关闭本 Issue。

## 0. 调查基线、项目规范与关联 Issue

- 日期：2026-11-17（Asia/Taipei）。
- Huhu 固定源码基线：[`main@913264045cee1818497a37a57715c664aa85a1ae`](https://github.com/NAMEWTA/huhu/commit/913264045cee1818497a37a57715c664aa85a1ae)；根版本 0.0.1-rc.4。实际开发前先对照当时最新 main 复查差异。
- Homarr 复刻参考：[`homarr-labs/homarr dev@38ef8ae44d0063d986e3dbdc4609e0997d6b6367`](https://github.com/homarr-labs/homarr/commit/38ef8ae44d0063d986e3dbdc4609e0997d6b6367)，重点复刻看板产品交互、Widget 定义、注册、容器与编辑逻辑，而非整体复制其框架与视觉。
- React Grid Layout 研究基线：[`react-grid-layout/react-grid-layout master@f0dd77c5b2fee2d2cb09541d220c00d6814c7242`](https://github.com/react-grid-layout/react-grid-layout/commit/f0dd77c5b2fee2d2cb09541d220c00d6814c7242)。
- 调查方法：读取 Huhu main 源码、部分项目规范和 Homarr/React Grid Layout 公开源码。**未运行桌面 GUI/真实拖拽/全平台 E2E**，不可将此 Issue 当作运行验证报告。

项目必读：
- [根目录 CLAUDE.md（复用优先原则）](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/CLAUDE.md)、[dev-workflow](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/skills/dev-workflow/SKILL.md)、[dev-ui-design](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/skills/dev-ui-design/SKILL.md)、[dev-architecture](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/skills/dev-architecture/SKILL.md)。
- [当前工作台约束](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/workbench.md)、[现行设计系统](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/design-system.md)、[现有工作台模块规格](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/modules/workbench.md)。
- 按仓库 `.agents/dev/changes/AGENTS.md`，实施时复用同一 `.agents/dev/changes/<YYYY-MM-DD-dashboard-widgets>/` 记录需求、设计、计划、原型、证据与进度，完成后由既有归档工作流收束。不要写入或重写 `.agents/skills/`。

交叉 Issue 边界：
- #4 Agent CLI、#5 Tasks/Automations、#7 SSH、#8 Mail 各自负责真实业务能力，本 Issue **只负责其首页 Widget 接入和交互契约**，不重做各模块业务。
- #6 公共 MCP / CLI / API 能力入口负责工具对外开放策略；本 Issue 先按统一 Dispatcher 注册布局能力，是否默认对外暴露由 #6 权限方案决定，不建立 Dashboard 私有 RPC。
- #2 知识库、#3 桌面标题栏、#9 Safe 各自领域不因本次重构被重写。

## 1. 当前源码事实与主要问题

| 位置 | 当前可确认事实 | 要解决的问题 |
| --- | --- | --- |
| [HomeModule.tsx](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/home/HomeModule.tsx) | CORE_COLUMNS 固定左右列；大部分卡片/4 个指标/Agent CLI 入口直接在 HomeModule 里；插件 Widget 统一追加右列；自定义对话框只提供显隐和同列上移/下移 | 无拖拽、跨列移动、自由尺寸、业务与布局耦合，新增插件的 Widget 排位被首页写死 |
| [shell.css](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/shell/shell.css) | shell-home-grid 为 1.8fr / 1fr 两列，overview-metrics 固定 4 格 | 容器没有网格坐标、缩放状态和布局算法 |
| [contributions.ts](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/contributions.ts) | HomeWidgetContribution 仅 id/plugin/title/order/component，插件启停可过滤贡献 | 缺默认/最小/最大尺寸、实例配置协议、多实例、运行/错误状态和懒加载约定 |
| [home.ts](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/contracts/src/home.ts) + [HomeStore](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/capabilities/home.ts) | widgets.json 只保存 hidden/order；原子写与损坏副本机制已存在 | 要升级为已校验的实例+几何布局；不能丢弃原来的有效配置 |
| [SSH UI](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/ui/index.tsx) + [Versioning UI](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/versioning/src/ui/index.tsx) | 已贡献 SSH 主机和 Git 状态 Widget | 复用这些已成型卡片，而不是重新造查询和卡片 |
| [插件 manifest](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/contracts/src/plugin-manifest.ts) | contributes.homeWidgets 已有声明字段；SSH/Versioning 的 manifest 写空数组、实际 UI 有 Widget；Tasks/Inbox manifest 有声明、UI 组件仍由首页硬编码 | 统一贡献声明/注册的一致性约束，防止“清单与真实可用 Widget”漂移 |
| [桌面 UI 注册](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/src/renderer/main.tsx) | 静态加载内置插件 UI，home 模块有“总览 / 今日安排 / 最近活动”页签 | 首页演进为**一个可编排看板**；把“今日安排”“最近活动”变为可选 Widget/筛选，而非保留两套彼此竞争的静态布局 |
| [外部扩展宿主](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/plugins/external.ts) | 外部插件在独立 Node 宿主进程运行、主要提供命令/能力，没有可直接使用的任意 React Widget UI 加载通道 | 不假定当前已支持安全的第三方 UI 插件，避免越过权限与隔离边界 |
| [查询失效映射](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/engine-client/query.ts) | entity.changed、plugin.stateChanged 等触发 React Query 失效，home 汇总也失效 | 新 Widget 查询要复用现有失效/订阅机制，不靠页面全量刷新 |

历史 [D-37 首页卡片决定](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/decisions.md) 曾**有意**让内置卡片留在首页，原因是迁移范围较大。本次需求明确改变前提：将其替代为“Widget 归属各自业务模块、系统级 Widget 归 kernel/workbench”，须补充新的设计决定与理由，不能抹掉旧决定或假装它已经过时并自动完成。

## 2. 最终产品模型

### 2.1 概念与职责

- **Dashboard / Board（首页看板）**：Huhu 自带系统页面；管理布局、编辑会话、Widget 实例集合，不保存任务/SSH/笔记业务副本。
- **Widget Definition（小组件类型）**：由某个内置插件或 kernel 声明，含类型 ID、名称、说明、图标、尺寸限制、配置校验与渲染入口。
- **Widget Instance（小组件实例）**：用户添加到看板的独立条目，拥有 instanceId、所属 widgetType、标题覆盖、config、显隐与空间位置；一种类型可有多个实例。
- **Widget Frame（统一容器）**：工作台公共外壳控制边框/标题/工具菜单/拖动把手/尺寸把手/加载/错误/空状态；插件只负责内容和自身动作。
- **Layout Engine（布局引擎）**：负责网格坐标、吸附、碰撞解决、尺寸约束、响应式、移动/调整大小的交互反馈。
- **Widget Catalog（组件目录）**：按插件/功能分类，展示能添加的全部 Widget，支持搜索、说明、尺寸预览及配置入口。
- **Engine + Vault**：继续通过现有能力调用/插件管理/配置读写管理状态；组件布局是 UI 状态，业务数据仍归业务插件。

### 2.2 智能网格而非无限白板

采用 **可纵向延伸的二维网格画布**：任意跨列/跨行移动；按网格格数调整 w/h；网格吸附，默认不允许重叠；根据碰撞策略预览卡片让位和自动排布。允许空位和纵向滚动；不默认实现自由像素坐标、无限缩放/平移、任意叠放或随意嵌套。

一期只有一张默认看板。用户可以完全重排它；未来多看板/容器嵌套只作为后续独立扩展点，**不提前增加复杂引擎或空壳 UI**。

## 3. 查看模式与编辑模式：完整交互规则

### 3.1 查看模式（默认）
1. 启动或切换 Vault 后，加载该 Vault 的布局与已启用插件定义，渲染已添加实例；不启动拖拽。
2. 点击卡片的 checkbox、按钮、输入框、滚动区、链接等操作业务功能；点击明确的“打开完整功能”入口跳转对应模块；不能把整张卡的所有点击强制路由。
3. 任务勾选、SSH 状态、Git 状态、专注计时等复用现有 Dispatcher 能力与查询缓存/事件刷新。
4. 卡片加载中、无数据、网络异常、插件已停用、权限不足、组件异常都应有独立状态；一张卡报错不致整页错误。
5. 首页仍是应用默认入口，保留现有导航体系与四主题；不更改整个桌面 Shell、左侧 rail 或其他模块页面。

### 3.2 编辑模式（事务式）
1. 首页右上角操作为“添加小组件”“编辑布局”；编辑时显示“保存 / 取消 / 恢复默认布局”，必要的辅助说明可在提示层，不要常驻大量小字。
2. 进入编辑时从当前已保存布局创建草稿；拖动卡片把手、跨列移动、调整右下角尺寸；有明显但克制的占位预览、碰撞让位与吸附反馈。拖拽不能由卡片正文、按钮、滑动开关或选择文本意外触发。
3. 放下后按布局规则检查边界、禁止重叠、执行确定性 reflow；非法布局恢复上个有效状态并提示，不产生“看起来成功但刷新后错位”。
4. 编辑中：添加实例（选类型→设置实例字段→加入画布）；编辑配置；复制实例（生成新 ID）；调整标题；隐藏/显示；移除实例；排序；恢复该实例推荐尺寸。
5. **取消**恢复原布局与实例集合，不保存；**保存**一次性提交规范化布局和配置，经 Engine 校验/原子写后刷新视图，失败时保留草稿并显示可恢复错误。恢复默认布局必须是可撤销的编辑动作，不直接擦除原用户状态。
6. 以键盘可使用的“移动位置/调整尺寸”或数字输入作为拖拽替代路径；Tab/焦点/ARIA 正确，reduced motion 时消除位置过渡而保留反馈。

### 3.3 小组件库（抽屉）
- 按“全部 / 系统 / 各插件”筛选，并支持搜索；卡片有名称、描述、所属插件、建议尺寸/预览。
- 默认只展示**已安装且有权限可用**的 Widget。停用插件的既有实例在查看模式不渲染；编辑模式可用明确的“插件未启用”占位或待恢复提示，保留 instanceId/config/placement。
- 同类型多实例（如 SSH 服务器 A/B/C、按任务项目筛选的不同任务列表）；若定义声明单例，则组件库解释为什么不能再添加。
- “隐藏/从看板移除”只修改看板实例，不删除任务、连接配置、Git 仓库或其他业务数据。卸载插件后的实例配置保留还是清除必须由显式用户操作决定。

## 4. Widget 组件贡献协议与系统归属

### 4.1 推荐目标契约（示意，实际以 Huhu contracts 的 Zod Schema 定义）

~~~ts
type WidgetTypeId = string; // 约定 pluginId/widgetId
type WidgetInstanceId = string; // 独立于 widgetType 的唯一实例 ID

interface HomeWidgetDefinition {
  id: string;
  plugin: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  order?: number;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  allowMultiple?: boolean;
  // 校验实例配置，默认值与上游插件数据模型一致
  configSchema?: unknown;
  component: React.ComponentType<HomeWidgetProps>;
}

interface HomeWidgetProps {
  instanceId: WidgetInstanceId;
  config: Record<string, unknown>;
  width: number;
  height: number;
  editing: boolean;
  onNavigate(moduleId: string, section?: string): void;
}
~~~

接口示意不是新的强制框架、权限模型或最终 API 命名；实现应压缩参数、使用原有 Context 和公共 UI 组件，不重复创建 engine-client。

必须区分 **类型 ID** 与 **实例 ID**。尺寸约束属于 Widget Definition；坐标/个人配置属于 Instance/Layout；业务数据属于插件，三者不能混在同一个状态对象里。

### 4.2 内置组件迁移矩阵

| 归属 | 一期至少纳入看板的 Widget |
| --- | --- |
| kernel / workbench 系统 | 25 分钟专注、习惯、跨插件指标概览（如保留）、最近活动 |
| tasks | 我的任务 / 今日任务（至少保留现有行内完成与数量） |
| notes | 最近笔记 / 继续上次的思考 |
| inbox | 待处理捕获 / 灵感收件箱 |
| agent-cli | Agent CLI 快速入口 / 当前可用状态（不重写完整终端） |
| ssh | 现有“SSH 主机” Widget；允许通过实例配置显示指定主机或主机列表时复用原能力 |
| versioning | 现有“版本与同步 / Git 状态” Widget |
| automations | 现有可取到的已启用规则/最近运行摘要（可优先提供轻量只读摘要） |

Safe、MCP、Mail 及后续插件有权贡献自己的 Widget，但**不得为凑数量开发空壳或不存在的监控能力**；例如当前 SSH 没有可复用的 CPU 指标源，就不能伪造监控图表。以该插件实际可调用的能力为依据。

系统功能如专注/习惯仍可由 kernel-owned Widget 提供，不强制额外新建 focus/habits 插件。现有 home.summary 可作为跨插件摘要使用，但不要让所有独立 Widget 依赖全量汇总数据才能渲染。

## 5. 布局、持久化、刷新与失败恢复

### 5.1 状态与文件
- 延用 `vault.stateDir/home/widgets.json`（正常情况即 Vault 下 `.huhu/home/widgets.json`）作为唯一 Dashboard 持久化文件；不另建应用级数据库、云存储或新服务。
- 建议字段：schemaVersion、boardId、instances（instanceId/widgetType/config/title/hidden）、layout（instanceId/x/y/w/h，按需要带断点信息）、updatedAt。**禁止保存任意 React 组件、函数、密钥或完整业务数据副本**。
- 一份 Widget Type 可以有多个 Instance；实例移除只影响实例数据；插件停用/升级/临时缺失不主动清空相关实例。
- 校验：重复/空 instanceId、未知 widgetType、非法配置、NaN/负数/超界网格坐标、重叠位置、尺寸越界、非法布局 schemaVersion 均有确定性的处理。缺失插件定义保留配置，以便重新启用；损坏文件按现有 HomeStore 模式备份+退回安全默认并提示用户，不悄悄覆盖唯一数据。
- 当前 hidden/order 可做**一次性转换**为新布局模型并保留用户能保留的显隐/顺序；不同时维护旧/新布局双写、长期别名或两套渲染器。保持用户 Vault 中的真实业务数据、专注/习惯状态不丢失。
- 布局改动仅在“保存”后原子写入；只读 Vault 可查看不可保存，所有编辑入口正确禁用/提示；跨 Vault 切换必须清理旧的草稿、组件状态与查询缓存。

### 5.2 响应式与交互坐标
- 窗口尺寸变化不能造成页面级水平滚动、Widget 相互覆盖、控件裁切或乱序。不同尺寸卡片可显示 compact/normal/expanded 内容，而不是无脑整体 CSS transform 缩小整个卡片。
- 首先验证**一个桌面主布局 + 窄窗确定性 reflow（不回写桌面坐标）**的简洁方案；若实测需要独立断点布局，再按布局引擎的已验证 API 引入，不凭空维护多份用户坐标。
- 调整窗口宽度、主题、系统缩放、浏览器字体缩放后，查看/编辑时坐标与命中区域一致；保存/恢复 idempotent，不越拖越乱。

### 5.3 能力与数据
- 复用 `packages/kernel/src/capabilities/home.ts` 的 HomeStore、现有 Dispatcher、权限校验、原子写、插件生命周期与 React Query 失效。建议暴露有限的 `home.dashboard.get / home.dashboard.update` 等能力，最终名称以现有风格和功能目录审查为准。
- 组件内业务操作继续调用业务插件能力（如 tasks.list / tasks.setStatus / ssh.hosts.list / git.status），不要由 Dashboard 代办业务写入。
- 只订阅与 Widget 数据真正相关的事件/查询；插件失效或取消订阅后释放副作用，避免无意义的全首页重载。
- 未来可经 #6 同一能力目录供 CLI/MCP 控制布局，但不能私自跳过授权或令 Widget 获得比其插件更高的数据权限。

## 6. 上游复刻路线与技术选择（强制遵守）

### 6.1 复用优先顺序
严格执行项目的原则：
1. Huhu 当前已有实现（HomeModule、ContributionRegistry、HomeStore、已有 UI/CSS）。
2. 项目本地 `temp/sources` 中已有成熟源码（实施时先实际检查；本次 GitHub 调查**未核实该本地目录**）。
3. 已验证成熟库：React Grid Layout 等。
4. GitHub 上可靠完整的成熟产品与组件：Homarr、GridStack 等。
5. 在成熟实现基础上做 Huhu 必要适配。
6. 只有都不适用时才最小量自研。

### 6.2 第一参考：Homarr（产品行为与实现）
固定版本：[`homarr@38ef8ae44d0063d986e3dbdc4609e0997d6b6367`](https://github.com/homarr-labs/homarr/commit/38ef8ae44d0063d986e3dbdc4609e0997d6b6367)。重点逐项学习/可复刻：
- [board/layout 几何、重排、坐标与语义](https://github.com/homarr-labs/homarr/tree/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/apps/nextjs/src/components/board/layout)
- [board/in-place-editor 编辑交互、空格选取、放置、调整大小、键盘、状态](https://github.com/homarr-labs/homarr/tree/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/apps/nextjs/src/components/board/in-place-editor)
- [board 结构、选择、容器及页面](https://github.com/homarr-labs/homarr/tree/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/apps/nextjs/src/components/board)
- [widgets/definition Widget 元信息与上下文](https://github.com/homarr-labs/homarr/blob/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/packages/widgets/src/definition.ts)
- [widgets/registry 动态加载与注册](https://github.com/homarr-labs/homarr/blob/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/packages/widgets/src/registry.ts)
- [widget-card-shell 统一容器](https://github.com/homarr-labs/homarr/blob/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/packages/widgets/src/widget-card-shell.tsx)
- [固定画布布局说明](https://github.com/homarr-labs/homarr/blob/38ef8ae44d0063d986e3dbdc4609e0997d6b6367/apps/nextjs/src/components/board/layout/README.md)

优先 **复刻实际交互闭环、组件模型、编辑与布局确定性规则**，而不是像素照搬 Mantine / Next.js / tRPC 等非 Huhu 技术栈。现行 Homarr 的 in-place editor 与早期 GridStack 版本不能混为一谈；若复制算法/行为必须记录具体来源函数、路径、上游 SHA、适配理由及测试。

### 6.3 第二参考：React Grid Layout / GridStack
- [React Grid Layout 固定版本](https://github.com/react-grid-layout/react-grid-layout/tree/f0dd77c5b2fee2d2cb09541d220c00d6814c7242)：优先 PoC 验证拖拽跨行/跨列、resize handle、边界/碰撞、保存恢复、窗口缩放、键盘操作、嵌套交互；满足即可直接依赖，不再自研几何引擎。
- [GridStack](https://github.com/gridstack/gridstack.js)：若 RGL 不能可靠覆盖需求再对比，禁止把两套网格库同时加入生产依赖。
- [dnd-kit](https://github.com/clauderic/dnd-kit)：用于更高阶编辑交互的备选；如选择它，先核对是否需要自行承担碰撞、网格几何、resize 与可访问性实现成本。

必须有一份**选型 PoC 决策记录**：RGL 与 GridStack/Homarr 适配方式对比，列出复用率、交互等价性、编辑态与查看态的耦合、渲染成本、迁移成本、维护责任；择一而非并存。

### 6.4 许可证/来源
Huhu 为 GPL-3.0-or-later；核对的 Homarr LICENSE 是 Apache-2.0、React Grid Layout LICENSE 是 MIT。引入/复制源码时核对依赖版本、NOTICE、原作者版权声明、必要的修改标识及 Huhu 现有 `THIRD_PARTY_NOTICES.md` 生成流程。**不要省略归属或声称“借鉴”就无须遵守许可证**。

交付中形成“上游行为/代码 → Huhu 复用文件/适配 → 验收测试”映射表。

## 7. UI / UX 与样式不可妥协的要求

- 保持 Huhu 四主题、light/dark、语义 token 和 [CSS 层级/类名前缀约束](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/design-system.md)：`@layer theme, tokens, base, vendor, components, shell, modules`；共享 `hu-`、工作台 `shell-`、插件独立前缀。
- 优先复用 `@huhu/ui` / Radix / Lucide / MotionProvider；禁止为 Dashboard 再引入 Tailwind、Mantine 整套组件库或平行 CSS Token 系统。
- 统一卡片容器：标题、可选状态/菜单、内容区、恰当的空态/错误态/权限态；任何 Widget 内容都不能靠挂载内部 CSS 覆盖其他插件或 Shell。
- 拖起时有轻微抬升/阴影；位置预览与占位清晰；放下时卡片柔和重新排布；删除/新增反馈克制；动画遵守主题动效和 `prefers-reduced-motion`，不要牺牲拖拽响应。
- 编辑把手和拖拽目标必须与卡片内部按钮/输入框/滚动区域隔离；对触摸、键盘及缩放后点击区域不误触。
- 避免整页长段落解释和冗余小字；默认首页展示真实可用信息，不让空白演示卡片淹没工作台。空看板给出清晰“添加首个小组件”入口。
- 在项目已有视觉验证体系下对主题、浅深色、窄屏、长文字、无数据、加载和 error state 提供真实截图/交互证据；不要用草图充当验证。

## 8. 实施切片与交付清单

### W01 — 源码/上游对照与原型
- [ ] 核对 Huhu 最新 main、既有 Home/Widget/manifest/聚合服务与 `temp/sources`；标记当前代码、用户目标、未知项。
- [ ] 产出 Homarr **交互行为逐项映射**，并做 RGL / GridStack / Homarr 实现的 PoC 比较。
- [ ] 按 Huhu 当前主题和 UI 组件实现可操作的看板原型/开发样例，能完整验证“添加→配置→拖拽→缩放→保存→恢复/取消”，和用户目标对齐后才定稿，不凭静态截图替代。

### W02 — 数据契约与 Engine
- [ ] 定义类型/实例/布局的 Zod Schema、版本/约束校验、有效默认布局、未知插件保留逻辑。
- [ ] 旧 widgets.json 的单次转换与回归验证；处理损坏文件、只读 Vault、跨 Vault、写入失败。
- [ ] Engine 统一 Dashboard get/update（必要时 reset/validate）能力，按现有 Dispatcher 与原子写规则实现。

### W03 — Widget Registry / Frame / Catalog
- [ ] 扩展 HomeWidgetContribution，插件注册、停用、卸载/恢复、实例 config 与多实例规则有统一生命周期。
- [ ] 统一 Widget Frame、独立 ErrorBoundary、加载/空态/权限态、插槽与行为。
- [ ] “添加 Widget”抽屉、插件分类/搜索/选择、配置、复制、隐藏、移除、单例约束。
- [ ] 修正 `huhu-plugin.json` 与真正 UI 贡献不一致的问题并增加检测规则/测试。

### W04 — Dashboard 画布、布局编辑器、样式
- [ ] 以成熟库完成网格拖动/resize/碰撞、查看/编辑、草稿/保存/取消、响应式 reflow 与键盘替代路径。
- [ ] 现有 Home 三页签与固定内容合并为单一看板体验；“今日安排/最近活动”能力以 Widget 或已有模块入口保留，避免功能丢失。
- [ ] 接入 Huhu 主题/设计系统，完善动效、缩放、空看板与无重叠规则。

### W05 — 内置 Widget 迁移与业务闭环
- [ ] 将任务、最近笔记、收件箱等首页业务 UI 收回各插件贡献；专注、习惯、活动等系统卡归 kernel/workbench；现有 SSH/Git Widget 复用。
- [ ] 按第 4.2 节矩阵补齐真正有数据源的组件，不伪造不存在的能力。
- [ ] 验证任务行内操作、Agent CLI/SSH/笔记等模块导航、查询刷新、实例配置隔离和插件启停恢复。

### W06 — 完整验收、文档及 PR
- [ ] 补规格、架构/决策、数据模型、用户故事、原型证据、复用台账、测试与原先 D-37 的明确替代说明；更新所有真实相关的映射和调用方。
- [ ] 执行 typecheck、lint、相关 unit/integration、Electron E2E、视觉主题/响应式验证，附截图/运行命令/结果。
- [ ] 清理被替代的旧首页固定布局、重复组件、无用 CSS 和过时测试/文档，不保留双实现。
- [ ] 一个完整 PR 关联本 Issue；核对所有验收项后才关闭 Issue。

## 9. Given / When / Then 验收矩阵

| ID | Given / When | Then |
| --- | --- | --- |
| ACC-DASH-01 | 新 Vault 首次打开首页 | 有可操作的合理默认 Widget 布局，非空白/非演示假数据；已有数据正常显示 |
| ACC-DASH-02 | 进入编辑，把任一 Widget 拖到另一列/另一行并保存，重启 Electron | 位置一致，无重叠、无跳跃、无额外创建 |
| ACC-DASH-03 | 编辑某卡宽高（含边界/min/max），保存后重开 | 按尺寸约束存储与还原；内容布局匹配容器大小 |
| ACC-DASH-04 | 编辑移动/缩放/添加/移除后点击取消 | 完全恢复编辑前的实例/位置/配置，磁盘布局未改变 |
| ACC-DASH-05 | 添加同类型两次，分别选择两台 SSH 主机或两个任务过滤条件 | 生成独立 instanceId/config，两个 Widget 独立工作与保存 |
| ACC-DASH-06 | 编辑某 Widget 配置或复制实例后保存 | 原实例不被覆盖，新实例参数生效，保存后仍生效 |
| ACC-DASH-07 | 隐藏/移除任务 Widget | 看板对应卡片消失，但任务业务数据文件完全未删除/修改 |
| ACC-DASH-08 | 停用并再启用 SSH / Versioning 插件 | 正常查看时停用 Widget 不运行；再次启用恢复原实例配置和布局 |
| ACC-DASH-09 | 某 Widget 抛异常/查询失败/配置非法/插件未安装 | 只影响该卡片或提供明确恢复状态；首页和其他卡片正常可用，布局配置不被悄然删去 |
| ACC-DASH-10 | Vault A 编辑保存后切换 Vault B 再返回 A | B 不泄露 A 的看板/数据；A 原布局完全恢复 |
| ACC-DASH-11 | 只读 Vault 或持久化写入失败 | 可以浏览；编辑保存受阻并明确告知；不能假成功或损坏配置 |
| ACC-DASH-12 | 模拟旧 widgets.json（hidden/order）/损坏 JSON/重复 ID/越界坐标 | 有效偏好单次转换并保留；损坏备份可恢复，布局归一化，Schema 校验有效 |
| ACC-DASH-13 | 查看模式点击任务 checkbox、输入框、列表滚动/选择文字 | 不误触卡片拖拽，业务行为与原模块一致 |
| ACC-DASH-14 | 1024×768、1366×768、宽屏及更窄窗口；跨主题/深浅模式 | 无整页横向滚动、卡片重叠/控件溢出；编辑命中与显示一致；视觉和布局可用 |
| ACC-DASH-15 | 使用键盘控制组件及开启 reduced-motion | 可以添加/配置/移动/调整尺寸或通过等价输入完成；焦点明确，动画被正确降低 |
| ACC-DASH-16 | 快速移动/缩放多个卡片，连续保存/重新打开，多次切换模块 | 布局稳定、无重排震荡、无重复注册/悬挂监听/严重交互卡顿 |
| ACC-DASH-17 | 检查插件清单与贡献注册 | manifest 与运行时 UI 贡献一致且测试可发现漂移；未启用插件不应暴露其能力 |
| ACC-DASH-18 | 当前“总览、今日安排、最近活动、指标、专注、习惯、Agent CLI 入口”功能回归 | 原有业务能力完整保留，只改变组织方式，旧页面功能不丢失 |

测试要同时覆盖必要的状态模型单测、布局纯函数/组件测试、插件注册与 Engine 能力集成测试、真实 Electron E2E（指针拖动、resize、save/reload、插件停用与 Vault 切换）、Huhu 现行 CSS/主题视觉测试。**截图、日志和可复现步骤作为证据；禁止“typecheck 通过=交互完成”。**

## 10. 明确非目标、风险与完成定义

### 非目标
- 不提供 Figma/Excalidraw 式无限自由画布、画图、自由叠放、任意像素坐标或泛用页面搭建器。
- 一期不做多看板权限分享、跨设备实时协作、云端同步管理器、容器多层嵌套；确有价值时后续独立设计。
- 不新建独立 Dashboard 服务、应用级 DB、平行拖拽引擎、第二套插件系统/权限系统、Tailwind/Mantine 全栈替换。
- 不开放“不受信任外部扩展直接在 Huhu Renderer 执行 React/JS”能力；此类安全 UI 扩展需另行确定隔离/签名/授权/通信协议，本期仅实现可控内置插件 Widget，预留明晰边界即可。
- 不重新实现 #4/#5/#7/#8 等既有业务；仅用现成 Capability 渲染其轻量 Widget。

### 风险与取舍
1. **布局库与 Homarr 交互不完全同构**：必须先 PoC 比较，不能一边搭自研碰撞引擎一边宣称“复刻”。
2. **拖拽与内部业务交互冲突**：独立拖拽把手、编辑模式、键盘替代、可见焦点和自动化测试是硬约束。
3. **旧 Widget 状态、插件启停与清单漂移**：类型和实例分开，不能在 unavailable 时删除数据；一处注册一处验证。
4. **外部插件隔离**：已有 Node 宿主与桌面静态 React UI 不可直接等同；遵守当前 Dispatcher/权限安全边界。
5. **查询与性能**：不要把计时、频繁轮询、数据变更简单等同于整板重绘；避免隐藏/离屏实例无节制调用。
6. **视觉一致性**：遵守 CSS 层级/owner/颜色规则，并使用仓库已有视觉回归流程。

### 完成定义（DoD）
- 本 Issue 一期范围与 ACC-DASH-01～18 满足，实际用户能从零添加、编排、交互并重启恢复；
- 内置插件的 Widget 贡献权责统一，首页不再硬编码各业务插件内容；
- 引入/复制的上游代码有固定 SHA、文件映射、许可与验证记录，优先复用成熟实现；
- 真实测试和截图证据齐备，提交完整 PR；相关规格与设计决定同步更新；旧实现清理完毕；
- Issue 关闭前逐项在 PR 中勾选验证；未实现能力不得以“未来支持”混入已完成声明。

## 评论

无评论。
