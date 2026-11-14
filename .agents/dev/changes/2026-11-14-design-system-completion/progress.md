# 进度：设计系统收尾

## 状态（2026-11-14 实施结束）

**核心目标达成，验证覆盖与规格有若干如实记录的降级和偏差**（见“偏差与未做”）。所有切片都以“与冻结的 `origin` 基线渲染零差异”为门槛：Claude 主题含状态矩阵，四套主题 × 明暗的默认状态计算样式 + 像素，10 个宽度 + compact + reduced-motion。

| 切片 | 状态 | 结果 / 证据入口 |
| --- | --- | --- |
| S0 等价性验证入库 | 完成 | `tests/visual/`、`scripts/visual.mjs`；见“S0 证据” |
| S1 层叠审计与根因 | 完成 | E0、E1；`evidence/`；见“S1 证据” |
| S2a 整体入层与不分层白名单 | 完成 | 项目样式整体在 `components` 层；`vendor-overrides.css`、`editor-cm.css` 为白名单；`scripts/check-css-layers.mjs` |
| S2b 去除 `!important` | 完成 | 73 处 → 保留 37 处带说明（减少动效 / 覆盖第三方 / 覆盖内联 width）；stylelint `declaration-no-important` |
| S3 样式归位与分层 | 完成（有登记债务） | 约 1,300 个规则块迁到 `shell` / `modules` 层；33 条规则退回 `components`（`evidence/s3-stay-in-components.json`）；36 个跨包共用类登记在 `scripts/css-ownership-exceptions.json` |
| S4 类名统一 | 完成（有登记债务） | 712 个类按归属加前缀（`evidence/class-map.json`）；209 个历史类名中 57 个仍作为例外登记（`scripts/css-class-exceptions.json`） |
| S5a 按组件拆分 | **部分完成** | `components/{core,overlays,data,feedback}.css`；`shared.css` 已删除。`core.css` 仍含按钮 / 分段控件 / 标签栏 / 全局元素等彼此顺序耦合的规则 |
| S5b 去重与同义类合并 | 部分完成 | 13 个同义类合并（`btn`、`badge`、`btn-primary`…）；`card`、`row`、`segmented`、`spin` 与已有 `hu-` 类并存，登记待合并；规则级“去重合并”未做 |
| S5c 无用样式核查 | 完成（静态 + PurgeCSS，无覆盖率） | AST 静态分析删除 378 条规则（`evidence/s5c-purge-candidates.json`）；PurgeCSS 130 条 rejected 逐条核查后一条都不删（`evidence/s5c-purgecss-review.md`）；**没有做覆盖率交叉** |
| S6 主题验收与收尾 | 部分完成 | 四主题比对完成；DSC-13 的人工逐张核对未做（见下）；文档已更新 |

## 偏差与未做（如实）

- **层结构与规格不同**：规格要求 `components / shell / modules` 一次到位；实测证明按文件一次分三层会产生上千组翻转（E1）。实际做法是 DC-D11：先整体放进 `components`（S2a），归位后（S3）再启用 `shell` / `modules`，并用“收敛循环”把无法保持原优先级的规则退回 `components`（33 条，包括各插件文件自己原有的规则）。`vendor` 层只承载静态第三方 CSS（xterm、katex）；运行时注入的 CodeMirror、sonner 样式无层，覆盖它们的规则在不分层白名单里。
- **S5a 没有做到“一个组件一个文件”**：细拆（7 个文件）产生 354 处计算样式差异，根因是按钮、分段控件、标签栏、全局元素选择器之间的同层顺序耦合。折中为 4 个文件，`core.css` 保留原相对顺序。要继续拆分需要把这些规则改写成与顺序无关的选择器，本期未做。
- **类名统一不彻底**：共享组件类用 `hu-` + 原名（如 `hu-knowledge-resource-footer`、`hu-tw-workbench`），名字沿用历史语义，没有重新命名；工作台 `shell-`，插件用插件前缀。57 个类登记为例外（数据驱动 / 同义类待合并等）。
- **stylelint 前缀规则未使用**：前缀规则由 `scripts/check-css-classes.mjs` 实现（含例外登记表），而不是 stylelint 的 `selector-class-pattern`；效果等价，位置不同。
- **PurgeCSS 与覆盖率**：PurgeCSS 已补做（见 DSC-11），覆盖率交叉仍未做。无用规则判定是静态的（类名在 TS 字符串、模板片段里都没有出现），删除后由四主题比对验证；不在固定 Vault 屏幕上出现的状态只有静态证据。
- **DSC-13 人工核对**：没有对 64 组截图逐张人工对照“标志特征”。替代证据：重构后与重构前（`origin` 基线，四套主题 × 明暗）计算样式与像素逐一相同，因此主题外观没有变化；人工查看了 Apple 浅色与 Vercel 深色的任务看板，符合上游 §6 的特征（Apple 蓝色强调与浅色外壳、Vercel 近黑背景与白字）。
- **覆盖盲区**：启动页、自动化规则编辑器、档案字段编辑对话框、新建菜单没有进入屏幕清单；xterm 终端与 Mermaid 的运行时样式夹具里没有出现（E0 只看到 sonner 与 CodeMirror）。
- **DS-06 / DS-07 / DS-12 / DS-14 的单独运行证据**：未单独重做；它们依赖的主题引擎代码本期没有改动，且 e2e（含 a11y）覆盖主题切换与终端换主题。

