# 规格：设计系统收尾（样式归属、类名治理与真实分层）

> 性质：**行为保持型重构**。所有界面在四套主题 × 明暗下的渲染结果必须与重构前一致；结构（文件归属、类名、层序）才是被改变的对象。
> 与上游的关系：沿用 [上游 design-system.md](../2026-11-13-brand-and-windows-installer/design-system.md) §1～§7（主题、token、字体）与 §10 的验收 DS-01～DS-15；**取代**它的 §8“样式架构”中关于层序、类名与实施路径的部分，取舍见本文 §8。

> **与用户原话的对应**（实施前请用户确认这两处理解，见 README“需要用户确认”）：
> 1. “`hu-` 类名统一” = 上游 design-system.md §8.1 已定的规则：共享组件用 `hu-`，工作台用区域前缀，插件用插件 id 前缀；不是把所有类名都改成 `hu-` 开头。
> 2. “按组件重写共享样式” = 把 `shared.css` 按组件拆成 `components/<name>.css`，同时去重与合并同义类；**规则内容以渲染结果不变为准**，不是按新设计重新写一遍。

## 1. 问题与预期效果

样式规则不属于它们的使用者，类名没有统一的归属规则，`@layer` 只有声明没有生效，没有可重复的“样式没变”的证明。预期效果：

- 打开任何一个插件的样式文件，里面只有这个插件自己的类（统一前缀），没有人为的排序技巧。
- 删除一个插件时，它的样式随之删除，不影响其他界面。
- 覆盖关系由 `@layer` 的层序决定，读代码的人不需要知道“这个文件在那个文件之后加载”。
- 任何人可以用一条命令证明某次样式改动没有改变外观，包括悬停、焦点、禁用等状态。

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 归属（owner） | 某个类名的使用者：`ui`（共享组件）、`workbench`（外壳 / 设置 / 启动页 / 插件中心 / 网关 / 健康 / 面板等）、某个插件 id、`editor`。一个类名只能有一个归属；被多个包使用的类必须是共享组件（归属 `ui`） |
| 状态类 | 与基础类组合使用的修饰类，如 `.active`、`.selected`、`.open`、`.disabled` |
| 等价性 | 同一应用状态下，对同一个元素，渲染结果（计算样式与像素）相同；元素用“DOM 路径 + 稳定标识”对应，不依赖类名 |
| 基线 | 在某个已知状态（git 引用）下生成的等价性参照物；`origin` 基线在 S0 开始时冻结，之后所有切片都与它比对 |

## 3. 目标契约

### 3.1 文件与归属

```text
packages/ui/src/styles/
  index.css                 # 唯一入口：层序声明 + 导入；不含规则
  themes.generated.css      # 自带 @layer theme（生成，勿手改）
  tokens.css                # @layer tokens
  fonts.generated.css       # @layer base（字体声明）
  base.css                  # @layer base：重置、正文、焦点环、滚动条、选区、减少动效
  components/<name>.css     # @layer components：每个共享组件一个文件
  vendor-overrides.css      # 不分层（白名单）：只放“覆盖运行时注入的第三方样式”的规则，见 §3.2
packages/workbench/src/**/*.css   # @layer shell
plugins/<id>/src/ui/<id>.css      # @layer modules
packages/editor/src/editor.css    # 编辑器自有规则 @layer modules；其中覆盖 CodeMirror 的规则不分层（见 §3.2）
```

- `shared.css` 不存在。`components/` 中的文件与 `packages/ui/src/components/` 的组件一一对应（`controls`、`feedback`、`motion`、`DataTable`、`Combobox`、`DateTimePicker`、`TerminalView` 等；对应表在 S5a 中生成并提交）。
- 每个 CSS 文件只能包含它自己归属的类。归属由 `scripts/check-css-ownership.mjs` 根据 TSX / TS 中的使用关系强制检查：某个包的 CSS 定义了只被另一个包使用的类，检查失败。
- **各文件自己声明所属的层，层序不依赖导入顺序。** 每个分层文件第一行重复一遍完整层序声明（幂等，防止某个文件比 `index.css` 先进入产物而抢先定下层序），再用 `@layer <name> { … }` 包住自己的规则。`index.css` 不集中导入插件 CSS（ui 包不得依赖插件，否则删除插件时样式删不干净）；插件样式仍由各自 `src/ui/index.tsx` 导入，外壳样式仍由 workbench 入口导入。
- 第三方样式由**使用它的包**自己以 `@import "…" layer(vendor)` 引入：sonner、xterm 在 ui 包（`index.css` 或 `components/` 下对应文件），katex 在 editor 包的 CSS 里；组件 TS 里不再 `import "….css"`。

