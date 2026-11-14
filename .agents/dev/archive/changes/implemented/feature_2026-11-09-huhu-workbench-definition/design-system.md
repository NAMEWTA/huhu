# 设计系统与交互规范

本文件是视觉 token、布局骨架、组件、交互、动效与可访问性的唯一权威定义。实现位置：`packages/ui`（token、组件）与 `packages/workbench`（外壳）。各模块页面结构在对应 `modules/*.md` 的“界面”一节描述，只能使用本文件定义的组件与 token。

## 1. 原则

1. **安静的工作台。** 中性色铺底，强调色只用于主要动作、选中与焦点；状态色只表达状态。
2. **一种做法。** 同类操作在所有模块使用同一组件与同一位置：新建在模块侧栏标题右侧“+”与页头主按钮；详情在右侧详情面板；危险操作在 AlertDialog 中写明对象名称与后果。
3. **状态诚实。** 只在收到 Engine 回执后显示成功；进行中、失败、未知都有明确样式和文字，不只用颜色。
4. **少解释。** 页面不放大段说明文字；必要的边界信息（例如“保存不会启动 Agent”）放在字段帮助文本，一行以内。

## 2. Token

实现：`packages/ui/src/styles/tokens.css` 定义 HUHU 语义变量，`packages/ui/src/styles/shadcn.css` 把 shadcn 变量映射到 HUHU 变量。组件只使用语义变量或 Tailwind 主题类（`bg-background`、`text-muted-foreground` 等），禁止写十六进制颜色。主题切换写 `<html data-theme="pearl|suliworld|soft" data-mode="light|dark">`。

### 2.1 颜色（值取自原型 `ui/refinement.css`）

| HUHU 变量 | shadcn 映射 | Pearl 浅色 | Pearl 深色 | 用途 |
| --- | --- | --- | --- | --- |
| `--bg` | `--background` | #ffffff | #17191c | 内容区背景 |
| `--panel` | `--card`、`--popover` | #ffffff | #1d2024 | 卡片、弹层 |
| `--sidebar` | `--sidebar` | #f7f8f9 | #1a1d21 | rail、模块侧栏 |
| `--chrome` | — | #f2f4f5 | #22262b | 顶栏、标签条、状态栏 |
| `--muted-bg` | `--muted`、`--secondary` | #f1f3f4 | #292e34 | 次要按钮、悬停背景 |
| `--text` | `--foreground` | #22272b | #e9ecef | 正文 |
| `--muted` | `--muted-foreground` | #56616c | #b0b8c0 | 次要文字 |
| `--faint` | — | #606b75 | #a0aab5 | 元信息 |
| `--line` | `--border`、`--input` | #e2e6e9 | #343b43 | 分隔线、输入框边框 |
| `--line-strong` | — | #cbd2d8 | #505b67 | 悬停边框、表头底线 |
| `--accent` | `--primary` | #293238 | #e4e9ed | 主按钮、选中指示 |
| `--accent-fg` | `--primary-foreground` | #ffffff | #1b2024 | 主按钮文字 |
| `--accent-soft` | `--accent` | #e8edef | #303941 | 选中行、激活导航背景 |
| `--focus-color` | `--ring` | #426f90 | #9bc3e6 | 焦点环 |
| `--success` / `--success-bg` | — | #246e49 / #edf5ef | #8fc8a6 / #21392e | 成功、已完成 |
| `--warning` / `--warning-bg` | — | #805b1f / #faf3e5 | #e0bc7d / #3b3122 | 警告、待处理 |
| `--danger` / `--danger-bg` | `--destructive` | #ae3e43 / #fbeef0 | #f4a2a7 / #42292f | 错误、危险 |
| `--blue` / `--blue-bg` | — | #32658f / #edf3f9 | #9bc3e6 / #263749 | 信息、Agent 执行标记 |
| `--violet` / `--violet-bg` | — | #6a568f / #f2eef7 | #c0ade2 / #332b43 | 收件箱待处理标记 |
| `--overlay-scrim` | — | #17212d40 | #090b1059 | 对话框遮罩 |

SuliWorld 与 Soft 主题只覆盖中性与强调变量（状态色共用 Pearl 值），数值：