## 本期发现并修复的真实缺陷（来自验证，而不是静态检查）

1. **迁移脚本丢 `@media` 包装**：抽出覆盖第三方的规则时丢了外层 `@media`，窄屏规则在所有宽度生效。
2. **编辑器装饰类被分层规则压住**：`.huhu-md-semibold` 等是 CodeMirror 内容里的元素，与运行时 `ͼN` 类竞争，也必须不分层。
3. **`!important` 去掉后行为改变**：`.tw-task-name` 等 6 处被更高特异性的 `button` 规则压住；`.primary-nav` 的宽度 `!important` 是为了覆盖 AppShell 的内联 `style.width`（属于允许的例外）。
4. **改名造成同名合并**：`btn`→`hu-btn` 与 `base.css` 里已有的 `.hu-btn` 合并，按钮在悬停 / 聚焦 / 按下状态多套了样式。
5. **清理脚本吃掉空格**：去除无定义类名时对字符串做 `trim()`，把 `" active"`、`" agent-history-open"` 的前导空格吃掉，Agent CLI 页布局崩掉；已逐处恢复。
6. **静态“无用”判定误伤**：用正则抽字符串会漏掉被引号配对错位的 token；改用 TS AST 后误删消失（378 条，而不是 1,529 条）。

## 最终验证

- **最终审计**（快照 `a49dac2092bd366ae959df03dd7f434318d07314`，隔离 worktree）：`pnpm install --frozen-lockfile` 通过；`pnpm typecheck` 通过；`pnpm lint`（oxlint、`check-lint-rules`、stylelint、`check-ui-colors`、`check-css-layers`、`check-css-classes`、`check-css-ownership`）通过；`pnpm test` 695 passed / 7 skipped / 0 failed；`pnpm build` 通过；全量 e2e 105 passed / 3 skipped（截图用例，设计上条件跳过）/ 0 failed。
- **视觉等价性**：S5a 完成后对四套主题 × 明暗运行 `pnpm visual:compare origin`：计算样式失败 0、宽度矩阵失败 0、像素比对通过（容差见 `tests/visual/masks.ts`）。之后只改了文档与脚本注释。
- 没有跑：`pnpm knip`、`pnpm format:check`（CI 里会跑，发布前补跑，见下）、打包后 e2e（`e2e:packaged`）、Windows / macOS 任何验证。

### 未完成的验收项（编号对应 spec）

