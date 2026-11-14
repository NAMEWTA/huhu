# 设计系统（现行规范）

> 取代归档的 `design-system.md` 中与主题相关的部分；来源与取舍见 `changes/2026-11-13-brand-and-windows-installer`。

## 主题 = 数据
- 四套主题（Claude、Apple、Notion、Vercel），每套有浅色与深色：`packages/ui/src/themes/<id>.ts`，字段由 `schema.ts`（zod）约束；`extends` 可以只改动部分字段。
- 生成器 `scripts/gen-themes.ts`（OKLab，culori）把核心色生成完整 token（含 accent-text、状态与标签底色 / 文字色、`term-*`、`syntax-*`、`diff-*`、`danger-fg`）→ `styles/themes.generated.css`（提交进仓库，由漂移测试守护）。运行 `pnpm gen:themes`。
- 新增 / 自定义配色：加一个主题文件并登记到 `themes/index.ts` 与 `contracts/settings.ts` 的 `THEME_IDS`，`pnpm gen:themes`，对比度测试（`packages/ui/test/theme.test.ts`）会检查：正文 ≥ 7、次要文字与 faint ≥ 4.5（在 bg / panel / sidebar / muted-bg 上）、按钮与链接文字 ≥ 4.5、危险按钮文字 ≥ 4.5。
- 外观由 `AppearanceController`（`packages/ui/src/theme.ts`）统一管理：`<html data-theme data-mode>`，跟随系统实时生效，首帧用 localStorage 缓存避免闪烁。

## 样式（最终规范，2026-11-14）

### 层与文件
- 层序：`@layer theme, tokens, base, vendor, components, shell, modules;`（每个分层文件第一行重复这条声明，层序不依赖导入顺序）。
  - `theme`、`tokens`、`base`：生成的主题、共享 token、重置与全局基础。
  - `vendor`：**静态**第三方 CSS（xterm、katex，由使用它的包以 `@import … layer(vendor)` 引入）。
  - `components`：共享组件样式 `packages/ui/src/styles/components/{core,overlays,data,feedback}.css`，以及 33 条“优先级依赖原特异性、无法放进更高层”的规则（登记在 `.agents/dev/changes/2026-11-14-design-system-completion/evidence/s3-stay-in-components.json`，它们分散在 `shell.css` 与各插件 CSS 末尾的 `@layer components` 块里）。
  - `shell`：工作台（`packages/workbench/src/shell/shell.css`）；`modules`：插件 `plugins/<id>/src/ui/<id>.css` 与编辑器 `packages/editor/src/editor.css`。
- **不分层白名单**（唯二）：`packages/ui/src/styles/vendor-overrides.css`（覆盖 sonner）与 `packages/editor/src/editor-cm.css`（覆盖 CodeMirror 与编辑器 DOM 内的装饰类）。原因：CodeMirror、sonner 在**运行时**注入无层样式，不分层的普通声明永远压过分层声明，覆盖规则放进层里会失效。只能写第三方选择器。
- `!important` 只允许两种：减少动效、覆盖元素的内联样式 / 第三方样式；必须用 `/* stylelint-disable declaration-no-important -- 原因 */` 说明（`reportDescriptionlessDisables` 开启）。

### 类名
- 共享组件 `hu-`；工作台 `shell-`；插件用插件前缀（`notes-`、`tasks-`、`automations-`、`inbox-`、`safe-`、`ssh-`、`version-`、`agent-`）；编辑器自有 `editor-`；状态类白名单（`active`、`selected`、`is-*` …）；第三方类（`cm-*`、`xterm*`、`katex*`、`mermaid*`、`[data-sonner-*]`）原样放行。
- 历史类名中不能安全改名的登记在 `scripts/css-class-exceptions.json`（带原因）；跨包共用却定义在某个包里的类登记在 `scripts/css-ownership-exceptions.json`。新增的违规会让 `pnpm lint` 失败。
- 现有 `hu-` 类名多沿用历史名字（如 `hu-knowledge-resource-footer`），语义命名是后续工作。

### 守护（`pnpm lint`）
`check-ui-colors`（无颜色字面量）、`check-css-layers`（除两个白名单文件外规则都在层里）、`check-css-classes`（前缀、悬空类名）、`check-css-ownership`（样式归属与 `shared.css` 不存在）、stylelint（含 `declaration-no-important`）。

### 迁移样式的唯一可靠办法：渲染等价性验证
- `pnpm visual:baseline <name> [--themes a,b]` / `pnpm visual:compare <name>`：固定 Vault（`tests/visual/fixture.ts`），逐元素比较计算样式（含悬停 / 焦点 / 按下状态的整棵子树与祖先链）、10 个宽度、compact、reduced-motion，并做像素比对（`tests/visual/masks.ts` 里有容差与遮罩的原因）。基线保存在 `.visual/<name>/`（不进 git）。
- 经验：**层序先于特异性**，把规则分进更高的层会让低特异性规则赢过高特异性规则——这是上一轮回归的原因之一；运行时注入的无层样式是另一个。分层、归位、改名、拆文件每一步都必须与冻结基线比对为零差异。
- 嵌套在别的视图里的对话框会继承外层的后代选择器：写 `.x h2` 这类后代选择器要限定到直接子元素或专用容器。

## 已知债务
见 `.agents/dev/changes/2026-11-14-design-system-completion/progress.md`“偏差与未做”：`core.css` 未再细拆；`card` / `row` / `segmented` / `spin` 与已有 `hu-` 类并存；覆盖率交叉未做；规则级去重未做；`pnpm css:purge` 是报告工具，判定“无用”必须再过渲染比对（模板片段拼出的类名会被误判）。