| 变量 | SuliWorld 浅 | SuliWorld 深 | Soft 浅 | Soft 深 |
| --- | --- | --- | --- | --- |
| `--bg` | #fbf9f4 | #1c1c19 | #fbfcfe | #1a1e24 |
| `--panel` | #fffefa | #24241f | #ffffff | #222832 |
| `--sidebar` | #f7f4ed | #20201c | #f3f5f9 | #1e232b |
| `--chrome` | #f0ece2 | #292a24 | #edf1f6 | #282f3a |
| `--muted-bg` | #f1ede4 | #30322a | #edf1f6 | #2d3542 |
| `--text` | #2b2c27 | #ecece4 | #252d38 | #e3eaf4 |
| `--muted` | #62645a | #b9b9aa | #596777 | #acb9cb |
| `--faint` | #66695e | #a7aa99 | #5d6b7e | #a1afc3 |
| `--line` | #e4dfd3 | #3d4035 | #dde4ec | #3b4656 |
| `--line-strong` | #cec8b9 | #59604e | #c4cedc | #56657c |
| `--accent` | #344b3c | #c8d9b6 | #3b5d84 | #b3c9e8 |
| `--accent-fg` | #fffefa | #22281d | #ffffff | #202c3c |
| `--accent-soft` | #e8ece3 | #363d2e | #e5ecf5 | #344257 |

W02 必须用 axe 检查六种组合中正文与 `--muted` 文字对比度 ≥ 4.5:1，不达标的值在 tokens.css 中修正后同步本表。

### 2.2 字体与字号

- 界面：`'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif`；等宽：`'Geist Mono', 'SFMono-Regular', Consolas, 'Noto Sans Mono', monospace`。Geist 字体文件随应用打包（原型 `vendor/fonts.css` 的字体资源）。
- 界面基准字号 `--font-size` 默认 14px，设置中可调 12–18px；其余字号相对它计算：

| 文本样式 | 大小 | 字重 | 行高 | 用途 |
| --- | --- | --- | --- | --- |
| `title-page` | 24px（固定） | 600 | 32px | 页面标题 |
| `title-section` | 16px | 600 | 24px | 卡片与分区标题 |
| `body` | `--font-size` | 400 | 1.6 | 正文、表单 |
| `list` | `max(12px, --font-size − 1px)` | 400 / 选中 500 | 1.5 | 列表行、导航项、表格 |
| `meta` | `max(11px, --font-size − 2px)` | 400 | 1.4 | 时间、路径、计数 |
| `mono` | 13px | 400 | 1.5 | 能力名、路径、代码、终端外文本 |
| `editor` | `editor.fontSize` 默认 16px | 400 | `editor.lineHeight` 默认 1.8 | 编辑器与阅读正文 |

不使用斜体作为界面强调；字重不超过 600。

### 2.3 间距、尺寸、圆角、阴影、层级

| 类别 | token |
| --- | --- |
| 间距（4px 栅格） | `--space-1` 4、`--space-2` 8、`--space-3` 12、`--space-4` 16、`--space-5` 20、`--space-6` 24、`--space-8` 32；页面左右边距 `--page-gutter` 28px（窗口 < 1280 时 20px） |
| 控件高度 | 默认 36px；紧凑 32px；图标按钮 32×32；表格行 44px（紧凑模式 36px）；列表行 40px（紧凑 32px） |
| 布局宽度 | rail 56px；模块侧栏默认 260px（可拖动 200–360px，记忆到界面状态）；详情面板默认 400px（可拖动 320–560px）；阅读正文 `max-width: 760px`（设置“正文宽度”可选 680/760/880/全宽） |
| 圆角 | 控件 8px；卡片与面板 12px；弹层 10px；标签/Badge 6px |
| 阴影 | `--shadow-sm` 0 1px 2px #14212b06；`--shadow-popover` 0 8px 28px #15202a12, 0 2px 6px #15202a08；`--shadow` 0 16px 48px #15202a14, 0 2px 8px #15202a0a（对话框） |
| 层级 | 内容 0；sticky 表头 10；侧栏覆盖层 30；popover/menu 50；dialog 60；toast 70；命令面板 80 |

