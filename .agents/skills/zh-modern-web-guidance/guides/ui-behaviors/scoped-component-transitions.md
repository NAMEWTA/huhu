<a id="scoped-component-transitions"></a>

# 局部组件过渡

`document.startViewTransition()` 将 `::view-transition` 覆盖层附着到 `:root`，阻止页面其他区域指针事件，无法并发过渡，并遮住 `position: fixed` 页头或已打开 `[popover]`，即使用嵌套过渡组防止溢出也如此。

在组件根调用 `element.startViewTransition()`，可把过渡限定到该 DOM 子树：`::view-transition` 伪元素树直接注入该元素，保留外部层叠上下文和页面交互，允许多个组件同时过渡。

<a id="implementation"></a>

## 实现

<a id="1-trigger-a-scoped-transition"></a>

### 1. 触发局部过渡

在组件根容器元素上调用 `element.startViewTransition()`，而非 `document.startViewTransition()`。调用 `startViewTransition()` 的元素成为过渡的作用域元素：只有其子树中的元素会被截取，更新回调期间只暂停该作用域的渲染，生成的 `::view-transition` 覆盖层匹配作用域元素的尺寸、形状和层叠上下文。

<a id="2-name-participating-elements"></a>

### 2. 命名参与元素

为作用域内需动画的子元素分配 `view-transition-name`。动态列表项可用 `view-transition-name: match-element` 根据 DOM 节点身份自动生成过渡名称，也可显式命名，仅需作用域内唯一。

名称在各作用域隔离，避免不同组件冲突。但 `view-transition-name` 仍可能与嵌套局部视图过渡中的名称冲突，应给子作用域元素添加 `view-transition-scope: all`。

<a id="3-self-participation-and-overflow-clipping"></a>

### 3. 自身参与与溢出裁剪

作用域元素自动参与自身过渡，因为用户代理为其设置 `view-transition-name: root` 和 `view-transition-group: contain`。这样 DOM 更新影响自身几何时，它会与子元素一起平滑动画。

当作用域裁剪溢出（`overflow: hidden`、`scroll` 或 `clip`），`::view-transition-group-children(root)` 自动应用 `overflow: clip`，防止过渡子元素超出组件。

> [!NOTE]
> 自动裁剪仅适用于作用域本身（`root`）。若作用域内部某个被截取元素裁剪自身溢出，并包含其他被截取的嵌套元素（例如 `.card` 内可滚动或裁剪的 `<ul>`），需用嵌套视图过渡组，让嵌套元素仍受外层截取容器裁剪：
>
> ```css
> .card ul {
>   height: 200px;
>   overflow-y: auto;
>   view-transition-name: match-element;
>   view-transition-group: contain;
>   view-transition-class: list;
> }
>
> ::view-transition-group-children(.list) {
>   overflow: clip;
> }
> ```

<a id="4-concurrent-and-nested-transitions"></a>

### 4. 并发与嵌套过渡

独立组件子树可以同时运行 `element.startViewTransition()`，不互相跳过。活动作用域由用户代理自动赋予 `view-transition-scope: all`，防止内部 `view-transition-name` 值泄漏到外层过渡。重复组件容器应在 CSS 中应用 `view-transition-scope: all`，即使空闲时也防止外层截取内部名称。

若外层需要在内部过渡运行时移动组件，给包裹内部作用域的包装元素设置 `view-transition-name`。外层只截取和动画包装而非内部作用域，让内部过渡运行完成。

<a id="example"></a>

## 示例

