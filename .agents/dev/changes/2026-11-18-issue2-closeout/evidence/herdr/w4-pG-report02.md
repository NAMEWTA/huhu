# F09 · 5,000 段实时预览的输入延迟

任务对象为基线 `9132640` 和最终候选 `e85d281`。本报告的 done 表示性能调查完成；业务实现和 Issue 验收由 Lead 决定。

**调查结论**　5,000 段普通笔记中，OK 富文本插件每键多次遍历全文或编辑区 DOM，是可移除的同步工作。相同输入驱动下，rc.4 和 e85d281 的三轮 p95 中位数分别为 17.4 和 24.7 ms，相差 7.3 ms。临时构建保留所有插件、同步和持久化，收窄无关扫描后三轮 p95 为 12.0 / 11.9 / 13.6 ms。临时构建三轮中位比原候选低 12.7 ms。原严格用例复核也通过 3/3，p95 分别为 13.3、11.8 和 13.3 ms。交付候选本身仍按原测量判定，临时试验未合入。

## 实验口径

- 候选执行 `git checkout --detach e85d281`、`pnpm build`。同机同一 Electron 44.9.1、Playwright 1.65.0、Node 26.11.1、Xvfb，rc.4 使用原工作树构建。每次独立进程、profile、临时 Vault。驱动在每次启动前检查一分钟平均负载 <2，且 `pgrep -fa 'electron|playwright'` 无匹配；40 次启动的负载范围为 0.65–1.99。另一个工作树运行 Playwright 时暂停起跑，等待期间不计样本。
- 复用了 `tests/e2e/perf.spec.ts` 的 5,000 段 fixture，包括加粗、行内代码和 50 种 Wiki 链接。打开同一篇笔记，点击编辑区，Ctrl+Home、ArrowDown，再用 `keyboard.type("a",{delay:25})` 输入 80 次。各轮 p95 取排序后第 76 项。诊断驱动额外核实连续 80 个 a 已经进入正文。单插件对照每次在临时运行实例中用 PM 的 reconfigure 只去掉指定 plugin，输入结束后复核 plugin key 已移除。对照组同样重配原插件列表。组合快路径改在复制的生产构建中，保留原插件列表。
- 本次按项目现有严格用例计时，终点为编辑区 MutationObserver 的首次回调。归档 quality.md 第 42 行把目标描述为“按键到下一帧”；该用例截止 DOM 更新，在 Xvfb 上没有量到屏幕呈现。候选用例打印的 CM 分段是旧探针，PM 不填那些数组。本次从真实 PM 对象、Yjs、浏览器事件和 CDP 取时，用专门插桩轮分析阶段；未把 profiler 轮用作门禁。

## 三轮端到端和单插件对照

| 构建或单独移除的插件 | 各轮 p95（ms） | 三轮中位（ms） |
|---|---:|---:|
| rc.4，CodeMirror | 17.4 / 16.9 / 18.6 | 17.4 |
| 候选，原插件 | 24.7 / 21.6 / 24.9 | 24.7 |
| 候选，重配同一插件列表 | 21.1 / 21.3 / 19.7 | 21.1 |
| 裸 HTML 图片 | 18.3 / 17.3 / 18.3 | 18.3 |
| JSX bridgeId | 21.1 / 18.1 / 23.5 | 21.1 |
| 标题锚点（plugin$37） | 18.6 / 22.0 / 20.5 | 20.5 |
| 协作光标 label 层 | 18.6 / 18.7 / 19.1 | 18.7 |
| 占位提示 | 21.5 / 19.4 / 24.0 | 21.5 |
| 代码块高亮 | 19.1 / 20.7 / 20.7 | 20.7 |
| 候选，七处保守快路径，165 个插件 | 12.0 / 11.9 / 13.6 | 12.0 |

原用例驱动的严格复核只在临时用例副本中替换应用根目录，保留原夹具、按键、观察器、断言和 retries=0。

| 严格复核 | p95（ms） | 最大值（ms） | 样本 | 结果 |
|---|---:|---:|---:|---|
| 1 | 13.3 | 16.3 | 80 | 通过 |
| 2 | 11.8 | 19.8 | 80 | 通过 |
| 3 | 13.3 | 19.8 | 80 | 通过 |

单插件结果用于检查方向，样本每组只有三轮。重配也会重建插件 view，组间 p95 有宿主噪声，单项差值不能相加或精确分摊这 7 ms。相对重配对照的 21.1 ms 中位，单独移除裸 HTML 图片或协作光标层分别为 18.3 和 18.7 ms；单独移除 bridgeId 的中位仍是 21.1 ms，尽管插桩能直接量到它的扫描时间。各单插件条件均未稳定通过 16 ms；组合构建的三轮与严格复核才用于可行性判断。Lead 的原脚本为 rc.4 14.8、候选 21.8 ms；本机本轮的 rc.4 也有超线，故不把 14.8 当作固定基线。

