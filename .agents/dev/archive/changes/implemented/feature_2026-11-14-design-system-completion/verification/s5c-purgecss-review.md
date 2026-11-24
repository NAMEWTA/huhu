# PurgeCSS 报告逐条核查（DSC-11）

运行：`pnpm build && node scripts/css-purge.mjs`（PurgeCSS 8.0.0，content = 全部非测试源码；safelist：第三方类 `cm-*` / `ͼ*` / `xterm*` / `katex*` / `mermaid*` / `data-sonner` / `lucide` / `radix` / `react-`，deep 放行其后代；`is-*` greedy 放行）。rejected 共 **130** 条，核查结论：

| 类别 | 数量 | 判定 | 依据 |
| --- | --- | --- | --- |
| 没有类名的选择器（`:focus-visible`、`[data-press]`、`[data-stagger-enter] > …`、`:root[data-motion=…]`） | 14 | 保留 | 靠属性 / 伪类驱动，不是死规则；PurgeCSS 的默认提取器看不到 JSX 属性名 |
| 类名在非测试源码里完全不出现，但以 **模板片段**（`hu-badge-${…}`、`board-${…}` 等）拼出 | 89 | 保留 | 静态分析看不到拼出的名字；第一次尝试把它们当死规则删除，渲染比对立刻发现任务 / 状态色变灰（四主题计算样式失败 132 项），已回退 |
| 属性 / 运行时数据驱动（sonner `data-*`、Radix tooltip `data-state`、`data-density`、`[data-press]`） | 15 | 保留 | 运行时才出现 |
| 判定为无用 | 12 | **仍然保留** | 删除这 12 条后四主题比对仍有 16 项计算样式差异（插件中心的状态徽标宽度、设置·关于页的 `pre` 高度），说明其中至少 `.badge-*` 一族由别处动态使用；没有足够证据逐条证明其余几条无用，所以全部不删 |

**结论**：没有可以靠静态判定安全删除的规则；上一轮（S5c）用 AST 判定删除的 378 条规则已经通过渲染比对验证。`css-purge.mjs` 保留为报告工具，日后判定“无用”必须同时通过渲染比对。完整 rejected 列表与逐条分类见 `s5c-purgecss-review.json`。
