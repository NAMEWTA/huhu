# G07 · 收件箱正文冷启动的根因与原型验证

**建议在收件详情采用同一 OK 阅读模型的轻量入口，先交付已验证的普通段落，保留复杂内容的原阅读器。** 在候选 `f9f0186` 上，三次诊断均看到标题后还要等约 0.8 秒才能读正文。关键耗时是整套富文本模块的加载、求值和最后一次 React Suspense 提交等待。将普通正文与标题同次渲染后，10 对原型与 rc.4 的正文配对差中位为 **+2.4 ms，95% 区间 [−25.8, +27.0]**。同次启动中，原型标题与正文出现的中位间隔为 0.2 ms。

首页、首页数据卡和任务的本轮配对区间均包含零。首篇可编辑笔记仍比 rc.4 慢 **392.8 ms**，10/10 对同向。富格式收件的冷路径和 H05 收件编辑仍需实现验收。本次交付为调查和原型，无业务提交。

## 与 rc.4 的冷启动对照

每侧 10 个完整样本，每对按奇偶交替首发，每侧每对分三次独立启动。60 次起跑均检测到其他 Electron/Playwright 为零，一分钟负载 1.53–1.97。首尾 uptime 分别为 `07:52:29 up 13:53,  2 users,  load average: 1.86, 2.16, 4.17` 和 `07:55:59 up 13:57,  2 users,  load average: 1.73, 2.04, 3.72`。Linux x64、i7-12700（环境可见 8 逻辑 CPU）、Electron 44.9.1 / Chromium 152、Node 26.11.1、Playwright 1.65.0、Xvfb。复制项目驱动，仅在开始计时前加入空闲检查与日志。完整执行 `node /tmp/g03/proto/scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 10 --frame-click`。新进程、新 profile、新 Vault，操作系统页缓存照常使用。

各列单位为 ms。p50/p95 采用驱动的 nearest-rank，10 个样本的 p95 是最大值。配对差为原型减 rc.4，区间采用固定种子的 10,000 次成对重采样。首篇笔记从文件行收到 Enter 到可编辑正文可见，其他表列从进程启动计时。

| 用户端点 | rc.4 p50 / p95 | 原型 p50 / p95 | 配对中位差 [95% CI] | 原型较慢 |
|---|---:|---:|---:|---:|
| 收件正文 | 1154.6 / 1279.1 | 1156.8 / 1250.6 | +2.4 [-25.8, +27.0] | 6/10 |
| 收件标题 | 1154.4 / 1278.9 | 1156.6 / 1250.1 | +2.5 [-25.7, +27.0] | 7/10 |
| 任务夹具名称 | 1154.5 / 1344.6 | 1155.0 / 1369.2 | -2.9 [-69.1, +89.6] | 5/10 |
| 首屏 | 1042.7 / 1107.7 | 1041.3 / 1092.2 | -9.5 [-35.5, +33.3] | 5/10 |
| 首页数据卡 | 1117.8 / 1204.3 | 1115.2 / 1192.5 | -13.5 [-42.1, +33.3] | 5/10 |
| 首篇笔记 | 70.7 / 93.8 | 462.1 / 508.9 | +392.8 [+380.1, +408.5] | 10/10 |

rc.4 同次启动的正文减标题中位数为 +0.2 ms，范围 +0.1 至 +0.3 ms。

原型同次启动的正文减标题中位数为 +0.2 ms，范围 +0.1 至 +0.5 ms。

本轮普通正文从标题到可读的额外等待已降到驱动采样间隔内。跨会话的绝对启动时间会波动，判断使用各自同机交错的 rc.4 配对差。首篇笔记仍走完整知识库编辑器，归档的原候选 40 对结果为 +394.6 ms；本轮记录的 +392.8 ms 与之接近。两批都以 rc.4 为基准，未做原候选与原型直接配对。本轮的 CI 精度也不足以排除任务等端点的小幅回退。[原候选结果](/home/wta/projects/huhu-wt-perf/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/reopened/README.md:22)

正式原型的 renderer 为 36,738,516 B，比未插桩候选多 3,420 B；rich/host-fetch JS 及其 CSS 的大小都保持候选值。这里的数字对应未压缩构建目录，安装包仍需在发布产物上测量。

## 0.8 秒花在哪里

