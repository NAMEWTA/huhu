# #3 窗口控制由谁负责

## 平台选择

推荐 Main 使用 Electron 现成窗口装饰，Renderer 只负责标题内容和交互空区。选择依据是原生控件在 Engine、React 甚至页面加载失败时仍能执行窗口动作。代价是三平台的可用矩形、全屏过渡与菜单呈现不同，需在安装版分别量测。下表是设计比较，尚未做宿主 PoC。[需求与验收](spec.md)

| 平台 | 推荐的原生路径 | 整窗 frameless、自绘按钮的代价及使用条件 |
| --- | --- | --- |
| macOS | 先试 `hiddenInset`，再对照 `hidden`。保留红黄绿、平台拖动区、系统菜单栏，左侧按实际按钮簇留白。全屏由 OS 接管。 | 自绘须承担红黄绿行为、用户双击偏好、全屏与辅助技术，崩溃页还需独立控件。本案已有原生方案，不默认引入。 |
| Windows | `hidden` + `titleBarOverlay`，预留原生 caption buttons、保持可调整边框，标题栏按钮按原生矩形之外排布。 | 自绘增加窗口状态订阅、命中测试、系统菜单与 Snap 复现成本。原生 hover/多屏 DPI 是选型实测项。 |
| Linux | 以相同 overlay 起步，分别测 X11 和原生 Wayland，不把 XWayland 计作 Wayland。记录 DE/合成器及窗口按钮布局，按实际控件侧留白。 | 仅目标环境确认 overlay 无法达标时评估受控适配。可移植的是 Host 的状态语义，自绘仍须实测移动/缩放、键盘关闭及加载失败逃生路径。该环境一次只启用一组按钮。 |

另一条低成本结构是保留完整系统装饰、只在内容区换品牌或隐藏菜单。它能保留系统控制，却持续占用两条顶部，不能满足 TB-02。把业务菜单的所有动作直接实现在 Main 也无法取得活动文档、插件状态及正确选区。推荐只在 Main 实现窗口行为和原生菜单模板。

## 两个实际调用

**在笔记 A 打开菜单并保存。** 用户原本选中 A 的一段文字。Renderer 在菜单取得焦点前记录当前 Vault、活动标签/文档身份和编辑上下文版本，通过限定字段把命令可用性发给当前窗口的 Main，文档内容、选区文本不跨 IPC。macOS 由系统菜单激活，Windows/Linux 可由标题按钮或 Alt/F10 唤起同一产品模板的原生 popup。Main 将允许的保存动作交回所属 Renderer。执行前再核对同一文档、启用状态和可写性，排空编辑器防抖并调用已有会话保存。结果为已保存、不可用或具体失败。菜单打开期间切 Vault、标签关闭或冲突均不能改写另一文档。菜单关闭/取消恢复原焦点。普通输入/编辑走系统编辑角色或编辑器自己的处理，单次按键只由其一消费。为 `Mod+S`、`Mod+K` 分配唯一 accelerator 或 DOM 处理者。插件动作复用 `ContributionRegistry`、`CommandPalette` 项的执行回调。状态切换复用 `UiState`，Vault 操作复用 `VaultSwitchDialog` 的脏文档处理。

**在最后一笔输入后点 X，等待时又选择退出。** 原生 X 或按需自绘的关闭动作进入 `win.close()`。退出请求进入 `before-quit`。Main 拥有待关闭窗口集合与事务。先拦住每次 close/quit，包括第二次关闭，再按窗口和文档世代合并在途检查。Main 向每个仍需落盘的可信主 frame 发送独立 `requestId`。preload 的 flush 订阅只在所属窗口回传本次结果。Renderer 排空 drainer，等待串行的文件/草稿写入和其他有效 flusher。结果归纳为已处理（全无修改、文件写入、按原策略保住草稿）、失败/冲突。超时、窗口消失或进程失联由 Main 标作无法确认。全部窗口均完成或用户逐项明确放弃后才发放一次性关闭许可，退出时再停 Engine。macOS 单独关窗仍可重新激活。请求取消时撤销这一轮许可，恢复窗口，已写入文件继续有效。重试只重试未确认的部分，并重新检查是否出现更新的编辑。

## 接口、状态和故障窗口

