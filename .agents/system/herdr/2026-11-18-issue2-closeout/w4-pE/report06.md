# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task06.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task06.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report06.md
- 执行结果：done
- 审查目标：`3dbd4204dea6cdda23be677ef51bc70a55c722b3`，对照 `e85d281`

## 结论

**建议暂缓关闭 Issue #2。** `ac6c8a5` 修复了已知 `:root` 泄漏，桌面各主题捕获值等价，KaTeX 例外的实际声明范围够窄。构建脚本仍漏检部分作用域外规则，H02 原「空交集」未满足。`cbb2b70` 的 F09 快路径和回退路径未发现静态编辑语义差异，登记和重放完整，严格测量 3/3。最终 G07 所测端点及打包通过。全量 E2E 仍有一条未归因的空 DOM 选区失败，执行到打开块类型菜单之前就已中断。应保留红灯并复核该路径。

## H02 · 主题值与构建守护

**原 `:root` 泄漏修复成立。** 三个捕获属性移入由桌面入口全局引入的 UI `tokens` 层，仍在 `html` 的计算值阶段解析 `--muted`、`--accent`、`--syntax-type`。主题控制器在同一个 `document.documentElement` 写入主题和明暗模式。下游 OK 消费已经解析的继承值，局部重定义 `--muted`、`--accent` 不会改写捕获值。无主题属性时仍由宿主默认的明暗规则提供值。没有发现当前桌面主题根、独立 portal 或源码编辑器在此改动后改变取值。pB 真实 Electron 的四主题 × 明暗，用同一探针核对 HTML 根、OK 根和 CodeMirror，两个版本的采样逐项一致。独立浏览器 harness 直接加载 OK 原生 CSS，它的功能验证不能代替 Huhu 主题颜色验证。 [UI 层序](/home/wta/projects/huhu-wt-review/packages/ui/src/styles/index.css:4) · [捕获位置](/home/wta/projects/huhu-wt-review/packages/ui/src/styles/tokens.css:3) · [主题所有者](/home/wta/projects/huhu-wt-review/packages/ui/src/theme.ts:66) · [OK 变量映射](/home/wta/projects/huhu-wt-review/packages/editor/src/rich/token-map.css:14) · [八组实测差分](/tmp/huhu-task10.CzdnGk/computed-diff.log)

**构建门禁实际生效。** 根 `pnpm build` 在各包构建完毕后执行 `check:ok-css`，现有 CI 与发布入口均走根命令。旧产物红灯为 `host-fetch` 的 `:root`，修后该块与 `rich` 的 C 均为 0。KaTeX 例外只匹配名为 `vendor` 的直接 `@layer` 中完整字面文本 `body{counter-reset:katexEqnNo mmlEqnNo}`。增加一个声明的既有探针已判红。例外没有绑定 KaTeX 文件来源或限定出现次数，同一规则文本可在其他已检查的 vendor 块匹配。就现有规则的实际声明而言足够窄，编译格式改变也会以失败显现。 [构建命令](/home/wta/projects/huhu-wt-review/package.json:13) · [例外判断](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:66) · [旧产物红灯](/tmp/huhu-task10.CzdnGk/baseline-guard.log) · [修复后守护](/tmp/huhu-task10.CzdnGk/final-guard.log) · [新增声明的红灯](/tmp/huhu-task10.CzdnGk/tampered-guard.log)

**守护可以漏检，C=0 只适用于现有启发式。**

