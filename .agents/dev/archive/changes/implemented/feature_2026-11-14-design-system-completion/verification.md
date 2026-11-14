# 验证方案：样式等价性

本文件是 [spec.md](spec.md) §3.4 与 §6 的执行细则，也是 S0 的交付说明。所有切片共用同一套命令，不另起炉灶。

## 1. 命令（S0 创建后才存在，现在是目标接口）

| 命令 | 作用 |
| --- | --- |
| `pnpm visual:baseline <name>` | 在**当前工作区**构建并运行全部屏幕，保存基线 `<name>`（`.visual/<name>/`，已加入 `.gitignore`）：计算样式快照 + 截图 |
| `pnpm visual:compare <name>` | 在当前工作区重新运行，与基线 `<name>` 比对；差异为 0 退出 0，否则输出“屏幕 / 元素路径 / 状态 / 属性 / 旧值 / 新值”并退出非 0 |
| `pnpm visual:noise` | 连续生成两次基线并互相比对，列出不稳定的区域（用来维护遮罩清单） |
| `node scripts/css-layer-report.mjs [--from <ref>]` | 静态层叠冲突报告：本工作区的层序与 `<ref>`（默认 `origin` 基线记录的提交）的不分层顺序相比，哪些规则对输赢翻转 |
| `node scripts/check-css-layers.mjs` / `check-css-ownership.mjs` / `check-css-classes.mjs` | 结构检查（DSC-01、06、08），接入 `pnpm lint` |
| `pnpm css:purge` | 对构建产物运行 PurgeCSS，输出 rejected 报告到 `.visual/purge/`（DSC-11） |

约定：

- 基线名固定三种：`origin`（S0 开始时在未改动的代码上生成，**冻结**，所有切片最终都与它比对）、`prev`（每个切片开始前重新生成，用来定位本切片引入的差异）、`scratch`（临时用）。
- `origin` 基线记录它对应的 git 提交与工作区快照 SHA（`git stash create` 的输出），写入 `.visual/origin/meta.json`，同时抄进 `progress.md`，换机器后才知道基线对应哪份代码。
- 时间固定：渲染端用 Playwright `page.clock`；引擎侧时间戳文字比对时忽略内容、保留盒模型（见 spec §3.4）。
- 同一时间只能有一个 Electron 实例（单实例锁）：这些命令、`audit` 的 e2e 不能并行。

## 2. 屏幕清单

沿用上一轮的 32 个屏幕（上一轮 2 主题 × 明暗 × 32 = 128 张），每个屏幕在 8 个组合下取证：`{4 套主题} × {浅色, 深色}`，共约 256 组。**`origin` 基线一次覆盖四套主题**（上一轮只完整比对了 Claude 与 Vercel，Apple 与 Notion 缺“重构前”参照，S0 在未改动代码上一次补齐）。

| 类别 | 屏幕 |
| --- | --- |
| 模块页（13） | 工作台、任务、知识库（笔记）、收件箱、保险箱、自动化、版本历史、远程连接、Agent CLI、健康中心、能力网关、插件中心、设置 |
| 任务（4） | 看板、月历、详情、编辑器（新建 / 编辑对话框） |
| 笔记 / 档案（5） | 笔记编辑器、档案类型视图、档案列表、档案详情、字段编辑对话框 |
| 自动化（1） | 规则编辑器 |
| 设置（7） | 各页（外观、Agent 接入、数据、快捷键、日志等，以 `SettingsModule` 的导航为准） |
| 启动页 / 命令面板 / 新建菜单 / 弹出层（3+） | `launch`、命令面板、新建菜单；一个下拉菜单与一个对话框 |

具体清单由 S0 写进 `tests/visual/screens.ts`（数据文件，一行一屏：id、进入方式、等待条件）。新增界面时在这里加一行，等价性检查自动覆盖。每屏在 1440×900 下取全部证据。**宽度矩阵**：默认状态的计算样式（不截图）在 1920、1440、1280、1100、1000、900、760、700、620、520 十个宽度下各取一次，覆盖现有 `@media` 断点两侧（S0 的脚本从 CSS 提取断点并校验）；截图只在 1440、760、520 三个宽度对启动页、工作台、任务看板、设置、新建菜单取（沿用上游 BR-04）。另取 reduced-motion 与 compact 密度各一个组合的默认状态；DataTable 取“滚到底部”一屏。

**组合取舍（Q3）**：完整状态矩阵只对 Claude 主题的明 / 暗运行；其余三套主题只取默认状态；总预算单次完整运行 ≤ 40 分钟。

## 3. 计算样式快照怎么取

