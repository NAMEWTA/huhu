# 实施计划：设计系统收尾

目标：达成 [spec.md](spec.md) 的 DSC-01～DSC-16——样式按归属归位、类名统一、`@layer` 真实生效，并且全程用可重复的等价性验证证明外观没有改变。
规格：[spec.md](spec.md)；验证细则：[verification.md](verification.md)；简报：[brief.md](brief.md)。
交付点：**本地工作区完成并验证**。不提交、不推送、不发布 rc；这些需要用户另行授权（CLAUDE.md）。

## 为什么是“整合边界”而不是并行的功能切片

这是跨全仓库的机械重构：所有切片都写 `packages/ui/src/styles/` 与几乎所有插件的 TSX，没有可以独立演示的“功能”。上一轮的教训是**一次做太多种变化，出现差异时无法归因**。所以本计划把每个切片限定为**一种**结构变化，并在每个切片结束时要求“与 `origin` 基线的渲染差异为 0”。这意味着：

- 每个切片结束时应用都必须可运行、渲染不变（可以部署，不允许“暂时不可运行”的中间状态）。
- 切片严格串行（S0 的工具建设与 S1 的审计除外）。唯一写入者原则：同一时间只有一个实施者改样式与类名。
- 整合点是 S6：全部切片完成后统一验证，并做主题人工验收。

## 切片总表

| 切片 | 完成后的行为 | 真正依赖 | 唯一写入边界 | 验证方式与通过判据 |
| --- | --- | --- | --- | --- |
| [S0 等价性验证入库](tasks/00-visual-equivalence.md) | 一条命令证明“渲染没变”：计算样式快照（含状态矩阵的子树 / 祖先、宽度矩阵、reduced-motion / compact）、像素比对、噪声基线、运行时样式表导出；`origin` 基线（四套主题）冻结；时间固定 | 其他三个 change 的界面代码已稳定或已提交（冻结窗口起点） | `tests/visual/`（新增）、`scripts/visual-*.mjs`（新增）、根 `package.json` 脚本、`.gitignore`；必要时仅测试用的时钟钩子 | 对未改动代码连续生成两次基线，差异 0；注入 1px padding、后代 / 祖先状态差异、`box-shadow` 差异均被报出；断点覆盖校验通过 |
| [S1 层叠审计与根因](tasks/01-cascade-audit.md) | 运行时注入样式清单（E0）与白名单范围；上一轮回归根因有实测结论；`!important` 处置清单；Vite `layer()` 导入方式与 vendor 位置有实测结论 | S0（二分实验用它）；`css-layer-report` 的编写可与 S0 同时进行 | 新增 `scripts/css-layer-report.mjs`（及夹具测试）；根 `devDependencies` 显式声明 `postcss`、`postcss-selector-parser`；**不改界面样式** | Q1、Q2 有结论；报告能解释实验里的每一处差异（未复现则给机制性证明）；工作区除脚本与依赖声明外无改动 |
| [S2a 整体入层与不分层白名单](tasks/02a-layering.md) | 除两个白名单文件外所有项目样式**整体在同一个层 `components` 里**（层内顺序＝原加载顺序，零翻转）；覆盖运行时注入样式的规则抽进白名单；静态第三方样式在 `vendor` 层 | S1 | `shared.css`（整体入 `components`，只抽出第三方覆盖规则）、`shell.css`、插件 CSS、`editor.css`、`index.css`、`base.css`、`vendor-overrides.css`（新增）、`check-css-layers.mjs` | DSC-01、02、03、04：与 `origin` 比对 0 差异；运行时样式表核对；冲突报告每条有结论、渲染变化 0 |
| [S2b 去除 `!important`](tasks/02b-important.md) | 无说明的 `!important` 为 0，保留项只属两类并有描述性注释 | S2a | 含 `!important` 的 CSS 文件、`.stylelintrc.json` | DSC-05、02、03 |
| [S3 样式归位与分层](tasks/03-ownership.md) | `shared.css` 中属于 workbench / 插件 / 编辑器的规则迁到所属包并进入 `shell` / `modules` 层（迁入规则放目标文件开头）；跨归属的翻转由冲突报告逐条处理；`shared.css` 只剩共享组件与全局基础 | S2b | `shared.css`（删除规则）、`packages/workbench/src/**/*.css`、`plugins/*/src/ui/*.css`、`packages/editor/src/editor.css`、`check-css-ownership.mjs`、`ownership.md` | DSC-02、03、04；归属不匹配 0；Q4、Q5 疑义项全部判定 |
| [S4 类名统一](tasks/04-class-names.md) | 类名符合前缀规则（同义类合并除外，登记待合并）；无悬空类名；e2e 不再依赖项目类名 | S3 | 全部 CSS 与 TS / TSX 类名使用点、`tests/**` 定位器、stylelint 前缀规则、`check-css-classes.mjs`、`css-dynamic-classes.json`、`class-map.json`、`class-merge-pending.json` | DSC-02、03、07、08、10：比对 0 差异；全量 e2e 通过 |
| [S5a 按组件拆分](tasks/05a-split-components.md) | `components/<name>.css`，一个共享组件一个文件；`shared.css` 不存在；规则数与顺序不变 | S4 | `packages/ui/src/styles/`、`check-css-ownership` 对照表 | DSC-06、02、03；规则数 / 顺序校验 |
| [S5b 去重与同义类合并](tasks/05b-dedupe-merge.md) | 重复选择器合并，同义类合并，`class-merge-pending.json` 清空 | S5a | `components/*.css`、被合并类涉及的 TSX 类名、stylelint 重复规则 | DSC-09、02、03 |
| [S5c 无用样式核查](tasks/05c-purge.md) | PurgeCSS rejected 逐条核查，覆盖率交叉；无用规则删除 | S5b | 各 CSS（仅删规则）、`css-dynamic-classes.json`、`pnpm css:purge`、根依赖 `purgecss` | DSC-11、12、02、03 |
| [S6 主题验收与收尾](tasks/06-theme-acceptance-and-docs.md) | 64 组主题截图人工验收；上游 DS 验收补证；文档与上游 change 状态更新 | S5c | `evidence/`、`notes/context/design-system.md`、`workbench.md`、上游 `progress.md` / `plan.md` | DSC-13、14、15、16；`audit` 全量；顾问复核 |

