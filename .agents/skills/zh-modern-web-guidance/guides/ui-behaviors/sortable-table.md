<a id="sortable-table"></a>

# 可排序表格

此模式让用户点击列标题排序数据表。从无 JavaScript 也可读的完整语义 `<table>` 开始，再增强。

本指南涵盖标题控件、排序状态、逻辑及应用 DOM 顺序。移动时保持行内状态参见 `move-dom-element-without-losing-state`（通过 `npx -y modern-web-guidance@latest retrieve "move-dom-element-without-losing-state"` 获取）。其他窄屏表格模式参见 `responsive-table`（通过 `npx -y modern-web-guidance@latest retrieve "responsive-table"` 获取）。

非表格的列表和卡片网格排序参见 `dynamic-sort`（通过 `npx -y modern-web-guidance@latest retrieve "dynamic-sort"` 获取）。

<a id="header-markup"></a>

## 标题标记

* **必须：** 每个可排序 `<th scope="col">` 内放 `<button type="button">`。不要让 `<th>` 自身可点击，不用 `<a>` 或 `role="button"`。
* 仅在当前排序列的 `<th>` 上设置 `aria-sort="ascending"` 或 `aria-sort="descending"`，并从其他表头移除该属性。不要设置 `aria-sort="none"`，也不要把 `aria-sort` 放到按钮上。
* 不可排序列保持普通 `<th>` 文本，无按钮。其内边距、对齐、字重与可排序标题一致；只对 `th:has(> button)` 去掉单元格内边距，因为按钮已提供。
* 保留 `<caption>` 作为无障碍名称，数据行放在 `<tbody>`，确保只排正文而不动 `<thead>`。
* 排序方向使用装饰图标（`aria-hidden="true"`、`currentColor`，参见 `icons`，通过 `npx -y modern-web-guidance@latest retrieve "icons"` 获取）。由 CSS `th[aria-sort]` 驱动外观，不用额外类或 JS。图标只视觉可见，因此始终通过 `<th>` 上的 `aria-sort` 向辅助技术传达排序状态。
* 按钮目标至少 24px，具有 `:focus-visible` 轮廓，填满单元格。

<a id="wire-buttons-with-invoker-commands"></a>

## 用 Invoker Commands 连接按钮

使用指向表格的 `commandfor` 和自定义 `--sort`（自定义命令必须以 `--` 开头）。表格上一个 `command` 监听器处理，替代逐按钮点击监听。`event.source` 是被激活按钮。

```html
<th scope="col" data-type="number">
  <button type="button" commandfor="planets" command="--sort">
    Moons
  </button>
</th>
```

```javascript
table.addEventListener('command', (event) => {
  if (event.command !== '--sort') return;

  const th = event.source.closest('th');
  const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';

  for (const header of table.tHead.rows[0].cells) header.removeAttribute('aria-sort');
  th.setAttribute('aria-sort', direction);

  const rows = sortRows([...tbody.rows], th.cellIndex, th.dataset.type, direction);
  reorderWithTransition(rows);
  // One message per sort; the status element must already be in the DOM.
  status.textContent = `Sorted by ${event.source.textContent.trim()}, ${direction}, ${rows.length} rows`;
});
```

* 首次激活升序，重复激活切换方向；换列重新升序。
* 焦点保留在激活的标题按钮。

<a id="compare-values-correctly"></a>

## 正确比较数值

* 文本用 `Intl.Collator`（`numeric: true, sensitivity: 'base'`），不用 `<` 或循环 `localeCompare`。
* 数字、日期和货币按数字比较。显示文本格式化时（如 `12,104`、`$1.2k`），从 `data-value` 或 `<time datetime>` 读取原始值。
* 每列通过 `data-type` 声明类型，不猜内容。
* `Array.prototype.sort` 稳定，相等行保留此前相对顺序。

```javascript
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortRows(rows, index, type, direction) {
  const factor = direction === 'ascending' ? 1 : -1;
  // Prefer the raw value when the displayed text is formatted.
  // This reads the DOM on every comparison; for large tables, read each row's value once before sorting.
  const value = (row) => row.cells[index].dataset.value ?? row.cells[index].textContent.trim();
  return rows.sort((a, b) =>
    factor * (type === 'number' ? value(a) - value(b) : collator.compare(value(a), value(b)))
  );
}
```

<a id="reorder-the-existing-rows"></a>

## 重排现有行

**必须：** 在 `<tbody>` 内移动现有 `<tr>` 元素。不要通过 `innerHTML` 或重渲染重建表格或 `<tbody>`，这会丢失内部焦点和状态，并破坏按身份匹配元素的视图过渡。绝不移动标题行。

```javascript
// Moving every row to the end in sorted order is enough; no need to compute minimal moves.
function reorder(container, orderedRows) {
  for (const row of orderedRows) container.moveBefore(row, null);
}
```

**不要**用 CSS `order` 伪造顺序，DOM 必须匹配视觉，服务键盘和屏幕阅读器用户。

<a id="optionally-animate-the-reorder"></a>

## 可选：重排动画

动画是增强，排序本身不依赖。何时动画、减少动态及快速点击行为参见 `dynamic-sort`（通过 `npx -y modern-web-guidance@latest retrieve "dynamic-sort"` 获取）。大表格跳过动画。

```css
tbody tr {
  /* Derives a unique name from each row's identity. */
  view-transition-name: match-element;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none;
  }
}
```

```javascript
// Scoped to the table so the rest of the page stays interactive during the animation.
function reorderWithTransition(rows) {
  table.startViewTransition(() => reorder(tbody, rows));
}
```

* **不要**在表格放 `aria-live`，否则逐行播报。改用单个 `role="status"`，通过 `clip-path: inset(50%)` 和 1px 尺寸视觉隐藏，不用 `display: none`。

<a id="narrow-screens"></a>

## 窄屏

将表格放入水平滚动容器（`overflow-x: auto`），设置 `role="region"`、通过 `aria-labelledby` 引用 caption 命名，以及 `tabindex="0"` 让键盘可滚动。表格设 `min-inline-size` 防止列塌缩。

<a id="common-mistakes"></a>

## 常见错误

* **不要**在排序时重渲染 `<tbody>` 或 `<table>`，会丢状态、焦点并破坏过渡。
* **不要**表格设 `aria-live` 或逐行播报。
* **不要**给多个标题保留 `aria-sort`。
* **不要**将按钮名称改为“升序排序”等动作。保留列名，由 `aria-sort` 传达状态。
* **不要**将底层为数字或日期的格式化字符串直接排序。

<a id="fallbacks"></a>

## 回退方案

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

目标 Baseline 不支持时，为每个表头按钮添加 `click` 监听器，运行同一个排序函数，行为相同。两种路径都依赖 JS，若表格必须无脚本也完全可读，应由脚本添加按钮。

Element-scoped view transitions 的浏览器支持：有限可用。
支持版本：Chrome 147（2026 年 4 月）和 Edge 147（2026 年 4 月）。
不支持：Firefox 和 Safari。

moveBefore() 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 144（2025 年 10 月）。
不支持：Safari。

目标 Baseline 不支持 `moveBefore()` 或元素作用域视图过渡时，遵循 `dynamic-sort`（通过 `npx -y modern-web-guidance@latest retrieve "dynamic-sort"` 获取）回退，表格仍排序且播报不变。