### 3.2 层序与不分层白名单

```css
@layer theme, tokens, base, vendor, components, shell, modules;
```

- **分两步到达目标层（S1 实测后的修正，见 progress.md）**：先把所有项目样式**整体放进同一个层 `components`**（层内顺序＝原来的加载顺序，所以项目内部的层叠结果与不分层时完全相同，不会产生任何“层序压过特异性”的翻转），同时把覆盖第三方运行时样式的规则抽进不分层白名单（S2a）；然后在样式归位时（S3）才把规则按归属分进 `shell`、`modules`，此时只有真正跨归属、高特异性压低特异性的规则对会翻转，由冲突报告逐条处理。上一版计划“一次把 shared / shell / 插件按文件分进 components / shell / modules”会产生上千组翻转（见 S1 的 E1），不可行。
- **事实依据（2026-11-14 核实）**：CodeMirror（style-mod）与 sonner（`__insertCSS`，模块加载时调用）都在**运行时**把样式注入页面，这些样式**不在任何 `@layer` 内**。不分层的普通声明永远压过分层声明，所以：
  1. 对它们的覆盖规则（`shared.css` 里约 124 处 `.cm-*`、12 处 `[data-sonner-*]`，`shell.css` 2 处，`editor.css` 的 `.cm-*` 2 条）一旦放进层里，普通声明会全部输给运行时注入的样式。这很可能就是上一轮“笔记编辑器”与提示条回归的根因（S1 的 E0 / E1 要实测确认）。
  2. `@import "sonner/dist/styles.css" layer(vendor)` 只会多出一份已分层的副本，真正生效的是运行时注入的那份。是否保留静态导入由 S1 决定（若注入内容与静态文件相同，则删除静态导入，只靠覆盖规则）。
- **不分层白名单**只有两类，每个文件头注明原因：
  - `packages/ui/src/styles/vendor-overrides.css`：覆盖运行时注入的第三方样式的规则（`[data-sonner-*]`、xterm 的运行时样式、mermaid 内联 `<style>`，范围以 S1 的 E0 实测为准）。
  - `packages/editor/src/editor.css` 中覆盖 `.cm-*` 的规则。`.hu-mermaid*` 等编辑器自有类**不在**白名单，进 `modules` 层。
- 白名单文件里的规则**会压过所有已分层规则**（原来是靠特异性与顺序决定输赢）。因此这些规则的“新赢家”要在 `css-layer-report` 里单独检查，只允许作用于第三方元素，不得命中项目自己的组件类（`.cm-*` / `[data-sonner-*]` 以外的选择器出现在白名单文件里，`check-css-layers` 失败）。
- `vendor` 放在 `base` 之后、`components` 之前（理由与实测要求见 DC-D3）：静态导入的第三方样式（xterm、katex 的 CSS 文件）不被我们的重置压过，又低于所有项目规则。
- 项目自己的所有其他规则（`base`、`components`、`shell`、`modules`）都必须在层里。`scripts/check-css-layers.mjs` 检查：除两个白名单文件外，所有 CSS 文件的规则都在 `@layer` 内；构建产物中层序声明是第一条 `@layer` 语句。
- 不允许在界面规则里使用 `!important`，例外只有两类，必须用 `/* stylelint-disable-next-line declaration-no-important -- <原因> */` 写明（stylelint 打开 `reportDescriptionlessDisables`）：减少动效、覆盖第三方元素的内联样式（`style=""` 属性）。当前仓库没有 `@media print`，不预留“打印”例外。

### 3.3 类名

| 归属 | 前缀 | 例 |
| --- | --- | --- |
| 共享组件（`packages/ui`） | `hu-` | `hu-btn`、`hu-dialog`、`hu-data-table` |
| 工作台（`packages/workbench`） | 区域前缀，列在 stylelint 配置的允许表里：`shell-`、`settings-`、`launch-`、`plugin-center-`、`gateway-`、`health-`、`palette-`、`notify-`、`home-`、`data-page-` | `shell-rail`、`settings-nav` |
| 插件 | 插件 id 前缀，`agent-cli` 用 `agent-` | `notes-`、`tasks-`、`automations-`、`inbox-`、`safe-`、`ssh-`、`version-`、`agent-` |
| 编辑器 | `editor-`（自有类）；`cm-*` 是 CodeMirror 的类，不改 | |
| 状态类 | 白名单：`active`、`selected`、`open`、`disabled`、`collapsed`、`dragging`、`is-*`；只允许与带前缀的基础类组合出现 | `.hu-tab.active` |
| 第三方 | `cm-*`、`xterm*`、`katex*`、`mermaid*`、`[data-sonner-*]` 原样放行 | |