- 在已纳入检查的样式块中，`:where(:root) { --sample: red }` 的首部不在全局正则范围，变量分支又排除 `:where(`。普通宿主类选择器写变量也走同一排除分支。`.ok-root + .host` 目标是作用域外相邻节点，字面命中 `.ok-root` 就被视为已限制。`:is(html, .ok-root)` 则包含未受限制的分支。以上都是代码可直接判定的漏检，用作后续守护的负例。已有整条 `::backdrop` 放行也不检查声明内容，历史理由只涵盖默认的 `--tw-*`。 [选择器判定](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:75) · [历史 backdrop 例外](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/spikes/sp-2.md:8)
- 桌面扫描先按作用域标记和 `rich-` 名称筛选块。构建把未限定的规则提取到其他独立块时，若工程仍有一个合格 OK 块，独立块可完全跳过。零候选退出 2 仅防止所有候选都消失。宜以构建来源识别 OK 产物，并用选择器 AST 检查每个匹配分支的目标是否留在作用域内。 [产物识别](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:42)
- **H02 原「空交集」仍未字面满足。** 集成构建 `host-fetch` 的 A/B 为 **10/12**，`rich` 为 **13/0**。交集只打印，退出状态只由 C 决定。数目与修复前一致。最终 `host-fetch` 的 `vendor.ok-utilities` 里，`.text-link { color: var(--link-color) }` 未限定目标，也能匹配 OK 根外启动页的「重新选择目录」和「以只读方式打开」。这是当前产物的选择器交集，视觉影响仍取决于样式进入该页面后的变量和层叠值。历史视觉审计有已登记的预期差异，这轮颜色对照针对三个捕获 token。我未找到逐项接受当前 A/B 或正式变更 H02 口径的记录。建议 Lead 明确登记作用域内自有类等已证实无冲突的项目，并处理剩余交集，再按原标准关闭。 [H02 规格](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:83) · [记录和退出码](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:106) · [构建规则](/home/wta/projects/huhu-wt-int/apps/desktop/out/renderer/assets/host-fetch-CSZlwlWN.css:3014) · [宿主按钮](/home/wta/projects/huhu-wt-review/packages/workbench/src/launch/LaunchPage.tsx:150) · [历史视觉审计](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/visual-compare-rc4.md)

## F09 · 快路径等价性

共享守卫从事务的 `before` 解析插入点。只接受一个 `ReplaceStep`、`from === to`、闭合 slice 中单个无标记文本节点、深度 1 的顶层 paragraph。结构改动、替换、开放 slice、带标记、复杂粘贴和嵌套输入继续走全路径。PM undo 与 redo 共用 `historyKey`，Yjs 更新及 Y.UndoManager 的事务仍带 `ySyncPluginKey`。普通单段纯文本粘贴、部分 IME 插入或编程插字可以满足同样的形状，判断只优化插件计算，不改写事务、选区、输入事件和 Yjs Bridge。无需靠输入来源保证等价。 [共享守卫](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/top-level-paragraph-insert.ts:7)

| 改动 | 判定 |
| --- | --- |
| 裸 HTML 图片 | 快路径额外要求旧装饰为空、变更段落无 `<`、相邻节点不是字面标记上下文。原扫描逐个文本节点解析图片，其他块内容保持。已存在图片、输入令图片标记成形、字面上下文均回扫，位置、widget 键和生命周期路径保留。 [代码](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bare-html-image-decoration.tsx:119) |
| Bridge/mark ID | 只在旧位置或 ID 索引为空且不能引入 JSX 或 mark 时复用，计数器、WeakMap 和已有条目的重新索引不受影响。当前 mark 过滤依赖 mark 本身，注册/注销仍由原 view 生命周期维护。 [Bridge](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bridge-id-plugin.ts:78) · [Mark](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/mark-identity.ts:166) |
| 标题锚点和重复 slug | 顶层段落插字不改变标题文字和顺序。按事务 mapping 移动旧节点装饰，正常文档结构和标题更新重新全集分配，旧 slug 后缀规则保留。无文档变化复用状态。 [代码](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/heading-anchors.ts:10) |
| 代码高亮 | 指定高亮节点不能是 paragraph，变更前后选区的 head 都须在该类块外。守卫成立时所有高亮块数量、内容不变，原 `findChildren` 分支也会返回位置映射。改语言、改代码文本和选择进入代码时沿用原计算。 [代码](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/code-block-lowlight-plugin.ts:93) |
| Placeholder | 已核对锁定的 Tiptap 3.22.3。上游只在包含 anchor 的空文本块加装饰，块端点采用闭区间。此次唯有可编辑、非组合态、单光标文本选择、深度 1、位于唯一非空顶层文本块严格内部、`showOnlyCurrent` 且不含子节点时直接给空集。同一时刻其他块都不能命中。边界、只读、IME、NodeSelection、选区、空块和嵌套继续委托原函数，旧插件 key 和 spec 保留。 [适配](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/TiptapEditor.tsx:261) |
| 协作光标标签 | 先放置同一个层，再在首次注册前跳过扫描。没有 label 可以被挂载的阶段，省去 DOM 查询。首次注册后继续逐次扫描、跨编辑器定位和销毁。模块一旦注册过就不会重新省去扫描，影响后续优化幅度。 [代码](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/caret-label-layer.ts:60) |