- **窗口接口（拟议）**。在现有 `window.huhuHost` 下提供可选的窗口能力。读初态、订阅变化并返回解绑函数。快照含平台、装饰模式、聚焦/最大化/全屏、可用标题区域。主进程事件为状态依据。展示名、有限外观参数、菜单可用项和触发菜单的锚点均由窄方法更新。色值/坐标、文本长度、命令 ID 按白名单与窗口界限校验。命令携带窗口本地上下文版本，不携带调用者任意指定的窗口 ID。只有自绘模式确实需要时才暴露最小化、最大化/还原和关闭。预览 iframe、data 错误页和任意子 frame 均无这些权限。校验 `senderFrame === sender.mainFrame`、可信 origin、`BrowserWindow.fromWebContents(sender)`、存活窗口及参数，延续隔离、沙箱、禁用 Node integration。错误页使用原生控件和最小静态可拖动空区，宿主级错误提示独立于 Renderer。
- **关闭结果（拟议）**。一个待处理项由窗口、当前 frame 世代、请求 ID 绑定，销毁/导航/超时均清理 timer 和订阅。迟到回执和其他窗口回执不改变新一轮状态。Main 可确认从未打开 Vault 的干净启动页可直接关闭。只读 Vault 也要核对有无未处理的编辑或草稿。已打开 Vault 但 Engine 不可用不能据此推断干净。失败对话框默认安全地留在窗口。重试、取消、明确放弃显示各自结果，崩溃时只说明已知的持久内容。保存期间冻结进一步编辑或在放行之前排空并复核最新 revision，避免“早一笔成功掩盖后一笔输入”。在途关窗升级为退出时，共用待处理集合并纳入其他窗口。取消退出不能提前置永久放行标志。若 #10 编辑草稿在场，先取得看板的离场结果。选「继续编辑」或保存失败均撤销关窗；放弃只处理布局草稿，仍须检查脏文档。三选项的权威契约在[看板规格 ACC-DASH-04](../feature_2026-11-19-issue-10-widget-dashboard/spec.md#用户验收)。
- **当前与目标的差距**。`requestFlush` 使用全局一次性 ack 和 3 秒超时，都解析成成功。`win.on("close")` 在 `closing` 为真时直接 return，可能让第二次关闭绕过等待。`before-quit` 提前置 `flushedForQuit`。preload 的 `onFlush` 吞异常、无解绑。`runFlushers` 的 `allSettled` 未读取结果。#2 当前 `DocumentSession.flushForExit` 自动模式忽略 `save()` 返回的 false，手动模式写 `notes.draft.save`。应从最内层传播实际结果，继续执行其他 flusher 并逐项汇总。专注计时的 `FocusPauseOnClose` 也在此链上，不能丢掉。Vault 切换的 `settleDirtyDocs` 已有写文件/保草稿语义，须区分文件未写但草稿可恢复与两者都失败。[Main](../../../../../../apps/desktop/src/main/index.ts) · [preload](../../../../../../apps/desktop/src/preload/index.ts) · [flushers](../../../../../../packages/workbench/src/state/flushers.ts) · [文档会话](../../../../../../plugins/notes/src/ui/documents/DocumentSession.ts)
- **菜单归属（拟议）**。平台模板的原生角色、HUHU 关于、窗口和退出归 Main。业务动作由贡献命令、当前文档或 UiState 所有。macOS 安装显式 HUHU 菜单。Windows/Linux 移除默认独立菜单横条，显式以按钮、Alt/F10 展开 HUHU popup，区分标题空白区的系统菜单。按窗口和 Vault 世代推送有限启用状态，点击时重新验权。手动保存来源包括当前 `NoteDocument.onKeyDownCapture`。命令面板已有全局 Mod+K 监听。打包的帮助只走既有可信目标，开发模板重载动作不进入产品菜单。[命令面板](../../../../../../packages/workbench/src/command-palette/CommandPalette.tsx) · [笔记输入](../../../../../../plugins/notes/src/ui/NoteDocument.tsx)
- **装配与 Web**。拟将现有 `.hu-window-bar` 提取至 workbench 的窗口标题组件，并由桌面 `Root` 在 Launch/加载/App 各分支共用合适的槽位，Engine 依赖仅在已就绪分支挂载。品牌、VaultMenu、搜索、命令、主题沿用现有控制。`appearanceController` 的首帧缓存、Vault 主题、系统明暗事件均驱动同一有限颜色/几何更新，原生背景跟上实际主题。标题可用矩形优先取系统报告，并在无报告时按宿主量测的保守安全区布局。一个高度定义驱动标题/overlay/内容。交互区和弹层 no-drag、纯空白区 drag。共享代码读取可选 Host 能力，普通 Web 使用浏览器窗口并保留应用导航。不依赖 `navigator.windowControlsOverlay` 或 Electron 模块。Web 的菜单/对话框沿用现有可访问控件、Escape 退一级并恢复焦点。避免对 Baseline 尚未 Widely available 的 invoker/popover 新行为形成硬依赖。桌面专用 app-region 以 Electron 44.9.1 的文档与安装实测为准。[版本固定的窗口选项](https://github.com/electron/electron/blob/v44.9.1/docs/api/structures/base-window-options.md) · [拖动区](https://github.com/electron/electron/blob/v44.9.1/docs/tutorial/custom-window-interactions.md)

## 来源与适配

先查 Huhu 的 Shell、VaultMenu、CommandPalette、主题、关闭流程及 [R-46 台账](../../../../../../docs/upstream/ledger.md)。[本批来源清单](../feature_2026-11-19-huhu-issues-3-10/sources.md)登记了实际检出。本地只读参考为 `temp/sources/open-knowledge`，本批核对 `origin/main@b2af296a73049ddd47f6d679b36774ecbdd3d19b`。已有 OK vendor 是编辑器闭包。Electron 自带 BrowserWindow/Menu 已足够作为首选依赖，当前 Huhu 根许可为 GPL-3.0-or-later。下表对应上游默认分支的本地文件；Issue 固定 SHA 的历史出处保存在 [source.md](source.md)。只借用授权的源码职责、行为和信息结构，品牌、导航、控件与文案沿用 Huhu。实施时按实际复制部分保留版权、许可证与修改说明，补台账、用 `pnpm notices` 检查分发清单。

| 已查上游 | Huhu 拟适配位置与限度 | 验证 |
| --- | --- | --- |
| OK `b2af296` 的 `buildNonDarwinChromeOpts`、`computeTitleBarOverlay`、`applyThemeToWindow` 与 traffic-light 常量。该 SHA 根 package 声明 GPL-3.0-or-later。[window-chrome.ts](../../../../../../temp/sources/open-knowledge/packages/desktop/src/main/window-chrome.ts) | 拟 `apps/desktop/src/main/platform/window-chrome.ts`。移植选项、几何来源与存活检查，颜色/坐标按 HUHU 四主题测量。 | TB-04～08、TB-10 |
| 同 SHA 的 `installApplicationMenu`、`MenuDeps`、`buildMenuTemplate`。[menu.ts](../../../../../../temp/sources/open-knowledge/packages/desktop/src/main/menu.ts) | 拟 `apps/desktop/src/main/application-menu.ts`。以 HUHU 命令 ID 和可用性替换 OK 产品项。 | TB-03、TB-12、TB-13、TB-17 |
| Electron 44.9.1 的 `Menu.setApplicationMenu` / `popup`。[Menu API](https://github.com/electron/electron/blob/v44.9.1/docs/api/menu.md) | 包内已有依赖。使用原生模板与角色。拟窗口桥同步修改 preload、renderer/env.d.ts、workbench/settings/host.ts 和实际 mock。 | TB-06、TB-12、TB-16、TB-18 |

## 待决选择

> 2026-11-21 用户采纳本表全部推荐项，定案见[批次决定](../feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)。


| 用户需决定的体验 | 选项、建议及代价 | 前置与影响 |
| --- | --- | --- |
| 哪些 Linux 环境列入安装版支持承诺？ | 建议先列 Ubuntu GNOME 的原生 Wayland 与 Xorg，若实际发布用户覆盖 KDE 等桌面则加对应组合。扩大承诺意味着每个组合都要取得原生窗口证据。 | 先列可取得的安装环境。影响 S0 的矩阵、Linux 适配例外与 S4 全平台结论，其他平台可推进。 |
| 最小宽度时保留哪些可见入口？ | 建议保留 Vault、搜索/命令和应用菜单的可识别按钮，长名称省略，版本移至关于。另一选择是将搜索收进产品菜单，节省宽度但多一步。 | 用长中文、150% 缩放和两种控件侧的原型对齐。仅影响 S2 紧凑布局。 |

两项均待确认。窗口装饰是否可用、Snap/全屏实际表现以及保存失败是否可恢复，分别由宿主和持久化证据回答。