- 不使用带版本号或历史阶段的名字（现有的 `version-v9-file-row`、`storage-view-v6`、`v9-*`、`tw-*`、`execution-*` 都要改为按归属的新名字）。
- 同一概念只有一个类名：删除 `.btn` 与 `.hu-btn` 并存、`.badge` 与 `.hu-badge` 并存这类情况。合并后若两个旧类的样式不同，以**当前渲染结果**为准保留，差异通过修饰类表达，并记入 `class-map` 的备注。
- TSX 里出现的每一个字面量类名都必须有定义（`hu-meta`、`archive-undefined` 之类要么补上样式，要么删除类名；以渲染结果不变为准）。
- 类名映射表 `class-map.json`（旧名 → 新名 / 归属 / 备注）是改名的唯一输入，提交进本 change 目录，改名完成后只作为证据保留，不进入代码。

### 3.4 等价性验证（仓库资产）

- **计算样式快照**：对固定 Vault 下的每个“屏幕”（模块页、对话框、菜单、设置各页、命令面板、规则编辑器、新建菜单、档案三视图、看板 / 月历 / 详情等），遍历可见 DOM，记录每个元素的 `getComputedStyle` 关键属性集合（含 `::before` / `::after` / `::placeholder` / `::selection`，滚动容器含 `::-webkit-scrollbar*`）。**主验证。**键 = 标签 + 结构序号 + role / aria 属性，**不使用类名，也不使用 `data-testid`**（S4 会新增 testid，用它做键会让改过的元素对不上）。
- **状态矩阵**：对可交互元素通过 CDP `CSS.forcePseudoState` 强制 `hover` / `focus-visible` / `active`，**强制后对该元素的整棵子树与祖先链重新取值**（`.row:hover .row-actions` 改的是后代，`:focus-within` 与 `:has()` 改的是祖先）；`:focus-within` 另用真实聚焦再取一次。
- **宽度矩阵**：默认状态的计算样式（不截图）在 1920、1440、1280、1100、1000、900、760、700、620、520 十个宽度下各取一次，覆盖现有 `@media` 断点两侧（现有断点：1750 / 1700 / 1600 / 1440 / 1280 / 1250 / 1200 / 1100 / 1050 / 1000 / 900 / 800 / 780 / 760 / 750 / 740 / 700 / 680 / 650 / 620 / 560 / 520，及 `tokens.css` 的 1279；S0 用脚本从 CSS 中提取断点并校验宽度矩阵覆盖了每个断点的两侧）。
- **像素比对**：Playwright `toHaveScreenshot`（复用优先③）。主要用于合成效果（毛玻璃、阴影、字体）。`threshold` 与 `maxDiffPixels` 从 0 起，若 S0 的噪声实测证明 0 不可行（例如 Apple 主题毛玻璃），则按屏幕单独放宽，**每处放宽写明数值与原因**，不得全局放宽。
- **运行时样式表导出**：对每个屏幕导出 `document.styleSheets` 与 `adoptedStyleSheets` 中不属于打包产物的样式（CodeMirror、sonner、xterm、mermaid 的运行时注入）；这是 `css-layer-report` 的补充输入，因为静态分析看不到它们。
- **层叠冲突报告**：`scripts/css-layer-report.mjs` 静态分析全部 CSS，**再并入上一条的运行时样式**，列出“在层序下输赢与原来不同的规则对”。每一条都要有处理结论（调整归属 / 调整特异性 / 移入白名单）。**不存在“确认新结果更合理”的出口**：本 change 外观不变，任何有意的差异都要先经用户批准（写入“已批准差异”表）。
- **噪声基线与时间**：在同一份代码上连续生成两次基线并互相比对，差异必须为 0；有差异的区域写进遮罩清单（带原因）。固定时间：S0 用 Playwright 的 `page.clock` 固定渲染端的当前时间（月历、逾期、相对时间依赖它）；引擎侧产生的时间戳（创建 / 更新时间）文字在比对时忽略内容、保留盒模型。若 `page.clock` 在 Electron 下不可用，S0 允许新增**仅测试用**的时钟注入钩子（环境变量，不改变默认行为），并写进 S0 的边界与 progress.md。
- **已知盲区**（不假装覆盖）：`forced-colors`、`hover: none`、动画中间态、虚拟列表中滚出视口的行（S0 对 DataTable 额外取“滚到底部”一屏）、系统字体差异、非 Linux 渲染。减少动效与 compact 密度各取一个组合（默认状态计算样式）纳入基线。
- 基线不进 git（与平台和字体渲染相关、体积大）；脚本、屏幕清单与遮罩清单进 git，命令见 [verification.md](verification.md)。