## 规格覆盖

| 规格要求 | 实现归属 | 验证归属 |
| --- | --- | --- |
| DSC-01 层生效 | S2a | S2a（`check-css-layers`、运行时样式表）、S6 |
| DSC-02 渲染不变 / DSC-03 状态与断点不变 | 每个切片的“与 origin 比对 0 差异” | S0 提供工具，S2a～S5c 每次运行，S6 终验 |
| DSC-04 冲突清零 | S2a（入层）、S3（归位） | S1 报告 + S2a / S3 复跑 |
| DSC-05 `!important` | S2b | S2b（stylelint） |
| DSC-06 归属唯一 | S3、S5a | S3、S5a（`check-css-ownership`） |
| DSC-07 前缀规则 / DSC-08 无悬空 | S4 | S4（stylelint、`check-css-classes`） |
| DSC-09 无重复 | S5b | S5b（stylelint） |
| DSC-10 e2e 选择器 | S4 | S4、S6（全量 e2e） |
| DSC-11 PurgeCSS / DSC-12 覆盖率 | S5c | S5c |
| DSC-13 DS-02 / DSC-14 补证 / DSC-15 回归 / DSC-16 文档 | S6 | S6 |
| 用户原话“`hu-` 统一 / 按组件重写 / 真实 `@layer` / PurgeCSS” | S4 / S5a+S5b / S2a+S2b / S5c | 同上；前两项的解释见 spec 开头，需用户确认 |

## 顺序与并行

```mermaid
flowchart LR
  S0[S0 等价性验证入库] --> S1[S1 层叠审计与根因]
  S1 --> S2a[S2a 全量入层与白名单]
  S2a --> S2b[S2b 去除 important]
  S2b --> S3[S3 样式归位]
  S3 --> S4[S4 类名统一]
  S4 --> S5a[S5a 按组件拆分]
  S5a --> S5b[S5b 去重与合并]
  S5b --> S5c[S5c 无用样式核查]
  S5c --> S6[S6 主题验收与收尾]
```

- S0 内部可并行：计算样式快照（A）与像素 / 遮罩（B）是两个文件集；`css-layer-report`（S1 的工具部分）与 S0 无文件冲突，可以与 S0 同时写，S1 的根因调查必须等 S0 能运行。
- S2a～S5c 严格串行：它们都改 `shared.css` 或使用它的类名，不同文件不等于互不冲突（共享的是**层叠顺序**这一不变量）。
- 每个切片开始前必须先 `visual:baseline prev`，开始前工作区应是干净的“已验证状态”。若中途需要回退，回到上一个切片结束时保存的快照 SHA（每个切片结束时记录 `git stash create` 的 SHA 与 `visual:compare origin` 结果）。

## 与其他 change 的冲突与冻结

- 本 change 在 S4 会改几乎所有 TSX 的 `className`，而 `origin` 基线要求代码在整个过程中不被别的改动污染。**冻结从 S0 生成 `origin` 之前开始**，持续到 S5c 结束：确认 [任务 Issue 化](../feature_2026-11-13-task-issue-automation/README.md)、[档案文件夹笔记](../feature_2026-11-13-archives-as-folder-notes/README.md)、[智能体启动设置](../feature_2026-11-13-agent-launch-settings/README.md) 三个 change 的代码已经稳定（它们当前都在同一个工作区、未提交）：要么先提交（需要用户授权），要么约定冻结期内不改界面与样式。冻结期内确需改动，则重新生成 `origin` 基线并在 progress.md 记录原因。
- 新界面在 S2a 之后的写法：直接按层与前缀规则写，不进入 `shared.css`。

