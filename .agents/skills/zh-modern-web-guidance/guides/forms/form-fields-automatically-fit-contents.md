<a id="form-fields-automatically-fit-contents"></a>
# 让表单字段自动适应内容尺寸

默认情况下，`<input>`、`<textarea>` 和 `<select>` 等表单控件具有固定尺寸。无论用户输入或选择多少内容，它们的大小都保持不变。

要让这些控件自动缩小或增大以适应内容（包括占位文本），可以使用 CSS 属性 `field-sizing: content`。

<a id="auto-sizing-form-controls"></a>
### 自动调整表单控件尺寸

为 input、select 或 textarea 设置 `field-sizing: content`，可以在用户键入或选择选项时动态调整大小。不过，要获得可靠的用户体验，必须考虑继承样式、默认布局以及最小和最大尺寸约束。

为防止布局问题，建议在文本输入框上设置 `field-sizing: content` 时，同时指定 `min-inline-size`（或 `min-width`）和 `max-inline-size`（或 `max-width`）。最小尺寸可以防止空输入框收缩到零宽度而无法点击，最大尺寸则确保它不会无限扩张并破坏页面布局。

对于 textarea，允许横向自动调整尺寸可能造成突兀的体验，例如带有较长占位文本的 textarea 会在用户输入一个字符时突然横向缩小。为避免这种情况，请为 textarea 设置明确宽度（例如 `width: 100%`）。这样可让它保持稳定的水平宽度，同时仍随内容换行而自动调整垂直高度。

建议对使用 `field-sizing: content` 的 `<select>` 元素设置 `max-inline-size`（或 `max-width`），避免选中极长选项时破坏页面布局。

```css
/* Applies horizontal auto-sizing to inputs */
input {
  /* Instructs the element to size itself to fit its content */
  field-sizing: content;

  /* Reset explicit width if inherited from global styles */
  width: auto;

  /* Prevents the input from collapsing and disappearing when empty */
  min-inline-size: 15ch;

  /* Prevents infinite horizontal growth */
  max-inline-size: 50ch;
}

textarea {
  /* Instructs the element to size itself to fit its content */
  field-sizing: content;

  /* Reset explicit height if inherited from global styles */
  height: auto;

  /* Use a fixed width to prevent jarring horizontal shifts when replacing a long placeholder */
  width: 50ch; /* or 100% depending on your layout */

  /* Sets a reasonable minimum height (e.g., 3 lines) for empty textareas */
  min-block-size: 3lh;

  /* Prevents infinite vertical growth. Once a textarea hits this */
  /* height, it will stop growing and show a vertical scrollbar. */
  max-block-size: 10lh;
}

select {
  /* Sizes the select element to fit the active option only */
  field-sizing: content;

  /* Prevents the dropdown from expanding infinitely and breaking the layout */
  max-inline-size: 50ch;
}
```

重要：明确指定的 `width` 和 `height` 属性会在所有表单控件上覆盖 `field-sizing: content`。如果项目的全局 CSS 将 input、select 或 textarea 设置为 `width: 100%`，则必须在使用 `field-sizing: content` 的元素上明确重设为 `width: auto`（或 `width: fit-content`），自动尺寸才会生效。同样，如果之前在全局设置了固定高度，就应为 textarea 明确设置 `height: auto`。

重要：Grid 和 Flexbox 布局通常会隐式拉伸子元素，使其填满可用空间。如果使用 `field-sizing: content` 的表单控件无法缩小，请检查其容器的对齐属性，并对控件应用 `align-self: start` 或 `justify-self: start`，覆盖拉伸行为。

<a id="fallback-strategies"></a>
### 回退策略

field-sizing 的 Baseline 状态：新近可用。自 2026-06-16 起达到 Baseline。
支持：Chrome 123（2024 年 3 月）、Edge 123（2024 年 3 月）、Firefox 152（2026 年 6 月）和 Safari 26.2（2025 年 12 月）。

应把 `field-sizing` 视为渐进增强。在不支持该属性的浏览器中，表单控件会平稳退回默认的固定尺寸行为。对于固定大小的 input 和 textarea 中溢出的内容，用户将使用标准滚动方式查看。

如果旧浏览器也必须支持动态增长的字段，就需要使用特性检测和较复杂的变通方案。对 textarea 而言，最稳健的回退方案是利用 CSS Grid：使用隐藏伪元素实时镜像用户输入，迫使网格容器及其内部的 textarea 一起扩展。

```html
<!-- The textarea is wrapped in a container that will mirror its value -->
<div class="growable-textarea" data-replicated-value="">
  <textarea></textarea>
</div>
```

```javascript
// Only attach the fallback event listeners if field-sizing is unsupported
if (!CSS.supports('field-sizing', 'content')) {
  document.querySelectorAll('.growable-textarea > textarea').forEach(textarea => {
    textarea.addEventListener('input', () => {
      textarea.parentNode.dataset.replicatedValue = textarea.value;
    });
  });
}
```

```css
/* Only apply the fallback if field-sizing is NOT supported */
@supports not (field-sizing: content) {
  .growable-textarea {
    display: grid;
  }

  /* The pseudo-element and textarea must share the exact same cell, font, and padding */
  .growable-textarea::after,
  .growable-textarea > textarea {
    grid-area: 1 / 1 / 2 / 2;
    font: inherit;
    padding: 0.5rem;
    border: 1px solid #999;
  }

  /* The pseudo-element renders the copied text invisibly to stretch the grid */
  .growable-textarea::after {
    /* The space is necessary for trailing empty lines to be rendered */
    content: attr(data-replicated-value) " ";
    white-space: pre-wrap;
    visibility: hidden;
  }

  .growable-textarea > textarea {
    resize: none;
    overflow: hidden;
  }
}
```

为每种表单控件复制样式并在 DOM 节点之间同步状态较为复杂。因此，除非动态尺寸对用户体验至关重要，否则大多数应用都建议依赖固定输入框的默认回退行为。
