# SP-2 Tailwind v4 限定在 `.ok-root`（S2a，2026-11-15）——**部分通过**

实现：`scripts/ok-css-build.mjs` 从上游 `globals.css`（7079 行）生成 `packages/editor/src/ok/ok-globals.css`（首部 `@import "tailwindcss"` → 分层、不带 preflight 的导入；`@source` 改指 vendor）。构建期 `packages/editor/build/ok-scope-plugin.mjs`（PostCSS）把 `:root / html / body / 裸 *` → `.ok-root`，顶层手写规则包进 `@layer vendor.ok-rules`，Tailwind 的 theme / utilities 进 `vendor.ok-theme` / `vendor.ok-utilities`。`@layer vendor.ok-*` 子层写法在 Vite 8 / Lightning CSS 下可行（构建通过，无需退回顶层 `ok-*` 层）。

| 项 | 结果 |
| --- | --- |
| 产出 CSS 大小 | 267 KB（gzip 43 KB）；非知识库页面不加载（CSS 随编辑器懒加载块，S2b 接线） |
| `scripts/check-ok-class-collisions.mjs <built.css>`：C 类（`.ok-root` 之外的全局 / 变量规则） | **0**（修正过两次：`:before/:after`、`html <descendant>`；`::backdrop` 是伪元素无法限定，只声明 `--tw-*` 初值，已豁免） |
| A 类（OK 类名 ∩ Huhu CSS 类名） | 11：`cm-content / cm-editor / cm-gutterElement / cm-gutters / cm-line / cm-lineNumbers / cm-scroller / cm-search / cm-searchMatch / cm-searchMatch-selected`（两边都是 CodeMirror 6 的类，规则互补）与 `grow`（语义相同） |
| B 类（Huhu TSX 里用了、但 Huhu 没有任何 CSS 规则，OK 的工具类会给它加规则） | 2：`text-link`（OK 的变量只在 `.ok-root` 内定义，外部 `color: var(--…)` 无效 → 继承，无可见变化）、`ok-root`（本方案自己的类） |
| 项目 CSS 守护（`check-css-layers / classes / ui-colors / ownership / duplicates`） | 全部通过；vendor 目录与生成的 `ok-globals.css` 被显式排除（5 个脚本各一行） |
| OK 变量不落 `:root` | 构建产物中 `:root / html / body` 规则 0 条（C 类 = 0 的一部分） |

**未做（如实）**：`pnpm visual:compare rc4` 的“非知识库屏幕 0 差异”断言——`rc4` 基线（S0 项）尚未生成；且 S2a 阶段 vendor CSS 还没有被 Huhu 应用代码引用（S2b 才接线），现在做这个对比没有信息量。该断言移到 S2b 末。OK 的 7000 行 globals.css 目前**整体**保留（经作用域化），没有裁剪到“被引用部分”——体积评估留给 S8。