## 风险与停止条件

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 入层后出现不可调和的反转（Q1） | S2a 出现无法用“移层 / 降特异性 / 白名单”消除的差异，或需要对大量规则加特异性 | 停止，不进入 S3；把根因与候选方案（例如保留 `components` 层不入层、仅 `modules` 入层）交给顾问与用户决定。上一轮就是在这里硬做导致回退 |
| 计算样式快照不稳定（Q3） | 噪声无法遮罩 | 按 verification.md §3 降级并写明覆盖降级；降级后 DSC-03 标为“部分覆盖”，S2a 的验收必须额外增加状态截图抽样 |
| 改名漏改 | 某状态下样式丢失但默认屏幕没发现 | `check-css-classes` 兜底；状态矩阵覆盖悬停 / 焦点；动态类名登记表 |
| 与其他 change 同时修改 | 类名冲突或差异来源不明，`origin` 被污染 | 冻结窗口从 S0 开始；每次比对前确认工作区快照 SHA |
| 运行时注入的第三方样式（CodeMirror、sonner）压过入层规则 | 笔记编辑器、提示条回归（上一轮疑似根因） | S1 的 E0 确认范围，S2a 用不分层白名单承接；运行时样式表导出纳入验证 |
| 时间相关内容使基线不稳 | 月历、逾期、相对时间每次不同 | `page.clock` 固定渲染端时间；无法固定的文字忽略内容、保留盒模型；仍无法稳定则逐屏遮罩并写原因 |
| 基线对应的代码丢失 | 无法解释差异 | `origin/meta.json` 记录提交与快照 SHA；快照 SHA 不会被 gc 前不要清理 |

## 未定部分

[spec.md §10](spec.md) 的 Q1～Q5 是假设与核实办法；Q1、Q2 阻塞 S2a，Q3 阻塞所有切片的验证方式（S0 内解决），Q4、Q5 阻塞 S3 的归属表。其余已决定。

## 完成边界

- 全部切片完成后：`audit` 跑 lint、typecheck、单元测试、全量 e2e；按 CLAUDE.md 请顾问复核；再交付“本地已完成，未提交”的报告。
- 完成之前不得宣称设计系统完成，也不得宣布可以发布 rc；上游 change 的 DS-S2～S4 状态以本 change 的结果为准更新。
- 本 change 不能验证的内容单独列出：非 Linux 平台的渲染、真实用户的长期使用感受。

## 复用核对（CLAUDE.md 复用优先）

| 需要 | ① Huhu 现有 | ② temp/sources | ③ 成熟依赖 | 结论 |
| --- | --- | --- | --- | --- |
| 启动应用并固定视口 | `tests/e2e/helpers/launch.ts`、`screenshots.spec.ts` 的 CDP 视口 | — | Playwright | 沿用；新增确定性 Vault 夹具（现有没有） |
| 像素比对 | 无 | open-knowledge / orca 只有截图，没有比对 | Playwright `toHaveScreenshot` | 用 ③，不自写 PNG 解码（取代上一轮的 Python 脚本） |
| 计算样式断言 | 无 | open-knowledge 有 `getComputedStyle` 断言（`packages/app/tests/foundation/theme-text-contrast.browser.test.tsx`），只是单点断言 | Playwright / CDP | 借鉴思路，快照式整屏比对自写（小范围适配，⑤） |
| 层序结构测试 | `packages/ui/test/theme.test.ts`（漂移测试）风格 | open-knowledge `packages/app/src/globals.suggestion-clip-cascade.test.ts`（解析 `@layer` 块并断言规则所在层） | postcss | 借鉴它的“解析层并断言”写法实现 `check-css-layers`（⑤） |
| CSS 解析与改写 | `scripts/check-ui-colors.mjs`（正则 / 文件扫描） | — | postcss、postcss-selector-parser（传递依赖） | 用 ③，声明为显式依赖 |
| 样式规则检查 | stylelint 16 + `.stylelintrc.json` | temp/sources 无 | stylelint 内置 `selector-class-pattern`、`declaration-no-important`、`no-duplicate-selectors` | 用 ①+③，补规则 |
| 无用 CSS 检测 | 无 | 无 | PurgeCSS（未安装） | 引入 ③ |
| 层导入 | `index.css` 已有 `layer(tokens)`、`layer(base)` | open-knowledge 用 Tailwind 的 layer | Vite 8.3.7 内置 postcss-import 16.2.0 | 沿用 ①+③ |
| 层叠冲突分析 | 无 | 无 | 无现成工具（stylelint 无此规则） | ⑥ 自行开发，规模小（单脚本），且只作静态预警 |