作用域元素（`.card` 或 `.card ul`）自身无需 CSS 来建立范围；范围由在元素而非 `document` 上调用 `startViewTransition()` 决定。组件嵌在外层视图过渡中时，参见[运行外层过渡](#running-an-outer-transition)中 `view-transition-scope: all`。

```css
/* 1. Name participating child items */
.card ul li {
  view-transition-name: match-element;
}

/* 2. OPTIONAL: Customize transition timing (300ms is an example duration) */
::view-transition-group(*) {
  animation-duration: 300ms;
  animation-timing-function: ease-in-out;
}

/* 3. MANDATORY: Respect user preference for reduced motion */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

```javascript
// 1. Trigger a transition scoped to a single component subtree
function runScopedTransition(scopeEl, updateDOM) {
  // MANDATORY: Call startViewTransition on the component element, not document
  const transition = scopeEl.startViewTransition(() => {
    updateDOM();
  });

  // Re-triggering startViewTransition() on the same element skips the active transition
  // and rejects `ready`. Catch the rejection to avoid unhandled promise rejection errors.
  transition.ready.catch(() => {});
}

// 2. Reorder items by moving existing DOM nodes (required for `match-element`)
// Scope to `listEl` since only the list order changes, keeping controls outside `listEl` interactive
function reorderItems(listEl, orderedIds) {
  const existing = new Map(
    Array.from(listEl.children, (li) => [li.dataset.id, li]),
  );

  runScopedTransition(listEl, () => {
    for (const id of orderedIds) {
      const li = existing.get(id);
      if (li) listEl.appendChild(li);
    }
  });
}

// 3. Remove an item while preserving exit animation and keyboard focus
// Scope to the outer `cardEl` so the card itself also transitions its height change
function removeItem(cardEl, itemEl) {
  const hadFocus = itemEl.contains(document.activeElement);
  const nextFocusTarget =
    itemEl.nextElementSibling?.querySelector('button') ??
    itemEl.previousElementSibling?.querySelector('button') ??
    cardEl.querySelector('button');

  runScopedTransition(cardEl, () => {
    itemEl.remove();
    if (hadFocus) {
      nextFocusTarget?.focus();
    }
  });
}
```

<a id="running-an-outer-transition"></a>

## 运行外层过渡

在预期作用域之外启动过渡（父组件或文档级）时，外层会截取并动画作用域元素及内部全部内容。

要避免，给作用域增加独立包装，包装拥有自身的 `view-transition-name`，内部作用域设置 `view-transition-scope: all`。这样外层可截取动画包装，但不截取内部内容。

```html
<div class="page" id="page">
  <div class="card-wrapper">
    <section class="card" id="left">
      <h2>Card A</h2>
      <ul id="left-list">
        <li>…</li>
      </ul>
    </section>
  </div>
  <div class="card-wrapper">
    <section class="card" id="right">
      <h2>Card B</h2>
      <ul id="right-list">
        <li>…</li>
      </ul>
    </section>
  </div>
</div>
```

```javascript
document.querySelector('#page').startViewTransition(() => {
  // do your DOM updates here...
});
```

```css
/* Apply a view-transition-name on the wrapper */
.card-wrapper {
  view-transition-name: match-element;
}

/* Prevent the contents of the card being captured by an outer transition */
.card {
  view-transition-scope: all;
}

.card ul li {
  view-transition-name: match-element;
}
```

也可允许外层截取子元素。要保留裁剪，使用嵌套过渡组在包装边界裁剪被截取子元素；此时必须手动为生成的 `::view-transition-group-children()` 应用 `clip`。

```css
.card-wrapper {
  overflow: clip;
  view-transition-name: match-element; /* Capture me as part of the outer VT */
  view-transition-group: contain; /* Nest children that also have a view-transition-name */
  view-transition-class: card; /* For targeting purposes */
}

/* Manually copy back the clip onto the ::view-transition-group-children pseudo */
::view-transition-group-children(.card) {
  overflow: clip;
}

.card ul li {
  view-transition-name: match-element;
}
```

<a id="constraints--accessibility"></a>

## 约束与无障碍

- **必须：** 在组件根元素而非 `document` 上调用 `startViewTransition()`，确保外部 `position: fixed` 元素和 `[popover]` 覆盖层保持在上方，页面其余部分仍可交互。
- **必须：** 使用 `view-transition-name: match-element` 时保留并移动现有 DOM 节点，不用 `innerHTML` 重建，因为 `match-element` 跟踪的是 DOM 节点身份。
- **必须：** 尊重减少动态效果，在 `@media (prefers-reduced-motion: reduce)` 中，为 `::view-transition-group(*)`、`::view-transition-old(*)` 和 `::view-transition-new(*)` 设置 `animation: none !important`。
- **必须：** 过渡移除聚焦元素时，在更新回调将焦点移到相邻项目或控件。
- **要：** 作用域内被截取元素裁剪自身溢出且含嵌套被截取元素时，使用嵌套过渡组（`view-transition-group: contain`，以及 `::view-transition-group-children()` 上 `overflow: clip`）。
- **要：** 快速交互可能在同一作用域元素上重复触发 `element.startViewTransition()` 时，附加 `transition.ready.catch(() => {})`。
- **要：** 内部过渡运行时外层需动画组件位置，则用独立具名包装包住内部作用域。
- **不要：** 对裁剪溢出（`overflow: hidden`、`scroll` 或 `clip`）或改变自身几何形状的作用域元素设置 `view-transition-name: none`，退出自身参与会禁用自动裁剪。

<a id="fallback-strategies"></a>

## 回退策略

Element-scoped view transitions 的浏览器支持：有限可用。
支持版本：Chrome 147（2026 年 4 月）和 Edge 147（2026 年 4 月）。
不支持：Firefox 和 Safari。

View transitions 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 144（2025 年 10 月）和 Safari 18（2024 年 9 月）。

目标 Baseline 不支持局部过渡时，立即运行 DOM 更新回调而不动画，优雅降级。虽然可回退到 `document.startViewTransition()`，但独立组件更新不推荐这样做，因为会阻止并发组件过渡，并遮挡顶层中的 `position: fixed` 和 `[popover]` 元素。

```javascript
// Feature detect specifically on Element.prototype (not document.startViewTransition)
const supportsScopedTransition = 'startViewTransition' in Element.prototype;

function runWithTransition(scopeEl, updateDOM) {
  if (!supportsScopedTransition) {
    // Fallback: apply the DOM update immediately without animation
    updateDOM();
    return;
  }

  const transition = scopeEl.startViewTransition(() => {
    updateDOM();
  });

  transition.ready.catch(() => {});
}
```

确实需要使用 `document.startViewTransition()` 回退时，必须按[运行外层过渡](#running-an-outer-transition)保留容器裁剪。此回退会破坏多过渡并发能力，并遮挡顶层 `position: fixed` 和 `[popover]`。