## 4. 场景与验收

### 4.1 等价性

- **DSC-01 层生效。** 运行 `node scripts/check-css-layers.mjs`：除两个不分层白名单文件外，所有 CSS 文件的规则都在 `@layer` 内；白名单文件里只有第三方选择器；构建产物中 `@layer theme, tokens, base, vendor, components, shell, modules;` 是第一条层声明，静态导入的 xterm / katex 规则出现在 `vendor` 层内。**运行时检查**：在固定 Vault 下导出 `document.styleSheets`，核对运行时注入的样式（CodeMirror、sonner）确实没有层，且覆盖它们的规则在白名单文件里生效（笔记编辑器与提示条的渲染与基线一致）。
- **DSC-02 渲染不变。** 每个切片完成后与 `origin` 基线比对：计算样式差异 0、像素差异 0（遮罩与逐屏放宽按 §3.4）。有意的差异必须**先经用户批准**，再写入 `progress.md` 的“已批准差异”表（元素、属性、旧值、新值、原因、截图），否则视为失败。
- **DSC-03 状态与断点不变。** 状态矩阵（悬停、焦点、按下，含子树与祖先）、宽度矩阵（10 个宽度）、减少动效与 compact 各一个组合，差异 0。若 Q3 触发降级，DSC-03 在 progress.md 中标为“部分覆盖”并写明缺口，**不得再写“差异 0”**。
- **DSC-04 层叠冲突清零。** `css-layer-report`（静态 + 运行时样式表）中每一条都有结论；以“渲染变化”为结论的条目为 0（有则先经用户批准，进“已批准差异”表）。
- **DSC-05 `!important`。** 项目 CSS 中不带说明的 `!important` 为 0；带说明的条目逐条列在 progress.md，只属于两类例外（减少动效、覆盖第三方内联样式）；stylelint 的 `declaration-no-important` 与 `reportDescriptionlessDisables` 打开。

### 4.2 归属与类名

- **DSC-06 归属唯一。** `check-css-ownership` 通过：每个 CSS 文件只定义它归属的类；`shared.css` 不存在；`git ls-files 'packages/ui/src/styles'` 只有 `index.css`、`base.css`、`tokens.css`、`vendor-overrides.css`、`*.generated.css` 与 `components/*.css`。
- **DSC-07 前缀规则。** stylelint `selector-class-pattern` 按目录配置，全仓库 0 违规；故意在 `plugins/tasks/src/ui/tasks.css` 写 `.row {}` 或在 `packages/ui` 写 `.knowledge-x {}`，`pnpm lint` 失败。
- **DSC-08 类名无悬空。** `check-css-classes` 通过：TSX / TS 中的字面量类名（含 `className`、`classList`、`querySelector` / `closest` 的类选择器、编辑器 Decoration 的 `class:` 键与 JS 生成的 HTML 字符串）100% 有定义；CSS 中的类名要么在 TSX 里出现，要么在登记的动态类名表里有出处，要么是第三方类。
- **DSC-09 无重复。** stylelint `no-duplicate-selectors` 与 `declaration-block-no-duplicate-properties`（去掉“consecutive-duplicates”例外）0 违规；规范化后的选择器在相同 at-rule 上下文、相同层中出现次数 ≤ 1（`.hu-btn:hover` 与 `.hu-btn` 是不同选择器，不算重复；原先“在 3 个以上规则块出现的类名”354 个只作起点数字记录，不作验收口径）。
- **DSC-10 改名后 e2e 不坏。** 全部 e2e 通过；`tests/**` 中依赖项目类名的定位器改为 `getByTestId` / `getByRole`，只保留第三方类（`.cm-*`、`.xterm-*`）。新增 testid 的元素不影响等价性比对（键不含 testid）。

### 4.3 无用样式