1. 固定 Vault：用 S0 新增的确定性夹具（`tests/visual/fixture.ts`，现有 e2e 没有种子夹具）经 `HUHU_VAULT` 启动；时间、随机数由已有测试钩子固定，剩余随时间变化的文本在比对时忽略文本内容、保留盒模型。
2. 对每屏：等待“引擎就绪”与 `requestAnimationFrame` 稳定；遍历 `document.body` 下可见元素（`getBoundingClientRect` 宽高 > 0，或 `position: fixed` 的浮层）。
3. 元素键 = 从屏幕根到元素的“标签 + 同级结构序号 + role / aria 属性”路径。**不使用类名，也不使用 `data-testid`**：S4 会新增 testid，用它做键会让改动过的元素与基线对不上；改名同样不能让键失配。testid 只作为报告里的辅助显示信息。
4. 记录的属性：布局（`display`、`position`、盒模型四边与尺寸、`gap`、`flex-*`、`grid-*`、`overflow`、`z-index`）、排版（`font-*`、`line-height`、`letter-spacing`、`text-*`、`white-space`）、颜色（`color`、`background-*`、`border-*-color`、`outline-*`、`box-shadow`、`opacity`、`fill`、`stroke`）、其他（`cursor`、`transition-*`、`animation-name`、`transform`、`backdrop-filter`、`filter`、`pointer-events`、`visibility`）。伪元素 `::before` / `::after` / `::placeholder` / `::selection` 对存在内容的元素同样记录。
5. 状态矩阵：对可交互元素（`button`、`a`、`input`、`select`、`textarea`、`[role=tab|menuitem|option|switch|checkbox|row]`、`[tabindex]`）依次用 CDP `CSS.forcePseudoState` 强制 `hover`、`focus-visible`、`active`，**强制后重新读取该元素的整棵子树与祖先链**（`.row:hover .actions` 改的是后代，`:focus-within` 与 `:has()` 改的是祖先），再恢复；`:focus-within` 另外用真实聚焦（`element.focus()`）再取一次，因为 CDP 强制的状态不会传给祖先。`disabled` / `aria-disabled` / `aria-selected` / `data-state` 是 DOM 状态，已在默认快照里。
6. 输出：每屏一个 JSON（键 → 属性哈希 + 可读属性表）。比对按键对齐；缺失 / 新增 / 不同的元素分别报告。

可行性（Q3）：S0 先在“任务看板”一屏验证耗时与稳定性；单屏超过 60 秒或两次运行有不可遮罩的抖动，则降级为“每屏默认状态的计算样式 + 每类可交互元素各取一个代表做状态矩阵”，并把降级写进 progress.md。

## 4. 像素比对

- Playwright `expect(page).toHaveScreenshot(name, { threshold: 0, maxDiffPixels: 0, animations: "disabled", caret: "hide", mask })`；基线目录通过 `snapshotPathTemplate` 指到 `.visual/<name>/`。
- 遮罩：时间戳、相对时间（“3 分钟前”）、随机 id、光标。遮罩清单写在 `tests/visual/masks.ts`，每项注明原因，由 `pnpm visual:noise` 产出候选。
- 与计算样式同时运行，**任一失败即失败**。若只有像素差异、计算样式无差异，先怀疑合成层（毛玻璃、阴影、字体），逐条记入 progress.md。

## 5. 层叠冲突报告怎么做（静态）

输入：每个 CSS 文件的规则（含所处 `@media` 上下文）及其“原来的位置”（不分层时的总顺序）和“新位置”（层、层内顺序）；**再并入运行时导出的 `document.styleSheets` / `adoptedStyleSheets` 中不属于打包产物的样式**（CodeMirror、sonner、xterm、mermaid 的注入），它们没有层、永远压过分层规则，静态分析看不到。

1. 规则按属性建立索引；同一属性、选择器可能命中同一元素的规则对才进入比较。“可能命中同一元素”按保守规则：任一方最右侧复合选择器与另一方的最右侧复合选择器存在共同类 / 标签 / 属性条件，或任一方为通配 / 纯标签 / 纯属性。
2. 对每个候选对，分别用“旧规则”（特异性、顺序、`!important`）与“新规则”（`!important` 先、层序后、特异性、顺序）判定赢家；赢家不同就列出。
3. 输出：`属性 | 规则 A（文件:行、选择器、层） | 规则 B | 旧赢家 | 新赢家 | 建议处理`。

局限：这是保守的过近似，会有误报，没有漏报是目标但不能证明；所以它不替代 §3 的运行时快照，只用来**提前**发现问题并给出修复位置。

## 6. 每个切片的操作规程

1. `pnpm visual:baseline prev`（在切片开始前的已验证状态上）。
2. 实施改动。
3. `pnpm visual:compare prev`：定位本切片引入的差异；`pnpm visual:compare origin`：确认累计差异。两者都必须为 0，或差异全部在 `progress.md` 的“已批准差异”表里。
4. `pnpm lint`、`pnpm typecheck`、受影响包的单元测试；最后交给 `audit`（传快照 SHA）。
5. 在 progress.md 追加该切片的证据：命令、输出摘要、基线 SHA、失败与处理。
6. 出现“看起来是噪声”的差异时，只能用 `visual:noise` 的遮罩清单解释；不能凭肉眼判断。

## 7. 噪声与稳定性

- 上一轮发现：未改动的两次运行有 33 张截图出现差异，来源是时间戳、相对时间文案和一次数据加载时序（“没有历史版本”）。S0 要把这些来源逐个变成遮罩或等待条件，目标是 `visual:noise` 差异 0。
- 字体：Fontsource 字体是随包文件，渲染稳定；系统中文字体随机器不同，所以基线只在本机有效。
- 动画：`animations: "disabled"`，并在快照前等待 `transition` 结束；减少动效下的验证由 DS-14 单独完成。