历史对照为 rc.4 `9132640` 与集成构建 `d6a4663`。其正文配对差为 +782.0 ms [765.8, 880.4]，10/10 对更慢，标题配对差 +11.1 ms。此次在 `f9f0186` 重新构建并复现。生产资源使用本地 `huhu-app://workbench/assets/` 协议，传输数值包含 Chromium 调度、读取和数据交付。[原 10 对记录](/home/wta/projects/huhu-wt-perf/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/reopened/g07-body-ab.jsonl)

每次启动均打开带 2,001 篇笔记和一条真实收件记录的新 Vault，首次可命中导航按钮时发可信指针点击。复制候选产物后为懒加载、模块体、语言切换、provider、构造器和有工作量的 settle 加 mark，同时采 CDP Network/DevTools 时间线、V8 编译事件、React 调度标记和正文 DOM。三轮开始时的一分钟负载为 1.92、1.99、1.99，其他 Electron/Playwright 为零。下表单位为 ms。相位内有并行下载、流式编译和嵌套执行，表内有意保留重叠区间。

| 观测 | 第 1 轮 | 第 2 轮 | 第 3 轮 |
|---|---:|---:|---:|
| 驱动的标题帧 → 正文帧 | 796.3 | 806.3 | 817.7 |
| 请求 Compact → 正文节点首次进入 DOM | 821.7 | 834.5 | 838.7 |
| 请求 → 首批 18 个 JS 全部收完 | 183.8 | 189.4 | 186.0 |
| 请求 → 两份 OK CSS 收完 | 76.5 | 64.8 | 70.7 |
| 两份 CSS 的解析时间 | 6.3 | 5.9 | 5.8 |
| V8 主线程解析/编译事件的时间并集 | 247.4 | 246.6 | 254.8 |
| 后台线程解析/编译事件的墙钟并集 | 132.8 | 136.2 | 137.2 |
| 主线程模块求值时间并集 | 242.4 | 249.7 | 249.3 |
| 请求 → rich import 已解析 | 428.1 | 440.5 | 437.6 |
| zh-Hans 目录请求到收完 | 10.0 | 11.7 | 8.7 |
| Lingui 激活全过程（含上一行） | 12.4 | 13.8 | 10.9 |
| LocalDocProvider 同步构造（含发起 hydrate） | 1.2 | 0.8 | 1.0 |
| 首次 hydrate，直到派发 synced 前 | 25.0 | 25.5 | 26.4 |
| Tiptap `new Editor`（含准备构造参数） | 9.9 | 7.3 | 7.5 |
| OK 原生 `create-tiptap` 测量，含挂载周边工作 | 58.2 | 56.0 | 60.5 |
| 有待处理工作的 settle 次数 | 0 | 0 | 0 |
| 最后一次 React retry 安排的延迟 | 226.0 | 232.4 | 225.3 |
| 该次安排 → 正文进入 DOM | 256.0 | 260.7 | 257.7 |

- **加载链**。首批 18 个 JS 并行，之后才请求中文目录，共 19 个 JS，CDP 合计解码 9,807,835 B。诊断版 rich 为 5,209,710 B，host-fetch 为 2,903,620 B，静态依赖的英文目录为 263,222 B，实际激活的中文目录另有 263,088 B。两份样式共 433,941 B。Vite 的动态 import 回调在请求后 82.5 / 86.5 / 97.6 ms 才开始。两大模块体在主线程各执行约 93–96 ms 和 136–141 ms，其他依赖求值和嵌套编译还会占时。单独挪走中文目录或几毫秒的 CSS 解析，覆盖不了这段等待。
- **挂载链**。外层 lazy resolve 后才进入 `OkRoot → dynamicActivate → acquireProvider → hydrate`。原构建给只读正文建立 Y.Doc 并将 Markdown 转进同步模型。Tiptap 挂载还会通过 promise 分段 yield。其后 trace 命中 React 在重试 lane 上的 `globalMostRecentFallbackTime + 300 - now()` 分支。最后一次定时等待约 0.23 秒，之后还有提交和 DOM 工作。更早的 throttle 与资源处理重叠。只读夹具没有触发处理脏数据的 settle。首个标题和正文的 DOM mark、rAF 采样以及物理显示器刷新的时刻各有自己的定义。计入对照的是驱动原有的 rAF 端点。[只读 compact](/home/wta/projects/huhu-wt-perf/packages/editor/src/rich/compact.tsx:64) · [语言门控](/home/wta/projects/huhu-wt-perf/packages/editor/src/rich/OkRoot.tsx:96) · [首次 hydrate](/home/wta/projects/huhu-wt-perf/packages/editor/src/host/hocuspocus-provider.ts:101)