- DSC-05：保留了 34 处 `!important`，其中“覆盖第三方运行时样式”一类超出规格的两类例外（见上表）。
- DSC-09（评估后未做）：`no-duplicate-selectors` 共 218 处重复选择器；写了一个保守的合并脚本（后块声明并入首块，要求中间没有“选择器可能重叠且设置同一属性”的规则），只有 7 处能证明与顺序无关，其余 210 处都因顺序耦合不能自动合并，已回退（7 处也未验证，没有保留）。手工合并每一处都要重跑渲染比对。`no-duplicate-selectors` 没有启用，`.stylelintrc.json` 里 `declaration-block-no-duplicate-properties` 仍保留 `consecutive-duplicates-with-different-values` 例外；规则级去重未做。
- ~~DSC-10~~ **已完成（发布后补做）**：16 处项目类名定位器改成 `data-testid`（`notes-reading-pane`、`home-main-column`、`home-side-column`、`version-diff-labels`、`notes-explorer-tree`、`agent-space-item`、`col-resizer`），`.hu-wikilink` 改按 `a[data-target]`；仍保留 2 处按类名：`.home-widget`（区分插件贡献的首页卡片）与第三方 `.cm-*` / `.xterm-*`。受影响的 e2e 用例本地通过。
- ~~DSC-11~~ **已完成（结论是“没有可安全删除的规则”）**：安装 PurgeCSS 8.0.0，`pnpm css:purge`；rejected 130 条逐条核查与结论见 `evidence/s5c-purgecss-review.md`。第一次按“类名在源码里不出现”删除 101 条被渲染比对否决（模板片段拼出的状态类），第二次只删确认无用的 12 条仍有 16 项差异，最终一条都不删。
- DSC-12：覆盖率交叉没有做。
- DSC-13（抽查）：没有逐张人工核对 64 组截图；抽查了 4 张：Claude 深色的设置·外观页（四张主题预览卡各按自己的主题渲染：Claude 珊瑚 + 衬线、Apple 蓝色胶囊、Notion 紫色主按钮、Vercel 黑色 + 等宽小标签，满足 DS-01）、Apple 浅色与 Vercel 深色的任务看板、Notion 浅色的笔记编辑器，均符合上游 §6 的特征。其余仍以“与重构前基线逐元素一致”为证据。
- DSC-15（部分）：项目 CSS 源文件合计 origin 302,555 B → 现在 316,663 B（+4.7%，增长来自层声明与 `@layer` 包装、前缀更长的类名与 33 条退回 `components` 的块，大于删除 378 条规则的减少）；构建产物 `index-*.css` 386,543 B（origin 构建产物字节数没有记录，S2a 时为 372,670 B）。`perf.spec.ts` 全量运行通过（一次全量里 17.4 ms 的偶发超出，单独复跑通过），没有保存 p95 数字对比。
- DSC-16：`notes/context/workbench.md` 里没有 D-18 条目可标注，无法核实该项；其余文档已更新（`notes/context/design-system.md`、知识索引）。
- DC-D10：不分层白名单文件里放行了编辑器 DOM 内的项目装饰类（`huhu-md-semibold`、`huhu-live-*`），不只是第三方选择器（`scripts/check-css-layers.mjs` 的 `THIRD_PARTY_CLASS`）；原因见 spec DC-D4。

## 文档阶段的发现

- 顾问审阅（2026-11-14）指出并经静态核实：CodeMirror（style-mod）与 sonner（`__insertCSS`）在运行时注入**不分层**样式，`shared.css` 里约 124 处 `.cm-*`、12 处 `[data-sonner-*]` 是覆盖规则，入层后会失效——很可能是上一轮“笔记编辑器”等回归的根因；方案据此加入不分层白名单（spec §3.2、DC-D4），并在 S1 用实验 E0 实测确认。
- 其余已吸收的审阅意见：元素键不含 testid；状态矩阵回读子树与祖先；宽度矩阵覆盖全部 `@media` 断点；固定时间与冻结窗口；Q3 的数字改为可行预算；S2 / S5 拆分；同义类合并推迟到 S5b；类名扫描范围扩到 `classList` / `querySelector` / 编辑器 Decoration；取消“确认新结果更合理”出口；`themes.generated.css` 自带层、仓库无 `@media print`。

## 起点事实（2026-11-14，供实施时对照）

- `shared.css` 12,131 行 / 245 KB / 2,398 条规则；全部不在 `@layer` 内；`!important` 62 处（界面范围合计 73）。
- 类名：721 个不同类名，`hu-` 开头 6 个；354 个类在 3 个以上规则块出现；TSX 字面量类名中 43 个无定义（含 `hu-meta` 23 处）。
- 按 TSX 使用关系的归属：workbench 156、notes 47、ui 42、ssh 27、tasks 21、inbox 18、agent-cli 17、versioning 12、automations 7、safe 6；多包共用约 67；无字面量使用约 300。
- 其他 CSS：shell 250 行、editor 29 行、8 个插件合计约 2,250 行。
- 上一轮验证：128 张截图（2 主题 × 明暗 × 32 屏）逐像素比对，未改动基线的噪声 33 张。脚本不在仓库。