- **DSC-11 PurgeCSS。** 对构建产物运行 PurgeCSS（safelist 先为空，第三方类放行），`rejected` 报告逐条核查并保存在 `progress.md`：确实没用的删除并重新比对；动态拼接的类名写进 safelist 并注明出处（TSX 文件与行）。
- **DSC-12 覆盖率交叉。** 在固定 Vault 的全部屏幕上收集 Chromium CSS 覆盖率；PurgeCSS 判为“有用”但覆盖率为 0 的规则列出并抽查，结论写入 progress.md。覆盖率为 0 不单独构成删除理由（状态没走到），只作为核查线索。

### 4.4 主题验收与回归

- **DSC-13 DS-02 完整执行。** 四套主题 × 明暗 × 8 个界面（首页、笔记编辑器、任务看板、Agent CLI 终端、设置页、启动页、一个对话框、一个下拉菜单）共 64 张截图；逐张核对上游 §6 的“标志特征”并在 `evidence/` 留存缩略对照与结论。
- **DSC-14 其余上游验收补证。** DS-06（跟随系统实时切换）、DS-07（首帧无白闪，含重启）、DS-12（终端换主题）、DS-13（compact 密度，另含与 origin 的默认状态比对）、DS-14（减少动效，同上）、DS-15（e2e 全通过）各有一次本 change 之后的运行证据；DS-09～DS-11 以 DSC-05～DSC-12 对应的脚本为准。
- **DSC-15 其他回归。** `pnpm lint`、`pnpm typecheck`、单元测试、全量 e2e（含 `a11y.spec.ts`）通过；构建后的 CSS 总字节数不超过 S0 记录值的 +5%（预期会显著减小）；`perf.spec.ts` 的指标不劣于 S0 记录。
- **DSC-16 文档。** `.agents/dev/notes/context/design-system.md` 更新为最终规范（层序、类名表、验证命令、不分层白名单）；`notes/context/workbench.md` 中的 D-18 标记为被取代；上游 change 的 `progress.md` 指向本 change；本 change 的 `progress.md` 记录每一项的真实证据。

## 5. 实现决定

- **样式的唯一归属信息来自 TSX 的使用关系。** `check-css-ownership` 用 TS AST 解析 `className`、`cn(...)`、模板字面量与 `clsx` 风格调用；无法静态解析的动态类名（`tw-${x}`）必须在 `scripts/css-dynamic-classes.json` 登记，写明所在文件与可能的取值。这份登记同时是 PurgeCSS 的 safelist 来源。
- **改名用 codemod，不手改。** 输入是 `class-map.json`；CSS 侧用 `postcss` + `postcss-selector-parser` 改选择器，TS / TSX 侧用 TS AST 改字符串字面量与模板字面量中的类名片段，**扫描范围包括**：`className`、`classList`、`querySelector(All)` / `closest` / `matches` 的类选择器、编辑器 `.ts` 里 Decoration 的 `class:` 键（`packages/editor/src/**`）、JS 拼出的 HTML 字符串（如 Markdown / Mermaid 渲染）、`tests/**` 里的类选择器；动态拼接的类名由登记表驱动，找不到的立刻失败而不是静默漏改。改名后立即跑 DSC-02/03。
- **一个切片只做一种结构变化。** 顺序固定为：入层并抽出不分层白名单（S2a）→ 去掉 `!important`（S2b）→ 归位（S3，保持类名）→ 改名（S4，保持文件；同义类合并推迟到 S5b）→ 按组件拆分（S5a，保持类名与规则顺序）→ 去重与合并（S5b）→ 删无用规则（S5c）。每一步只做一种变化，所以任何差异都能定位到那一步。
- **S3 迁移的位置规则。** 原来 `shared.css` 整体先于各插件 CSS 加载；规则迁入插件文件后，必须放在目标文件的**开头**并保持相对顺序，才能保留“共享规则先于插件规则”的次序。S4 改名之前，`.row` 这类通用类名仍可能出现在多个插件文件，所以“文件顺序不再影响结果”要到 S4 之后才成立。
- **层序下的特异性。** 入层之后“层序先于特异性”：后一层的低特异性规则也会赢前一层的高特异性规则。凡 `css-layer-report` 标出的反转，处理方式优先级为：① 把规则移到它应该在的层；② 去掉不必要的复合选择器（降特异性）；③ 在被覆盖的一方提高特异性。不用 `!important` 解决。
- **去重合并的安全条件。** 同一选择器的块 A、C 合并时，若它们之间存在别的选择器以相同或更高特异性设置了同一属性且可能命中同一元素的块 B，不得合并（合并会改变胜负）；用 `css-layer-report` 的匹配器判断，不凭肉眼。
- **base 层放全局元素规则。** 对 `button`、`input`、`h1` 等元素选择器的全局规则只能在 `base`；其余层不写光秃秃的元素选择器（stylelint `selector-max-type` 或等价规则：除伪元素与后代的末尾元素外，不允许类型选择器作为复合选择器的主体）。
- **密度只用 `[data-density="compact"]`。** 继承上游 §8.1，已完成（DS-10 的 grep 为 0）。

