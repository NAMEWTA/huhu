# GitHub Issue #3 [桌面外壳重构] 替换 Electron 默认顶部栏：macOS / Windows / Linux 的 HUHU 品牌标题栏、应用菜单与原生窗口控制一体化

- 原报告 — https://github.com/NAMEWTA/huhu/issues/3
- GitHub 对象 ID — I_kwDOVmq61M8AAAABfPo1Cw
- 状态 — OPEN
- 作者 — NAMEWTA
- 创建时间 — 2026-11-14T15:06:07Z
- 更新时间 — 2026-11-14T15:06:07Z
- 标签 — 

## 正文

## 0. 用户问题与本 Issue 的范围

用户反馈：macOS、Windows、Linux 安装后，顶部仍然是 Electron 默认的那条栏，与 Huhu 本身不匹配，需要换成适合这个软件的顶部界面。

**目标：安装版默认使用与 HUHU 工作台一致的品牌标题栏和应用菜单，消除默认框架外观与重复顶部栏，同时保留三平台正确的原生窗口交互。不是只把文字改成 HUHU、换图标，或用一行代码隐藏菜单就结案。**

这里区分三个对象，一并核对和整改：

1. 系统窗口装饰 / 标题栏：拖动区域、窗口名称、最小化 / 最大化 / 关闭按钮。
2. Electron 默认应用菜单：File / Edit / View / Window / Help 等默认模板及其默认动作。
3. Huhu 内容区已有的品牌 / Vault 栏：当前 `AppShell` 中的 `hu-window-bar`。

没有用户截图，因此不声称已经辨认用户所指的是其中某一个像素区域，也不声称三平台都显示了字面上的“Electron”。本 Issue 按完整顶部体验处理上述边界，避免只修菜单、却留下重复标题栏，或者只隐藏窗口框架、却丢失窗口操作。

与 #2 的边界：#2 负责知识库编辑器及文档内部工具栏；本 Issue 负责整个桌面应用的窗口外壳、标题栏和应用菜单。不能只在 notes 插件内修复，更不能让更换模块后恢复默认栏。本 Issue 不要求重写 Electron、任务、终端或调度系统。

## 1. 已核对的真实基线与代码

- Huhu：`main@913264045cee1818497a37a57715c664aa85a1ae`，提交 `chore(release): 0.0.1-rc.4`，2026-11-14 21:45:51（UTC+8）。
- 桌面包当前声明的 Electron 版本：**`44.9.1`**，见 [desktop/package.json][h-package]。实现应按这个锁定版本验证 API，不能把官网 latest 示例中的版本当成当前依赖。
- 本次为静态源码调查与需求方案；未安装三平台产物，未运行真实窗口测试。用户报告与源码事实分别记录。

| 代码位置 | 已确认事实 | 修改要求 |
| --- | --- | --- |
| [apps/desktop/src/main/index.ts][h-main]：`createWindow()` | 已设置 `title: "HUHU"`、品牌 `icon`、背景色和窗口尺寸，但未配置 `titleBarStyle` / `titleBarOverlay`，仍沿用默认窗口框架。 | 不重复做已有标题和图标工作；真正接入自定义顶部和平台窗口控制。 |
| 同一 Main 入口及仓库菜单检索 | 当前入口没有安装 HUHU 应用菜单；`setApplicationMenu` 仓库搜索未命中。Electron 官方文档明确，未设置菜单时会提供默认菜单。 | 显式安装产品菜单，而不是继续使用框架模板。 |
| [packages/workbench/src/shell/AppShell.tsx][h-shell] | 已有品牌、`VaultMenu` 和版本号组成的 `hu-window-bar`；它在网页内容内，不等于操作系统标题栏。 | 复用并重构这条栏，与窗口装饰合为统一顶部，避免再叠加一条新的品牌栏。 |
| [packages/workbench/src/shell/shell.css][h-css] | 存在多处 `.hu-window-bar` 规则；`.hu-focus-mode .hu-window-bar` 会隐藏该栏。 | 一起清理相关布局规则。专注模式不能误隐藏新标题栏的必要窗口控制和移动区域。 |
| [apps/desktop/src/preload/index.ts][h-preload]、[settings/host.ts][h-host] | 现有 `huhuHost` 提供应用信息、Vault、文件对话框等能力，没有专门的窗口控制 / 状态契约。 | 按实际需要扩展现有窄 Host API；不能在 Renderer 直接引入 Electron / Node。 |
| [apps/desktop/src/renderer/main.tsx][h-renderer] | 启动入口已有首帧主题恢复、`LaunchPage` 和工作台装配。 | 顶部覆盖未打开 Vault、加载、正常工作台与异常状态，不以 EngineProvider 或 notes 启用为前提。 |
| [Main 的 close / before-quit / requestFlush][h-main] | 已有关闭前请求落盘及退出 Engine 的流程；`requestFlush` 有 3 秒超时，preload 回调失败也会发送 ack。 | 新按钮必须进入既有关闭流程，不另走直接销毁路径；失败 / 超时不能被当作“所有文档保存成功”。 |