## 已批准差异（渲染有意改变的登记处）

| 切片 | 屏幕 / 元素 | 属性 | 旧值 | 新值 | 原因 | 截图 |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |

## `!important` 例外清单（最终状态，共 34 处；类别只有三种）

> 第三类“覆盖第三方运行时样式”是对规格“只允许两类”的偏差：editor-cm.css / vendor-overrides.css 里覆盖 CodeMirror / sonner 的声明仍用 `!important`（运行时样式表在文档顺序上晚于本文件，等特异性时它们赢）；实测未验证能否全部去掉。

| 文件:行 | 类别 | 原因 | 声明 |
| --- | --- | --- | --- |
| packages/editor/src/editor-cm.css:615 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `padding: 0 15px !important;` |
| packages/editor/src/editor-cm.css:628 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `padding: 0 14px !important;` |
| packages/editor/src/editor-cm.css:738 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `padding: 0 !important;` |
| packages/editor/src/editor-cm.css:739 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `margin: 0 !important;` |
| packages/editor/src/editor-cm.css:740 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `font: 13px/1.75 var(--font-ui) !important;` |
| packages/editor/src/editor-cm.css:741 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `max-width: 100% !important;` |
| packages/editor/src/editor-cm.css:752 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `margin: 0 !important;` |
| packages/editor/src/editor-cm.css:753 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `font-size: 13px !important;` |
| packages/editor/src/editor-cm.css:762 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `padding: 9px 12px !important;` |
| packages/editor/src/editor-cm.css:763 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `border: 0 !important;` |
| packages/editor/src/editor-cm.css:764 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `border-bottom: 1px solid var(--line) !important;` |
| packages/editor/src/editor-cm.css:782 | 覆盖第三方运行时样式 | 覆盖 CodeMirror 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `border-bottom: 0 !important;` |
| packages/ui/src/styles/base.css:4 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `transition: none !important;` |
| packages/ui/src/styles/base.css:5 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| packages/ui/src/styles/base.css:11 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `transition: none !important;` |
| packages/ui/src/styles/base.css:12 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| packages/ui/src/styles/components/core.css:2478 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| packages/ui/src/styles/components/core.css:2484 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `scale: 1 !important;` |
| packages/ui/src/styles/components/core.css:2491 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| packages/ui/src/styles/components/core.css:3157 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `transition-duration: 0.01ms !important;` |
| packages/ui/src/styles/vendor-overrides.css:81 | 覆盖第三方运行时样式 | 覆盖 sonner 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `border-radius: 12px !important;` |
| packages/ui/src/styles/vendor-overrides.css:82 | 覆盖第三方运行时样式 | 覆盖 sonner 运行时注入的样式（文档顺序上晚于本文件，等特异性时它们赢） | `box-shadow: var(--shadow-popover) !important;` |
| packages/workbench/src/shell/shell.css:1600 | 覆盖元素内联样式 | 覆盖元素上的内联 width（AppShell 的 style 属性按侧栏宽度设置） | `width: 184px !important;` |
| packages/workbench/src/shell/shell.css:1668 | 覆盖元素内联样式 | 覆盖元素上的内联 width（AppShell 的 style 属性按侧栏宽度设置） | `width: 184px !important;` |
| packages/workbench/src/shell/shell.css:1690 | 覆盖元素内联样式 | 覆盖元素上的内联 width（AppShell 的 style 属性按侧栏宽度设置） | `width: 174px !important;` |
| packages/workbench/src/shell/shell.css:1753 | 覆盖元素内联样式 | 覆盖元素上的内联 width（AppShell 的 style 属性按侧栏宽度设置） | `width: 210px !important;` |
| packages/workbench/src/shell/shell.css:3082 | 覆盖元素内联样式 | 覆盖元素上的内联 width（AppShell 的 style 属性按侧栏宽度设置） | `width: 180px !important;` |
| plugins/automations/src/ui/automations.css:341 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| plugins/automations/src/ui/automations.css:342 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `transition: none !important;` |
| plugins/inbox/src/ui/inbox.css:476 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| plugins/inbox/src/ui/inbox.css:477 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `transition: none !important;` |
| plugins/ssh/src/ui/ssh.css:625 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `scroll-behavior: auto !important;` |
| plugins/versioning/src/ui/versioning.css:346 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `animation: none !important;` |
| plugins/versioning/src/ui/versioning.css:347 | 减少动效 | 减少动效：必须压过组件自己的动画 / 过渡声明 | `transition: none !important;` |