## 一次按键中时间花在哪里

下表分别取三次独立插桩运行中 80 键的中位数。事件时刻从捕获 keydown 开始；函数时长为首个 DOM 回调前已返回的同步调用累计，含嵌套；不能把父子项相加。

| 时刻或同步工作（ms） | 三轮中位数 |
|---|---:|
| keydown 到 document 冒泡监听器 | 0.4 / 0.3 / 0.3 |
| 到 beforeinput 捕获 | 0.6 / 0.5 / 0.5 |
| 到原生 input 捕获 | 4.9 / 4.8 / 4.8 |
| 到 PM view.dispatch 开始 | 5.3 / 5.2 / 5.2 |
| PM state.applyTransaction（含插件） | 5.8 / 6.1 / 5.6 |
| 其中 sourceDirty.appendTransaction | 0.4 / 0.4 / 0.4 |
| 其中裸 HTML 图片装饰状态 | 1.7 / 1.7 / 1.6 |
| 其中 bridgeId 索引 | 1.6 / 1.6 / 1.5 |
| 其中代码块高亮状态 | 1.0 / 1.1 / 1.0 |
| 其中 markIdentity | 0.6 / 0.7 / 0.6 |
| PM view.updateState | 4.1 / 4.0 / 4.2 |
| 其中标题锚点 decorations | 0.5 / 0.5 / 0.5 |
| 其中 placeholder decorations | 0.3 / 0.4 / 0.3 |
| 其中 docView.update（含子节点/NodeView 更新） | 0.9 / 0.9 / 0.8 |
| 其中协作 caret label view.update | 0.6 / 0.6 / 0.6 |
| 其中 y-sync view.update | 0.8 / 0.6 / 0.9 |
| y-sync 内部 PM→Y.XmlFragment | 0.6 / 0.5 / 0.7 |
| 到首个编辑区 DOM mutation 回调 | 16.0 / 15.5 / 15.8 |

rc.4 的 CM 事务完成从 keydown 起计，三轮中位为 11.7 / 12.1 / 13.8 ms。CM 编辑 DOM 仅 34 个直接子元素，PM 有 5,001 个。两侧使用同一份文档。候选的字符变更引起 PM 读取 DOM、应用事务及插件、更新 view 并同步 Yjs，随后测试观察器才收到通知。关闭查找栏且无批注的普通输入中，findReplace 与 okCommentAnchors 的状态/装饰、trailingAffordance、dragHandle 均非主要耗时；SourceDirty 的 append 和基础节点树更新保留。

CDP CPU 样本可见 PM 的 nodesBetween、bridge 的 buildPmNodeToYElementIndex、裸图片过滤 isLiteralOnlyContext、DOM 查询与序列化。CPU 采样覆盖按键之间的活动；用上述回调计时确定首个 DOM 前的成本。另三轮在真实 runAfterAll 周围记录结算区间，分别如下。

- 第 1 轮结算 1 次，耗时 1808 ms，与 80 个 keydown→DOM 区间重叠 0 次。
- 第 2 轮结算 1 次，耗时 1844 ms，与 80 个 keydown→DOM 区间重叠 0 次。
- 第 3 轮结算 1 次，耗时 1998 ms，与 80 个 keydown→DOM 区间重叠 0 次。

`server-bridge/server-observers.ts` 已对超过 400 个顶层块的文档使用延后结算，连续推迟上限 3 秒，flush / 切源码等出口有 settleNow。长结算会妨碍下一个键派发；再次 debounce 不会拿回已测单键 DOM 路径中的这 ~7 ms。

## 给实现会话的修改范围