### 2.4 图标

lucide-react（D-17）。界面图标 16px，rail 图标 18px；描边 1.65，选中 2.2。每个仅图标的按钮必须有 `aria-label` 与 Tooltip。模块图标固定为原型 `catalog.jsx` 中的选择（House、NotebookPen、ListTodo、Database、Inbox、SquareTerminal、Server、Workflow、Blocks、Plug、ShieldCheck、History、HeartPulse、Settings）。

## 3. 外壳布局

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 顶栏 40px：logo · Vault 切换器(居中) · 关于菜单                               │
├────┬─────────────────────────────────────────────────────────────────────────┤
│rail│ 标签条 38px：已打开模块/文档标签 · + · 侧栏折叠 · 专注模式              │
│56px├─────────────────────────────────────────────────────────────────────────┤
│    │ 路径栏 38px：Vault › 模块 › 对象 · 保存状态 · 搜索 · 明暗 · 通知        │
│    ├──────────────┬─────────────────────────────────────┬────────────────────┤
│    │ 模块侧栏     │ 内容区                               │ 详情面板（按需）    │
│    │ 260px        │ 页头：标题 / 副标题 / 主操作         │ 400px              │
│    │              │ 工具条：搜索 · 视图切换 · 筛选       │                    │
│    │              │ 主体                                 │                    │
├────┴──────────────┴─────────────────────────────────────┴────────────────────┤
│ 状态栏 24px：Vault 状态 · 插件数 · MCP 状态 ·…· 保存状态 · 命令面板入口      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **rail**：上组为“知识与行动”“执行”（工作台、知识库、任务、档案、收件箱、Agent CLI、远程连接、自动化），下组为“系统”（插件中心、能力网关、保险箱、版本历史、健康中心、设置）。选中项 `--accent-soft` 背景 + 左侧 2px `--accent` 指示条。有待处理事项时右上 6px 圆点（收件箱待处理、健康需处理）。点击当前已选模块切换模块侧栏折叠。停用插件对应的 rail 项隐藏。
- **标签条**：每个模块最多一个标签；知识库内的文档标签在知识库内容区内部（R-16）。关闭标签只关闭视图，不影响数据。拖动排序；中键关闭；溢出时滚轮横向滚动。
- **模块侧栏**（D-19，全部模块统一）：标题行（模块名 + 计数 + “+” 新建）、可选搜索框、导航项（图标 + 名称 + 右侧计数）、可选分组、底部一行提示或跨模块链接。原型中用顶部条带做二级导航的工作台、插件中心、能力网关、保险箱，以及独占整列的健康、设置，全部改为此结构。
- **内容区页头**：`title-page` 标题、可选一行副标题、右侧主操作（主按钮至多一个）。
- **详情面板**：右侧滑出，头部为对象名 + 操作 + 关闭；窗口宽度 < 1200px 时以覆盖抽屉呈现（Sheet），关闭后焦点回到触发行，列表筛选与滚动位置不变。
- **状态栏**：左侧 Vault 就绪状态、插件数、MCP 状态；右侧保存状态、命令面板快捷键提示。点击各项跳转到对应模块。
- **专注模式**：隐藏 rail、模块侧栏、状态栏，仅保留标签条与内容区；`Esc` 或再次点击退出。

### 响应式

| 窗口宽度 | 行为 |
| --- | --- |
| ≥ 1440 | 全部区域并列 |
| 1200–1439 | 并列；页面边距 20px |
| 1024–1199 | 详情面板改为覆盖抽屉；Agent CLI 右侧历史改为抽屉 |
| < 1024 | 模块侧栏默认折叠为覆盖层（标签条左侧按钮打开）；表格隐藏低优先级列（每个表格在模块文档中标注） |

最小窗口 960×600（Main 设置 `minWidth/minHeight`）。界面缩放 125%、150% 时不得出现水平滚动条（编辑器、终端、表格自身滚动除外）。

## 4. 组件清单

全部位于 `packages/ui/src/components/`，基于 shadcn 生成后映射 token。每个组件必须覆盖下表列出的状态。

