# S1 层叠审计与根因

规格：[spec.md](../spec.md) §3.2、§5、§10 的 Q1、Q2；DC-D3、DC-D4、DC-D5 的实测核实；DSC-04 的静态工具。
交付：回答“为什么上一轮分层回归”以及“该怎么入层”；产出 `css-layer-report` 与 `!important` 处置清单。**交付是结论与工具，不是界面改动。**
依赖：S0 的比对命令（二分实验要用）。`css-layer-report` 的编写与 S0 无文件冲突，可提前开始。
边界：新增 `scripts/css-layer-report.mjs`；实验在临时副本或临时分支快照里做，**不把实验性的层包装留在工作区**；不改界面样式。

## 背景

上一轮把样式一次性分进 `vendor / components / shell / modules`，同一套 128 张截图比对出现任务页、任务详情、笔记编辑器、档案视图、新建菜单的回归，并推测原因是“分层会改变 `!important` 与未分层规则之间的优先级关系”。这只是推测。本任务用二分实验把原因变成结论。

## 实施要点

1. 写 `css-layer-report`（规格见 [verification.md §5](../verification.md)）。用 `postcss`、`postcss-selector-parser`（复用优先③；两者已作为 stylelint 的传递依赖安装，需要在根 `devDependencies` 显式声明，版本沿用 `pnpm-lock` 中现有的 8.5.x / 7.x）。
2. **E0（先做）**：在每个屏幕导出 `document.styleSheets` 与 `adoptedStyleSheets` 中不属于打包产物的运行时样式，列出来源（CodeMirror、sonner、xterm、mermaid 等）及其是否带层——这是白名单（spec §3.2）的依据。已知静态证据：`shared.css` 约 124 处 `.cm-*`、12 处 `[data-sonner-*]`，sonner 2.0.7 在模块加载时 `__insertCSS`，CodeMirror 用 style-mod；`.hu-mermaid*` 并非覆盖第三方。
3. 二分实验（每步用 `visual:compare origin`）：
   - E1：仅把 `shared.css` 以 `@import … layer(components)` 导入，其余不变 → 记录差异屏幕与元素。
   - E2：E1 + `fonts/themes` 保持原样；对比“tokens / base 在层里、shared 在层里”与“shared 不在层里”的差异。
   - E3：把 sonner 放入 `vendor`，分别试 `vendor` 在最前与在 `base` 之后（DC-D3）。
   - E4：把插件 CSS 放入 `modules`、`shell.css` 放入 `shell`。
   - E5：逐一去掉 `!important`（73 处按文件 / 行列出），观察哪些改变渲染。
   - 对每个差异定位到具体规则对，归类为：特异性被层序反转 / `!important` 反转 / 第三方不分层样式压过 / 元素选择器落在不同层 / 其他。
4. Q2：已知 Vite 8.3.7 的 postcss-import 16.2.0 支持 `layer()`；仍要最小复现 `@import "pkg/x.css" layer(vendor)` 在项目使用的 Vite 版本下的构建结果；确认 katex 字体 `url()` 与 xterm 样式可用。不行就记录可行的替代写法。
5. DC-D4：逐行核对 `packages/editor/src/editor.css` 的 29 行（其中 `.hu-mermaid*` 不是覆盖第三方）与 `shared.css` 中全部 `.cm-*`、`[data-sonner-*]`、`.xterm*`、mermaid 相关规则，划定白名单范围；写明结论与是否保留 sonner 静态导入。
6. `!important` 处置清单：73 处逐条给出“去掉 / 改特异性 / 改层 / 保留为两类例外（减少动效、覆盖第三方内联样式）”及理由，作为 S2b 的输入。
7. 结论回写：若实测推翻 DC-D3 / DC-D4 / DC-D5 或 spec §3.2 的层序，**先修改 spec 再继续**，并在 progress.md 记录。

## 验收

- [ ] E0 的运行时样式清单完成，白名单范围写入 progress.md，并回写 spec §3.2（若与规格不一致）。
- [ ] 在“shared.css 整体入 components”的实验里，`css-layer-report`（静态 + 运行时样式表）标出的规则对，能解释实验中出现的**每一处**差异。上一轮 5 个回归屏幕（任务页、任务详情、笔记编辑器、档案视图、新建菜单）的数据已不可得，新夹具上若未复现，必须写“未复现，原因是…”并给出机制性证明（例如笔记编辑器的 `.cm-*` 覆盖规则入层后输给运行时样式的最小复现），不得省略。
- [ ] 每一个回归都有根因分类和对应处理方式（见 spec §5 的三种处理优先级）；Q1、Q2 的结论写入 progress.md，附命令与差异输出摘要。
- [ ] `!important` 清单覆盖 shared / base / agent-cli / versioning / notes / ssh / tasks 全部 73 处，每条有处置与理由。
- [ ] 报告脚本对“故意制造的反转”（在测试夹具 CSS 中构造两条特异性与层序相反的规则）能报出，对“无反转”夹具不报（放进 `scripts/` 旁的小测试，纯静态，可跑单元测试）。
- [ ] 工作区除 `scripts/css-layer-report.mjs` 及其测试外没有改动（`git status` 核对）。

## 完成证据

progress.md 追加：E1～E5 的命令与差异摘要、根因归类表、`!important` 清单、Q2 的构建产物片段、报告脚本的夹具测试输出。