## 2. 产品效果：一条属于 HUHU 的顶部栏

### 2.1 统一布局

在现有 `hu-window-bar` 基础上重构为一条应用级标题栏：HUHU 品牌、应用菜单入口、当前 Vault / 必要的活动上下文、现有搜索与命令入口、平台窗口控制。位置按平台安全区安排；不要求为此次工作增加新业务功能。

- 使用已有 `BrandMark`、`VaultMenu`、命令面板、设置入口与主题 token，不画另一套品牌，不复制一份 Vault 切换逻辑。
- 普通窗口状态下，不再出现“系统大标题栏 + 默认菜单横条 + 网页内品牌栏”三层重复顶部。
- 保持与 Huhu 当前主题、字体、间距、边界和明暗模式一致；原生按钮底色不能与自定义标题栏明显拼接。
- 标题栏高度、窗口控制占位和内容区顶部间距来自同一份几何定义；不能简单沿用旧 39px 或到处写死按钮宽度。
- 长 Vault 名称、中文 / emoji、窄窗口下正确省略；菜单、搜索与窗口按钮不能被挤出、遮挡或换成两排。版本号可降为次要信息 / 关于入口，不得挤占必要操作。
- 操作系统用于任务切换器等场景的窗口标题仍保留 HUHU 品牌；可采用“当前 Vault — HUHU”的格式，未打开 Vault 时为“HUHU”。不在标题里暴露绝对路径、令牌或秘密值。
- 工作台模块标签、知识库文档标签和编辑工具栏仍各有职责；本 Issue 不为了压成一行而破坏 #2 的文档编辑布局。

### 2.2 全生命周期一致

同一套窗口外壳覆盖：冷启动、首次使用 / 未打开 Vault、打开 / 切换 Vault、Engine 启动中 / 崩溃、正常工作台、专注模式、全屏切换及 Renderer 加载失败。

专注模式可以隐藏业务导航，但非系统全屏状态仍须能拖动、最小化和关闭窗口。全屏按平台习惯处理，不留下无意义空白或重复按钮。加载失败时也不能把用户困在既无按钮又无可用拖动区的无框窗口中；优先保留可独立工作的原生控制，必要的错误页安全顶部使用明确的最小实现。

## 3. 三平台行为契约

| 平台 | 默认方案 | 必须保留 / 验证 |
| --- | --- | --- |
| macOS | 优先采用 Electron `hiddenInset` / `hidden` 与原生红黄绿控制，将 HUHU 内容延伸到标题区域；具体选择以锁定版本的布局验证为准。 | 红黄绿位于平台惯用位置；内容留出安全区；原生全屏、缩放 / 最小化、窗口拖动、系统标题栏双击偏好正常。**保留屏幕顶部的 macOS 系统菜单栏**，其中内容改为 HUHU 菜单，不能把它误当作要删除的 Electron 栏。 |
| Windows | 优先 `titleBarStyle: 'hidden'` + `titleBarOverlay`，在 HUHU 顶部保留原生最小化 / 最大化还原 / 关闭按钮。 | 最大化 / 还原、边缘缩放、系统窗口菜单、Alt+F4；在支持环境验证 Windows 11 Snap Layouts / 贴靠；DPI 和多显示器切换后按钮位置准确。不得用仅外观相似的三个按钮换掉可用的系统行为。 |
| Linux | 先验证锁定 Electron 下原生 overlay 能否满足目标，使用同一 HUHU 顶部。 | 明确覆盖的发行版、桌面环境与 X11 / Wayland；验证窗口控制、拖动、缩放、最大化 / 全屏与键盘关闭。只有实测发现特定环境不满足时，才在平台层采用受控的无框 / 自绘控制适配，不凭一个平台截图断言整个 Linux 已通过。 |

