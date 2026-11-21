# task01 · H02 OK 样式作用域与碰撞守护

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- pane_id `w4:pJ`
- task `task01.md`
- 任务文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pJ/task01.md`
- 报告文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pJ/report01.md`
- 代码工作树 `/home/wta/projects/huhu-wt-css`
- 分支 `closeout/issue2-css`，基线 `3dbd420`，本地提交 `eb21c5bb287c6bd9e762a2abe75572748a3547ea`
- 执行结果 `done`
- 证据目录 `/tmp/huhu-h02-evidence`

## 实现

OK PostCSS 插件在目标复合选择器上增加零特异性 `:where(.ok-root, .ok-root *)`。伪元素仍以其来源元素为目标。现有 `vendor.ok-*` 层持续标示 OK 输入，其余 OK 层增加专用子层，沿用原来的顶层级别。构建守护扫描所有 CSS 资源的 OK 来源层，用选择器 AST 检查逗号分支、`:is()` / `:where()` 的每个分支以及兄弟组合子。未登记的 A/B 或作用域违规会使 `pnpm build` 失败。裸 `::backdrop` 只接受登记的属性名和值，且不能带 `!important`。当前 OK 产物也限定了 backdrop 的来源元素。

气泡菜单、路径建议、命令候选、lint 提示、列表拖拽预览和图片缩放对话框保留现有挂载点，并在自己的根上挂 `.ok-root`。这些入口之前直接挂在 body 上。Radix 浮层沿用已有的 OK 容器。八份 vendor 修改已登记 P-H02-01 并重放。

通过 `modern-web-guidance` 搜索 CSS 作用域并读取 `css` 指南。依据 “Within each layer, use `:where()` to make selectors only compete based on meaningful signals” 保持原有选择器特异性。浏览器 harness 也使用同一插件。

## 原始产物 A/B 逐项复核

旧检查在 `host-fetch-CSZlwlWN.css` 得 A=10、B=12，在 `rich-DOEYNOYq.css` 得 A=13、B=0。表中「可越根」指旧 OK 选择器能命中现有根外宿主元素；是否改变最终值还取决于资源加载、变量和层叠。完整选择器与产物行号见 `collision-selectors.log`。下表相对路径位于本工作树。