## 基线记录

| 基线 | git 提交 | 快照 SHA | 生成时间 | 范围 |
| --- | --- | --- | --- | --- |
| origin | `8283c5c`（HEAD）+ 工作区 | `51681e7a5159feaf8ef8e48aa5fb9793999cb334` | 2026-11-13T23:36Z | 四套主题 × 明暗 × 30 屏（Claude 含状态矩阵）+ 宽度矩阵 + 运行时样式表 |

CSS 总字节数：S0 起点 `packages/ui/src/styles/*.css` 合计约 287 KB（shared.css 245 KB）；构建产物里的 CSS 文件由 vite 生成，S0 / 最终都**没有单独记录字节数与 perf 指标**（DSC-15 的这两项未做；全量 e2e 含 perf 用例通过，`perf.spec.ts` 在一次全量运行中出现 17.4 ms 的偶发超出，单独复跑通过）。

## 未做 / 未验证（实施结束时如实更新）

- 非 Linux 平台的渲染；真实用户长期使用感受。


## S0 证据（2026-11-14）

- 工具：`pnpm visual:baseline|compare|noise <name> [--themes a,b] [--no-states] [--no-build]`（`scripts/visual.mjs` 先 `pnpm build`，再跑 `playwright.visual.config.ts`）。三个 spec：`visual.spec.ts`（计算样式快照 + 状态矩阵 + 像素）、`widths.spec.ts`（10 个宽度 + compact + reduced-motion 的默认状态计算样式，并校验所有 `@media` 断点两侧都有样本）、`runtime-styles.spec.ts`（E0：导出运行时注入样式表）。固定 Vault：`tests/visual/fixture.ts`（随包 demo vault + 固定的任务 / 笔记，所有 mtime 固定为 2026-11-10T08:00Z；路径固定为 `/tmp/huhu-visual/固定库`）。时间：`page.clock.setFixedTime`（Electron 下可用，不需要产品侧钩子）。
- 屏幕：30 个（13 个模块页、任务列表 / 看板 / 月历 / 详情 / 新建对话框、笔记编辑 / 阅读、档案三视图、命令面板、设置 9 页）。**未覆盖**：启动页（需要无 Vault 启动）、自动化规则编辑器、档案字段编辑对话框、新建菜单——上一轮 128 张里有，本轮未重做，列为已知缺口。
- 渲染稳定性：Electron 启动参数 `--disable-gpu --disable-lcd-text --font-render-hinting=none --force-color-profile=srgb --disable-gpu-rasterization`。随机来源逐个处理：Vault 目录名（固定路径）、文件 mtime（固定）、过渡中间态（等待有限动画结束；状态矩阵读取时关闭过渡）、Vault 标识与 space id（遮罩，`masks.ts`）。像素容差：默认 40 像素（SVG 边缘抖动），命令面板单独 150（backdrop 模糊，实测 45）；计算样式无容差。
- **噪声验证**：同一份代码下，Claude 明 / 暗的完整比对连续运行（含基线重新生成共 4 次）计算样式失败项 0；四套主题 × 明暗对冻结的 `origin` 基线复测：2 个 spec passed（8.8 分钟）、计算样式失败项 0；宽度矩阵对 origin：失败项 0（2.9 分钟）。
- **工具有效性验证**（`VISUAL_INJECT` 运行时注入样式）：`.rail-item{padding-left:7px}` → 默认状态与状态矩阵均报出，像素 1472 处差异；`.rail-item:hover svg{stroke:red}` → 状态矩阵报出（`i4|hover`）；`button{box-shadow:…}` → 仅像素差异（12914 处）；`div:focus-within{outline…}` → 像素差异 3654 处。验证中还发现并修复了一个工具缺陷：伪元素属性与元素自身同名属性在解析时互相覆盖，会漏报差异。
- 耗时：Claude 主题含状态矩阵的 30 屏 × 明暗 ≈ 6.5 分钟；四套主题 ≈ 9–10 分钟；宽度矩阵 ≈ 3 分钟。
- `origin` 基线：`.visual/origin/`（四套主题 + 宽度矩阵 + 运行时样式表）。对应代码：HEAD `8283c5c` + 工作区快照 `51681e7a5159feaf8ef8e48aa5fb9793999cb334`（`git stash create`，生成时间 2026-11-13T23:36:38Z）。
- 与规格的差异：降级——状态矩阵只对 Claude 主题运行（其余三套主题只取默认状态），按 Q3 的预算；DataTable“滚到底部”一屏与 reduced-motion / compact 只做默认状态计算样式。

