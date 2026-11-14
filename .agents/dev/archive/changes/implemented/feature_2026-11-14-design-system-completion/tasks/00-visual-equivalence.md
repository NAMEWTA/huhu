# S0 等价性验证入库

规格：[spec.md](../spec.md) §3.4、§6；DSC-02、DSC-03 的验证工具；Q3。细则：[verification.md](../verification.md)。
交付：一条命令能证明“渲染没变”，并且这套工具是仓库资产而不是临时脚本；`origin` 基线已生成并冻结。
依赖：无。
前置：**冻结窗口从本切片开始**。生成 `origin` 基线之前，其他三个 change（任务 Issue 化、档案文件夹笔记、智能体启动设置）的界面代码必须已稳定——要么先提交，要么约定在 S0～S5c 期间不再改界面与样式。`origin` 一旦被其他改动污染就回不到 0 差异。
边界：只新增 `tests/visual/`、`scripts/visual-*.mjs`、根 `package.json` 的脚本、`.gitignore`（忽略 `.visual/`）。**不改任何界面样式或 TSX。**不修改 `tests/e2e/helpers/` 现有函数（需要时新增，不改签名）。**例外**：若 Playwright `page.clock` 在 Electron 下无法固定渲染端时间，允许新增仅测试用的时钟注入钩子（环境变量，默认行为不变），并在 progress.md 注明。

## 背景

上一轮靠 `/tmp/ds/*` 的 Python 脚本与已删除的 `_vis.spec.ts` 做 128 张截图的像素比对，噪声来源为时间戳类文字与一次数据加载时序。像素比对覆盖不到悬停 / 焦点 / 禁用，而分层最容易改变的正是这些状态，所以本任务把主验证换成“计算样式快照”。

## 当前代码指针（实施时复核）

- 启动与夹具：`tests/e2e/helpers/launch.ts`（`openApp`、`root`）；`tests/e2e/screenshots.spec.ts`（CDP 固定视口 1440×900 的做法）。
- 依赖：像素比对只用 Playwright 自带能力，不新增包；计算样式快照用 Playwright / CDP，不新增包。需要读 CSS 的脚本（S1 起）要把 `postcss`、`postcss-selector-parser` 声明为根 `devDependencies`（现在只是传递依赖，不能直接 import）。
- 旧脚本做法摘要：[上游 progress.md“样式拆分”](../../feature_2026-11-13-brand-and-windows-installer/progress.md)；临时脚本 `/tmp/ds/` 可能已不存在，不依赖它。
- 拟新增：`tests/visual/{screens.ts,masks.ts,snapshot.ts,compare.ts,visual.spec.ts}`、`scripts/visual-compare.mjs`、`playwright.visual.config.ts`（独立配置，不进默认 `pnpm e2e`）。

## 实施要点

1. 先做可行性：只对“任务看板”一屏实现计算样式快照 + 状态矩阵（CDP `CSS.forcePseudoState`；强制后重取该元素**子树与祖先链**；`:focus-within` 另用真实聚焦），同时验证 `page.clock` 能固定渲染端时间，测单屏耗时与两次运行的稳定性（Q3）。可行再扩展到全部屏幕；不可行按 verification.md §3 降级，并在 progress.md 写明。
2. **固定 Vault 夹具**：现有测试没有种子数据夹具（只有 `acceptance.spec.ts` 内联复制 `demo-vault`）。新增 `tests/visual/fixture.ts`：用 `HUHU_VAULT` 指向一份确定性的 Vault（任务、笔记、档案、收件箱、自动化规则、保险箱条目、历史版本），内容进 git，时间戳用固定值。上一轮的 128 屏数据已不可得，这里重新定义，`origin` 基线在它上面生成。
3. 屏幕清单与进入方式写成数据（`screens.ts`），而不是每屏一段脚本；外观组合（主题 × 明暗）通过现有设置入口或测试钩子切换，不改产品代码。
4. 元素键 = 标签 + 结构序号 + role / aria 属性；**不使用类名，也不使用 `data-testid`**（S4 会新增 testid，用它做键会使改动过的元素对不上）。
5. 宽度矩阵：从全部 CSS 提取 `@media` 断点，校验宽度矩阵（1920、1440、1280、1100、1000、900、760、700、620、520）覆盖每个断点两侧，缺失就报错；默认状态计算样式在每个宽度取一次。减少动效与 compact 密度各取一个组合。DataTable 额外取“滚到底部”一屏。运行时样式表（`document.styleSheets` / `adoptedStyleSheets` 中不属于打包产物的）每屏导出一份，供 S1 使用。
6. 像素比对用 Playwright 内置 `toHaveScreenshot`，基线目录由 `snapshotPathTemplate` 指到 `.visual/<name>/`；遮罩从 `visual:noise` 的结果产生，逐项写原因；阈值从 0 起，只有噪声实测证明不可行的屏幕才逐屏放宽，写明数值与原因。
7. `pnpm visual:baseline|compare|noise` 三个脚本；比对输出必须能定位“屏幕 / 元素路径 / 状态 / 属性 / 旧值 / 新值”。
8. `origin` 基线在**未做任何样式改动**的代码上生成；把提交与 `git stash create` 的快照 SHA 写入 `.visual/origin/meta.json` 并抄入 progress.md。生成前先 `git add` 新文件。
9. 故意破坏验证：加载一段临时样式（运行时注入即可，不改文件）让某按钮 `padding` 变化 1px、某悬停色变化，确认比对分别在默认状态与悬停状态报出；然后撤销。

## 验收

- [ ] 在同一份未改动代码上连续运行 `visual:baseline a`、`visual:baseline b`，`visual:compare` 两者差异为 0（计算样式与像素）；有噪声的区域已进入遮罩清单且每项有原因。
- [ ] 状态矩阵能报出后代与祖先上的差异：注入 `.row:hover .child { color }` 与 `:focus-within` 祖先的差异，均被发现。
- [ ] 注入 1px 的 `padding` 差异：比对报告该屏幕、元素路径、属性、旧值与新值；注入 `:hover` 背景色差异：状态矩阵能报出；注入只影响 `box-shadow` 的差异：像素比对能报出（对应“辅助验证”的价值）。
- [ ] 屏幕清单覆盖 verification.md §2 的全部类别，Claude、Apple、Notion、Vercel 四套主题 × 明暗；窄屏（760 / 520）按清单取证。
- [ ] 单次完整运行耗时已记录；超过 40 分钟（或单屏超过 60 秒）按降级方案处理，并在 progress.md 标注覆盖降级。
- [ ] 断点覆盖校验通过：脚本列出的每个 `@media` 断点两侧都有宽度样本。
- [ ] `.visual/` 已被 git 忽略；`pnpm lint`、`pnpm typecheck` 通过；脚本新增文件没有颜色字面量问题（`check-ui-colors` 通过）。
- [ ] `origin` 基线已生成，`meta.json` 记录提交与快照 SHA。

## 完成证据

执行者在 progress.md 追加：两次基线比对输出、三个故意差异的报告输出、`visual:noise` 的遮罩清单、单次运行耗时、`origin` 基线的 SHA。实际结果由执行者记录，不预填。