| 文件或插件 | 保持行为的改法 | 必须覆盖的回退 |
|---|---|---|
| `extensions/bare-html-image-decoration.tsx` | 已有装饰为空，且仅在普通顶层段落内插入无 mark 文本时，检查变更段落。若新段落连 `<` 都没有，保留空集合。 | 含 HTML、跨段粘贴、删改标签、行内代码或已有图片时走原逻辑，保留位置映射和原始 Markdown。 |
| `extensions/bridge-id-plugin.ts`、`extensions/mark-identity.ts` | 只在旧 ID 表为空、单步插入普通文本且该步无法引入 JSX 或被跟踪的 mark 时沿用旧状态。 | JSX、已有 ID、带 mark 的插入、移动、撤销及结构变更仍走原路径，覆盖节点身份与回调。 |
| `extensions/code-block-lowlight-plugin.ts` | 已证明单步编辑发生在顶层普通段落时直接映射已有高亮装饰，免去对新旧文档两次 findChildren。 | 代码块正文、语言变化、跨块操作及远端复杂事务保留完整计算。 |
| `extensions/heading-anchors.ts` | 将 heading decorations 存到 PM 插件状态。无文档变化直接复用；普通段落文本插入只映射位置；可能改到标题或层次的操作全量重算。 | 重名标题的后缀、粘贴片段中的标题、删除/移动/改名和远端事务。 |
| Tiptap Placeholder；接入点 `app/src/editor/TiptapEditor.tsx` | 对 showOnlyCurrent、无子节点递归且光标严格处于非空顶层文本块内部的情况，直接返回空装饰。可用本地适配或项目已有的 pnpm patch 方法落地。 | 空文档、块间边界、嵌套节点、只读模式、NodeSelection、组合输入；其余分支按原语义求值。 |
| `app/src/editor/caret-label-layer.ts` | 保留创建并放置 label 层的时机。从未注册过 label 时跳过整棵编辑 DOM 的 querySelectorAll；第一次 attachCaretLabel 后恢复原 reconcile。 | 覆盖远端光标首次出现、消失、多个编辑面、重新挂载。模块级“曾出现过”只向 true 转换，不依赖弱表可枚举性。 |

表中 `extensions/` 均位于 `packages/editor/src/vendor/open-knowledge/app/src/editor/` 下。原型共享的窄分支要求单个 replace step、零长替换、闭合 slice、唯一无 mark 的文本节点、原位置处于深度 1 的 paragraph。所有未知事务使用原路径。保留了 Yjs 同步、bridge settle、保存、DOM 更新和 rAF 时序。生产化时记录 vendor patch，沿用小范围守卫，避免把整个编辑事务或同步语义改成异步。

## 合入前验证

1. 在原候选和实现分支以同一入口跑严格用例，每次开跑前检查同样负载与进程，交错至少三轮。记录每轮 80 样本、p95、最大值和返回码；验目前 16 ms 门槛，保留 rc.4 及未改候选作参照。
2. 用包含标题、图片、代码块、链接和 JSX 的文档做等价性回归，比较快路径与完整计算的 DecorationSet 位置、内容和 bridge/mark ID，覆盖表中回退场景。混合富文本、粘贴、选区变化、撤销/重做、IME、只读、远程 Yjs 事务、切换源码、关闭落盘和重开都需保留语义。通过现有插件单测、IME/评论/附件/查找替换 E2E 后再交付。
3. 单独记录持续输入超过 3 秒时的输入间隔和保存/切模式耗时。首个 DOM mutation 指标从 keydown 开始计，主线程在派发下一个 keydown 前的阻塞可能完全漏记。不要用通过单键门槛替代这项检查。

## 复查入口与证据边界

原型的三轮语义回放与原插件重配的三轮输出逐字节相同：加入两个同名标题、JavaScript 代码块、裸 HTML 图片，在前面段落插字后比较标题 ID 和装饰位置，再改标题检查重编号。三轮快路径输入均在退出后从 Vault 文件读回连续 80 字符。该覆盖限于这些路径；IME、跨客户端合并和完整产品回归尚需在正式实现上验证。

在本工作树运行 `python /tmp/pgf09/fast.py` 可从当前产物重建候选副本。用 `python /tmp/pgf09/gate.py normal runA fast runB` 可独立复跑诊断。严格用例沿用 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g "编辑输入延迟" --retries=0`。对临时构建复跑使用临时用例副本，把 root 指向 `/tmp/pgf09/fast/apps/desktop`。逐键记录、门槛日志、原型和严格用例副本位于本机临时目录；本报告保留逐轮结果。归档的 F09 历史对照显示同一 OK 编辑器在 main 与合入查找替换修复后的候选均约 21–22 ms。结合本轮实测，可把主要差异定位到随 7edcaa8 引入的富文本输入路径。单提交二分未执行。未提交代码或修改 rc.4。

[驱动与临时原型](/tmp/pgf09/) · [每轮起跑负载](/tmp/pgf09/gates) · [CDP 原始 profile](/tmp/pgf09/profile1.cpu) · [严格复核 1](/tmp/pgf09/strict1.log) · [严格复核 2](/tmp/pgf09/strict2.log) · [严格复核 3](/tmp/pgf09/strict3.log)

Lead（2026-11-19）：接受。可行性成立，派 w4:pH（impl-perf，sol medium）按 report02 范围实现并以严格用例验收。
