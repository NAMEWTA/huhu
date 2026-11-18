<a id="handling-dynamic-user-triggered-changes-to-sort-order"></a>

# 处理用户触发的动态排序变化

用户操作对列表、卡片网格或表格重排，且没有项目正处于交互中时，使用此模式。它只涵盖将新顺序应用到 DOM（移动节点、动画、播报、性能），不涉及排序计算或触发方式。

<a id="reorder-the-existing-nodes"></a>

## 重排现有节点

**必须：** 将现有 DOM 节点移动到新顺序，不要重新创建。通过 `innerHTML` 或替换节点的重渲染，会丢失焦点、项目内部滚动位置与图片状态，也会破坏依靠元素身份匹配新旧元素的视图过渡。

用 `moveBefore()` 而非 `append()`，让移动项保留 `<iframe>` 内容、播放中动画及内部焦点等状态。

```javascript
// `orderedNodes` is the container's existing child elements in their new order.
function reorder(container, orderedNodes) {
  // Moving each node to the end in order is enough; no need to compute minimal moves.
  for (const node of orderedNodes) container.moveBefore(node, null);
}
```

**不要**用 CSS `order` 或 `flex-direction: row-reverse` 伪造新顺序。视觉与 DOM 必须一致，使键盘和屏幕阅读器顺序跟随用户所见。

<a id="reordering-table-rows"></a>

### 重排表格行

对 `<table>`，在 `<tbody>` 内用同一函数移动 `<tr>`：`reorder(tbody, orderedRows)`。绝不重排 `<thead>` 标题行，也不重建 `<tbody>`。

<a id="optionally-animate-the-reorder-with-view-transitions"></a>

## 可选：用视图过渡为重排添加动画

动画只是增强，没有它重排仍有效。要添加动画，用视图过渡包裹 DOM 重排，并为每项提供唯一 `view-transition-name`，让各项从旧位置动画到新位置。没有名称时列表会跳变。

使用 `view-transition-name: match-element`，无需逐项生成名称。

必须始终通过 `prefers-reduced-motion` 尊重减少动态效果偏好。

View transitions 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 144（2025 年 10 月）和 Safari 18（2024 年 9 月）。

```css
.item {
  /* Derives a unique name from each element's identity. */
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
function reorderWithTransition(list, orderedNodes) {
  const update = () => reorder(list, orderedNodes);

  // Prefer a transition scoped to the list: the rest of the page stays interactive.
  // Fall back to a document-level transition, then to a plain update.
  if (list.startViewTransition) {
    list.startViewTransition(update);
  } else if (document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    update();
  }
}
```

* **快速变化：** 开始新视图过渡会跳过当前过渡，符合用户快速切换选项的需求。始终在更新回调应用最终状态，确保即使跳过动画，DOM 顺序也正确。
* **大列表：** 每个具名元素都会截为图片，数百项命名开销很大。`match-element` 同样给每个匹配元素命名，并不比显式名称便宜。超过几百项时跳过过渡。
* **交互性：** 文档级过渡运行时阻止整页指针事件，`list.startViewTransition()` 只影响列表子树。优先局部形式，且两者都保持短暂。名称仅需在作用域内唯一。表格行应以 `<table>` 或外部包装为作用域。详见 `scoped-component-transitions`（通过 `npx -y modern-web-guidance@latest retrieve "scoped-component-transitions"` 获取）。

<a id="announce-the-change-once"></a>

## 只播报一次变化

重排移动多个节点，但用户只执行一个操作。**不要**给列表添加 `aria-live`，否则会逐项播报。应：

* 添加一个视觉隐藏的 `role="status"`，开始更新后每次重排仅设置一次文本。文本改变前它必须已在 DOM 中。
* 描述结果而非机制，例如“已按价格从低到高排序，共 24 项”。
* 焦点保留在触发控件，不移入列表。
* 让控件自身可读出当前顺序，屏幕阅读器用户聚焦后无需搜索页面即可知道选择。原生 `<select>`、单选按钮已提供；切换按钮用 `aria-pressed`，标签描述当前状态而非操作。

```html
<p id="reorder-status" role="status" class="visually-hidden"></p>
```

```css
/* Hides the status text visually but keeps it available to screen readers. Do not use display: none. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

```javascript
reorderWithTransition(list, orderedNodes);
// Set the message once, not once per item.
status.textContent = `Sorted by price, low to high, ${orderedNodes.length} items`;
```

<a id="performance-on-large-lists"></a>

## 大列表性能

* 成本在布局和渲染，而非计算顺序。单次遍历重排，循环中不要读取布局（`offsetTop`、`getBoundingClientRect()`）。
* 长列表项目添加 `content-visibility: auto` 与 `contain-intrinsic-size`，跳过屏外渲染。
* 大约超过一千项时使用虚拟列表，不要保留所有 DOM 节点。虚拟化时跳过视图过渡。
* 开销大的重排（超大列表，或多个输入共同决定顺序）仅在用户确认时应用，例如“应用”按钮，而非每次输入变化。

<a id="fallbacks"></a>

## 回退方案

Element-scoped view transitions 的浏览器支持：有限可用。
支持版本：Chrome 147（2026 年 4 月）和 Edge 147（2026 年 4 月）。
不支持：Firefox 和 Safari。

目标 Baseline 不支持 `element.startViewTransition()` 时，用 `document.startViewTransition()`；仍不支持则无动画重排。列表仍正确排序，播报不变，因此是优雅降级：动画增强体验，但并非核心。

moveBefore() 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 144（2025 年 10 月）。
不支持：Safari。

不支持 `moveBefore()` 时使用 `append()`。DOM 顺序相同，但内部可能丢失焦点、iframe 或动画状态，仅在项目包含这些状态时有影响。

```javascript
function reorder(container, orderedNodes) {
  const move = Object.hasOwn(Element.prototype, 'moveBefore')
    ? (node) => container.moveBefore(node, null)
    : (node) => container.append(node);

  for (const node of orderedNodes) move(node);
}
```
