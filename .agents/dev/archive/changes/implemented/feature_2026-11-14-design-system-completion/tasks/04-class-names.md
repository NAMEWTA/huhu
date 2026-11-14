# S4 类名统一

规格：[spec.md](../spec.md) §3.3、§5“改名用 codemod”、DC-D6、DC-D7；DSC-07、DSC-08、DSC-10。
交付：全部类名符合前缀规则；TSX 中没有悬空类名；e2e 不再依赖项目类名；stylelint 强制前缀。
依赖：S3（每个类只有一个归属之后，改名才是单包内的事）。
边界：全部 CSS 与 TSX 中的 `className` / 类名片段；`tests/**` 的定位器；`.stylelintrc.json`；`scripts/check-css-classes.mjs`；`scripts/css-dynamic-classes.json`；本 change 的 `class-map.json`。**不改规则内容与顺序，不改外观。**

## 背景

现状：`shared.css` 类名中以 `hu-` 开头的仅 6 个，其余带历史前缀（`knowledge-` 97、`execution-` 53、`tw-` 39、`vault-`、`huhu-`、`review-`、`storage-`、`version-`、`v9-` 等），还有 43 个 TSX 字面量类名没有定义（含 `hu-meta` 23 处）。`archive-undefined`、`version-v9-file-row` 之类的名字携带历史阶段信息，要换成按归属的名字。

## 实施要点

1. 生成 `class-map.json`：旧名 → 新名、归属、依据、备注。命名规则见 spec §3.3；同义类（`.btn` 与 `.hu-btn` 并存等）**本切片不合并**：登记到 `class-merge-pending.json`（保留旧名，stylelint 前缀规则对该清单临时放行），在 S5b 单独合并并验证。映射表先评审（顾问或用户）再执行。
2. 悬空类名：对 43 个 TSX 字面量类名逐个决定“补样式”还是“删类名”，判据是**当前渲染结果不变**——没有样式的类，删除即不变；有意义的语义标记类（给测试或 a11y 用）改为 `data-*` 属性。`hu-meta`（23 处）与 `hu-row` 等先核对它们是否被后代选择器间接样式化。
3. codemod：CSS 侧 `postcss-selector-parser` 改类；TS / TSX 侧 TS AST 改字符串字面量、模板字面量中的静态片段，**扫描范围**：`className`、`classList`、`querySelector(All)` / `closest` / `matches`、`packages/editor/src/**` 里 Decoration 的 `class:` 键、JS 拼出的 HTML 字符串（Markdown / Mermaid 渲染）、`tests/**`（已知至少 9 处 DOM 查询与约 21 处编辑器类名）；动态拼接（`tw-${status}`）按 `css-dynamic-classes.json` 的登记逐条改，找不到登记项则失败。改完立即 `visual:compare origin`。
4. e2e：56 处依赖 CSS 类的定位器，除第三方类（`.cm-*`、`.xterm-*`）外改为 `getByTestId` / `getByRole`，缺少 testid 的在 TSX 补 `data-testid`（按现有 testid 命名风格）；等价性比对的元素键不含 testid，所以不影响基线。
5. stylelint：`selector-class-pattern` 按目录配置前缀（见 spec §3.3 表），第三方类与状态类白名单放行；`pnpm lint` 接入 `check-css-classes.mjs`（悬空类检查）。
6. 分批执行：按归属一批一批（notes、tasks、…、workbench、ui 最后，因为共享组件类影响面最大），每批 `visual:compare origin` 为 0 才继续。

## 验收

- [ ] DSC-02 / DSC-03：每批与最终 `visual:compare origin` 差异 0。
- [ ] DSC-07：`pnpm lint` 全仓库前缀 0 违规；故意在 `tasks.css` 写 `.row {}` 失败。
- [ ] DSC-08：`check-css-classes` 通过：TSX 字面量类名 100% 有定义；CSS 类名要么在 TSX 出现、要么在动态登记表、要么是第三方。
- [ ] DSC-10：`tests/**` 里除第三方类外没有 CSS 类名定位器；全量 e2e 通过（含 `a11y.spec.ts`）。
- [ ] `git grep` 不再出现 `version-v9`、`storage-view-v6`、`tw-`、`execution-`、`archive-undefined` 等历史名字（以 `class-map.json` 的旧名清单为准，逐个核对）。
- [ ] `class-map.json` 中每个旧名的新名在 TSX 与 CSS 里都出现，且旧名在仓库中为 0 处（`class-merge-pending.json` 登记的组除外，它们在 S5b 清零）。

## 完成证据

progress.md 追加：`class-map.json` 的条目数与评审记录、每批比对输出、悬空类名处理表（补 / 删 / 改属性）、e2e 定位器改动统计、`audit` 结果与快照 SHA。