上述是平台适配，不是保留新旧产品兼容层。不得同时展示原生与自绘两套窗口按钮；也不要求为了视觉统一把三平台强制画成 Windows 风格。

官网资料说明了 `titleBarStyle`、`titleBarOverlay` 和拖动区域的基本方式，见 [Custom Title Bar][e-title]、[Custom Window Interactions][e-interactions]；最终支持范围由项目实际 Electron 版本和真实宿主验收决定。

## 4. 应用菜单必须产品化，而不是一删了之

### 4.1 内容与入口

- macOS 使用标准系统应用菜单，应用名 / 关于 / 退出等明确为 HUHU，保留系统服务、隐藏、窗口等惯用角色。
- Windows / Linux 默认不显示独立的 Electron 模板菜单横条；通过 HUHU 标题栏中的菜单按钮访问产品菜单。明确 Alt / F10 等键盘访问路径，不能只 `autoHideMenuBar` 后让默认菜单仍随机弹出。
- 建议分组：HUHU / 文件 / 编辑 / 视图 / 窗口 / 帮助。按平台组织呈现，菜单项只绑定 Huhu 已有或本次真实实现的动作。
- 文件 / Vault 操作复用既有选择、切换和未保存检查；编辑操作面向当前焦点编辑器 / 输入框；视图操作复用侧栏、专注、搜索命令和全屏能力；帮助链接指向 Huhu 项目，不保留默认“Learn More → Electron”。
- 不为凑齐菜单新增本项目没有的“在线账户”“自动更新”“新开 Vault 窗口”等功能；不可用操作明确禁用或隐藏。
- 安装版不直接照搬开发模板的 Reload / Force Reload / Toggle Developer Tools；如项目确需诊断入口，明确放到受控的诊断区，重载先处理未保存数据。

### 4.2 同一动作只执行一次

菜单、标题栏、命令面板与快捷键调用同一操作实现。不要新增第二套命令总线，或把业务动作分别写在 Main 菜单回调和 Renderer 里。

- 复用已有贡献注册和命令执行链；涉及新增少量宿主命令时只做窄桥接。
- 编辑器保存、撤销、复制粘贴等先明确当前焦点 / 活动文档的归属；与 #2 的 OK 编辑器接入保持一致，不能两条路径同时处理一次快捷键。
- 系统菜单打开造成焦点暂时转移时，不能把保存发给错误标签或丢失原有选区。
- 关闭文档标签、关闭窗口、退出应用是不同动作，快捷键和文案需要区分，不要一律转为 `app.quit()`。
- 无 Vault、只读、Engine 未就绪、模块被禁用时，菜单状态正确，不调用不存在的能力。

## 5. 交互与安全不能因自定义标题栏退化

### 5.1 拖动、点击、焦点与无障碍

- 只把标题栏空白区域标为 `app-region: drag`；品牌按钮、Vault 菜单、搜索、菜单按钮及其弹层等交互区必须为 `no-drag`。
- 不把整个 `body`、编辑器、标签拖拽区设置成窗口拖动区；笔记文字选择和标签重排不得拖走窗口。
- 原生拖动区域可能不派发普通指针事件，不能假设在其上绑 React `onDoubleClick` / `onContextMenu` 就能覆盖系统行为。优先使用原生行为；确需自绘适配时再按平台验证。
- 区分系统窗口菜单与应用菜单，避免在同一拖动区域争抢右键。
- 所有自有按钮和菜单有可读名称、键盘焦点与可见焦点状态；自绘控件正确显示最大化 / 还原状态，不只换图标。
- 窗口失焦、最小化恢复、最大化 / 还原、进入 / 离开全屏后布局和状态同步；不在 Renderer 乐观猜测窗口状态。