## 阅读等价性的实测范围

原型只改复制到 `/tmp` 的生产 renderer。详情仍读原始 capture 正文，沿用 `trim()` 和原空值文案。普通段落可包含文字、组合字符、数字、空格以及列明的全角标点，可按一个空行分段。边界含空格、Markdown 语法、无法识别的字符或结构进入原 compact 路径。HTML 节点以文本构造，ID 和 value 绑定当前记录。常规阅读无需创建 Y.Doc、加载语言目录或运行 Tiptap。独立的带数据 CDP 对照在正文出现前未见编辑器 JS/CSS 请求，标题与正文 DOM mark 相隔约 0.09 ms。该次为诊断轮。

- **解析**。将 20 种文字片段两两组合，再分别以空格、中文逗号和空行连接，1,200/1,200 的节点类型、段落数及文本都与真实 OK `mdManager.parseWithFallback(stripFrontmatter(s).body)` 的 content 对齐。复制选区另外以 OK 的真实 `mdManager.serialize` 为对照，1,285/1,285 个子串和跨段组合的纯文本 MIME 值一致。
- **真实窗口**。Electron 中先后打开单段、多段、长文折行、加粗/斜体/行内代码、空正文、Wiki 链接、列表、代码块。Claude 亮色 1280×920 和暗色 1024×920 下共 16 组，innerText、第一段选区、段落/标记盒和计算样式字段、可编辑状态和 tabIndex 各组均相同。四类各保留一对正文截图，两档共八对。记录字体、方向、选区与滚动几何，包含按现有布局绘制的滚动条。浅色四对像素差为零；暗色单段、多段、折行和格式化的截图分别有 34、18、12、0 个像素不同；裁去外框 18 px 后四张差异均为零。
- **复制与存储**。通过可信 Ctrl+C 读取系统剪贴板，对照单段、带格式段以及多段的整段、局部、跨段、边界、仅空格和段落间隙选区。检查 `text/plain` 与 `text/html`，包括 OK 的行尾和 `data-pm-slice`。两种模式共 18 个选区对照，两类 MIME 均一致。额外用鼠标移入段落、移入左侧留白和拖选后按 Ctrl+C。两版显示的操作按钮、选中文本和两种剪贴板载荷均相同。点击铅笔可打开原始 fenced Markdown，在编辑窗修改并取消后，八份文件的字节内容均保持一致。
- **收窄原因**。另做过 1,485,162 B 的同源解析器原型，能显示强调和行内代码，但普通 DOM 复制会丢失 Markdown 标记、段末换行和内部粘贴信息。最终受测版把这类内容交回原 OK 阅读器，并移除了该包。已测普通段落可以作为独立实现切片。复杂节点仍承担原冷启动成本，分语法的通过率与真实 Vault 中的覆盖比例需要另测。

## 备选方案与适用边界

| 方案 | 首屏与任务 | 收件正文 | 首篇笔记 | H05 与风险 |
|---|---|---|---|---|
| 已验证的普通段落阅读入口 | 只增加少量入口 JS/CSS，无首页预取；见 A/B | 直接绘制可读内容，富格式走原 compact | 笔记使用原入口；见 A/B | 普通阅读和复制单独验；输入走正式编辑入口。需共用布局、剪贴板与 schema 测试以防漂移 |
| 首页 idle、hover 或导航意图时预取 | 首页 idle 不代表首页数据和任务已就绪，磁盘、编译会竞争；可信首帧点击也可能早于 hover | 命中时可覆盖一部分加载，仍须 hydrate 和提交 | 命中共享模块时可能提前完成一部分工作，也可能占用导航主线程 | 可保持原编辑行为；缺少本次 A/B 支持，只适合作为另一个对照实验 |
| 进一步拆 compact 模块闭包 | 以独立只读入口加载，首页与任务初始依赖可隔离 | 有机会加速链接、列表等慢路径；只拆文件仍保留真实的 React retry 与挂载成本 | 笔记需继续使用自己的惰性文档入口，共享依赖避免重复打包 | 使用原 schema、NodeView 和宿主链接回调；按功能验证源码、插件、翻译、输入和样式，复查安装包与重复依赖 |

## 交给实现会话

