# S5b 去重与同义类合并

规格：[spec.md](../spec.md) §5“去重合并的安全条件”、DC-D7；DSC-09。
交付：重复选择器合并；`.btn` / `.hu-btn` 这类同义类合并为一个；`class-merge-pending.json` 清空。
依赖：S5a。
边界：`packages/ui/src/styles/components/*.css`、被合并类涉及的 CSS 与 TSX 类名、`.stylelintrc.json`（打开 `no-duplicate-selectors`，去掉 `consecutive-duplicates` 例外）、`class-merge-pending.json`。**不删除“看起来没用”的规则**（S5c）。

## 实施要点

1. 去重：同一选择器（规范化后，同一 at-rule 上下文、同一层）的多个块合并，**后块覆盖前块的同一属性**；若两块之间存在可能命中同一元素、以相同或更高特异性设置同一属性的别的块，不合并（用 `css-layer-report` 的匹配器判断）。
2. 同义类合并（S4 登记在 `class-merge-pending.json` 的组）：逐组判断用旧类的元素在合并后是否仍渲染一致——若两个旧类的规则互不重叠，合并即可；若有重叠且值不同，**以各自元素当前的渲染结果为准**，用修饰类表达差异（如 `hu-btn` + `hu-btn-subtle`），并同步 TSX。每组合并后立即比对。
3. 每合并一批即比对；一组出差异就回滚该组，不累计。

## 验收

- [ ] DSC-09：stylelint 的重复规则 0 违规；规范化选择器在相同上下文与层中出现 ≤ 1 次（脚本输出前后数字）。
- [ ] `class-merge-pending.json` 为空，stylelint 前缀规则不再有临时放行。
- [ ] DSC-02 / DSC-03：`visual:compare origin` 差异 0。
- [ ] 全量 e2e 通过。

## 完成证据

progress.md 追加：合并前后规则数 / 字节数、同义类合并表（旧类、新类、差异如何表达）、比对输出、`audit` 结果与快照 SHA。