## 6. 验证决定

- 真实入口：Electron 应用（固定 Vault，`tests/e2e/helpers/launch.ts`）；`pnpm lint`；`pnpm build` 的产物。
- 主验证 = 计算样式快照 + 状态矩阵；辅助验证 = 像素；静态验证 = 冲突报告、归属 / 层 / 类名检查脚本、stylelint、PurgeCSS。静态检查只能证明结构，**不得**代替渲染等价性。
- 每个切片的流程见 [verification.md](verification.md)：生成 `prev` 基线 → 改动 → 与 `prev` 与 `origin` 同时比对 → 记录。
- 最终整合：`audit` 跑 lint、typecheck、单元测试、全量 e2e；顾问复核；再做 64 张主题截图的人工核对（DSC-13）。
- 环境限制：Windows / macOS 上的字体渲染差异无法在本机复现；等价性只保证 Linux（Chromium / Electron 当前版本）。CI 里的跨平台截图不在本 change 范围。

## 7. UI

不改变任何界面外观。涉及的界面全集即 [verification.md](verification.md) 的屏幕清单；新增状态（空态、错误态、长内容）不在本期扩写。

## 8. 已作出的取舍

| 编号 | 决定 | 理由与备选 |
| --- | --- | --- |
| DC-D1 | 不引入 CSS Modules / Tailwind / vanilla-extract，保持“全局 CSS + 前缀 + `@layer`” | 现有 2,500 条规则与约 1,250 处 `className` 以全局类名为前提；换方案等于重写全部界面，风险与本期目标（不改外观）冲突。前缀 + stylelint 已能给出归属保证。备选：CSS Modules（作用域天然隔离），但类名散布在 TSX 之外的 e2e 与 axe 配置中，且主题预览卡需要跨组件复用样式 |
| DC-D2 | 等价性主验证用“计算样式快照”，像素比对作辅助 | 上一轮只靠像素比对，覆盖不到悬停 / 焦点 / 禁用，分层的风险恰好在这些状态；计算样式能直接断言“同一元素同一属性的值相同”，也不受字体抗锯齿噪声影响。像素仍保留，用来发现合成层面的差异 |
| DC-D3 | `vendor` 层放在 `base` 之后、`components` 之前，取代上游 §8.1 的“vendor 最先” | 只管**静态导入**的第三方样式（xterm、katex、可能的 sonner 静态副本）：既不被我们的 `base` 重置压过，又低于所有项目规则。运行时注入的第三方样式（CodeMirror、sonner）不受层管理，由 DC-D4 处理。**实施前由 S1 用实验确认**；若实测相反，以实测为准并改写本条 |
| DC-D4 | 覆盖运行时注入的第三方样式的规则，放在**不分层白名单**（`vendor-overrides.css` 与 `editor.css` 的 `.cm-*` 部分），其余样式全部入层 | 运行时注入的样式没有层，不分层的普通声明永远压过分层声明，覆盖规则放进层里会全部失效（这很可能是上一轮回归的根因，S1 实测）。上一版把 `editor.css` 整个设为例外，既漏了 sonner，又把 `.hu-mermaid*` 这类并非覆盖第三方的规则一起放了出来。备选：全部改用 `EditorView.theme` 写（上游 §4.2 已规定编辑器主题经它写，但把现有 124 处 `.cm-*` 覆盖迁过去是另一件事，不在本期） |
| DC-D5 | `!important` 只允许两类例外（减少动效、覆盖第三方内联样式），用 stylelint 的描述性 disable 注释强制 | 分层后 `!important` 的优先级反转（越早的层越强，且任何 `!important` 都压过不带的），继续使用会让层序失去意义。现有 73 处在 S1 逐条分类，多数是为了压特异性，应改成层序 / 选择器调整；覆盖运行时注入样式的需求改由 DC-D4 的白名单解决，不再用 `!important` |
| DC-D6 | 状态类用白名单，不统一改为 `is-*` | `.active` 等总是与带前缀的基础类组合，歧义不大；统一改名会触碰数百处且不带来归属收益。`is-*` 保留，新增状态类用 `is-` 或属性选择器 |
| DC-D7 | 改名由 codemod 完成，`class-map.json` 先评审后执行；**同义类合并（`.btn` 与 `.hu-btn` 并存）不在 S4 做** | 700 多个类、两个以上包同时涉及，手改必漏；映射表评审比评审 diff 更便宜，漏改由 `check-css-classes` 兜底。合并会让原本只有一个类的元素套用另一个类的规则，是改写样式而不是改名，放到 S5b 单独用等价性验证；S4 期间这些组用 `class-merge-pending.json` 登记，stylelint 前缀规则临时放行，S5b 结束时该文件必须为空 |
| DC-D8 | 验证基线不入 git，脚本入 git | 基线与字体 / 渲染环境耦合且体积大；脚本、遮罩清单与屏幕清单是可审查的资产 |
| DC-D11 | 先整体入同一层、归位后再分层（S2a → S3），而不是一次按文件分进三层 | S1 实验 E1：只把 shared.css 放进 `components`、其余不分层，计算样式差异 214 处（任务列表网格列宽、笔记编辑器行号槽、任务详情 / 新建对话框的行高与宽度等），静态报告给出 1500 组输赢翻转，主要是 shared.css 里属于插件的高特异性规则（如 `.knowledge-detail-section > .row:first-child h3`）原本压过插件里的低特异性规则（`.tw-board h3`），入层后反转。同层整体迁移保持原顺序，不会翻转；归位之后同一归属的规则同处一个文件一个层，翻转只剩真正跨归属的少数规则对 |
| DC-D9 | 不并行改同一批样式 | 所有切片都写 `shared.css` 或使用它的 TSX，唯一写入者原则下只能串行；可并行的只有 S0 的工具建设与 S1 的审计 |
| DC-D10 | 不分层白名单文件里只允许第三方选择器 | 白名单规则会压过全部分层规则；限定只作用于第三方元素，才不会反过来绕过层序 |