| 组件 | 来源 | 必须状态与规则 |
| --- | --- | --- |
| Button | shadcn | 变体 primary / secondary / outline / ghost / destructive / link；尺寸 default 36 / sm 32 / icon 32；hover、active（按下 translateY(0.5px)）、focus-visible 环、disabled（50% 不透明、无指针）、loading（左侧 Spinner，文字保留，禁止重复点击） |
| Input / Textarea | shadcn | 默认、hover 边框 `--line-strong`、focus 环、invalid（`--danger` 边框 + 下方错误文字 + `aria-invalid`）、disabled、readonly |
| Select / Combobox | shadcn Select、Command + Popover | 键盘上下选择、Enter 确认、Esc 关闭、空结果文案 |
| Checkbox / CompletionCircle | shadcn Checkbox；任务专用圆形完成框 | 圆形框 18px：未完成空心 `--line-strong`；hover 显示淡色对勾；完成实心 `--success` + 白色对勾，标题划线与 `--muted` 色 |
| Switch | shadcn | on/off/disabled；切换立即调用能力，回执前显示 loading 并禁止再次切换，失败回弹并提示 |
| SegmentedControl | shadcn Tabs（list 样式） | 方向键移动、Enter/Space 选择；选中项 `--panel` 背景 + `--shadow-sm` |
| Badge / StatusBadge | shadcn Badge | tone：neutral / success / warning / danger / info / violet；状态徽标必须同时有文字 |
| Tooltip | shadcn | 延迟 500ms；只放简短名称与快捷键 |
| Popover / DropdownMenu / ContextMenu | shadcn | 碰撞翻转；Esc 只关闭最上层；菜单项含图标、文字、快捷键 |
| Dialog | shadcn | 标题、可选描述、主体、底部操作（取消在左、主操作在右）；提交中禁用关闭外点；表单错误保留输入 |
| AlertDialog | shadcn | 危险操作专用：标题写“删除「对象名」？”，描述写后果与保留内容；确认按钮 destructive 变体并写具体动词 |
| Sheet | shadcn | 详情抽屉、窄屏侧栏 |
| Toast | sonner | 只用于短暂回执（已保存、已复制、已移到回收站 + “撤销”）；错误若需要处理，同时在页面保留 Banner |
| Banner | 自建（`packages/ui/src/components/banner.tsx`） | tone + 文字 + 操作按钮；用于只读 Vault、插件停用、Engine 断开、保险箱锁定、冲突待处理等持续状态 |
| EmptyState | 自建 | 图标 + 一句标题 + 一句说明 + 至多一个主操作；区分“空集合”和“无匹配结果”（后者提供“清除筛选”） |
| Skeleton / Spinner | shadcn | 首次加载 > 150ms 才显示骨架；局部操作用 Spinner |
| DataTable | TanStack Table + react-virtual | 行 hover、选中、键盘上下移动、Enter 打开；列宽可调；sticky 表头；分组行可折叠；超过 200 行启用虚拟化 |
| Tree | @pierre/trees（R-17） | 展开/折叠、重命名内联输入、拖放、键盘（方向键、Enter、F2 重命名、Delete 移到回收站） |
| ResizablePanels | react-resizable-panels | 分隔条可聚焦，方向键 10px 步进；双击恢复默认宽度 |
| Kbd | 自建 | 快捷键显示，macOS 用 ⌘，其他平台 Ctrl |
| DateTimePicker | Calendar（R-18）+ 时间输入 | 年月下拉、前后月、“今天/明天/一周后/清除”快捷、直接输入 `YYYY-MM-DD` 与 `HH:mm`、周起始取设置；DateOnly 不做时区换算 |
| CronPicker | R-29 | 预设（每 5 分钟、每小时、每天 9:00、工作日 9:00、每周一 9:00、自定义）、自定义五字段、时区下拉、下次 3 次激活时间预览；无效表达式就地报错 |
| ResourcePicker | R-19 | 见 [modules/tasks](modules/tasks.md) §4 |
| DiffView | @pierre/diffs（R-47） | 并排/统一切换、上一处/下一处、忽略首尾空白、展开未改动行、属性差异独立分区 |
| TerminalView | xterm（R-39） | 适应容器、搜索、复制、链接点击走 `openExternal`、断开状态覆盖层、只读观察模式 |
| MarkdownEditor / MarkdownPreview | `packages/editor` | 见 [modules/knowledge](modules/knowledge.md) §5 |