### 5.2 Host API 与权限

沿用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。窗口相关动作归 Desktop Main / preload，不放进业务插件或 Engine 的公共远程能力中。

只暴露实际需要的能力，例如读取 / 订阅窗口状态、应用菜单、标题 / 主题同步；只有存在自绘控制时才增加最小化、最大化还原、关闭等方法。不要为了“可能有用”暴露完整 `BrowserWindow` 或原始 `ipcRenderer`。

Main 校验可信主 frame、调用参数和发送者对应窗口；不接受 Renderer 指定任意窗口 ID，不用 `getAllWindows()[0]` 作为操作目标。iframe / HTML 文件预览不得获得窗口控制权限。订阅返回清理函数，重挂载 / 切换 Vault 不重复监听。

### 5.3 关闭与保存

新关闭按钮必须走 `win.close()` 所触发的统一关闭检查；退出走既有 `before-quit` 流程。**禁止在新按钮处理器中直接 `destroy()` / `process.exit()` 绕过落盘。** 现有 `close` 流程最终的销毁也必须发生在明确处理保存结果之后。

当前 `requestFlush` 的超时和 preload 的无条件 ack 不能证明保存成功。接入时至少核对并修正：请求与窗口 / 请求 ID 对应、失败可回传、成功 / 失败 / 超时区分、超时监听清理、重复关闭防重入。保存失败或超时必须有重试 / 取消关闭 / 明确放弃的用户路径，不静默当成功。Renderer 已崩溃时给出实际可恢复范围，不能伪造保存成功；不因此另建通用事务平台。

窗口关闭、菜单退出、快捷键退出的行为一致；保持现有 macOS 关窗与退出应用的区别，不能为换标题栏擅自改变终端 / Engine 生命周期。

## 6. 复用来源与实施落点

严格遵守：**Huhu 已有实现 → `temp/sources` → 已有成熟依赖 → 优秀开源源码 → 小范围适配 → 确无实现才自研**。检查现有实现不等于必须保留不合适的旧顶栏；允许直接替换，不做长期兼容壳。

### 6.1 先复用 Huhu

`AppShell` / `BrandMark` / `VaultMenu` / 命令面板 / 主题控制器 / Host bridge / 关闭落盘流程已有基础，按职责重构，不另建标题栏插件、主题系统或窗口框架。

### 6.2 Open Knowledge 可直接复制 / 适配的源码

本次实际读取的上游固定提交为 **`44a2e0a6acce5952da0764746e3693fded5025b4`**，与先前来源清单对齐，不声称这是上游最新提交。

| 上游文件 / 符号 | 复用内容 | Huhu 目标（拟新增，除已存在路径外） |
| --- | --- | --- |
| [OK `packages/desktop/src/main/window-chrome.ts`][ok-chrome]：`buildNonDarwinChromeOpts`、`computeTitleBarOverlay`、`applyThemeToWindow` | 非 macOS 标题栏配置、overlay 几何、实时主题同步与窗口销毁检查。 | `apps/desktop/src/main/platform/window-chrome.ts`；只移植所需部分，颜色和尺寸对齐 Huhu，不照搬 OK 的两种窗口产品模式。 |
| 同文件：`TRAFFIC_LIGHT_POSITION`、`APP_HEADER_TRAFFIC_LIGHT_POSITION` | macOS 控件安全区与标题栏高度协同方式。 | 同一平台适配模块；数值按 HUHU 实际布局验证，不直接复制坐标当验收结论。 |
| [OK `packages/desktop/src/main/menu.ts`][ok-menu]：`installApplicationMenu` / `MenuDeps` / `buildMenuTemplate` | 显式产品菜单、依赖注入、平台角色和命令可用状态组织。 | `apps/desktop/src/main/application-menu.ts`；按实际导入补齐必要文件，接 Huhu 命令，不搬入 OK 的账户、Agent、协作或更新功能。 |
| Electron 官方窗口 / 菜单 API | 使用当前依赖已有能力，不新增仅为装饰的第三方标题栏框架。 | Main / preload 的薄封装及相应测试。 |