| 类名 | 旧分类 | Huhu 位置 | 旧 OK 可越根 | 处理与证据 |
| --- | --- | --- | --- | --- |
| `ProseMirror` | host-fetch A；rich A | `packages/editor/src/editor.css:64`，`rich/EditorAssetMenu.tsx:30`，`packages/workbench/src/command-palette/CommandPalette.tsx:60` | 通用 OK 规则可匹配根外同类元素；现有宿主查询的是根内编辑器 | 明确守住 OK 目标；登记。富文本、评论、任务编辑器用例 |
| `cm-content` | host-fetch A | `packages/editor/src/plain/PlainTextEditor.tsx:46`，`rich/token-map.css:149–156` | 是，旧 `.cm-editor .cm-content` 可匹配 TXT/JSON | 作用域化并登记；Electron TXT 计算样式、查看器用例 |
| `cm-editor` | host-fetch A | `packages/editor/src/plain/PlainTextEditor.tsx:50`，`rich/token-map.css:163–167` | 是，旧根外 `.cm-editor` 可匹配 TXT/JSON | 同上；额外比较外框和衍生搜索样式 |
| `cm-searchMatch` | host-fetch A | `packages/editor/src/plain/PlainTextEditor.tsx:51`，`rich/token-map.css:163` | 否，旧搜索命中规则已要求 OK 根 | 精确登记；Electron TXT 搜索 |
| `cm-searchMatch-selected` | host-fetch A | `packages/editor/src/plain/PlainTextEditor.tsx:52`，`rich/token-map.css:167` | 否，旧当前命中规则已要求 OK 根 | 精确登记；Electron TXT 搜索 |
| `cm-selectionLayer` | host-fetch A | `packages/editor/src/plain/PlainTextEditor.tsx:50`，`rich/token-map.css:159` | 否，旧选区层规则已要求 OK 根 | 精确登记；Electron TXT 选区层 |
| `cm-selectionMatch` | host-fetch A | `packages/editor/src/rich/token-map.css:163`，CodeMirror 运行时渲染 | 否，旧选区匹配规则已要求 OK 根 | 精确登记；Electron TXT 运行时采样 |
| `grow` | host-fetch A | `packages/ui/src/styles/components/storage-etc.css:99`，`packages/workbench/src/home/HomeModule.tsx:167`，`plugins/inbox/src/ui/InboxModule.tsx:78` 等 | 是，旧 `.grow` 无条件命中；宿主 `flex: 1` 优先 | 作用域化并登记；Electron 取根外 `.grow` 的 `flex` |
| `is-active` | host-fetch A；rich A | `packages/editor/src/rich/at-reference.ts:26`，`packages/editor/src/editor.css:98` | 否，OK 还要求 `.ok-table-insert-bar`，宿主引用菜单没有它 | 精确登记；富文本引用与表格用例 |
| `tiptap-editor` | host-fetch A；rich A | `packages/editor/src/editor.css:61–68`，`rich/RichMarkdownEditor.tsx:140,489` | 通用 OK 规则可匹配根外同类元素；现有 Tiptap 均在 OK 根内 | 作用域化并登记；编辑器及 portal 用例 |
| `border-t` | host-fetch B | `packages/editor/src/rich/comments.tsx:58,92` | 通用工具可越根；当前 Huhu 这些节点在 `OkRoot` 内 | 保留根内工具并登记；批注用例 |
| `flex` | host-fetch B | `packages/editor/src/rich/comments.tsx:58,87` | 同上 | 同上 |
| `flex-1` | host-fetch B | `packages/editor/src/rich/comments.tsx:88` | 同上 | 同上 |
| `flex-col` | host-fetch B | `packages/editor/src/rich/comments.tsx:58,87` | 同上 | 同上 |
| `h-full` | host-fetch B | `packages/editor/src/rich/comments.tsx:87` | 同上 | 同上 |
| `min-h-0` | host-fetch B | `packages/editor/src/rich/comments.tsx:87–88` | 同上 | 同上 |
| `ok-root` | host-fetch B | `packages/editor/src/host/explorer.tsx:132`，`rich/OkRoot.tsx:113` | 否，作用域根本身 | 精确登记；文件树、编辑器、批注、主题用例 |
| `overflow-y-auto` | host-fetch B | `packages/editor/src/rich/comments.tsx:88` | 通用工具可越根；当前 Huhu 节点在 `OkRoot` 内 | 保留根内工具并登记；批注用例 |
| `p-2` | host-fetch B | `packages/editor/src/rich/comments.tsx:58,92` | 同上 | 同上 |
| `text-link` | host-fetch B | `packages/workbench/src/launch/LaunchPage.tsx:150,154` | 是，旧 OK 选择器可命中两个根外按钮 | 作用域化并登记；启动页正常加载、显式挂载旧/新产物及设定测试变量的 Electron 对照 |
| `text-muted-foreground` | host-fetch B | `packages/editor/src/rich/comments.tsx:92` | 通用工具可越根；当前只读批注提示在 `OkRoot` 内 | 保留根内工具并登记；批注用例 |
| `text-xs` | host-fetch B | `packages/editor/src/rich/comments.tsx:92` | 同上 | 同上 |
| `editor-ok-compact` | rich A | `packages/editor/src/rich/RichMarkdownEditor.tsx:459`，`packages/editor/src/editor.css:67` | 无 OK 来源规则；旧 rich 扫描将 Huhu 自有类与自身求交 | 按来源剔除；任务描述及编辑器 |
| `editor-ok-properties` | rich A | `packages/editor/src/rich/RichMarkdownEditor.tsx:483`，`packages/editor/src/editor.css:106` | 同上 | 同上；属性面板及属性批注 |
| `editor-ok-surface` | rich A | `packages/editor/src/rich/RichMarkdownEditor.tsx:459`，`packages/editor/src/editor.css:55–64` | 同上 | 同上；富文本用例 |
| `editor-plain-editor` | rich A | `packages/editor/src/plain/PlainTextEditor.tsx:148`，`packages/editor/src/editor.css:5` | 同上；宿主 TXT 容器本来在 OK 根外 | 按来源剔除；Electron TXT 与查看器用例 |
| `editor-ref-item` | rich A | `packages/editor/src/rich/at-reference.ts:26`，`packages/editor/src/editor.css:88,98` | 无 OK 来源规则；Huhu 引用菜单样式 | 按来源剔除；引用用例 |
| `editor-ref-kind` | rich A | `packages/editor/src/rich/at-reference.ts:31`，`packages/editor/src/editor.css:101` | 同上 | 同上 |
| `editor-ref-menu` | rich A | `packages/editor/src/rich/at-reference.ts:68`，`packages/editor/src/editor.css:75` | 同上 | 同上 |
| `hu-mermaid` | rich A | `packages/editor/src/MermaidBlock.tsx:42,50`，`packages/editor/src/editor.css:29–37` | 无 OK 来源规则；Huhu 图表容器 | 按来源剔除；rich 选择器来源及嵌入块用例 |
| `hu-mermaid-error` | rich A | `packages/editor/src/MermaidBlock.tsx:42`，`packages/editor/src/editor.css:39` | 同上 | 按来源剔除；rich 选择器来源 |
| `hu-mermaid-loading` | rich A | `packages/editor/src/MermaidBlock.tsx:50`，`packages/editor/src/editor.css:46` | 同上 | 按来源剔除；rich 选择器来源 |

## 验证