1. 从 `plugins/inbox/src/ui/InboxModule.tsx:222` 的只读详情接入 `@huhu/editor` 的独立阅读入口。直接渲染已经确认等价的段落。将阅读样式提成 OK 与工作台共同消费的规则，避免复制一套易漂移的字体、方向、换行、段距及代码样式。解析输出来自 `packages/editor/src/vendor/open-knowledge/server-bridge/md-manager.ts` 与 `bridge-intake.ts` 的同一条路径。把有交互的节点交还带宿主路由的 `CompactMarkdownView`。拿普通段落和选区快捷路径持续同真实解析与序列化做差分测试，未知结构回到原实现。保持记录 ID / 版本绑定，切换条目时丢弃过期解析，不将只读投影写回 Markdown。
2. 保持铅笔打开已有编辑弹窗的交互。按 OP-D18 将想法正文输入接入 `CompactMarkdownInput`，可参照 `plugins/tasks/src/ui/compact.tsx` 传入页面与 `referenceSearch`，提交前从 port flush，取消时丢弃草稿。候选的 `InboxModule.tsx:400` 仍使用 textarea，快速捕获是单行 input，转换表单在第 479 行另有 textarea。要分别界定这些入口的业务范围。OP-D18 的成本回退条款写的是任务详情，不能据此把收件编辑迁回纯文本。
3. 对正文建与真实 OK 阅读器逐项对照的样本组。覆盖中英文、RTL、空内容/空格、换行/折行、嵌套标记、链接/引用、列表/代码/表格、附件及未知节点，检查亮暗与主题、宽度、字体、缩放、可访问树、键盘遍历、拖选、纯文本和富文本复制。检查只读无保存、快速切换无串文，点击真实引用时宿主打开同一目标。输入端单列新建、修改后立即保存、取消、重新打开、@、undo/redo、中文 IME composition 及数据落盘。
4. 性能复核同时保留标题与实际正文的第一个可见帧端点。空收件箱的模块追踪另补带数据的冷进程追踪。按正文类别分层补冷启动，记录慢路径比例与正文等待。用同一驱动对最终生产构建跑 A/A 与 rc.4 A/B，记录首屏、首页数据、任务、标题、正文及首篇笔记的 p50/p95、配对区间，复核桌面与 Web 入口、安装包和 chunk 大小。

## 复查材料

本次临时构建与原始证据位于本机 `/tmp/g03`，系统清理临时目录后需重跑。诊断与正式计时使用独立构建。正式测量保留项目原有正文探针、轮换顺序及统计代码。[驱动原件](/home/wta/projects/huhu-wt-perf/scripts/measure-notes-startup.mjs:64) · [本次驱动](/tmp/g03/proto/scripts/measure-notes-startup.mjs) · [60 次起跑记录](/tmp/g03/formal-gates) · [完整原始样本与统计](/tmp/g03/formal.jsonl)

- **诊断**。[时间线 1](/tmp/g03/orig1.trace) · [时间线 2](/tmp/g03/orig2.trace) · [时间线 3](/tmp/g03/orig3.trace) · [阶段统计脚本](/tmp/g03/timing.py) · [CDP 资源统计脚本](/tmp/g03/network.py) · [普通正文原型对照](/tmp/g03/check1.trace)
- **原型**。[只读条件与剪贴板代码](/tmp/g03/reader.js) · [阅读布局](/tmp/g03/reader.css) · [接入构建的脚本](/tmp/g03/proto.py) · [OK 原版窗口观测](/tmp/g03/original-parity.json) · [最终原型窗口观测](/tmp/g03/proto-parity.json) · [鼠标拖选对照](/tmp/g03/proto-gesture.json)
- **验收依据**。[G07 与 H05](/home/wta/projects/huhu-wt-perf/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:79) · [OP-D18](/home/wta/projects/huhu-wt-perf/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/decisions.md:127)

### Modern Web Guidance

查阅 deferred rendering 与 performance 指南后，原型保留可查找、可选取的真实正文，只推迟阅读时用不到的编辑器工作。当前实测平台为 Linux Electron/Xvfb。Web 入口、其他桌面平台、全部主题和真实输入法留给实现验收。[本次检索与指南](/tmp/g03-guidance)

- 2026-11-20 Lead：接受分析与原型结论，派 w4:pP task01 实现。注意：原型只覆盖普通段落，富格式正文仍走原 compact 冷路径，是否满足 G07「无回退」需实测富格式样本后再判定；另据本报告第 2 条核对，H05 收件想法输入仍是 textarea，台账 H05「满足」不成立，一并交 w4:pP。