本次没有取得用户本机 `temp/sources` 工作副本。实施前需补核本地 OK 版本和改动，记录最终采用 SHA；不得把“读过上游固定源码”写成“已检查本机全部来源”。复制保留必要来源声明，并更新现有 `docs/upstream/ledger.md`。

### 6.3 目录和职责

```text
apps/desktop/src/main/
  index.ts                         修改：窗口创建、菜单安装、关闭集成
  application-menu.ts              拟新增：HUHU 原生菜单与动作桥接
  window-controls.ts               按需新增：窄窗口 IPC、事件和销毁清理
  platform/window-chrome.ts        拟新增：平台窗口选项、overlay、颜色和安全区
apps/desktop/src/preload/index.ts  修改：现有 huhuHost 的窄桥接
apps/desktop/src/renderer/main.tsx 修改：启动页 / 工作台共同外壳的装配
packages/workbench/src/
  shell/WindowTitleBar.tsx          拟新增：从现有品牌栏提取、整合
  shell/AppShell.tsx                修改：删除重复品牌栏、接统一标题栏
  shell/shell.css                   修改：shell 层样式、焦点模式和安全区
  settings/host.ts                  修改：Host 类型；同步其他实际声明与 mock
```

这些是实施目标路径，不冒充仓库里已经存在的文件。若共同外壳的实际组件边界更适合其他现有文件，应在同一职责目录内调整，并更新清单。

UI 类名使用 `shell-`，共享 token 归 `packages/ui`；遵守当前样式分层与归属检查。标题栏自身的布局变化是本次预期变更，必须记录视觉差异；不能一边要求新效果，一边机械要求这一区域零像素差异。无关页面则不能回归。旧品牌栏样式、重复占位和失去用途的兼容分支直接删除；不保留“新版标题栏试用”开关。

## 7. 实施切片

- [ ] **S0：基线与复用核对。** 在实际安装包记录三个平台的现状，补读本地来源，固定 SHA，列明支持环境和原生控制方案。
- [ ] **S1：Main / preload 窗口与菜单能力。** 平台配置、产品菜单、状态 / 主题桥接和关闭流程；新桥接通过安全测试。
- [ ] **S2：统一 HUHU 顶部。** 重构已有品牌栏，接入启动 / 工作台 / 错误态，完成安全区、拖动排除、主题和窄窗口布局。
- [ ] **S3：菜单与动作贯通。** 连接已有命令、Vault 切换、焦点编辑器和快捷键；校验禁用状态、无重复执行、关闭失败处理。
- [ ] **S4：真实安装验收与清理。** 三平台安装包回归、旧样式删除、来源台账和现行规范更新；尚未验证的系统单独标明，不宣称全平台完成。

## 8. 验收条件

### 外观与产品入口

- [ ] TB-01：macOS / Windows / Linux 实际安装产物首次启动即使用 HUHU 顶部；不是只在开发模式或某个插件里生效。
- [ ] TB-02：窗口内无默认标题栏、模板菜单横条与品牌栏重复堆叠；无重复窗口控制。系统正常保留的边框 / macOS 系统菜单不算缺陷。
- [ ] TB-03：品牌和帮助内容属于 HUHU；版本信息来自实际应用版本；没有默认 Electron Learn More 或测试窗口标题残留。
- [ ] TB-04：当前四套主题及明暗 / 跟随系统切换正确；原生 overlay 与 UI 同步，冷启动与切换 Vault 不出现明显异色接缝。
- [ ] TB-05：最小窗口尺寸、最大化、长标题、中文 / emoji、系统缩放和多显示器下无裁切、覆盖或不合理换行。