| 检查 | 实际结果 | 证据（`/tmp/huhu-h02-evidence/`） |
| --- | --- | --- |
| 原产物判红 | 新守护对 `3dbd420` 原产物标出 C=2279，退出 1 | `new-guard-old-build.log` |
| 最终构建与守护 | `pnpm build` 通过。host-fetch A=10 / B=12 均按精确类名登记，C=0。rich 无 OK 来源层，CSS 与基线同名同内容 | `build-final.log`、`final-guard.log` |
| 自动检查 | lint、typecheck、knip、format:check 通过。守护测试 18 通过。仓库测试 1006 通过、1 跳过 | `lint-final.log`、`typecheck-final.log`、`knip-final.log`、`format:check-final.log`、`test-final.log` |
| vendor | 路径和候选菜单单测 33 通过。PATCHES 无漏登或多余项。固定上游重放 1348 文件，集合及字节差异为零 | `vendor-tests.log`、`vendor-check.log`、`replay-refresh.log`、`replay.log` |
| Electron 启动页 | Electron 44.9.1 / Chromium 152.0.7977.167。Claude 亮暗的整屏计算样式零差异。显式加载原产物时，`.text-link` 匹配两个按钮；新产物匹配零个。旧匹配被宿主颜色覆盖，实测浅色为 `rgb(169, 63, 61)`、深色为 `rgb(216, 117, 111)`。从 Vault 返回启动页的正常路径也测得同色且无残留匹配 | `electron-probe.json`、`electron-probe-final.log` |
| Electron 实际元素 | 工作台、收件箱、设置的根外 `.grow` 计算 `flex` 相同。TXT 的根外 CodeMirror 实测显示、前景、背景、padding 相同；旧 OK 规则给外层 `.cm-editor` 加的等宽字体被移除，外层回到 Huhu 的 Inter，内容和查找/选区层的首选字体仍是 JetBrains Mono，只还原了宿主回退栈。TXT 的实现未启用匹配选区高亮，因此两版均未创建 `.cm-selectionMatch` | `electron-probe.json` |
| Electron 样式与像素 | 同一构建基线 `3dbd420` 对最终版。工作台、任务、收件箱、设置，以及知识库、编辑、阅读七屏 × Claude 亮暗，全部默认计算样式零差异。8 张逐像素相同，其余 6 张差 5–38 像素，最大单通道差 2，均在仓库登记的 40 像素栅格化容差内 | `captures-diff.log`、`visual-before.log`、`visual-after.log`，工作树 `.visual/h02-{before,after}` |
| Electron portal | 原本在 body 且未标根的气泡菜单和命令候选现归入 OK 作用域。实测深色气泡从透明恢复为宿主面板色 `rgb(24, 23, 21)`，候选菜单恢复为 488px 的布局，命令和选择交互可用 | `electron-probe.json`、`e2e-final.log` |
| rc4 历史视觉流程 | 以 `9132640` 已存基线运行 `pnpm visual:compare rc4 --themes claude --no-build`，选择十个非知识库屏幕。覆盖率及运行时样式测试通过，历史截图和宽度矩阵测试仍有差异。修复前 `3dbd420` 的逐屏计算样式已在设置页出现历史差异。任务对话框、任务详情的预期范围见既有 `visual-compare-rc4.md`；即时基线用于判断本次变更的影响 | `visual-rc4.log`、`rc4-vs-before.log` |
| Web | `pnpm --filter @huhu/editor build:harness` 成功。独立 Chromium 158 中打开编辑器与文件树入口，验证相同 `.flex` 在 OK 根内为 `flex`，根外为 `block` | `build-harness.log`、`browser-probe.log` |
| 第一轮零重试 E2E | CSS 作用域修复阶段，指定 10 个文件共 103 通过。运行前确认无其他 Electron / Playwright；起止 11-20 00:28:50–00:37:06，load average 5.10 → 2.61（1 分钟） | `e2e.log` |
| 最终提交零重试 E2E | 同样 10 个文件，102 通过、1 失败。运行前确认无其他 Electron / Playwright；起止 00:45:28–00:54:07，load average 14.05 → 2.29（1 分钟）。在断言「转换目标」已选中时收到空串，位于 `editor-parity-closeout.spec.ts:592`，尚未打开菜单。同期已知 B06 竞态在 `3dbd420` 和 main 的实证见 `w4:pD/report05.md`，由 `w4:pH/task02.md` 处理 | `e2e-final.log`、`e2e-final-results/…/trace.zip` |
| 失败项单独零重试复核 | 最终提交单跑 `editor-parity-closeout.spec.ts:580` 通过。运行前确认无其他 Electron / Playwright；起止 00:54:08–00:54:15，load average 2.35 → 2.16（1 分钟） | `selection-standalone.log` |

## 接续

H02 的作用域、登记、负例测试和即时视觉对照均已完成。全套 E2E 保留一次 B06 既有失败，独立复核通过；集成时仍须合入并验证对应的 ProseMirror 修复。历史 rc4 视觉流程的差异和当前截图的像素容差已保留在上表。

## Lead 验收

Lead（2026-11-20）：接受。作用域化消除越根命中（text-link、grow、cm-editor）并修复 portal 未挂 .ok-root 造成的深色气泡透明；守护先红后绿，A/B 以精确类名登记（均位于 OK 根内或按来源剔除）。已 --no-ff 合入集成分支。
