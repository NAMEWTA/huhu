# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task07.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task07.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report07.md
- 执行结果：done
- 审查目标：`ce913d204053f26005b027b44c7ff486e37ec4dd`，对照 `3dbd420`

## 结论

**按 Lead 已接受的 H02 登记口径，`ce913d2` 可作为 Issue #2 的关闭候选。** 已确认 H02 原有越根匹配消除，已登记 A/B 的保护成立。B06 的折叠光标修复通过受控红绿对照，集成全量 **244 通过、4 跳过、0 失败**，打包门禁也通过。待修事项是 H02 的 backdrop 目标与浮层字族，以及 B06 在键盘聚焦后到文档起点时的旧观察器回退。当前证据没有显示这些边界阻断本轮验收。

## H02 样式作用域

- **作用域成立。** 新守护根据 `vendor.ok-*` 与 `*.huhu-ok` 来源层扫描每个 CSS 资产。AST 按逗号分支判断，要求 `:is()` / `:where()` 的每个分支都能保证作用域，并区分根的兄弟和根内元素的兄弟。测试覆盖 `:where(:root)`、`.ok-root + .host`、`:is(html,.ok-root)`、否定和关系伪类、嵌套逃逸、无根标记的来源层和仅名为 rich 的宿主块。旧产物判红 C=2279，集成产物 C=0。测试从旧守护 1/18 转为集成版 18/18，途中名为 `unit-green.log` 的 15/18 是中间记录。 [插件](/home/wta/projects/huhu-wt-review/packages/editor/build/ok-scope-plugin.mjs:29) · [守护](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:164) · [负例](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.test.mjs:21) · [旧产物](/tmp/huhu-h02-evidence/new-guard-old-build.log:26) · [集成产物](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/build.log:328)
- **A/B 登记符合本次验收。** host-fetch 的 A=10、B=12 都有精确类名和理由，样例验证未登记交集会失败。rich CSS 与 `3dbd420` 产物逐字节一致，旧计数来自混入的 Huhu 自有规则。启动页 `.text-link` 的越根命中从 2 降到 0，两个按钮的实际颜色相同。根外 `.grow` 的 flex 相同，TXT 的 CodeMirror 外层回到宿主 Inter，内容和搜索层仍以 JetBrains Mono 为首选。原规格仍写「空交集」，Lead 已接受有逐项证据的登记机制。 [登记](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:22) · [原规格](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:83) · [逐项记录](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pJ/report01.md:21) · [Lead 验收](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pJ/report01.md:84) · [Electron 探针](/tmp/huhu-h02-evidence/electron-probe.json)
- **根内特异性不增加。** `:where()` 的特异性为零，过滤目标元素而保留其他组合子，普通伪元素的过滤作用于来源元素。既有根替换和 descendant-only reset 保留。`base.huhu-ok`、`components.huhu-ok` 保留原顶层层次，同层宿主直接声明相对子层的优先级按 CSS 层叠处理。产物中新旧 95 个 `@property` 与 34 个 `@keyframes` 逐条一致。pJ 同机即时对照 14 张计算样式全相同，8 张逐像素相同，其余差 5–38 点且最大通道差 2。历史 rc4 截图与宽度矩阵仍红，设置页在修复前已有 103 处计算样式差异。即时对照支持本补丁未引入所测页面的新差异，历史验收应保留原有差异和批准依据。 [选择器规范](https://www.w3.org/TR/selectors-4/#zero-matches) · [作用域实现](/home/wta/projects/huhu-wt-review/packages/editor/build/ok-scope-plugin.mjs:9) · [即时对照](/tmp/huhu-h02-evidence/captures-diff.log) · [历史对照](/tmp/huhu-h02-evidence/rc4-vs-before.log) · [历史差异台账](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/visual-compare-rc4.md:19)
- **Portal 的局部 token 继承成立。** 气泡、路径面板、命令候选、lint 提示、拖拽预览及三个图片入口继续使用原挂载位置。根标记使宿主 token 在各自根上重新映射，`color-scheme` 继承页面，定位和 z-index 保持原设置。拖拽预览仍复制正文排版。pJ 实测深色气泡恢复为 `rgb(24, 23, 21)`，候选恢复为 488 px。新根也应用 `base.huhu-ok` 的 Inter 和默认背景。以未单独设字族的 lint 消息为例，Vercel 下从继承宿主 Geist 转为继承 OK Inter。Claude 探针未覆盖这个差异。OP-D05 约定字体使用宿主 token，建议补测其他主题并对齐 portal 字族。Web harness 的根内/根外 `.flex` 对照通过。深色图片缩放的原规则另要求 `.dark` 祖先，Huhu 文档根设 `data-mode`，而 Zoom portal 位于 body。此次单加标记不能让该历史分支命中，现有探针也未测展开后的遮罩。 [token 映射](/home/wta/projects/huhu-wt-review/packages/editor/src/rich/token-map.css:14) · [宿主主题](/home/wta/projects/huhu-wt-review/packages/ui/src/theme.ts:37) · [Vercel 字体](/home/wta/projects/huhu-wt-review/packages/ui/src/styles/themes.generated.css:660) · [浮层根字族](/home/wta/projects/huhu-wt-int/apps/desktop/out/renderer/assets/host-fetch-D7ldV90B.css:7443) · [图片规则](/home/wta/projects/huhu-wt-review/packages/editor/src/ok/ok-globals.css:14) · [Portal 证据](/tmp/huhu-h02-evidence/electron-probe-final.log) · [浏览器证据](/tmp/huhu-h02-evidence/browser-probe.log)
- **`::backdrop` 的越根例外已收紧，有一处选择器输出应修。** 裸分支只容许精确登记的 `--tw-*` 初值，无 `!important`。当前产物中没有裸分支。逗号成员开头的空格在 AST 插入时留在伪元素上，实际生成 `:where(.ok-root, .ok-root *) ::backdrop`，解析结果是作用域伪类、后代组合子、伪元素。它会漏掉自身就是 `.ok-root` 的 dialog backdrop。该规则位于 Tailwind 属性回退的 `@supports` 中，内容是初始化值，图片对话框另有内部 overlay。未观察到当前 Electron 的可见故障。建议将开头空格移到插入的节点之前，补产物断言覆盖有空格的逗号成员与根自身。 [CSS 伪元素定义](https://drafts.csswg.org/css-position-4/#backdrop) · [输出语句](/home/wta/projects/huhu-wt-review/packages/editor/build/ok-scope-plugin.mjs:20) · [集成 CSS](/home/wta/projects/huhu-wt-int/apps/desktop/out/renderer/assets/host-fetch-D7ldV90B.css:172) · [例外判定](/home/wta/projects/huhu-wt-review/scripts/check-ok-class-collisions.mjs:211)
- **P-H02-01 完整。** 补丁登记与此次八份 vendor 文件逐一对应，重放清单记录对应目标与 SHA-256。Lead 集成重放的 1,348 个文件集合与字节均零差异，登记无缺项或多余项。 [登记](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/PATCHES.md:317) · [清单](/home/wta/projects/huhu-wt-review/docs/upstream/ok-parity/vendor-replay.json) · [重放](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/replay.log)

## B06 聚焦后的折叠光标

- **原失败链与修复吻合。** pD 用真实 Electron 捕获 Home 造成 DOM 4→0，而 PM 留在段尾 25。聚焦回调把 DOM 写回 4，随后 Shift+End 仍为空。旧候选、前一版、main 都能在受控时序下复现。历史全量 trace 缺内部端点，无法逐个回填原因。集成补丁每次聚焦建立独立记录，仅在 PM 放行的可信、未取消、非组合态导航键上保存默认动作前的端点。回调在同次聚焦、视图存活、可编辑、未组合、两端在编辑器且已移动时，先让观察器读取折叠光标。 [pD 定因](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report05.md:12) · [快照及回调](/home/wta/projects/huhu-wt-review/patches/prosemirror-view@1.41.8.patch:185)
- **与上游设计方向一致，适用条件更窄。** 已核对 npm 1.43.0 源包。上游聚焦时读取 `DOMSelState`，未同步才登记定时器，定时回调只在当前端点与聚焦时快照相同才 `sync()`，正常 `selectionchange` 继续读 DOM。此处固定 1.41.8 沿用已有 observer，比较的是本次原生导航前的四个端点，条件满足时主动 flush。无本次导航、端点没动、普通重新聚焦沿用模型回写。组合态跳过新增 flush，销毁或失焦提前退出，非折叠区继续按原聚焦快照 flush 并重新检查视图。 [上游发布包](https://registry.npmjs.org/prosemirror-view/-/prosemirror-view-1.43.0.tgz) · [上游聚焦源码](/tmp/huhu-pH02/package/src/input.ts:926) · [DOMSelState](/tmp/huhu-pH02/package/src/selection.ts:39) · [本地回调](/home/wta/projects/huhu-wt-review/patches/prosemirror-view@1.41.8.patch:205)
- **折叠光标还有一条应修边界。** `DOMObserver.flush()` 保留旧的文档起点复位启发式。焦点建立未满 200 ms、最近 300 ms 无点击或触摸且本轮无文档变更时，即使刚有可信 Home/Ctrl+Home，若目标等于文档第一个可放光标的位置，observer 仍可把它写回模型旧位置。现有受控红绿用例点进文档第二段，同时避开两项条件。建议为纯键盘重新聚焦到首段末尾后到文档起点补对照，且保留无导航的浏览器复位行为。静态路由已核对，触发频率和用户可见结果暂无该场景的运行记录。 [observer 回退](/tmp/huhu-pH02/patch-edit/src/domobserver.ts:224) · [本地 flush 调用](/home/wta/projects/huhu-wt-review/patches/prosemirror-view@1.41.8.patch:222) · [第二段夹具](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-selection-focus.spec.ts:27)
- **补丁与指纹一致。** 对照 TypeScript、ESM、CJS 的事件门槛、快照、回退和 teardown。集成实际依赖链接指向新指纹，三个文件的 Git blob 分别为 `b1f3e6b9`、`68106de7`、`454d1d44`，与补丁后像和 pH 文件一致。补丁 SHA-256 为 `da42778675211e26b06cb163d935e568bed5ee521a7b40f2495a72233f30f50e`，锁文件依赖引用一致，版本仍为 1.41.8。R-53 与 notices 同步。 [补丁](/home/wta/projects/huhu-wt-review/patches/prosemirror-view@1.41.8.patch) · [锁文件](/home/wta/projects/huhu-wt-review/pnpm-lock.yaml:228) · [台账](/home/wta/projects/huhu-wt-review/docs/upstream/ledger.md:22) · [声明](/home/wta/projects/huhu-wt-review/THIRD_PARTY_NOTICES.md:133)
- **先红后绿成立。** 测试仅暂存同一生产聚焦回调。真实 Home 后且 PM 仍在 11→11 时，基线在回调后断言读到 DOM 偏移 4、PM 11→11，修复版保持 DOM 偏移 0、PM 7→7，接着 Shift+End 选中 7→11 并显示气泡。专项首次 6/6，修订后的知识库回归 59/59，原块类型转换及保存重开压力批次 30/30。保留了先前 58/59 的夹具红灯。 `f9dbed3` 只让重新聚焦用例先等待 End 同步到 DOM 和 PM，两者确认段尾再测试复位，专项复跑 10/10。IME 证据为 CDP 合成，仍按 Q7 记录。 [红灯](/tmp/huhu-pH02/red.log:14) · [专项](/tmp/huhu-pH02/green.log) · [夹具调整](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-selection-focus.spec.ts:177) · [回归](/tmp/huhu-pH02/regressions-final.log) · [压力批次](/tmp/huhu-pH02/pressure.log)

## 集成候选门禁

Lead 的构建信息与审查 SHA 一致。格式、lint、typecheck、build、knip、notices、vendor 补丁登记与重放均退出 0。额外的 H02 守护用例 18/18，项目 Vitest 1006 通过、1 跳过，vendor 6427 通过、4 跳过。 [构建标识](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/build-info.json) · [退出码](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/progress.log) · [项目用例](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/test.log:235) · [vendor 用例](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/test:vendor.log:1762)

**G07** 的 rc.4 A/B 和候选 A/A 各有 20 个交错完整对，分别在 1 分钟负载 1.92、1.90 时起跑。采样期间 1 分钟负载范围 1.90–3.87。下表由原始样本重算 nearest-rank p50/p95，单位 ms。 [A/B](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/g07-rc4.jsonl) · [A/A](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/g07-aa.jsonl) · [负载](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/g07-load.txt)

| 端点 | rc.4 p50 / p95 | 候选 p50 / p95 | A/B p95 差 / 配对中位差 | A/A p95 差 / 配对中位差 |
| --- | ---: | ---: | ---: | ---: |
| 工作台外壳与引擎就绪 | 1051.0 / 1172.6 | 1058.9 / 1161.2 | −11.3 / +6.8 | −32.3 / −9.8 |
| 收件箱外壳首次可见 | 70.1 / 81.9 | 64.7 / 82.1 | +0.3 / −5.6 | +5.1 / +7.2 |
| 首篇笔记可编辑 | 71.6 / 84.6 | 463.6 / 485.8 | +401.2 / +391.5 | −18.5 / −1.7 |

工作台 p95 下降，配对中位小幅上升。收件箱 p95 小幅上升，配对中位下降。两处正向差值均小于同构建 A/A 波动，未发现可辨别的非知识库回退。旧 locator 辅助记录工作台 p95 −55.0 ms、配对中位 +36.8 ms，保留原始结果。首篇笔记 20/20 对更慢，沿 Q9 记录。候选 rich JS 5,209,193 B、host-fetch JS 2,903,173 B、explorer JS 712,146 B，桌面 out 为 38,838,723 B。 [指标定义](/home/wta/projects/huhu-wt-review/scripts/measure-notes-startup.mjs:82) · [观测和产物](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/g07-rc4.jsonl:2)

**F09** 三批独立严格测试均零重试通过，起跑负载为 1.89、1.95、1.82。每批 80 个按键，p95 **12.3 / 14.2 / 14.1 ms**，最大 **17.7 / 22.3 / 20.1 ms**。16 ms 门槛用于 p95，计时端点为 keydown 至编辑区 DOM 更新。 [测试定义](/home/wta/projects/huhu-wt-review/tests/e2e/perf.spec.ts:148) · [第一批](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/f09-strict-1.log:6) · [第二批](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/f09-strict-2.log:6) · [第三批](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/f09-strict-3.log:6)

**全量 E2E** 零重试 **244 通过、4 跳过、0 失败**，耗时 22.2 分钟。此前失败的块类型用例在本轮 #46 通过，转换、保存和重开均走到。六条 B06 专项、F08 四主题和 F10 泄漏专项均通过。套件内 F09 p95 **12.3 ms**，80 个样本。默认跳过的是 10 万文件 Vault 与三条截图用例。 [块类型用例](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/e2e-full.log:51) · [B06 专项](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/e2e-full.log:89) · [F09](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/e2e-full.log:242) · [全量日志](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/e2e-full.log)

**打包** Linux 解包产物 ASAR 核对 51,021 条，读回 `ce913d2`，测试源、helpers、结果与夹具排除检查通过。打包 E2E **4/4**，覆盖写盘、任务与导出、随包 Herdr Core、CLI、Agent 监督运行。 [ASAR](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/asar.log) · [打包用例](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/e2e-packaged.log)

Debian amd64 构建退出 0。安装包版本为 `0.0.1~rc.4`，实测 **225,401,008 B**，相对 rc.4 的 **141,619,672 B** 增加 **83,781,336 B（59.16%）**，按 Q9 记录。 [Debian 元数据与 SHA-256](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/deb-size.txt) · [rc.4 基线](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md:118)

## 分级与审查边界

- **阻断 · 当前范围未发现仍需阻断 Issue #2 关闭的问题。** report06 的越根匹配与未登记交集已按 Lead 验收口径处理。此前 B06 全量红灯有同一失败机制的受控红绿对照，原转换流程与候选全量均通过。
- **应修 · 收紧 H02 的产物覆盖与主题继承。** 修正以伪元素开头的逗号成员插入位置，并覆盖自身是 OK 根的 dialog。为新浮层补 Vercel 等主题的字族对照，按 OP-D05 映射宿主字体。验收台账应同步登记的 A/B 例外，以及历史 rc4 图像与宽度矩阵的已知差异。
- **应修 · 核对键盘聚焦后到文档起点。** 保留普通光标恢复，同时补文档起点导航与 observer 的对照。当前 B06 接受证据覆盖鼠标点进第二段和后续扩选链。
- **可选 · 扩充实机与弹层对照。** 深色图片缩放的历史 selector 行为可用打开后的实际 overlay 样式与截图补证。按 Q7 记录 Windows/macOS 实机、实体鼠标及真实输入法测试范围。

detached HEAD 核对了 `3dbd420..ce913d2` 的 21 个文件和合入图。 `eb21c5b` 由 `d1d3c11` 合入，`10f8dd6` 与 `f9dbed3` 由 `ce913d2` 合入。全量 `git diff --check` 在 PM 补丁的 167、184、204 行提示尾空白，三处均是内层 unified diff 的空上下文行。其余文件检查通过。静态审查引用了 Modern Web Guidance 的选择器层叠和原生键盘焦点指导。运行数据来自各执行者的日志，本轮未运行 E2E、构建、Electron 或测试，业务工作树保持干净。 [CSS 指南](/tmp/mwg-guide-997351-1795108460560.md:40) · [焦点指南](/tmp/mwg-guide-997424-1795108460797.md:282)

## Lead 验收

Lead（2026-11-20）：接受。本轮无阻断；应修与可选项登记到台账「后续项」。ce913d2 作为交付候选，合入 main。