**现有等价性测试确实覆盖快路径与回退路径。** 同一个初始状态分别应用同样 steps，一份只加 Yjs 元数据来强制回退，还用新建最终状态做装饰的完整初算对照。比较位置、属性、widget 键、side 和两类 ID 以及文档结构。相应断言还核对快路径未遍历全文并保留空索引引用。Placeholder 直接调用安装版本的原插件，而非手写预期。边界用例里的部分两侧本来就都回退。测试没有运行真实 Yjs binding、人工输入法或逐个比较图片 widget DOM 销毁，也没有单列 redo 与单段纯文本粘贴。静态看这些路径满足同一不变量，仍可补真实绑定和组合态多事务测试增强证据。pH 的分支知识库与浏览器记录覆盖真实 Electron 路径和独立 Chromium 的普通输入、重名锚点、高亮与同步。 [等价性比较](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/paragraph-fast-path.test.ts:104) · [历史与边界](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/paragraph-fast-path.test.ts:281) · [Placeholder 和 caret 对照](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/paragraph-fast-path.test.ts:342) · [pH 原始报告](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pH/report01.md)

**补丁登记齐全。** P-F09-01..09 覆盖七个既有 vendor 文件改动和两个新增文件，另更新 PATCHES.md 本身的清单条目。固定 OK 是 `44a2e0a6acce5952da0764746e3693fded5025b4`。重放清单的改动条目有上游对应 blob 和最终 SHA，本地新增文件以 patch 产出。集成构建登记 277 项，0 漏登、0 多余。Lead 重放 1348 文件集合与内容零差异，新增专项 36/36。 [登记](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/PATCHES.md:301) · [Lead 构建标识](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/build-info.json) · [登记检查](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/okp.log) · [固定重放](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/replay.log)

## 最终门禁与 Issue #2

- **F09 严格验证。** Lead 在 `3dbd420` 的三轮同机严格用例均通过，起跑一分钟负载分别为 **1.86 / 1.82 / 1.81**。每轮 80 个按键，p95 **11.7 / 13.0 / 13.6 ms**，均低于 16 ms。pH 在独立分支交错的五轮中位数从 18.0 ms 降至 10.6 ms，支持实际减少了输入同步扫描。项目门槛的观测终点为编辑器 DOM 更新，分支持续输入仍有两侧共有的约 1.8–1.9 秒最长相邻按键间隔，应保留为独立的体验留项。 [严格轮 1](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/f09-strict-1.log:6) · [严格轮 2](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/f09-strict-2.log:6) · [严格轮 3](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/f09-strict-3.log:6) · [分支对照](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pH/report01.md)
- **G07 最终版复验。** 两批均保存完整 20 对，起跑负载 A/B **1.86**、A/A **1.79**，两批运行中取样 **1.79–3.40**。按 report05 已确认的口径，工作台 p50/p95 从 **1030.8 / 1118.2 ms** 到 **1018.2 / 1092.1 ms**，配对差中位 **−7.7 ms**。收件箱从 **63.5 / 78.1 ms** 到 **64.1 / 78.0 ms**，配对差中位 **+0.8 ms**。同构建 A/A 这两项配对中位 **+0.8 / −0.9 ms**，p95 差 **+32.5 / +4.6 ms**。所测启动端点未发现超出同构建波动的回退。旧 locator 配对差 **−1.3 ms**，首篇笔记可编辑 **71.5 / 74.6 → 465.1 / 480.5 ms**，20/20 对更慢。首页卡片数据及其他直接冷启入口仍未测。 [A/B 原始数据](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/g07-rc4.jsonl) · [A/A 原始数据](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/g07-aa.jsonl) · [负载记录](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/g07-load.txt) · [上轮 Lead 验收](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report05.md:64)