## 5. 交互规则

### 反馈时序

| 情形 | 规则 |
| --- | --- |
| 本地乐观更新 | 只允许用于任务勾选、星标、习惯勾选：立即切换样式，回执失败时回滚并提示错误与“重试” |
| 普通提交 | 按钮进入 loading；成功后关闭对话框并 toast；失败保留对话框与输入，错误显示在对话框顶部 |
| 长操作（重建索引、同步、导出、诊断） | 页面内进度区：阶段文字 + 取消按钮；取消后显示“已取消，未改变…” |
| 外部动作（启动 Agent、SSH 连接、脚本） | 显示“已提交”→“运行中”→ 终态；结果未知显示 `unknown` 徽标与“对账”按钮 |
| 删除 | 可撤销的删除（回收站、归档）用 toast“撤销”（8 秒）；不可撤销的删除用 AlertDialog |

### 焦点与键盘

- 打开对话框焦点进入第一个输入；关闭回到触发元素。详情面板打开不抢焦点，`F6` 在侧栏 → 内容 → 详情间循环。
- 编辑器与终端获得焦点时，全局快捷键只保留 `Mod+K`、`Mod+S`、`Mod+W`；其余按键交给编辑器/终端；输入法组合输入期间不触发任何快捷键。

全局快捷键（设置 → 快捷键 页面展示同一张表，W02 实现在 `packages/workbench/src/shortcuts.ts`）：

| 快捷键 | 动作 |
| --- | --- |
| `Mod+K` | 搜索与命令面板 |
| `Mod+N` | 新建笔记 |
| `Mod+Shift+N` | 快速捕获 |
| `Mod+Shift+T` | 新建任务 |
| `Mod+S` | 保存当前文档 |
| `Mod+W` | 关闭当前标签 |
| `Mod+\` | 折叠/展开模块侧栏 |
| `Mod+.` | 专注模式 |
| `Mod+1…9` | 切换到第 n 个模块标签 |
| `Esc` | 关闭最上层弹层；专注模式下退出专注 |

### 动效（值取自原型 `ui/motion.css`）

| token | 值 | 用于 |
| --- | --- | --- |
| `--motion-fast` | 120ms | hover、按下、开关 |
| `--motion-enter` | 180ms，`--ease-out` cubic-bezier(0.16,1,0.3,1) | 弹层、对话框、抽屉进入（淡入 + 4px 位移 / 0.98 缩放） |
| `--motion-exit` | 144ms，`--ease-in-out` cubic-bezier(0.65,0,0.35,1) | 退出 |
| `--motion-move` | 220ms | 详情面板滑入、侧栏折叠宽度变化 |
| `--motion-stagger` | 30ms | 列表首屏项依次出现（最多 8 项） |

设置“动态效果”为“减少”或系统开启减少动态效果时，所有位移与缩放改为 80ms 纯淡入淡出，列表不做依次出现。动效不得阻塞操作：提交在点击时发出，不等待动画结束。

## 6. 文案

- 简体中文，句子短；按钮用动词（“保存”“移到回收站”“恢复此版本”）。
- 错误文案 = 发生了什么 + 用户可以做什么（例：“文件已被其他程序修改。查看差异后选择保留哪一份。”）。
- 不在界面出现“原型”“演示”“演练”字样（D-24）。

## 7. 可访问性

- 所有交互元素可键盘到达，焦点环 `0 0 0 3px color-mix(in srgb, var(--focus-color) 18%, transparent)` 加 1px `--focus-color` 边框，只在 `:focus-visible` 显示。
- 状态不只靠颜色：完成用对勾与划线，错误用图标与文字。
- 图标按钮有 `aria-label`；表格有表头 `scope`；树使用 `role="tree"`；实时区域（保存状态、进度）用 `aria-live="polite"`。
- E2E 中对每个模块主页面运行 axe，严重级别（serious/critical）为 0。