### 平台与交互

- [ ] TB-06：macOS 红黄绿、全屏和平台双击偏好正确；系统菜单为 HUHU，保留惯用系统角色。
- [ ] TB-07：Windows 最小化、最大化还原、关闭、拖动、缩放、系统菜单和支持环境下的 Snap 交互正确。
- [ ] TB-08：Linux 按记录的发行版 / 桌面环境分别完成 X11 与 Wayland 验证；不得用一种环境的结果代替全部。
- [ ] TB-09：拖动只发生在约定空白区；菜单、Vault、搜索、弹层、标签拖拽和编辑器选区互不抢占。
- [ ] TB-10：专注模式不让必要窗口操作消失；进入 / 退出全屏、失焦 / 恢复后按钮状态和占位正确。
- [ ] TB-11：未打开 Vault、Engine 断开及加载错误时仍能操作窗口，不依赖某个业务插件初始化成功。
- [ ] TB-12：自有菜单与按钮可键盘操作、有正确可访问名称和焦点提示；关闭 / 退出快捷键遵循平台约定。

### 数据与宿主边界

- [ ] TB-13：菜单与快捷键保存 / 撤销 / 复制等只作用于正确的焦点对象，与 #2 编辑器集成不双触发。
- [ ] TB-14：标题栏关闭、菜单退出和系统快捷键都经过统一保存检查；最后输入仍处在防抖期时不丢失。
- [ ] TB-15：保存失败、冲突、超时和 Renderer 崩溃有明确处理；无“ack 已发 = 保存成功”的错误判断，无静默强制销毁。
- [ ] TB-16：窗口 IPC 拒绝不可信 frame / 参数；HTML 预览不能控制宿主；订阅清理完整，反复切换 / 重挂载无重复监听。
- [ ] TB-17：菜单不引入 Huhu 尚未支持的产品能力；只读 / 无 Vault / 模块停用状态正确。
- [ ] TB-18：实现、Host 类型、测试 mock、规范和来源台账同步；旧顶部实现与无用样式清理，不留两套长期运行链路。

## 9. 测试证据与完成定义

单元 / 组件测试覆盖平台选项、菜单模板、可用状态、主题参数、窗口状态及 IPC 校验；Electron E2E 覆盖真实拖动排除、焦点、关闭握手、Vault 切换和专注模式。复用现有 `tests/e2e/`、`tests/e2e/packaged/` 与视觉验证体系，拟增加标题栏专项用例，不新建平行测试系统。

**三平台必须补实际安装后的截图 / 录屏和结果**：记录提交、安装包版本、操作系统版本、Linux 桌面 / 会话类型、DPI、主题，以及窗口化 / 最大化 / 全屏、菜单展开和启动页等状态。涉及原生框架的证据必须能看到系统窗口区域；仅网页截图或 Renderer screenshot 看不到原生部分，不能据此证明默认框架已消失。CI 或浏览器 DOM 测试不能代替原生控件、macOS 菜单和 Windows Snap 的宿主验收。

完成标准：**用户安装后看到的就是 HUHU 自己的桌面工作台，而不是带着 Electron 默认顶部模板的网页；标题栏、菜单、平台窗口操作、主题和关闭保存形成一个一致、可靠的整体。**

### 源码与官方资料

[h-main]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/src/main/index.ts
[h-package]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/package.json
[h-shell]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/shell/AppShell.tsx
[h-css]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/shell/shell.css
[h-preload]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/src/preload/index.ts
[h-host]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/settings/host.ts
[h-renderer]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/src/renderer/main.tsx
[ok-chrome]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/desktop/src/main/window-chrome.ts
[ok-menu]: https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/desktop/src/main/menu.ts
[e-title]: https://www.electronjs.org/docs/latest/tutorial/custom-title-bar
[e-interactions]: https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions

应用菜单默认行为与平台区别另见 Electron 官方 [Application Menu](https://www.electronjs.org/docs/latest/tutorial/application-menu) 和 [Menu API](https://www.electronjs.org/docs/latest/api/menu)。

## 评论

无评论。