- **块类型 E2E 首跑红灯。** Lead 全量 #46 在 `editor-parity-closeout.spec.ts:592` 失败。同一临时笔记下点击「转换目标」，`toBeFocused`、Home、Shift+End 的驱动操作均完成，随后 5 秒内 DOM 选区文本持续为空。此时尚未点击「文本」按钮。上轮 report02 的观察是 DOM 选区已正确、气泡未出现，两种失败位置不同。当前 trace 只有测试层动作与失败附件，缺点击后的 PM 选区、原生选区事件时间及聚焦回调，无法判断是 Chromium 动作未形成选区、延迟回写，还是候选改动间接改变时序。新普通插字守卫在这段无输入操作中不应执行，标题缓存、Placeholder 或已有焦点逻辑仍属于观察范围。需要保留失败并按相同操作核对 DOM/PM 选区、输入事件与 20 ms 聚焦回调，再判产品与测试归因。 [全量单项](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/e2e-full.log:51) · [断言位置](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-parity-closeout.spec.ts:588)

- **最终候选的其他门禁。** 格式、lint、typecheck、build、knip、notices、补丁登记与重放均退出 0。项目单测 **1006 通过、1 跳过**，vendor 单测 **6427 通过、4 跳过**。新构建在两个主要编辑器 CSS 产物均报 C=0。
- **全量零重试。** **239 通过、1 失败、4 跳过**，21.8 分钟。唯一失败为上述块类型用例。两条受控 B06 选区用例、B07 合成 IME、F08 主题以及全量中的 F09 均首跑通过。全量 F09 p95 **11.8 ms**。跳过的是默认不启用的 10 万文件和三条截图用例。 [全量汇总](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/e2e-full.log:399) · [全量 F09](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/e2e-full.log:238) · [全部门禁退出码](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/progress.log)
- **打包与尺寸。** 解包产物 ASAR 有 **51,021 条**，读回 `3dbd420`，测试文件、helpers、结果和夹具检查通过。打包 E2E **4/4**，Debian amd64 构建退出 0。同格式包从 rc.4 的 **141,619,672 B** 增到 **225,423,448 B**（**+83,803,776 B，+59.18%**）。最终 rich JS **5,209,051 B**，host-fetch JS **2,902,075 B**，explorer JS **712,146 B**，按 Q9 记录增量。 [ASAR](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/asar.log) · [打包用例](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/e2e-packaged.log) · [Debian 尺寸与指纹](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/deb-size.txt) · [rc.4 基线](/home/wta/projects/huhu-wt-review/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/g07-budget.md:119) · [最终块尺寸](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/g07-rc4.jsonl:2)

## 分级

- **阻断 · 候选全量的块类型选区红灯。** 失败时 DOM 尚未选中文字，功能验收没有走到气泡菜单。下一步以同一样本和操作核对 DOM/PM 选区同步，区分产品偶发回归与测试时序。现有日志支持保留失败及未归因结论，无法据此把责任归给 F09 改动。
- **阻断 · H02 原验收仍缺证。** 当次实际全局 `:root` 回归已修。现有 A/B 非空，至少 `.text-link` 的不限定匹配仍能跨到宿主按钮，C=0 的输出无法表明 H02 空交集已完成。需限定规则，或逐项登记已验证的交集及明确接受依据，并核对非知识库实际样式表现后签收 H02。
- **应修 · 构建守护的覆盖。** 使用带来源的资产/层识别和选择器 AST，覆盖函数选择器、落在作用域外的关系以及没有 OK 根标记的独立构建块。将历史 `::backdrop` 例外约束至登记的默认声明，给漏检分支留负例。KaTeX 当前例外可保留。
- **可选 · 扩充编辑对照及性能观察。** 补真实 Yjs 远端与撤销重做、组合提交后同形插字、单段纯文本粘贴的事务序列对照，并继续独立记录持续输入最长停顿。

## 审查范围

- 已切到 detached `3dbd420`。核对 `e85d281..3dbd420` 16 个文件和合入图，`git diff --check` 通过，业务工作树无修改。
- 本轮只做静态审查和日志核对，未自行运行任何测试、构建或 Electron。Modern Web Guidance 读取了 CSS 层叠、主题 token、交互性能及组合输入的相关内容，作为审查参考。 [指南记录](/tmp/mwg-guide-763738-1795102871454.md)

## Lead 验收

Lead（2026-11-20）：接受。两项阻断均成立：块类型选区红灯派 pD task05 定因；H02 A/B 交集（main 既有，OP-D05 口径要求空交集）派 w4:pJ impl-css 逐项清零/登记并按应修收紧守护（AST、来源识别、::backdrop）。可选项登记。
