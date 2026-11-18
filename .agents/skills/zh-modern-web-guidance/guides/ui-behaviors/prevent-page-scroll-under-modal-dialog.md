<a id="prevent-the-page-underneath-a-modal-dialog-from-scrolling"></a>

# 阻止模态对话框下方页面滚动

`showModal()` 打开 `<dialog>` 后，浏览器将其提升到顶层，并把文档其余部分设为 inert。这阻止底层页面点击和键盘聚焦，却不阻止滚动：

1. 指针或触摸位于 `::backdrop` 上时，滚动会移动底层页面。
2. `<dialog>` 内滚动到边界后会传递到底层页面；内容没有溢出时则立即传递。

CSS Overscroll Behavior 规范规定，`overscroll-behavior` 适用于**所有滚动容器**，包括不可滚动容器（`overflow: hidden`，或内容暂未溢出的 `overflow: auto`）。在 `<dialog>` 上设置 `overscroll-behavior: contain`，并在 `dialog::backdrop` 上组合 `overflow: hidden` 与 `overscroll-behavior: contain`，即可用纯 CSS 阻止底层滚动。

<a id="implementation"></a>

## 实现

<a id="1-contain-scroll-chaining-on-the-dialog"></a>

### 1. 约束 `<dialog>` 上的滚动链

用户代理样式默认给 `<dialog>` 设置 `overflow: auto`，它本身就是滚动容器。对 `dialog:modal`（或 `dialog`）应用 `overscroll-behavior: contain` 或 `none`。

<a id="2-turn-backdrop-into-a-scroll-container-and-contain-its-scroll"></a>

### 2. 把 `::backdrop` 变成滚动容器并约束滚动

`dialog::backdrop` 默认 `overflow: visible`，**不是**滚动容器，会忽略 `overscroll-behavior`。必须在 `dialog::backdrop` 上设置 `overflow: hidden`，使其成为不可滚动的滚动容器，并配合 `overscroll-behavior: contain`，捕获背景上的滚动手势，不让其到达底层文档。

<a id="example-code"></a>

## 示例代码

```css
dialog:modal {
  /* MANDATORY: Prevent scroll gestures inside the modal (even when its content
     does not overflow) from chaining to the underlying page. */
  overscroll-behavior: contain;
}

dialog::backdrop {
  /* MANDATORY: ::backdrop defaults to overflow: visible (not a scroll container).
     Set overflow: hidden so it becomes a non-scrollable scroll container that
     honors overscroll-behavior. */
  overflow: hidden;
  overscroll-behavior: contain;
}
```

<a id="best-practices--constraints"></a>

## 最佳实践与约束

- **必须：** 在 `<dialog>` 本身（用 `dialog:modal`）及 `dialog::backdrop` 都设置 `overscroll-behavior: contain`。否则背景或对话框内手势仍会传到页面。
- **必须：** 在 `dialog::backdrop` 上设置 `overflow: hidden` 或 `overflow: auto`，让其成为滚动容器。否则 `::backdrop` 默认采用 `overflow: visible`，`overscroll-behavior` 不会生效。
- **不要**在 `dialog::backdrop` 或 `dialog` 上使用 `overflow: clip` 或 `overflow: visible`。两者都不建立滚动容器，因此 `overscroll-behavior` 不会生效。
- **不要**在打开时通过 `<html>` 或 `<body>` 的 `overflow: hidden`、`position: fixed` 锁定背景。改变根溢出会移除滚动条，造成水平布局偏移，可能重置或跳变页面位置，并破坏底层 `position: sticky`。

<a id="fallback-strategies"></a>

## 回退策略

overscroll-behavior 的浏览器支持：有限可用。
支持版本：Chrome 144（2026 年 1 月）、Edge 144（2026 年 1 月）和 Firefox 150（2026 年 4 月）。
不支持：Safari。

所有主流浏览器都支持在内容溢出的滚动容器上使用 `overscroll-behavior` CSS 属性，但在**不可滚动**的滚动容器上遵循 `overscroll-behavior` 是较新的规范要求，无法通过特性检测判断支持情况。

**不要**用 `@supports (overscroll-behavior: contain)` 或 `CSS.supports('overscroll-behavior', 'contain')` 检测不可滚动容器支持。所有现代浏览器都支持 `overscroll-behavior: contain` 的属性语法并返回 `true`，即使仅在内容溢出时执行。

将不可滚动容器上的滚动约束视为**渐进增强**：

- 在支持对不可滚动的滚动容器应用 `overscroll-behavior` 的浏览器中，无论手势位于 `dialog::backdrop` 上还是 `<dialog>` 内部（无论内容是否溢出），都能完全阻止背景页面滚动。
- 在尚不支持对不可滚动的滚动容器应用 `overscroll-behavior` 的浏览器中，只要对话框自身内容溢出且可滚动，`dialog` 上的 `overscroll-behavior: contain` 仍会阻止滚动链；`showModal()` 也仍约束焦点并使背景 `inert`。
- 推荐渐进增强，优于在 `<html>` 或 `<body>` 上施加 `overflow: hidden` 或 `position: fixed` 的旧变通，因为不会移除根滚动条、引起水平偏移、跳变页面位置或破坏底层页面的 `position: sticky` 元素。