## S1 证据（2026-11-14）

- **E0 运行时样式表**（`evidence/e0-runtime-styles.json`，在 30 个屏幕上导出）：两份不属于打包产物的 `<style>`，**均无 `@layer`**：sonner（97 条规则，`[data-sonner-toaster]…`，每个屏幕都有）、CodeMirror（175 条规则，`.ͼ1 …`，17 个屏幕）。夹具里没有 xterm 终端会话与 Mermaid 图，所以这两类运行时样式未被覆盖到——S2a 写白名单时需要补一次实测（Agent CLI 终端、阅读模式 Mermaid）。
- 静态核实：`css-layer-report`（`scripts/css-layer-report.mjs`，配置 `evidence/layers-*.json`）显示 `shared.css` 中有 126 条规则的选择器命中第三方运行时样式（`.cm-*`、`[data-sonner-*]`、`.xterm*`、`.katex*`），按“全量入层”配置则为 617 条（含各插件）。这些规则入层后会输给无层的运行时样式（Q1 的第一类原因）。
- **E1**（只把 `shared.css` 以 `layer(components)` 导入，其余不变）：与 origin 比对，计算样式失败项 214、宽度矩阵失败项 73、像素失败。集中在 task-new-dialog / task-detail / tasks-list / tasks-board / settings-versioning / note-editor / archives-detail，与上一轮的回归屏幕（任务页、任务详情、笔记编辑器、档案视图）一致。具体：任务列表的网格列宽 `104/541/110/125/150/26px → 19/697/92/110/120/28px`（`.tw-*` 规则在 shared.css 与 tasks.css 里都有，shared 里高特异性的规则原本赢，入层后 tasks.css 的无层规则赢）；笔记编辑器行号槽 36→40px、行内宽高变化（CodeMirror 注入样式压过 shared.css 里对 `.cm-*` 的覆盖）。静态报告 1500 组翻转，主要是 `shared.css × 各插件 CSS`（versioning 278、agent-cli 273、automations 246、notes 191、ssh 123、tasks 122、inbox 112、shell 58）。
- 结论（Q1）：上一轮回归的原因是两类，都已用数据证实——① 运行时注入的无层第三方样式（CodeMirror、sonner）压过入层后的覆盖规则；② 按文件分进不同层后，“层序压过特异性”使 shared.css 里属于插件的高特异性规则输给插件里的低特异性规则。对策见 spec DC-D4、DC-D11：覆盖规则进不分层白名单；先整体放进同一个层（零翻转），归位后再分层。`!important` 反转这一类原因本轮没有单独实验（E5）：shared.css 的 62 处 `!important` 在整体同层下不改变胜负，留到 S2b 逐条处理。
- Q2（`@import … layer()`）：Vite 8.3.7 内置 postcss-import 16.2.0 支持；`index.css` 现有的 `layer(tokens)` / `layer(base)` 已被内联为 `@layer` 块。sonner / xterm / katex 的 `layer(vendor)` 导入与 katex 字体 `url()` 将在 S2a 构建时实测并记录。
- 依赖：根 `devDependencies` 已显式声明 `postcss@8.5.32`、`postcss-selector-parser@7.2.1`（原先只是 stylelint / vite 的传递依赖）。
