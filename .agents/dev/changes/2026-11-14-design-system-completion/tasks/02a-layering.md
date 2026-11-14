# S2a 整体入层与不分层白名单

规格：[spec.md](../spec.md) §3.1、§3.2、DC-D3、DC-D4、DC-D10；DSC-01、02、03、04。
交付：所有项目样式整体放在**同一个层 `components`** 里（层内顺序＝原来的加载顺序），覆盖运行时注入的第三方样式的规则抽进不分层白名单，静态第三方样式进 `vendor`；渲染与 `origin` 基线一致。`shell`、`modules` 两层本任务不使用，在 S3 归位时才启用。
依赖：S1（E0 的运行时样式表清单、E1～E4 的根因结论与白名单范围）；S0 的比对命令。
边界：`packages/ui/src/styles/{index,base}.css`、`shared.css`（整体进 `components`；只允许**抽出**第三方覆盖规则到 `vendor-overrides.css`）、`packages/workbench/src/shell/shell.css`、`plugins/*/src/ui/*.css`、`packages/editor/src/editor.css`；sonner / xterm / katex 的导入位置（`TerminalView.tsx`、`MarkdownPreview.tsx` 只删除 CSS 导入语句）；`scripts/check-css-layers.mjs`。**不改类名；除“抽出白名单规则”外不移动规则；不处理 `!important`（S2b）。**

## 背景

“全量”很关键：上一轮只放了一部分，不分层的规则总是赢。更关键的是 S1 前的静态核实：CodeMirror 与 sonner 在**运行时**注入不分层样式，`shared.css` 里约 124 处 `.cm-*` 与 12 处 `[data-sonner-*]` 的覆盖规则放进层里会输给它们——这条是本任务最大的风险，也是白名单存在的原因。

## 当前代码指针（实施时复核）

- 层声明与导入：`packages/ui/src/styles/index.css`；外壳样式导入：`apps/desktop/src/renderer/main.tsx`；插件样式：各 `plugins/*/src/ui/index.tsx` 的 `import "./<id>.css"`。
- 第三方：sonner（运行时 `__insertCSS`，`node_modules/.pnpm/sonner@*/…/dist/index.mjs`）、CodeMirror（style-mod）、xterm（`TerminalView.tsx` 的 JS 导入）、katex（`MarkdownPreview.tsx` 的 JS 导入）。
- 拟新增：`packages/ui/src/styles/vendor-overrides.css`、`scripts/check-css-layers.mjs`。

## 实施要点

1. 层序与 spec §3.2 一致；若 S1 修改了 DC-D3，以修改后为准。
2. **每个文件自己入层**：文件第一行写完整层序声明，随后 `@layer <name> { … }` 包住全部规则（`shared.css`、`shell.css`、各插件 CSS 与 `editor.css` 中非覆盖第三方的部分**全部** → `components`，各文件相对顺序必须与原顺序一致：`shared` → `shell` → automations → agent-cli → inbox → editor → notes → safe → ssh → versioning → tasks；`base.css` / `fonts.generated.css` → `base`。理由见 spec DC-D11：S1 的 E1 显示按文件分三层会产生上千组翻转）。`index.css` 只做层声明与 ui 包自己的导入，**不集中导入插件 CSS**。
3. 第三方静态样式：xterm 在 ui 包以 `@import "@xterm/xterm/css/xterm.css" layer(vendor)` 引入，katex 在 editor 包的 CSS 里同样引入，TS 里删除对应导入；sonner 按 S1 结论（删除重复的静态导入，或保留）。
4. 抽出白名单：按 S1 的 E0 清单，把 `shared.css` / `shell.css` 中覆盖运行时注入样式的规则（`.cm-*`、`[data-sonner-*]`、xterm / mermaid 的运行时样式，以实测为准）**按原相对顺序**抽到 `vendor-overrides.css`（ui）与 `editor.css` 的不分层段；`.hu-mermaid*` 等非覆盖规则进 `modules` 层。白名单文件中不得出现 `.cm-*` / `[data-sonner-*]` / 已登记第三方选择器以外的选择器。
5. 对 `css-layer-report`（静态 + 运行时样式表）的每条冲突给出结论（调整归属 / 调整特异性 / 移入白名单）；**没有“新结果更合理”这一出口**，需要改变渲染的，先停下问用户。
6. 加入 `check-css-layers.mjs`，接入 `pnpm lint`；白名单文件清单写在脚本里并注明原因。

## 验收

- [ ] DSC-01：`check-css-layers` 通过；构建产物第一条层声明为 spec §3.2 的序列；静态导入的 xterm / katex 规则在 `vendor` 层内；运行时导出的 `document.styleSheets` 显示 CodeMirror / sonner 注入样式无层，且覆盖它们的规则在白名单里生效。
- [ ] DSC-02 / DSC-03：`visual:compare origin` 计算样式（含状态矩阵、宽度矩阵）与像素差异 0；若 Q3 降级，按 spec DSC-03 标“部分覆盖”。
- [ ] DSC-04：`css-layer-report` 全部条目有结论，渲染变化条目 0。
- [ ] 上一轮五个回归屏幕（任务页、任务详情、笔记编辑器、档案视图、新建菜单）与基线一致；另外专项核对：提示条（sonner）、笔记编辑器的搜索高亮与表格单元格、Mermaid 预览。
- [ ] 白名单文件内只有第三方选择器（脚本检查）；故意在白名单文件加 `.hu-btn {}`，检查失败。
- [ ] `git diff` 中 TS / TSX 的 `className` 无变更；全量 e2e 通过。

## 完成证据

progress.md 追加：每次 `visual:compare` 输出、冲突条目与结论表、白名单规则清单（选择器、来源行、原因）、构建产物层声明截取、运行时样式表导出摘要、`audit` 的 lint / typecheck / 单元 / e2e 结果与快照 SHA。