## 9. 范围之外

- 任何外观、交互、文案、图标的改动；新增 / 修改主题与 token；字体包变更。
- 自定义主题的用户界面（上游 §3.6 已定为扩展点）。
- 把编辑器改为纯 `EditorView.theme`。
- 跨平台截图基线、CI 视觉回归（可在后续 change 把本期的脚本接入 CI）。
- Windows 安装器与真实 CLI 验证（上游遗留项）。

## 10. 待决问题（假设与核实办法）

| 编号 | 假设 | 核实办法 | 影响切片 |
| --- | --- | --- | --- |
| Q1 | 上一轮分层回归的根因，最可能是**运行时注入的第三方样式（CodeMirror、sonner）不分层，压过了被放进层里的覆盖规则**（已有静态证据：shared.css 约 124 处 `.cm-*`、12 处 `[data-sonner-*]`，sonner 与 CodeMirror 均运行时注入）；其次是特异性与层序反转、`!important` 反转、vendor 与 base 的相对位置 | S1：E0 导出运行时样式表确认哪些注入样式没有层；E1 起二分定位每个回归屏幕的差异规则；允许在新夹具上“未复现”，但必须给出机制性证明 | S2a |
| Q2 | 已有证据：Vite 8.3.7 内置 postcss-import 16.2.0，支持 `@import … layer(name)`，现有产物里 `tokens`、`base` 已被内联为 `@layer` 块。待验证：sonner / xterm / katex 以 `layer(vendor)` 导入后的产物，且 katex 字体 `url()` 仍可解析；xterm 目前由 `TerminalView.tsx` 以 JS 导入，要改到 `index.css` | S1：最小复现并构建，检查产物；不行就用等价写法并记录 | S2a |
| Q3 | 计算样式快照 + CDP 强制伪类在 Electron 下可行且耗时可接受。取舍：完整状态矩阵只跑 Claude 主题的明 / 暗两个组合；其余三套主题只取默认状态；宽度矩阵只取默认状态；约 32 屏 × 8 组合默认快照 + 约 32 屏 × 2 组合状态矩阵，目标单次完整运行 ≤ 40 分钟（阈值单屏 > 60 秒或总时长 > 40 分钟即降级） | S0 先做一屏的可行性验证；不可行则退为“冲突报告 + 状态截图抽样”，并在 progress.md 写明覆盖降级 | 全部 |
| Q4 | `shared.css` 中约 300 个没有 TSX 字面量使用的类，主要是库生成类、动态拼接类和只出现在后代选择器里的状态类，而非死代码 | S3 / S4 由 `check-css-classes` 与登记表逐个判定 | S3、S5c |
| Q5 | 多个包同时使用的类（现约 67 个）都应归入 `ui` 共享组件；其中部分只是“碰巧同名”，应拆成各自带前缀的类 | S3 的归属表逐个判定，疑义项列入 `class-map.json` 备注 | S3、S4 |

## 11. 现状证据（实施前核对最新代码）

- 层序与导入：`packages/ui/src/styles/index.css`；`apps/desktop/src/renderer/main.tsx`（`@huhu/ui/styles.css`、`@huhu/workbench/shell.css`）；各插件 `src/ui/index.tsx` 的 `import "./<id>.css"`；`packages/editor/src/MarkdownEditor.tsx`（`./editor.css`）、`MarkdownPreview.tsx`（katex）、`packages/ui/src/components/TerminalView.tsx`（xterm）。观察于 2026-11-14。
- 旧验证脚本（不在仓库）：`/tmp/ds/{pngdiff.py,cmp.mjs,seq.mjs,migrate.py}` 与已删除的 `tests/e2e/_vis.spec.ts`；它们的做法记录在上游 progress.md 的“样式拆分”一节。S0 重写为仓库资产，不复制旧脚本。
- 现有截图入口：`tests/e2e/screenshots.spec.ts`（`HUHU_SHOTS_DIR`）、`tests/e2e/helpers/launch.ts`（`openApp()` 每次用 `mkdtemp` 创建空 Vault，经 `HUHU_VAULT` 启动）。**仓库里没有“固定 Vault 种子数据”的夹具函数**，只有 `acceptance.spec.ts` 内联复制 `apps/desktop/resources/demo-vault`；S0 要新增夹具。
- 构建与导入：Vite 8.3.7（electron-vite 6），渲染端无动态 `import()`，各插件 UI 同步导入，产出单个 CSS 文件；插件 CSS 的先后由 `apps/desktop/src/renderer/main.tsx` 的 import 顺序决定（automations → agent-cli → inbox → notes → safe → ssh → versioning → tasks）。同一层内的跨插件顺序因此是隐式的，S3/S4 之后各插件只含自己的前缀类，顺序不再影响结果。
- 依赖现状：`postcss`、`postcss-selector-parser` 只是 stylelint / vite 的传递依赖，没有在任何 package.json 声明；`pixelmatch`、`pngjs`、`purgecss` 未安装。
- 上游设计：[design-system.md](../2026-11-13-brand-and-windows-installer/design-system.md) §8、§10；[plan.md](../2026-11-13-brand-and-windows-installer/plan.md) DS-S2～DS-S4；现行规范 `.agents/dev/notes/context/design-system.md`。


## 12. 实施后修订（2026-11-14）

上面的规格是实施前写定的目标；实测后以下几点与它不同，以 [progress.md](progress.md) 为准：

- **DC-D11（先整体入层、归位后再分层）**：取代 §3.2“一次入三层”的做法。S1 的 E1 实验证实一次按文件分层会产生上千组翻转。
- **DC-D12 收敛循环**：归位后，凡是在更高层里赢过共享层规则、导致渲染变化的规则（含插件文件原有的规则），按选择器退回 `components` 层的块（`evidence/s3-stay-in-components.json`，33 条）。这是对“零差异”的现实让步：它们的优先级依赖原来的特异性，而不是层序。
- **DC-D13 `core.css`**：§3.1 的“一个共享组件一个文件”只做到 `components/{core,overlays,data,feedback}.css`。`core.css` 内的按钮 / 分段控件 / 标签栏 / 全局元素规则彼此顺序耦合（细拆产生 354 处差异），保持原相对顺序。
- **DC-D14 类名**：共享组件类 `hu-<原名>`、工作台 `shell-`、插件用插件前缀（`agent-`、`version-`…）；同义类合并分两步（先改名成 `-alt`，S5c 删除 `base.css` 里无人使用的 `.hu-btn*` 后合并）；仍有 57 个类登记为例外。前缀与悬空检查由 `scripts/check-css-classes.mjs` 完成（不是 stylelint）。
- **DC-D15 去重与无用样式**：规则级去重合并未做；无用样式只做静态（AST）判定并删除 378 条，没有运行 PurgeCSS 与覆盖率。
- 新增的守护脚本（均在 `pnpm lint` 里）：`check-css-layers.mjs`（DSC-01）、`check-css-classes.mjs`（DSC-07/08）、`check-css-ownership.mjs`（DSC-06）。登记表：`scripts/css-class-exceptions.json`、`scripts/css-ownership-exceptions.json`。
